// ============================================================================
// reading-stats.js — Dashboard reading-tracking widgets: reading goal,
// "Currently Reading" shelf, year-in-review chart, and incomplete-series
// detection
//
// Reading goal is stored server-side (one row per library, in the
// `reading_goals` table) since it's meaningful data worth syncing across
// devices. Everything else here is computed client-side from `library` —
// no schema needed for year-in-review or series gaps, since the dates and
// series numbers are already on each book.
//
// Depends on: db.js (library, _currentLibraryId, _activeOwnerId,
//             _supabaseUser), utils.js (esc, showToast),
//             render-helpers.js (getEmoji, spineTint), config.js (SPINE_COLORS)
// Used by:    render-dashboard.js (renderDashboard calls each render*())
// ============================================================================

var _currentGoal = null; // {target, year} for the active library, or null if none set

// ── Reading goal ──────────────────────────────────────────────────────────
function renderReadingGoal() {
  var panel = document.getElementById('goal-panel');
  if (!supabaseClient || !_currentLibraryId) { panel.style.display = 'none'; return; }
  supabaseClient.from('reading_goals').select('target,year').eq('library_id', _currentLibraryId).maybeSingle()
    .then(function(res) {
      if (res.error || !res.data) { _currentGoal = null; panel.style.display = 'none'; return; }
      _currentGoal = res.data;
      var year = new Date().getFullYear();
      var readThisYear = library.filter(function(b) {
        return b.status !== 'Wishlist' && b.finishDate && new Date(b.finishDate + 'T00:00:00').getFullYear() === year;
      }).length;
      var pct = Math.min(100, Math.round((readThisYear / _currentGoal.target) * 100));
      document.getElementById('goal-title').textContent = year + ' Reading Goal';
      document.getElementById('goal-bar-fill').style.width = pct + '%';
      document.getElementById('goal-count-text').textContent = readThisYear + ' / ' + _currentGoal.target;
      panel.style.display = '';
    });
}

// The panel only appears once a goal exists, so the dashboard also needs a
// way to create the first one — see the "Set a reading goal" link rendered
// by renderYearInReview().
function openGoalModal() {
  document.getElementById('goal-target-input').value = _currentGoal ? _currentGoal.target : 20;
  document.getElementById('goal-modal').classList.add('open');
}
function closeGoalModal() {
  document.getElementById('goal-modal').classList.remove('open');
}

function handleGoalSubmit(e) {
  e.preventDefault();
  var target = parseInt(document.getElementById('goal-target-input').value) || 0;
  if (target < 1) return;
  var year = new Date().getFullYear();
  supabaseClient.from('reading_goals').upsert({
    library_id: _currentLibraryId, user_id: _activeOwnerId || _supabaseUser.id, year: year, target: target
  }, { onConflict: 'library_id' }).then(function(res) {
    if (res.error) { showToast('Could not save goal'); return; }
    closeGoalModal();
    showToast('Reading goal saved');
    renderReadingGoal();
  });
}

