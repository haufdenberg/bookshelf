// ============================================================================
// modal-shortcuts.js — click-outside-to-close and Escape-to-close for every
// modal in the app
//
// Each modal already has its own close function (closeDetailModal,
// closeFormModal, etc.) wired to an X button. This file adds two more ways
// to trigger the same close: clicking the dark backdrop, or pressing Escape.
// Neither changes what closing a modal *does* — it's the same function
// either way — just makes the modals easier to dismiss.
//
// Depends on: every close*() function listed in MODAL_CLOSE_FNS (modals.js,
//             cover-search.js, profiles.js, lookup-review.js,
//             duplicate-detection.js, bulk-add.js, account.js)
// Used by:    nothing calls into this directly — it wires itself up once
//             at the bottom of this file.
// ============================================================================

// Listed in Escape-key priority order: highest z-index (topmost / most
// recently opened on top of another modal) first, so pressing Escape closes
// whichever modal is actually on top rather than always the first in DOM order.
var MODAL_CLOSE_FNS = [
  { id: 'profile-modal',       close: function() { closeProfileModal(); } },
  { id: 'lookup-review-modal', close: function() { closeLookupReview(); } },
  { id: 'bulk-modal',          close: function() { closeBulkAdd(); } },
  { id: 'dupclean-modal',      close: function() { closeDupCleanup(); } },
  { id: 'compare-modal',       close: function() { closeCompareModal(); } },
  { id: 'csv-preview-modal',   close: function() { closeCsvPreview(); } },
  { id: 'scan-modal',          close: function() { closeBarcodeScanner(); } },
  { id: 'mfa-modal',           close: function() { cancelMfaEnroll(); } },
  { id: 'admin-browse-modal',  close: function() { closeAdminBrowseModal(); } },
  { id: 'goal-modal',          close: function() { closeGoalModal(); } },
  { id: 'password-modal',      close: function() { closePasswordModal(); } },
  { id: 'photo-modal',         close: function() { closePhotoModal(); } },
  { id: 'dup-modal',           close: function() { closeDupModal(); } },
  { id: 'form-modal',          close: function() { closeFormModal(); } },
  { id: 'detail-modal',        close: function() { closeDetailModal(); } }
];

function setupModalDismissal() {
  MODAL_CLOSE_FNS.forEach(function(m) {
    var el = document.getElementById(m.id);
    if (!el) return;
    // Only close if the click landed on the backdrop itself, not something
    // inside the modal (e.g. a form field or button) that happens to bubble.
    el.addEventListener('click', function(e) {
      if (e.target === el) m.close();
    });
  });

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    for (var i = 0; i < MODAL_CLOSE_FNS.length; i++) {
      var el = document.getElementById(MODAL_CLOSE_FNS[i].id);
      if (el && el.classList.contains('open')) {
        MODAL_CLOSE_FNS[i].close();
        break; // only close the topmost one
      }
    }
  });
}

setupModalDismissal();
