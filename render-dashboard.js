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
  var pages = books.reduce(function(acc, b) { return acc + (parseInt(b.pages) || 0); }, 0);
  var rated = books.filter(function(b) { return b.rating; });
  var avg = rated.length ? (rated.reduce(function(acc, b) { return acc + b.rating; }, 0) / rated.length).toFixed(1) : '—';
  var pct = books.length ? Math.round((read.length / books.length) * 100) + '% read' : '—';

  document.getElementById('d-total').textContent = books.length;
  document.getElementById('d-read').textContent = read.length;
  document.getElementById('d-read-pct').textContent = pct;
  document.getElementById('d-pages').textContent = pages.toLocaleString();
  document.getElementById('d-rating').textContent = avg + (rated.length ? ' ★' : '');
  updateGlobalSidebarStats();

  // Recently added
  var sorted = library.filter(function(b) { return b.status !== 'Wishlist'; }).sort(function(a, b) { return b.addedAt - a.addedAt; }).slice(0, 5);
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
}

// Live search box on the dashboard — searches title/author/ISBN/subjects/series.
// Debounced ~150ms so typing quickly doesn't re-filter the whole library on
// every single keystroke.
var _dashSearchTimer = null;
function renderDashboardSearch() {
  clearTimeout(_dashSearchTimer);
  _dashSearchTimer = setTimeout(renderDashboardSearchNow, 150);
}

function renderDashboardSearchNow() {
  var q = document.getElementById('dash-search-input').value.trim().toLowerCase();
  var res = document.getElementById('dash-search-results');
  if (!q) { res.style.display = 'none'; return; }
  var hits = library.filter(function(b) {
    return b.status !== 'Wishlist' && (
      (b.title || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.isbn || '').includes(q) ||
      (b.subjects || '').toLowerCase().includes(q) ||
      (b.seriesName || '').toLowerCase().includes(q)
    );
  });
  res.style.display = '';
  if (!hits.length) {
    res.innerHTML = '<div style="font-size:13px;color:var(--ink-faint);padding:8px 0">No books matched "' + esc(q) + '"</div>';
    return;
  }
  res.innerHTML = '<div style="font-size:12px;color:var(--ink-faint);margin-bottom:8px">' + hits.length + ' result' + (hits.length !== 1 ? 's' : '') + ' for "' + esc(q) + '"</div><div class="book-grid">' + hits.slice(0, 12).map(bookCard).join('') + '</div>';
}
