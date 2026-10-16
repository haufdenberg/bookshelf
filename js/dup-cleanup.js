// ============================================================================
// dup-cleanup.js — Settings → "Find duplicates": library-wide cleanup
//
// duplicate-detection.js catches a duplicate at the moment you add a book.
// This module sweeps the whole existing library for copies that slipped in
// (bulk adds, CSV imports, older data) and lets you merge or dismiss them.
//
//   Exact    — same ISBN, or same title + author (ISBN missing on one side)
//   Possible — same title with a different/blank author, a title that differs
//              only by subtitle or "The/A", or the same book with two different
//              ISBNs (could be a hardcover and a paperback — you decide)
//
// Merging keeps one book, fills its blanks from the others, adds up quantities,
// combines notes/tags, then removes the extras. Every merge has an Undo.
// "Not duplicates" is remembered per library (this browser) so it stays quiet.
//
// Depends on: db.js (library, save, _currentLibraryId), utils.js (esc, showToast,
//             showToastAction), reading-stats.js (nextQueueOrder),
//             render-helpers.js (updateGlobalSidebarStats)
// Used by:    Settings → Data Management → "Find duplicates"
// ============================================================================

var _dupGroups = [];
var _dupKeep = {};      // group index → id of the book to keep
var _dupFilter = 'all'; // all | exact | possible
var _dupShown = 25;