// ── Currently Reading shelf ──────────────────────────────────────────────
function renderCurrentlyReading() {
  var panel = document.getElementById('currently-reading-panel');
  var list = document.getElementById('currently-reading-list');
  var reading = library.filter(function(b) { return b.status === 'Reading'; });
  if (!reading.length) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  var colors = SPINE_COLORS;
  list.innerHTML = reading.map(function(b) {
    var hv = 0; for (var i = 0; i < b.title.length; i++) { hv = ((hv << 5) - hv + b.title.charCodeAt(i)) | 0; }
    var cl = colors[Math.abs(hv) % colors.length];
    var cover = b.coverUrl
      ? '<img src="' + esc(b.coverUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="handleCoverError(this,\'' + getEmoji(b.title) + '\',\'' + cl + '\')">'
      : '<span style="font-size:22px">' + getEmoji(b.title) + '</span>';
    var daysText = '';
    if (b.startDate) {
      var days = Math.floor((Date.now() - new Date(b.startDate + 'T00:00:00').getTime()) / 86400000);
      daysText = days <= 0 ? 'Started today' : ('Day ' + days);
    }
    return '<div onclick="openBook(\'' + b.id + '\')" style="flex-shrink:0;width:92px;cursor:pointer">' +
      '<div style="width:92px;height:134px;border-radius:6px;background:' + spineTint(cl) + ';display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--border);margin-bottom:6px">' + cover + '</div>' +
      '<div style="font-size:11px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(b.title) + '</div>' +
      (daysText ? '<div style="font-size:10px;color:var(--ink-faint)">' + daysText + '</div>' : '') +
    '</div>';
  }).join('');
}

// ── Year in Review ────────────────────────────────────────────────────────
function renderYearInReview() {
  var year = new Date().getFullYear();
  document.getElementById('year-review-title').innerHTML = year + ' In Review' +
    ' <a onclick="openGoalModal()" style="font-size:12px;font-family:\'DM Sans\',sans-serif;font-weight:400;color:var(--rust);cursor:pointer">' + (_currentGoal ? 'Edit goal' : 'Set a goal') + '</a>';
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var counts = new Array(12).fill(0);
  var total = 0;
  library.forEach(function(b) {
    if (!b.finishDate) return;
    var d = new Date(b.finishDate + 'T00:00:00');
    if (d.getFullYear() !== year) return;
    counts[d.getMonth()]++;
    total++;
  });
  var el = document.getElementById('year-review-chart');
  if (!total) { el.innerHTML = '<div style="font-size:12px;color:var(--ink-faint);text-align:center;padding:6px 0">No books finished yet this year</div>'; return; }
  var max = Math.max.apply(null, counts) || 1;
  el.innerHTML =
    '<div style="font-size:12px;color:var(--ink-muted);margin-bottom:8px"><strong style="color:var(--ink)">' + total + '</strong> book' + (total !== 1 ? 's' : '') + ' finished so far</div>' +
    counts.map(function(c, i) {
      if (!c && (i > new Date().getMonth())) return ''; // skip future empty months
      return '<div class="genre-bar-row"><div class="genre-name" style="width:32px">' + monthNames[i] + '</div><div class="genre-bar-track"><div class="genre-bar-fill gold" style="width:' + Math.round((c / max) * 100) + '%"></div></div><div class="genre-count">' + c + '</div></div>';
    }).join('');
}

// ── Incomplete series ("you have 1, 2, 4 — missing 3") ──────────────────────
function renderSeriesGaps() {
  var panel = document.getElementById('series-gaps-panel');
  var list = document.getElementById('series-gaps-list');
  var bySeries = {};
  library.forEach(function(b) {
    if (!b.seriesName || !b.seriesNum) return;
    var n = parseFloat(b.seriesNum);
    if (isNaN(n) || n < 1 || !Number.isInteger(n)) return; // skip non-whole numbers (e.g. "1.5" specials)
    if (!bySeries[b.seriesName]) bySeries[b.seriesName] = [];
    if (bySeries[b.seriesName].indexOf(n) === -1) bySeries[b.seriesName].push(n);
  });

  var gaps = [];
  Object.keys(bySeries).forEach(function(name) {
    var owned = bySeries[name].sort(function(a, b) { return a - b; });
    var max = owned[owned.length - 1];
    if (max < 2) return; // nothing to be missing yet
    var missing = [];
    for (var n = 1; n <= max; n++) if (owned.indexOf(n) === -1) missing.push(n);
    if (missing.length) gaps.push({ name: name, missing: missing, owned: owned.length, max: max });
  });

  if (!gaps.length) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  gaps.sort(function(a, b) { return a.name.localeCompare(b.name); });
  list.innerHTML = gaps.map(function(g) {
    return '<div style="padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">' +
      '<div style="font-weight:600;color:var(--ink);margin-bottom:2px">' + esc(g.name) + '</div>' +
      '<div style="color:var(--ink-muted)">Have ' + g.owned + ' of ' + g.max + ' &middot; missing #' + g.missing.join(', #') + '</div>' +
    '</div>';
  }).join('');
}

// ── Reading queue (TBR) ───────────────────────────────────────────────────
// A book is in the queue when queued === true; queueOrder (1,2,3…) is its
// position. Reordering swaps orders; removing leaves gaps, which is fine
// because we always sort by value rather than assuming 1..n.
function nextQueueOrder() {
  var max = 0;
  library.forEach(function(b) { if (b.queued) max = Math.max(max, parseInt(b.queueOrder, 10) || 0); });
  return max + 1;
}

function getQueue() {
  return library.filter(function(b) { return b.queued && b.status !== 'Wishlist'; })
    .sort(function(a, b) { return (parseInt(a.queueOrder, 10) || 1e9) - (parseInt(b.queueOrder, 10) || 1e9); });
}

function toggleQueue(id) {
  var b = library.find(function(x) { return x.id === id; });
  if (!b) return;
  if (b.queued) { b.queued = false; b.queueOrder = ''; showToast('Removed from queue'); }
  else { b.queued = true; b.queueOrder = nextQueueOrder(); showToast('Added to your read-next queue'); }
  save();
  openBook(id);
  if (currentView === 'library') renderLibrary();
  if (currentView === 'dashboard') renderDashboard();
}

function moveInQueue(id, dir) {
  var q = getQueue();
  var i = q.findIndex(function(b) { return b.id === id; });
  var j = i + dir;
  if (i < 0 || j < 0 || j >= q.length) return;
  // Renumber 1..n first so swaps are always clean, then swap the two.
  q.forEach(function(b, n) { b.queueOrder = n + 1; });
  var t = q[i].queueOrder; q[i].queueOrder = q[j].queueOrder; q[j].queueOrder = t;
  save(); renderQueue();
}

function removeFromQueue(id) {
  var b = library.find(function(x) { return x.id === id; });
  if (!b) return;
  b.queued = false; b.queueOrder = '';
  save(); renderQueue();
}

function renderQueue() {
  var panel = document.getElementById('queue-panel');
  var list = document.getElementById('queue-list');
  if (!panel || !list) return;
  var q = getQueue();
  if (!q.length) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  function btn(disabled) {
    return 'style="background:none;border:1px solid var(--border-strong);border-radius:6px;cursor:pointer;color:var(--ink-muted);width:26px;height:26px;font-size:13px;flex-shrink:0' + (disabled ? ';opacity:.3;cursor:default' : '') + '"' + (disabled ? ' disabled' : '');
  }
  list.innerHTML = q.map(function(b, i) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:' + (i ? '1px solid var(--border)' : 'none') + '">' +
      '<div style="width:22px;text-align:center;font-weight:700;color:var(--rust);flex-shrink:0">' + (i + 1) + '</div>' +
      '<div style="flex:1;min-width:0;cursor:pointer" onclick="openBook(\'' + b.id + '\')">' +
        '<div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(b.title) + '</div>' +
        '<div style="font-size:11px;color:var(--ink-muted)">' + esc(b.author || 'Unknown') + '</div></div>' +
      '<button ' + btn(i === 0) + ' title="Move up" onclick="moveInQueue(\'' + b.id + '\',-1)">↑</button>' +
      '<button ' + btn(i === q.length - 1) + ' title="Move down" onclick="moveInQueue(\'' + b.id + '\',1)">↓</button>' +
      '<button ' + btn(false) + ' title="Remove from queue" onclick="removeFromQueue(\'' + b.id + '\')">✕</button>' +
    '</div>';
  }).join('');
}
