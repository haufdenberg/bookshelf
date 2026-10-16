// ============================================================================
// render-library.js — #view-library rendering: filter bar + grid/table listing
//
// Depends on: db.js (library), render-helpers.js (bookCard, esc),
//             config.js (displayMode)
// Used by:    main.js / showView('library'), profiles.js (on switch),
//             index.html filter-bar oninput/onchange handlers
// ============================================================================

// Applies every active filter + search term + sort order to `library`,
// returning a new array (never mutates `library` itself). Wishlist items are
// always excluded — see wishlist.js for those.
function getFilteredBooks() {
  var q = (document.getElementById('lib-search-input').value || '').trim().toLowerCase();
  var genre = document.getElementById('filter-genre').value;
  var subgenre = document.getElementById('filter-subgenre').value;
  var age = document.getElementById('filter-age').value;
  var status = document.getElementById('filter-status').value;
  var condition = document.getElementById('filter-condition').value;
  var series = document.getElementById('filter-series').value;
  var sort = document.getElementById('filter-sort').value;
  var tag = document.getElementById('filter-tag').value;
  var special = document.getElementById('filter-special').value;

  var f = library.filter(function(b) {
    if (b.status === 'Wishlist') return false;
    if (genre && b.genre !== genre) return false;
    if (subgenre && b.subgenre !== subgenre) return false;
    if (age && age !== '__custom__' && b.ageRange !== age) return false;
    if (age === '__custom__') {
      var stdAges = ['Pre-K (Ages 0–4)', 'Early Reader (Ages 5–8)', 'Middle Grade (Ages 8–12)', 'Young Adult (Ages 13–17)', 'Adult (18+)'];
      if (!b.ageRange || stdAges.indexOf(b.ageRange) > -1) return false;
    }
    if (status && b.status !== status) return false;
    if (condition && b.condition !== condition) return false;
    if (tag && splitTags(b.tags).indexOf(tag) < 0) return false;
    if (special === 'queue' && !b.queued) return false;
    if (special === 'loaned' && !b.loanedTo) return false;
    if (special === 'reading' && b.status !== 'Reading') return false;
    if (series === '__standalone__' && b.seriesName) return false;
    if (series && series !== '__standalone__' && b.seriesName !== series) return false;
    if (q) {
      return (b.title || '').toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.isbn || '').includes(q) ||
        (b.subjects || '').toLowerCase().includes(q) ||
        (b.seriesName || '').toLowerCase().includes(q) ||
        (b.publisher || '').toLowerCase().includes(q);
    }
    return true;
  });

  f.sort(function(a, b) {
    if (sort === 'added-desc') return b.addedAt - a.addedAt;
    if (sort === 'added-asc') return a.addedAt - b.addedAt;
    if (sort === 'title-asc') return (a.title || '').localeCompare(b.title || '');
    if (sort === 'author-asc') return (a.author || '').localeCompare(b.author || '');
    if (sort === 'rating-desc') return (b.rating || 0) - (a.rating || 0);
    if (sort === 'queue') return (parseInt(a.queueOrder, 10) || 1e9) - (parseInt(b.queueOrder, 10) || 1e9);
    if (sort === 'series-order' || sort === 'series-asc') {
      var snA = a.seriesName || '';
      var snB = b.seriesName || '';
      if (snA !== snB) return snA.localeCompare(snB);
      // Numeric sort on seriesNum (handles decimals like 1.5)
      var nA = parseFloat(a.seriesNum) || 0;
      var nB = parseFloat(b.seriesNum) || 0;
      return nA - nB;
    }
    return 0;
  });
  return f;
}

function renderLibrary() {
  refreshFilterOptions();
  var container = document.getElementById('library-container');
  var books = getFilteredBooks();
  if (!books.length) {
    container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg><div class="empty-title">No matches found</div><div class="empty-sub">Adjust filters or search keywords</div></div>';
    return;
  }
  var activeSeries = document.getElementById('filter-series').value;
  var showNum = !!(activeSeries && activeSeries !== '__standalone__');
  if (displayMode === 'grid') {
    container.innerHTML = '<div class="book-grid">' + books.map(function(b) { return bookCard(b, showNum); }).join('') + '</div>';
  } else {
    var markup = '<table class="book-table"><thead><tr>' + (showNum ? '<th>#</th>' : '') + '<th>Title</th><th>Author</th><th>Genre</th><th>Status</th><th>Rating</th><th>Shelf</th></tr></thead><tbody>';
    markup += books.map(function(b) {
      var r = b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : '—';
      var numCell = showNum ? '<td style="color:var(--rust);font-weight:600;font-size:12px">' + (b.seriesNum ? '#' + esc(String(b.seriesNum)) : '—') + '</td>' : '';
      return '<tr onclick="openBook(\'' + b.id + '\')">' + numCell + '<td><strong>' + esc(b.title) + '</strong>' + (b.queued ? ' <span title="In read-next queue">📚</span>' : '') + (b.loanedTo ? ' <span title="Loaned to ' + esc(b.loanedTo) + '">🤝</span>' : '') + (b.quantity > 1 ? ' <span class="qty-badge">×' + b.quantity + '</span>' : '') + '</td><td>' + esc(b.author || '—') + '</td><td><span style="font-size:12px;color:var(--ink-muted)">' + esc(b.genre || '—') + '</span></td><td><span class="tag read-tag" style="padding:2px 6px;font-size:11px">' + esc(b.status || 'Unread') + '</span></td><td style="color:var(--gold)">' + r + '</td><td>' + esc(b.location || '—') + '</td></tr>';
    }).join('');
    markup += '</tbody></table>';
    container.innerHTML = markup;
  }
}

