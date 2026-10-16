// ============================================================================
// main.js — app bootstrap + view routing
//
// This should be the LAST script loaded (aside from modal-shortcuts.js) —
// window.onload wires together everything defined in the other modules.
//
// Depends on: auth.js (initAuth), genre-fields.js (populateGenreDropdowns),
//             modals.js (setupDragAndDrop), profiles.js (initProfiles),
//             account.js (checkAdminStatus)
//             showView() itself depends on render-dashboard.js,
//             render-library.js, wishlist.js, updates.js, settings.js,
//             modals.js (openAddModal), wishlist.js (openAddWishlistModal)
// ============================================================================

window.onload = function() {
  initAuth(function() {
    // Only reached once a signed-in session is confirmed — see auth.js
    populateGenreDropdowns();
    setupDragAndDrop();
    initProfiles();
    checkAdminStatus();
    renderAccountMenu();
    initSettingsTabs();
  });
};

// Central view switcher — shows the requested .view section, highlights the
// matching sidebar nav item, updates the topbar title, triggers that view's
// render function, and swaps the topbar's primary Add button between
// "Add Book" and "Add to Wishlist" depending on context.
function showView(viewId) {
  currentView = viewId;
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  document.getElementById('view-' + viewId).classList.add('active');
  var activeNav = document.querySelector('.nav-item[data-view="' + viewId + '"]');
  if (activeNav) activeNav.classList.add('active');

  var titles = { 'dashboard': 'Dashboard', 'library': 'My Books Collection', 'wishlist': 'My Personal Wishlist', 'updates': 'Suggested Updates', 'settings': 'Application Settings' };
  document.getElementById('topbar-title').textContent = titles[viewId] || 'Bookshelf';

  if (viewId === 'dashboard') renderDashboard();
  if (viewId === 'library') renderLibrary();
  if (viewId === 'wishlist') renderWishlist();
  if (viewId === 'updates') renderUpdates();
  if (viewId === 'settings') renderSettings();

  // Update the topbar Add button for wishlist vs other views
  var addBtn = document.querySelector('.topbar .btn-primary');
  if (addBtn) {
    if (viewId === 'wishlist') {
      addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add to Wishlist';
      addBtn.setAttribute('onclick', 'openAddWishlistModal()');
    } else {
      addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Book';
      addBtn.setAttribute('onclick', 'openAddModal()');
    }
  }
}