// ── Matching ────────────────────────────────────────────────────────────────
function dcNorm(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function dcBaseTitle(t) {
  t = (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  t = t.split(/\s*[:(\[]\s*|\s+-\s+/)[0];
  t = t.replace(/,\s*(the|a|an)\s*$/, '');            // "Hobbit, The" → "hobbit"
  return t.replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');
}
// "J.K. Rowling" and "Rowling, J.K." both → "rowling"
function dcAuthorKey(a) {
  a = (a || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/;| and | & /)[0].trim();
  if (!a) return '';
  var last = a.indexOf(',') > -1 ? a.split(',')[0] : a.split(/\s+/).pop();
  return last.replace(/[^a-z]/g, '');
}

// Returns 'exact', 'possible', or null for a pair of books.
function dcCompare(a, b) {
  var ka = isbnKey(a.isbn), kb = isbnKey(b.isbn);
  if (ka && kb && ka === kb) return 'exact';
  var ta = dcNorm(a.title), tb = dcNorm(b.title);
  var aa = dcAuthorKey(a.author), ab = dcAuthorKey(b.author);
  if (ta && ta === tb && aa && aa === ab) {
    return (ka && kb && ka !== kb) ? 'possible' : 'exact'; // two ISBNs → maybe two editions
  }
  var ba = dcBaseTitle(a.title), bb = dcBaseTitle(b.title);
  if (ba.length >= 4 && ba === bb && (!aa || !ab || aa === ab)) return 'possible';
  if (ta && ta === tb && (!aa || !ab)) return 'possible';
  return null;
}

function dcFindGroups() {
  var parent = {}, level = {};   // union-find; level[root] = 'exact' | 'possible'
  library.forEach(function(b) { parent[b.id] = b.id; level[b.id] = 'exact'; });
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b, lvl) {
    var ra = find(a), rb = find(b);
    var worst = (lvl === 'possible' || level[ra] === 'possible' || level[rb] === 'possible') ? 'possible' : 'exact';
    if (ra !== rb) parent[ra] = rb;
    level[find(a)] = worst;
  }
  // Only compare books that share a bucket (isbn / base title) — keeps this fast.
  var buckets = {};
  function add(key, b) { if (!key) return; (buckets[key] = buckets[key] || []).push(b); }
  library.forEach(function(b) {
    if (isbnKey(b.isbn)) add('i:' + isbnKey(b.isbn), b);
    add('t:' + dcBaseTitle(b.title), b);
  });
  var seenPair = {};
  Object.keys(buckets).forEach(function(k) {
    var list = buckets[k];
    if (list.length < 2 || list.length > 60) return; // 60+ same-titled books = a series/omnibus quirk, skip
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
      var pk = list[i].id + '|' + list[j].id;
      if (seenPair[pk]) continue; seenPair[pk] = true;
      var lvl = dcCompare(list[i], list[j]);
      if (lvl) union(list[i].id, list[j].id, lvl);
    }
  });
  var groups = {};
  library.forEach(function(b) { var r = find(b.id); (groups[r] = groups[r] || { books: [], level: level[r] }).books.push(b); });
  var dismissed = dcGetDismissed();
  return Object.keys(groups).map(function(k) { return groups[k]; })
    .filter(function(g) { return g.books.length > 1; })
    .map(function(g) { g.key = g.books.map(function(b) { return b.id; }).sort().join('|'); return g; })
    .filter(function(g) { return !dismissed[g.key]; })
    .sort(function(a, b) {
      if (a.level !== b.level) return a.level === 'exact' ? -1 : 1;
      return (a.books[0].title || '').localeCompare(b.books[0].title || '');
    });
}

// ── Choosing what to keep ───────────────────────────────────────────────────
var DC_STATUS_RANK = { 'Wishlist': 0, 'Unread': 1, 'Reading': 2, 'Read': 3 };
var DC_SCORE_FIELDS = ['author', 'isbn', 'genre', 'subgenre', 'seriesName', 'seriesNum', 'ageRange', 'pages',
  'publisher', 'year', 'location', 'description', 'notes', 'subjects', 'tags', 'startDate', 'finishDate', 'coverUrl'];

function dcScore(b) {
  var s = 0;
  DC_SCORE_FIELDS.forEach(function(f) { if (b[f]) s++; });
  if (b.rating) s += 2;
  if (b.status && b.status !== 'Wishlist') s += 1;
  if (b.coverUrl && b.coverUrl.indexOf('/storage/v1/object/public/') > -1) s += 1;
  return s;
}
function dcBestId(books) {
  return books.slice().sort(function(a, b) { return dcScore(b) - dcScore(a) || (a.addedAt || 0) - (b.addedAt || 0); })[0].id;
}

// Folds `others` into `keep` (mutates keep). Never overwrites a value keep already has.
function dcMergeInto(keep, others) {
  var fields = ['author', 'isbn', 'subtitle', 'year', 'genre', 'subgenre', 'ageRange', 'grade', 'seriesName', 'seriesNum',
    'pages', 'publisher', 'language', 'format', 'condition', 'location', 'startDate', 'finishDate', 'loanedTo', 'loanedDate'];
  others.forEach(function(o) {
    fields.forEach(function(f) { if (!keep[f] && o[f]) keep[f] = o[f]; });
    if (!keep.rating && o.rating) keep.rating = o.rating;
    if (!keep.description && o.description) keep.description = o.description;
    // Prefer a cover already stored permanently
    var oStored = o.coverUrl && o.coverUrl.indexOf('/storage/v1/object/public/') > -1;
    var kStored = keep.coverUrl && keep.coverUrl.indexOf('/storage/v1/object/public/') > -1;
    if (!keep.coverUrl || (oStored && !kStored)) { if (o.coverUrl) keep.coverUrl = o.coverUrl; }
    // Longer free-text fields: combine distinct notes
    if (o.notes && o.notes !== keep.notes) keep.notes = keep.notes ? keep.notes + '\n\n' + o.notes : o.notes;
    ['subjects', 'tags'].forEach(function(f) {
      var have = (keep[f] || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean);
      (o[f] || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean).forEach(function(x) {
        if (have.map(function(h) { return h.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) have.push(x);
      });
      keep[f] = have.join(', ');
    });
    if ((DC_STATUS_RANK[o.status] || 0) > (DC_STATUS_RANK[keep.status] || 0)) keep.status = o.status;
    if (o.queued && !keep.queued) { keep.queued = true; keep.queueOrder = nextQueueOrder(); }
  });
  // Quantity = copies actually owned (a wishlist entry isn't a copy)
  var owned = [keep].concat(others).filter(function(b) { return b.status !== 'Wishlist'; });
  var qty = owned.reduce(function(n, b) { return n + (parseInt(b.quantity, 10) || 1); }, 0);
  keep.quantity = Math.max(1, qty);
  if (keep.status !== 'Wishlist' && !keep.condition) keep.condition = 'Good';
}

// ── Applying merges (with undo) ─────────────────────────────────────────────
function dcApplyMerges(plans) { // plans: [{keepId, removeIds}]
  var snapshot = {};
  var removeAll = {};
  plans.forEach(function(p) {
    [p.keepId].concat(p.removeIds).forEach(function(id) {
      var b = library.find(function(x) { return x.id === id; });
      if (b) snapshot[id] = JSON.parse(JSON.stringify(b));
    });
  });
  var removed = 0;
  plans.forEach(function(p) {
    var keep = library.find(function(x) { return x.id === p.keepId; });
    if (!keep) return;
    var others = p.removeIds.map(function(id) { return library.find(function(x) { return x.id === id; }); }).filter(Boolean);
    dcMergeInto(keep, others);
    others.forEach(function(o) { removeAll[o.id] = true; removed++; });
  });
  library = library.filter(function(b) { return !removeAll[b.id]; });
  save();
  var ids = Object.keys(snapshot);
  showToastAction('Merged — removed ' + removed + ' duplicate' + (removed === 1 ? '' : 's') + '.', 'Undo', function() {
    library = library.filter(function(b) { return ids.indexOf(b.id) < 0; });
    ids.forEach(function(id) { library.push(snapshot[id]); });
    save();
    dcRefreshEverything();
    showToast('Merge undone');
  }, 12000);
  dcRefreshEverything();
}

function dcRefreshEverything() {
  _dupKeep = {};
  updateGlobalSidebarStats();
  renderDupCleanup();
  renderDupSettingsRow();
  if (currentView === 'library') renderLibrary();
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'wishlist') renderWishlist();
}

// ── Dismissals ──────────────────────────────────────────────────────────────
function dcDismissKey() { return 'bookshelf-dup-dismissed-' + (_currentLibraryId || 'local'); }
function dcGetDismissed() {
  try { return JSON.parse(localStorage.getItem(dcDismissKey()) || '{}'); } catch (e) { return {}; }
}
function dcSetDismissed(o) { try { localStorage.setItem(dcDismissKey(), JSON.stringify(o)); } catch (e) {} }

// ── UI ──────────────────────────────────────────────────────────────────────
function renderDupSettingsRow() {
  var el = document.getElementById('cfg-dup-status');
  if (!el) return;
  var g = dcFindGroups();
  var exact = g.filter(function(x) { return x.level === 'exact'; }).length;
  el.textContent = g.length ? (exact + ' exact, ' + (g.length - exact) + ' possible') : 'No duplicates found';
}

function openDupCleanup() {
  _dupFilter = 'all'; _dupShown = 25; _dupKeep = {};
  document.getElementById('dupclean-modal').classList.add('open');
  renderDupCleanup();
}
function closeDupCleanup() { document.getElementById('dupclean-modal').classList.remove('open'); }

function dupSetFilter(f) { _dupFilter = f; _dupShown = 25; renderDupCleanup(); }
function dupShowMore() { _dupShown += 25; renderDupCleanup(); }

function dupSelectKeep(g, id) { _dupKeep[g] = id; renderDupCleanup(true); }

function dupMerge(g) {
  var grp = _dupGroups[g]; if (!grp) return;
  var keepId = _dupKeep[g] || dcBestId(grp.books);
  var removeIds = grp.books.map(function(b) { return b.id; }).filter(function(id) { return id !== keepId; });
  dcApplyMerges([{ keepId: keepId, removeIds: removeIds }]);
}

function dupDismiss(g) {
  var grp = _dupGroups[g]; if (!grp) return;
  var d = dcGetDismissed(); d[grp.key] = 1; dcSetDismissed(d);
  _dupKeep = {};
  renderDupCleanup(); renderDupSettingsRow();
  showToast('Marked as not duplicates');
}

function dupResetDismissed() {
  dcSetDismissed({}); _dupKeep = {};
  renderDupCleanup(); renderDupSettingsRow();
  showToast('Dismissed pairs will show again');
}

function dupMergeAllExact() {
  var exact = _dupGroups.filter(function(g) { return g.level === 'exact'; });
  if (!exact.length) return;
  var n = exact.reduce(function(s, g) { return s + g.books.length - 1; }, 0);
  if (!confirm('Merge all ' + exact.length + ' exact-duplicate groups? ' + n + ' extra entr' + (n === 1 ? 'y' : 'ies') + ' will be folded into the most complete copy (you can undo right after). Possible matches are left alone.')) return;
  dcApplyMerges(exact.map(function(g) {
    var keepId = dcBestId(g.books);
    return { keepId: keepId, removeIds: g.books.map(function(b) { return b.id; }).filter(function(id) { return id !== keepId; }) };
  }));
}

function dcCopyCard(b, g, isKeep) {
  var added = b.addedAt ? new Date(Number(b.addedAt)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  var cover = b.coverUrl
    ? '<img src="' + esc(b.coverUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">'
    : '<span style="font-size:18px">' + getEmoji(b.title) + '</span>';
  var bits = [];
  if (b.isbn) bits.push('ISBN ' + esc(b.isbn));
  if (b.format) bits.push(esc(b.format));
  if (b.year) bits.push(esc(b.year));
  if (b.location) bits.push('📍 ' + esc(b.location));
  if (b.seriesName) bits.push(esc(b.seriesName) + (b.seriesNum ? ' #' + esc(String(b.seriesNum)) : ''));
  var extras = [];
  if (b.rating) extras.push('★'.repeat(b.rating));
  if (b.notes) extras.push('has notes');
  if (b.finishDate) extras.push('finished ' + esc(b.finishDate));
  if (parseInt(b.quantity, 10) > 1) extras.push('×' + b.quantity);
  return '<label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1.5px solid ' + (isKeep ? 'var(--sage)' : 'var(--border)') + ';background:' + (isKeep ? 'var(--sage-light)' : 'var(--surface)') + ';border-radius:10px;cursor:pointer">' +
    '<input type="radio" name="dupkeep-' + g + '" ' + (isKeep ? 'checked' : '') + ' onchange="dupSelectKeep(' + g + ',\'' + b.id + '\')" style="margin-top:3px;flex-shrink:0">' +
    '<div style="width:34px;height:50px;border-radius:3px;background:var(--cream-dark);overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + cover + '</div>' +
    '<div style="min-width:0;flex:1">' +
      '<div style="font-size:13px;font-weight:600;line-height:1.3">' + esc(b.title) + '</div>' +
      '<div style="font-size:12px;color:var(--ink-muted)">' + esc(b.author || 'Unknown author') + '</div>' +
      '<div style="font-size:11px;color:var(--ink-faint);margin-top:3px">' + (bits.join(' · ') || 'No other details') + '</div>' +
      '<div style="font-size:11px;color:var(--ink-faint);margin-top:2px">' + esc(b.status || 'Unread') + ' · added ' + added + (extras.length ? ' · ' + extras.join(' · ') : '') + '</div>' +
    '</div>' +
    (isKeep ? '<span style="font-size:10px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:.5px;flex-shrink:0">Keep</span>' : '') +
  '</label>';
}

function renderDupCleanup(keepScroll) {
  var body = document.getElementById('dupclean-body');
  if (!body) return;
  var scrollTop = keepScroll ? body.scrollTop : 0;
  _dupGroups = dcFindGroups();
  var exactN = _dupGroups.filter(function(g) { return g.level === 'exact'; }).length;
  var possN = _dupGroups.length - exactN;
  var dismissedN = Object.keys(dcGetDismissed()).length;

  function tab(id, label, n) {
    var on = _dupFilter === id;
    return '<button class="pill-btn' + (on ? ' active' : '') + '" onclick="dupSetFilter(\'' + id + '\')">' + label + ' (' + n + ')</button>';
  }
  var head = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">' +
    tab('all', 'All', _dupGroups.length) + tab('exact', 'Exact', exactN) + tab('possible', 'Possible', possN) +
    '<span style="flex:1"></span>' +
    (exactN ? '<button class="btn btn-primary" style="font-size:12px" onclick="dupMergeAllExact()">Merge all exact (' + exactN + ')</button>' : '') +
  '</div>';

  var visible = [];
  _dupGroups.forEach(function(g, idx) { if (_dupFilter === 'all' || g.level === _dupFilter) visible.push(idx); });

  var html = head;
  if (!_dupGroups.length) {
    html += '<div class="empty-state"><div class="empty-title">No duplicates found 🎉</div><div class="empty-sub">Your library is clean.</div></div>';
  } else if (!visible.length) {
    html += '<div class="empty-state"><div class="empty-sub">Nothing in this category.</div></div>';
  } else {
    visible.slice(0, _dupShown).forEach(function(idx) {
      var g = _dupGroups[idx];
      var keepId = _dupKeep[idx] || dcBestId(g.books);
      _dupKeep[idx] = keepId;
      var badge = g.level === 'exact'
        ? '<span style="background:var(--rust-light);color:var(--rust);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:600">Exact match</span>'
        : '<span style="background:var(--gold-light);color:var(--gold);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:600">Possible match</span>';
      var isbns = g.books.map(function(b) { return b.isbn; }).filter(Boolean);
      var edNote = (g.level === 'possible' && isbns.length > 1 && new Set(isbns).size > 1)
        ? '<span style="font-size:11px;color:var(--ink-faint)">Different ISBNs — could be separate editions</span>' : '';
      html += '<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px;background:var(--cream)">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">' + badge + edNote + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px">' +
          g.books.map(function(b) { return dcCopyCard(b, idx, b.id === keepId); }).join('') +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
          '<button class="btn btn-primary" style="font-size:12px" onclick="dupMerge(' + idx + ')">Merge into the kept copy</button>' +
          '<button class="btn btn-secondary" style="font-size:12px" onclick="dupDismiss(' + idx + ')">Not duplicates — keep all</button>' +
        '</div></div>';
    });
    if (visible.length > _dupShown) {
      html += '<div style="text-align:center"><button class="btn btn-secondary" onclick="dupShowMore()">Show ' + Math.min(25, visible.length - _dupShown) + ' more (' + (visible.length - _dupShown) + ' left)</button></div>';
    }
  }
  if (dismissedN) {
    html += '<div style="text-align:center;margin-top:14px;font-size:11px;color:var(--ink-faint)">' + dismissedN + ' group' + (dismissedN === 1 ? '' : 's') + ' hidden as "not duplicates" · <a style="color:var(--rust);cursor:pointer" onclick="dupResetDismissed()">show again</a></div>';
  }
  body.innerHTML = html;
  body.scrollTop = scrollTop;
}
