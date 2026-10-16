// ============================================================================
// wishlist.js — #view-wishlist rendering, cards, and wishlist ↔ library moves
//
// Depends on: db.js (library, save), render-helpers.js (getEmoji, esc),
//             config.js (SPINE_COLORS), utils.js (showToast),
//             modals.js (closeDetailModal, openEditModal)
// Used by:    main.js / showView('wishlist')
// ============================================================================

function wishCard(b) {
  var colors = SPINE_COLORS;
  var hv = 0; for (var i = 0; i < b.title.length; i++) { hv = ((hv << 5) - hv + b.title.charCodeAt(i)) | 0; }
  var cl = colors[Math.abs(hv) % colors.length];
  var coverDisplay = b.coverUrl ? '<img src="' + esc(b.coverUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0" onerror="handleCoverError(this,\'' + getEmoji(b.title) + '\',\'' + cl + '\',\'28px\')">' : '<span style="font-size:28px;position:relative;z-index:1">' + getEmoji(b.title) + '</span>';
  var genreTag = b.genre ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:500;background:var(--sage-light);color:var(--sage);margin-right:4px">' + esc(b.genre) + '</span>' : '';
  var ageTag = b.ageRange ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:500;background:var(--cream-dark);color:var(--ink-muted)">' + esc(b.ageRange) + '</span>' : '';
  var notes = b.notes ? '<div style="font-size:11px;color:var(--ink-muted);margin-top:6px;line-height:1.5;font-style:italic;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' + esc(b.notes) + '</div>' : '';
  return '<div class="wish-card">' +
    '<div class="wish-card-cover" style="background:' + spineTint(cl) + '" onclick="openBook(\'' + b.id + '\')">' + coverDisplay + '</div>' +
    '<div style="flex:1;min-width:0">' +
      '<div class="wish-card-title" onclick="openBook(\'' + b.id + '\')">' + esc(b.title) + '</div>' +
      '<div style="font-size:11px;color:var(--ink-muted);margin-bottom:5px">' + esc(b.author || 'Unknown author') + (b.year ? ' · ' + esc(b.year) : '') + '</div>' +
      '<div>' + genreTag + ageTag + '</div>' +
      notes +
    '</div>' +
    '<div class="wish-card-actions">' +
      '<button class="wish-btn-add" onclick="addToLibrary(\'' + b.id + '\')">✓ Add to Library</button>' +
      '<button class="wish-btn-edit" onclick="openEditModal(\'' + b.id + '\')">Edit</button>' +
      '<button class="wish-btn-remove" onclick="removeFromWishlist(\'' + b.id + '\')">Remove</button>' +
    '</div>' +
  '</div>';
}

// Converts a wishlist entry into an owned book (status: Unread) in place —
// same record, just flips its status rather than creating a duplicate.
function addToLibrary(id) {
  var b = library.find(function(x) { return x.id === id; });
  if (!b) return;
  b.status = 'Unread';
  if (!b.condition) b.condition = 'Good';
  save();
  showToast('"' + b.title + '" added to library!');
  // If the detail modal is open, close it
  closeDetailModal();
  renderWishlist();
  updateGlobalSidebarStats();
}

function removeFromWishlist(id) {
  var b = library.find(function(x) { return x.id === id; });
  if (!b) return;
  library = library.filter(function(x) { return x.id !== id; });
  save();
  offerUndoDelete(b, 'Removed from wishlist');
  renderWishlist();
}

function editWishlistBook(id) {
  openEditModal(id);
}

function renderWishlist() {
  var container = document.getElementById('wishlist-container');
  var wish = library.filter(function(b) { return b.status === 'Wishlist'; });
  if (!wish.length) {
    container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><div class="empty-title">Wishlist is empty</div><div class="empty-sub">Add a book and set its status to Wishlist, or use the Add Book button above.</div></div>';
    return;
  }
  container.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div style="font-size:13px;color:var(--ink-muted)"><strong style="color:var(--ink)">' + wish.length + '</strong> book' + (wish.length !== 1 ? 's' : '') + ' on your wishlist</div>' +
      '<div style="font-size:11px;color:var(--ink-faint)">Click "Add to Library" when purchased</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' + wish.map(wishCard).join('') + '</div>';
}
