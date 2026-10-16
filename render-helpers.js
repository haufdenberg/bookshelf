// ============================================================================
// render-helpers.js — small rendering building blocks shared across views
//
// bookCard() in particular is the workhorse: it's used by the Library grid,
// the Dashboard's live search results, and anywhere else a book needs to
// show up as a tile.
//
// Depends on: config.js (SPINE_COLORS, EMOJIS), utils.js (esc), db.js (library)
// Used by:    render-dashboard.js, render-library.js, wishlist.js, db.js (save())
// ============================================================================

// Deterministic "random" emoji per title, so the same book always gets the
// same fallback cover glyph across renders.
function getEmoji(title) {
  if (!title) return EMOJIS[0];
  var total = 0; for (var i = 0; i < title.length; i++) total += title.charCodeAt(i);
  return EMOJIS[total % EMOJIS.length];
}

// SPINE_COLORS holds solid hex colors (e.g. '#A84332'), not CSS class names.
// This turns one into a light background tint suitable for a cover/thumb
// placeholder, by appending an alpha channel (~10% opacity) — e.g.
// '#A84332' -> '#A843321A'. Returned as a ready-to-use CSS color value for
// inline styles (`style="background:" + spineTint(hex)`), NOT a class name.
function spineTint(hex) {
  return hex + '1A';
}

// Called via onerror="" on any book-cover <img>. If a stored cover URL ever
// fails to load — dead link, moved CDN asset, hotlink protection, etc. —
// this swaps it for the same emoji + tinted-background placeholder used
// when there's no cover at all, instead of leaving a blank box behind a
// broken image. `fontSize` is optional, matching whatever inline font-size
// the emoji would have had at that call site.
function handleCoverError(img, emoji, hex, fontSize) {
  var parent = img.parentElement;
  img.remove();
  if (!parent) return;
  parent.style.background = spineTint(hex);
  var span = document.createElement('span');
  span.style.position = 'relative';
  span.style.zIndex = '1';
  if (fontSize) span.style.fontSize = fontSize;
  span.textContent = emoji;
  parent.appendChild(span);
}

function ageBadge(val) {
  if (!val) return '';
  var cls = 'age-adult';
  if (val.includes('Pre-K')) cls = 'age-prek';
  else if (val.includes('Early')) cls = 'age-early';
  else if (val.includes('Middle')) cls = 'age-mid';
  else if (val.includes('Young')) cls = 'age-ya';
  else cls = 'age-adult'; // handles custom values gracefully
  return '<span class="age-badge ' + cls + '">' + esc(val) + '</span>';
}

function conditionBadge(val) {
  if (!val) return '';
  var bg = '#E2E8F0', co = '#475569';
  if (val === 'Good') { bg = '#D1FAE5'; co = '#065F46'; }
  else if (val === 'Okay') { bg = '#FEF3C7'; co = '#92400E'; }
  else if (val === 'Rough') { bg = '#FEE2E2'; co = '#991B1B'; }
  return '<span class="tag" style="background:' + bg + ';color:' + co + '">' + esc(val) + '</span>';
}

// The book tile used in grid views. `showSeriesNum` overlays a "#N" badge
// when the Library view is filtered to a single series.
function bookCard(b, showSeriesNum) {
  var colors = SPINE_COLORS;
  var hv = 0; for (var i = 0; i < b.title.length; i++) { hv = ((hv << 5) - hv + b.title.charCodeAt(i)) | 0; }
  var cl = colors[Math.abs(hv) % colors.length];
  var stars = b.rating ? '<span style="color:var(--gold);font-size:11px">' + ('★'.repeat(b.rating)) + '</span>' : '';
  var coverDisplay = b.coverUrl ? '<img src="' + esc(b.coverUrl) + '" alt="" onerror="handleCoverError(this,\'' + getEmoji(b.title) + '\',\'' + cl + '\')">' : '<span style="position:relative;z-index:1">' + getEmoji(b.title) + '</span>';
  var numBadge = showSeriesNum && b.seriesNum ? '<div style="position:absolute;top:4px;right:4px;background:rgba(28,26,23,0.78);color:white;border-radius:8px;font-size:10px;font-weight:700;padding:1px 5px;z-index:3;line-height:1.4">#' + esc(String(b.seriesNum)) + '</div>' : '';
  var seriesLabel = showSeriesNum && b.seriesNum ? '<div style="font-size:10px;color:var(--rust);font-weight:600;margin-bottom:2px">Book #' + esc(String(b.seriesNum)) + '</div>' : '';
  var flags = (b.queued ? '<div title="In read-next queue" style="position:absolute;top:4px;left:12px;background:var(--rust);color:white;border-radius:8px;font-size:10px;font-weight:700;padding:1px 5px;z-index:3;line-height:1.4">📚' + (b.queueOrder ? ' ' + esc(String(b.queueOrder)) : '') + '</div>' : '') +
    (b.loanedTo ? '<div title="Loaned to ' + esc(b.loanedTo) + '" style="position:absolute;bottom:4px;left:12px;background:var(--gold);color:white;border-radius:8px;font-size:10px;font-weight:600;padding:1px 6px;z-index:3;line-height:1.4;max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🤝 ' + esc(b.loanedTo) + '</div>' : '');
  return '<div class="book-card" onclick="openBook(\'' + b.id + '\')"><div class="book-cover" style="position:relative' + (b.coverUrl ? '' : ';background:' + spineTint(cl)) + '"><div class="book-cover-spine" style="background:rgba(0,0,0,0.08)"></div>' + coverDisplay + numBadge + flags + '</div>' + seriesLabel + '<div class="book-card-title">' + esc(b.title) + '</div><div class="book-card-author">' + esc(b.author || 'Unknown') + '</div><div class="book-card-footer">' + stars + (b.quantity > 1 ? '<span class="qty-badge">×' + b.quantity + '</span>' : '') + '</div></div>';
}

// Keeps the left sidebar's Total/Read/Unread/Wishlist counters in sync with
// `library`. Called after every save() and on view/profile switches.
function updateGlobalSidebarStats() {
  var books = library.filter(function(b) { return b.status !== 'Wishlist'; });
  var wish = library.filter(function(b) { return b.status === 'Wishlist'; });
  var read = books.filter(function(b) { return b.status === 'Read'; });
  document.getElementById('stat-total').textContent = books.length;
  document.getElementById('stat-read').textContent = read.length;
  document.getElementById('stat-unread').textContent = (books.length - read.length);
  document.getElementById('stat-wish').textContent = wish.length;
}
