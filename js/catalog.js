// ============================================================================
// catalog.js — shared household catalog of book FACTS (keyed by ISBN-13)
//
// Everyone signed in to the same Supabase project reads and contributes to one
// `book_catalog` table: series, series #, genre, subgenre, age range, grade,
// Lexile, subjects, summary, pages, publisher, year, cover. Personal data
// (status, rating, notes, tags, shelf, loans, queue) is never shared.
//
//  • Contributing: when books with an ISBN are saved, their facts are sent to
//    the catalog (blank-fill only — nobody can overwrite someone else's entry;
//    admins can replace entries from Settings).
//  • Using it: Auto-Fill / Bulk Add check the catalog, and "Check catalog for
//    suggestions" adds proposals to the Updates tab (Accept / Ignore).
//
// If supabase-catalog.sql hasn't been run yet, everything here quietly turns
// itself off and Settings explains what to do.
//
// Depends on: db.js (supabaseClient, library, save), utils.js (isbnKey,
//   showToast, esc), updates.js (_pendingUpdates, updateBadge, renderUpdates),
//   account.js (_isAdmin), forms/autofill helpers (setAgeCombo, setSubgenreCombo,
//   updateSubgenreOptions, setCoverPreview)
// ============================================================================

// app field → catalog column
var CATALOG_FIELDS = {
  title: 'title', author: 'author', subtitle: 'subtitle',
  seriesName: 'series_name', seriesNum: 'series_num', genre: 'genre', subgenre: 'subgenre',
  ageRange: 'age_range', grade: 'grade', lexile: 'lexile', subjects: 'subjects',
  description: 'description', pages: 'pages', publisher: 'publisher', year: 'year', coverUrl: 'cover_url'
};
// Fields the household "curates" — these are offered as suggestions even when
// the book already has a different value.
var CATALOG_CURATED = [
  { key: 'seriesName', label: 'Series Name' }, { key: 'seriesNum', label: 'Series #' },
  { key: 'genre', label: 'Genre' }, { key: 'subgenre', label: 'Subgenre' },
  { key: 'ageRange', label: 'Age Range' }, { key: 'grade', label: 'Grade Level' },
  { key: 'lexile', label: 'Lexile' }
];
// Fields only suggested when the book has nothing there yet.
var CATALOG_FILL_ONLY = [
  { key: 'subjects', label: 'Subjects' }, { key: 'description', label: 'Summary' },
  { key: 'pages', label: 'Pages' }, { key: 'publisher', label: 'Publisher' },
  { key: 'year', label: 'Year' }, { key: 'coverUrl', label: 'Cover' }
];

var _catalogMissing = false;   // table/function not created yet (or no access)
var _catalogCache = {};        // isbn13 → row (camelCase) fetched this session
var CATALOG_PREF_KEY = 'bookshelf-catalog-contribute';
var CATALOG_IGNORE_KEY = 'bookshelf-catalog-ignored';

function catalogEnabled() { return !!supabaseClient && !!_supabaseUser && !_catalogMissing; }
function catalogContributeOn() { try { return localStorage.getItem(CATALOG_PREF_KEY) !== 'off'; } catch (e) { return true; } }

function catalogNoteError(err) {
  if (!err) return;
  var msg = (err.message || '') + ' ' + (err.code || '');
  if (/42P01|PGRST205|PGRST202|42883|does not exist|schema cache|permission denied|42501/i.test(msg)) _catalogMissing = true;
  console.warn('Catalog:', err);
}

function catalogFromRow(r) {
  var o = {};
  Object.keys(CATALOG_FIELDS).forEach(function(k) { o[k] = r[CATALOG_FIELDS[k]] || ''; });
  o.isbn = r.isbn;
  return o;
}

// Fetch catalog entries for a list of ISBNs → { isbn13: entry }
function catalogFetch(isbns) {
  var keys = [], seen = {};
  (isbns || []).forEach(function(i) { var k = isbnKey(i); if (k && !seen[k]) { seen[k] = 1; keys.push(k); } });
  var out = {}, need = [];
  keys.forEach(function(k) { if (_catalogCache[k]) out[k] = _catalogCache[k]; else need.push(k); });
  if (!catalogEnabled() || !need.length) return Promise.resolve(out);
  var chunks = chunkArray(need, 100);
  return Promise.all(chunks.map(function(c) {
    return supabaseClient.from('book_catalog').select('*').in('isbn', c);
  })).then(function(results) {
    results.forEach(function(res) {
      if (res.error) { catalogNoteError(res.error); return; }
      (res.data || []).forEach(function(r) { var e = catalogFromRow(r); _catalogCache[r.isbn] = e; out[r.isbn] = e; });
    });
    return out;
  }).catch(function(e) { catalogNoteError(e); return out; });
}

