// ============================================================================
// render-dashboard.js — #view-dashboard rendering
//
// Depends on: db.js (library), render-helpers.js (getEmoji, ageBadge,
//             bookCard, updateGlobalSidebarStats), utils.js (esc),
//             config.js (SPINE_COLORS)
// Used by:    main.js / showView('dashboard')
// ============================================================================

function renderDashboard() {
  var books = library.filter(function(b) { return b.status !== 'Wishlist'; });
  var read = books.filter(function(b) { return b.status === 'Read'; });
  // Pages count every copy (2 copies of a 200-page book = 400 pages on the shelf)
  var pages = books.reduce(function(acc, b) { return acc + (parseInt(b.pages) || 0) * bookQty(b); }, 0);
  var copies = totalCopies(books);
  var rated = books.filter(function(b) { return b.rating; });
  var avg = rated.length ? (rated.reduce(function(acc, b) { return acc + b.rating; }, 0) / rated.length).toFixed(1) : '—';
  var pct = books.length ? Math.round((read.length / books.length) * 100) + '% of titles read' : '—';

  document.getElementById('d-total').textContent = copies.toLocaleString();
  document.getElementById('d-total-sub').textContent = copies > books.length ? books.length.toLocaleString() + ' unique titles · ' + copies.toLocaleString() + ' copies' : 'in your library';
  document.getElementById('d-read').textContent = read.length;
  document.getElementById('d-read-pct').textContent = pct;
  document.getElementById('d-pages').textContent = pages.toLocaleString();
  document.getElementById('d-rating').textContent = avg + (rated.length ? ' ★' : '');
  updateGlobalSidebarStats();

  // Recently added
  var sorted = library.filter(function(b) { return b.status !== 'Wishlist'; }).sort(function(a, b) { return b.addedAt - a.addedAt; }).slice(0, 10);
  var rl = document.getElementById('recent-list');
  if (!sorted.length) {
    rl.innerHTML = '<div class="empty-state" style="padding:20px 0">No records found. Add your first book above!</div>';
  } else {
    var colors = SPINE_COLORS;
    rl.innerHTML = sorted.map(function(b) {
      var ds = new Date(b.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      var hv = 0; for (var i = 0; i < b.title.length; i++) { hv = ((hv << 5) - hv + b.title.charCodeAt(i)) | 0; }
      var cl = colors[Math.abs(hv) % colors.length];
      var thumb = b.coverUrl ? '<img src="' + esc(b.coverUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="handleCoverError(this,\'' + getEmoji(b.title) + '\',\'' + cl + '\')">' : getEmoji(b.title);
      return '<div class="recent-item" onclick="openBook(\'' + b.id + '\')"><div class="book-thumb"' + (b.coverUrl ? '' : ' style="background:' + spineTint(cl) + '"') + '>' + thumb + '</div><div class="recent-info"><div class="recent-title">' + esc(b.title) + (b.quantity > 1 ? ' <span class="qty-badge">×' + b.quantity + '</span>' : '') + '</div><div class="recent-meta">' + esc(b.author || 'Unknown') + (b.genre ? ' · ' + esc(b.genre) : '') + (b.seriesName ? ' · <em>' + esc(b.seriesName) + (b.seriesNum ? ' #' + b.seriesNum : '') + '</em>' : '') + '</div></div><div class="recent-date">' + ds + '</div></div>';
    }).join('');
  }

  // By-genre mini bar chart
  var genreMap = {};
  library.filter(function(b) { return b.status !== 'Wishlist' && b.genre; }).forEach(function(b) { genreMap[b.genre] = (genreMap[b.genre] || 0) + 1; });
  var genres = Object.entries(genreMap).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 6);
  var fills = ['', 'sage', 'gold', 'ink', '', ''];
  var gc = document.getElementById('genre-chart');
  gc.innerHTML = genres.length ? genres.map(function(item, i) { return '<div class="genre-bar-row"><div class="genre-name">' + esc(item[0]) + '</div><div class="genre-bar-track"><div class="genre-bar-fill ' + fills[i] + '" style="width:' + Math.round(item[1] / genres[0][1] * 100) + '%"></div></div><div class="genre-count">' + item[1] + '</div></div>'; }).join('') : '<div style="font-size:12px;color:var(--ink-faint);text-align:center;padding:6px 0">No data yet</div>';

  // By-age breakdown
  var ageMap = {};
  library.filter(function(b) { return b.ageRange; }).forEach(function(b) { ageMap[b.ageRange] = (ageMap[b.ageRange] || 0) + 1; });
  var ages = Object.entries(ageMap).sort(function(a, b) { return b[1] - a[1]; });
  var ac = document.getElementById('age-chart');
  ac.innerHTML = ages.length ? ages.map(function(item) { return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px"><div>' + ageBadge(item[0]) + '</div><div style="color:var(--ink-muted);font-weight:500">' + item[1] + ' book' + (item[1] !== 1 ? 's' : '') + '</div></div>'; }).join('') : '<div style="font-size:12px;color:var(--ink-faint);text-align:center;padding:6px 0">No data yet</div>';

  renderReadingGoal();
  renderCurrentlyReading();
  renderQueue();
  renderYearInReview();
  renderSeriesGaps();
  renderDashboardSearchNow();
}

// Live search box on the dashboard. Uses the same matcher as My Books, runs on
// every keystroke (no delay), shows ALL matches (24 at a time) and re-runs
// automatically whenever the library changes.
var _dashShown = 24;
function renderDashboardSearch() { _dashShown = 24; renderDashboardSearchNow(); }

function clearDashSearch() {
  var inp = document.getElementById('dash-search-input');
  if (inp) { inp.value = ''; inp.focus(); }
  _dashShown = 24;
  renderDashboardSearchNow();
}

function dashShowMore() { _dashShown += 24; renderDashboardSearchNow(); }

function dashOpenInLibrary() {
  var q = document.getElementById('dash-search-input').value;
  showView('library');
  var inp = document.getElementById('lib-search-input');
  if (inp) { inp.value = q; applyFilters(); updateSearchClear(); }
}

function renderDashboardSearchNow() {
  var inp = document.getElementById('dash-search-input');
  var res = document.getElementById('dash-search-results');
  if (!inp || !res) return;
  var q = inp.value.trim();
  var clr = document.getElementById('dash-search-clear');
  if (clr) clr.style.display = inp.value ? 'inline-flex' : 'none';
  if (!q) { res.style.display = 'none'; res.innerHTML = ''; return; }
  var hits = library.filter(function(b) { return b.status !== 'Wishlist' && bookMatchesQuery(b, q); });
  res.style.display = '';
  if (!hits.length) {
    res.innerHTML = '<div style="font-size:13px;color:var(--ink-faint);padding:8px 0">No books matched "' + esc(q) + '"</div>';
    return;
  }
  var shown = hits.slice(0, _dashShown);
  var more = hits.length - shown.length;
  res.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">' +
      '<div style="font-size:12px;color:var(--ink-faint)">' + hits.length + ' result' + (hits.length !== 1 ? 's' : '') + ' for "' + esc(q) + '"</div>' +
      '<button class="btn btn-secondary" style="font-size:11px;padding:4px 10px" onclick="dashOpenInLibrary()">Open in My Books</button>' +
    '</div><div class="book-grid">' + shown.map(function(b) { return bookCard(b); }).join('') + '</div>' +
    (more > 0 ? '<div style="text-align:center;margin-top:10px"><button class="btn btn-secondary" onclick="dashShowMore()">Show ' + Math.min(24, more) + ' more (' + more + ' left)</button></div>' : '');
}