// Rebuilds the "All Series" filter dropdown from whatever series names
// currently exist in the library, preserving the current selection if
// it's still valid.
function refreshFilterOptions() {
  var seriesSel = document.getElementById('filter-series');
  var currentVal = seriesSel.value;
  var namesSet = {};
  library.filter(function(b) { return b.status !== 'Wishlist' && b.seriesName; })
    .forEach(function(b) { namesSet[b.seriesName] = true; });
  var names = Object.keys(namesSet).sort(function(a, b) { return a.localeCompare(b); });
  var html = '<option value="">All Series</option>';
  html += '<option value="__standalone__">Standalone Books</option>';
  names.forEach(function(n) { html += '<option value="' + esc(n) + '">' + esc(n) + '</option>'; });
  seriesSel.innerHTML = html;
  refreshTagFilterOptions();
  if (currentVal) {
    for (var i = 0; i < seriesSel.options.length; i++) {
      if (seriesSel.options[i].value === currentVal) { seriesSel.value = currentVal; break; }
    }
  }
}

function applyFilters() {
  // Auto-set sort to Series Order when a specific series is selected
  var seriesVal = document.getElementById('filter-series').value;
  var sortSel = document.getElementById('filter-sort');
  if (seriesVal && seriesVal !== '__standalone__') {
    if (sortSel.value === 'added-desc' || sortSel.value === 'added-asc') {
      sortSel.value = 'series-asc';
    }
  }
  renderLibrary();
  updateClearFiltersBtn();
}

function updateSearchClear() {
  var inp = document.getElementById('lib-search-input');
  var btn = document.getElementById('lib-search-clear');
  if (btn) btn.style.display = inp && inp.value ? 'block' : 'none';
}

function clearLibSearch() {
  var inp = document.getElementById('lib-search-input');
  if (inp) { inp.value = ''; applyFilters(); }
  updateSearchClear();
}

function clearAllFilters() {
  document.getElementById('lib-search-input').value = '';
  document.getElementById('filter-genre').value = '';
  document.getElementById('filter-subgenre').value = '';
  document.getElementById('filter-age').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-condition').value = '';
  document.getElementById('filter-series').value = '';
  document.getElementById('filter-tag').value = '';
  document.getElementById('filter-special').value = '';
  refreshFilterOptions();
  document.getElementById('filter-sort').value = 'added-desc';
  updateFilterSubgenres();
  updateSearchClear();
  applyFilters();
}

function updateClearFiltersBtn() {
  var btn = document.getElementById('btn-clear-filters');
  if (!btn) return;
  var hasFilter =
    document.getElementById('lib-search-input').value ||
    document.getElementById('filter-genre').value ||
    document.getElementById('filter-subgenre').value ||
    document.getElementById('filter-age').value ||
    document.getElementById('filter-status').value ||
    document.getElementById('filter-condition').value ||
    document.getElementById('filter-series').value ||
    document.getElementById('filter-tag').value ||
    document.getElementById('filter-special').value ||
    document.getElementById('filter-sort').value !== 'added-desc';
  btn.style.display = hasFilter ? 'inline-flex' : 'none';
}

function setDisplayMode(m) {
  displayMode = m;
  document.getElementById('btn-grid').classList.toggle('active', m === 'grid');
  document.getElementById('btn-list').classList.toggle('active', m === 'list');
  renderLibrary();
}

// ── Tags, random pick ────────────────────────────────────────────────────────
// Tags are stored as one comma-separated string per book.
function splitTags(str) {
  return (str || '').split(',').map(function(t) { return t.trim(); }).filter(Boolean);
}

function refreshTagFilterOptions() {
  var sel = document.getElementById('filter-tag');
  if (!sel) return;
  var cur = sel.value, set = {};
  library.forEach(function(b) { splitTags(b.tags).forEach(function(t) { set[t] = true; }); });
  var html = '<option value="">All Tags</option>';
  Object.keys(set).sort(function(a, b) { return a.localeCompare(b); }).forEach(function(t) {
    html += '<option value="' + esc(t) + '">' + esc(t) + '</option>';
  });
  sel.innerHTML = html;
  if (cur && set[cur]) sel.value = cur;
}

// Picks a random not-yet-read book from whatever the library filters currently
// show (so "Fantasy" + "Pick for me" gives a random unread fantasy book).
function pickRandomBook() {
  var pool = getFilteredBooks().filter(function(b) { return b.status === 'Unread' || !b.status; });
  if (!pool.length) { showToast('No unread books match the current filters'); return; }
  var b = pool[Math.floor(Math.random() * pool.length)];
  openBook(b.id);
  showToast('🎲 How about this one?');
}