// Turn books into catalog rows (only facts, only books with a valid ISBN)
function catalogRowsFromBooks(books) {
  var byKey = {};
  (books || []).forEach(function(b) {
    var k = isbnKey(b.isbn);
    if (!k) return;
    var row = byKey[k] || { isbn: k };
    Object.keys(CATALOG_FIELDS).forEach(function(f) {
      var v = (b[f] === undefined || b[f] === null) ? '' : String(b[f]).trim();
      if (f === 'coverUrl' && !/^https?:\/\//i.test(v)) v = '';   // never share inline images
      if (v && !row[CATALOG_FIELDS[f]]) row[CATALOG_FIELDS[f]] = v;
    });
    byKey[k] = row;
  });
  return Object.keys(byKey).map(function(k) { return byKey[k]; });
}

function catalogSend(rows, overwrite) {
  if (!catalogEnabled() || !rows.length) return Promise.resolve(0);
  var chunks = chunkArray(rows, 150);
  var total = 0;
  return chunks.reduce(function(p, chunk) {
    return p.then(function() {
      return supabaseClient.rpc('contribute_catalog', { rows: chunk, overwrite: !!overwrite }).then(function(res) {
        if (res.error) { catalogNoteError(res.error); throw res.error; }
        total += (res.data || 0);
        chunk.forEach(function(r) { delete _catalogCache[r.isbn]; });
      });
    });
  }, Promise.resolve()).then(function() { return total; });
}

// Called from db.js after books are successfully synced. Silent and best-effort.
var _catPending = {}, _catTimer = null;
function catalogContributeBooks(books) {
  if (!catalogEnabled() || !catalogContributeOn()) return;
  (books || []).forEach(function(b) { _catPending[b.id] = b; });
  clearTimeout(_catTimer);
  _catTimer = setTimeout(function() {
    var list = Object.keys(_catPending).map(function(id) { return _catPending[id]; });
    _catPending = {};
    catalogSend(catalogRowsFromBooks(list), false).catch(function() {});
  }, 2500);
}

// ── Using the catalog while adding a book ────────────────────────────────────
function _setIf(id, val, force) {
  var el = document.getElementById(id);
  if (!el || !val) return false;
  if (!force && el.value && el.value.trim()) return false;
  if (el.value === val) return false;
  el.value = val; return true;
}

// Fills the Add/Edit form from the catalog. Household-curated fields win over
// API guesses; everything else only fills blanks. Returns true if anything was used.
function applyCatalogToForm(isbnRaw) {
  var k = isbnKey(isbnRaw);
  if (!k || !catalogEnabled()) return Promise.resolve(false);
  return catalogFetch([k]).then(function(map) {
    var c = map[k];
    if (!c) return false;
    var used = false;
    _setIf('f-title', c.title); _setIf('f-author', c.author); _setIf('f-subtitle', c.subtitle);
    if (_setIf('f-series', c.seriesName, true)) used = true;
    if (_setIf('f-series-num', c.seriesNum, true)) used = true;
    if (c.genre) {
      var g = document.getElementById('f-genre');
      if (g && g.value !== c.genre) { g.value = c.genre; if (typeof updateSubgenreOptions === 'function') updateSubgenreOptions(); used = true; }
    }
    if (c.subgenre && typeof setSubgenreCombo === 'function') { setSubgenreCombo(c.subgenre); used = true; }
    if (c.ageRange && typeof setAgeCombo === 'function') { setAgeCombo(c.ageRange); used = true; }
    if (_setIf('f-grade', c.grade, true)) used = true;
    if (_setIf('f-lexile', c.lexile, true)) used = true;
    _setIf('f-subjects', c.subjects); _setIf('f-desc', c.description); _setIf('f-pages', c.pages);
    _setIf('f-publisher', c.publisher); _setIf('f-year', c.year);
    var cov = document.getElementById('f-cover-url');
    if (cov && !cov.value && c.coverUrl) { cov.value = c.coverUrl; if (typeof setCoverPreview === 'function') setCoverPreview(c.coverUrl); }
    return used || true;
  }).catch(function() { return false; });
}

// Bulk-add rows: apply the curated fields to one row's inputs.
function applyCatalogToBulkRow(n, isbnRaw) {
  var k = isbnKey(isbnRaw);
  if (!k || !catalogEnabled()) return Promise.resolve(false);
  return catalogFetch([k]).then(function(map) {
    var c = map[k];
    if (!c) return false;
    function put(cls, val, force) {
      var el = document.querySelector('.' + cls + '[data-row="' + n + '"]');
      if (el && val && (force || !el.value)) el.value = val;
    }
    put('bulk-title', c.title); put('bulk-author', c.author);
    put('bulk-genre', c.genre, true); put('bulk-series', c.seriesName, true);
    put('bulk-seriesnum', c.seriesNum, true); put('bulk-age', c.ageRange, true);
    return true;
  }).catch(function() { return false; });
}

// ── Suggestions on the Updates tab ───────────────────────────────────────────
function _catIgnored() { try { return JSON.parse(localStorage.getItem(CATALOG_IGNORE_KEY) || '{}'); } catch (e) { return {}; } }
function catalogRememberIgnore(book, field) {
  var m = _catIgnored(); m[book.id + '|' + field.key + '|' + field.suggested] = 1;
  try { localStorage.setItem(CATALOG_IGNORE_KEY, JSON.stringify(m)); } catch (e) {}
}

function runCatalogScan(manual) {
  if (!catalogEnabled()) { if (manual) showToast('Shared catalog is not set up yet — see Settings → Shared Catalog'); return Promise.resolve(0); }
  var books = library.filter(function(b) { return b.status !== 'Wishlist' && isbnKey(b.isbn); });
  if (!books.length) { if (manual) showToast('No books with an ISBN to check'); return Promise.resolve(0); }
  var ignored = _catIgnored();
  return catalogFetch(books.map(function(b) { return b.isbn; })).then(function(map) {
    var added = 0;
    books.forEach(function(b) {
      var c = map[isbnKey(b.isbn)];
      if (!c) return;
      var fields = [];
      function consider(def, curatedMode) {
        var sug = (c[def.key] || '').trim();
        if (!sug) return;
        var cur = (b[def.key] || '').toString().trim();
        if (cur === sug) return;
        if (cur && !curatedMode) return;
        if (def.key === 'coverUrl' && !/^https?:\/\//i.test(sug)) return;
        if (ignored[b.id + '|' + def.key + '|' + sug]) return;
        fields.push({ key: def.key, label: def.label, current: cur, suggested: sug, ignored: false, src: 'catalog' });
      }
      CATALOG_CURATED.forEach(function(d) { consider(d, true); });
      CATALOG_FILL_ONLY.forEach(function(d) { consider(d, false); });
      if (!fields.length) return;
      var entry = null;
      for (var i = 0; i < _pendingUpdates.length; i++) if (_pendingUpdates[i].book.id === b.id) { entry = _pendingUpdates[i]; break; }
      if (!entry) { entry = { book: b, fields: [] }; _pendingUpdates.push(entry); }
      fields.forEach(function(nf) {
        entry.fields = entry.fields.filter(function(f) { return f.key !== nf.key || f.ignored; });
        entry.fields.push(nf); added++;
      });
    });
    updateBadge();
    if (manual) {
      if (added) { showView('updates'); } else { showToast('Your books already match the shared catalog'); }
    } else if (currentView === 'updates') { renderUpdates(); }
    return added;
  });
}

// Quiet check after the library loads (cheap: one or two requests).
function catalogAutoCheck() {
  if (!catalogEnabled()) return;
  runCatalogScan(false).catch(function() {});
}

// ── Settings → Shared Catalog ────────────────────────────────────────────────
function renderCatalogSettings() {
  var st = document.getElementById('cat-status');
  if (!st) return;
  var sel = document.getElementById('cat-contrib-sel');
  if (sel) sel.value = catalogContributeOn() ? 'on' : 'off';
  var adminBtn = document.getElementById('cat-admin-row');
  if (adminBtn) adminBtn.style.display = (typeof _isAdmin !== 'undefined' && _isAdmin) ? '' : 'none';
  if (!supabaseClient || !_supabaseUser) { st.textContent = 'Sign in to use the shared catalog.'; return; }
  st.textContent = 'Checking…';
  supabaseClient.from('book_catalog').select('isbn', { count: 'exact', head: true }).then(function(res) {
    if (res.error) {
      catalogNoteError(res.error);
      st.innerHTML = '<span style="color:var(--rust)">Not set up yet.</span> In Supabase → SQL Editor, run the contents of <code>supabase-catalog.sql</code>, then reload this page.';
      return;
    }
    _catalogMissing = false;
    st.textContent = (res.count || 0).toLocaleString() + ' book' + (res.count === 1 ? '' : 's') + ' in the shared catalog';
  });
}

function saveCatalogContribPref() {
  var sel = document.getElementById('cat-contrib-sel');
  try { localStorage.setItem(CATALOG_PREF_KEY, sel && sel.value === 'off' ? 'off' : 'on'); } catch (e) {}
}

function catalogShareMyBooks(overwrite) {
  if (!catalogEnabled()) { showToast('Shared catalog is not set up yet'); renderCatalogSettings(); return; }
  var rows = catalogRowsFromBooks(library.filter(function(b) { return b.status !== 'Wishlist'; }));
  if (!rows.length) { showToast('None of your books have an ISBN yet'); return; }
  var msg = overwrite
    ? 'Replace shared catalog entries with YOUR versions of ' + rows.length + ' books? This changes what suggestions everyone sees.'
    : 'Share the facts (series, genre, age range, grade, Lexile, subjects, summary, cover) of ' + rows.length + ' books with your household catalog?\n\nNo ratings, notes, shelves or reading history are shared. Existing catalog entries are only filled in where blank.';
  if (!confirm(msg)) return;
  showToast('Sharing ' + rows.length + ' books…');
  catalogSend(rows, !!overwrite).then(function() {
    showToast('Shared ' + rows.length + ' books with the catalog');
    renderCatalogSettings();
  }).catch(function(e) { showToast('Could not share: ' + ((e && e.message) || 'unknown error')); });
}
