// ============================================================================
// forms.js — #book-form submit handling
//
// Depends on: db.js (library, save), utils.js (toTitleCase, showToast),
//             config.js (editingId, formRating), modals.js (closeFormModal),
//             render-dashboard.js / render-library.js / wishlist.js
//             (renderDashboard, renderLibrary, renderWishlist)
//             dup-detection (findDuplicate, openDupModal — TODO, not yet ported)
// Used by:    index.html <form id="book-form" onsubmit="handleFormSubmit(event)">
// ============================================================================

function handleFormSubmit(e) {
  e.preventDefault();
  var title = toTitleCase(document.getElementById('f-title').value.trim());
  var author = document.getElementById('f-author').value.trim();
  if (!title || !author) return;
  // Write title case back into the field so the user sees it
  document.getElementById('f-title').value = title || document.getElementById('f-title').value;

  // Auto-fill reading dates the user didn't set themselves: moving a book to
  // "Reading" implies it was started (today, if no date given); moving it to
  // "Read" implies it's finished (and, if somehow skipped, started) today.
  var status = document.getElementById('f-status').value;
  var startDate = document.getElementById('f-start-date').value;
  var finishDate = document.getElementById('f-finish-date').value;
  var today = new Date().toISOString().slice(0, 10);
  if (status === 'Reading' && !startDate) startDate = today;
  if (status === 'Read') {
    if (!finishDate) finishDate = today;
    if (!startDate) startDate = today;
  }

  var payload = {
    id: editingId || 'b_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    title: title, author: author,
    subtitle: document.getElementById('f-subtitle').value.trim(),
    isbn: (function() { var v = document.getElementById('f-isbn').value.trim().replace(/[^0-9X]/gi, ''); return (/^(97[89]\d{10}|\d{9}[\dX])$/i.test(v) ? v : ''); })(),
    genre: document.getElementById('f-genre').value,
    subgenre: document.getElementById('f-subgenre').value,
    year: document.getElementById('f-year').value,
    subjects: document.getElementById('f-subjects').value.trim(),
    seriesName: document.getElementById('f-series').value.trim(),
    seriesNum: document.getElementById('f-series-num').value,
    ageRange: document.getElementById('f-age').value,
    grade: document.getElementById('f-grade').value.trim(),
    status: status,
    startDate: startDate,
    finishDate: finishDate,
    tags: document.getElementById('f-tags').value.trim(),
    queued: document.getElementById('f-queued').checked,
    loanedTo: document.getElementById('f-loaned-to').value.trim(),
    loanedDate: document.getElementById('f-loaned-date').value,
    condition: document.getElementById('f-condition').value,
    format: document.getElementById('f-format').value,
    pages: document.getElementById('f-pages').value,
    quantity: parseInt(document.getElementById('f-quantity').value) || 1,
    location: document.getElementById('f-location').value.trim(),
    publisher: document.getElementById('f-publisher').value.trim(),
    language: document.getElementById('f-language').value.trim(),
    coverUrl: document.getElementById('f-cover-url').value.trim(),
    description: document.getElementById('f-desc').value.trim(),
    notes: document.getElementById('f-notes').value.trim(),
    rating: formRating,
    queueOrder: '',
    addedAt: editingId ? (library.find(function(x) { return x.id === editingId; }) || { addedAt: Date.now() }).addedAt : Date.now()
  };
  var prevBook = editingId ? library.find(function(x) { return x.id === editingId; }) : null;
  if (payload.queued) payload.queueOrder = (prevBook && prevBook.queueOrder) || nextQueueOrder();
  if (editingId) {
    library = library.map(function(x) { return x.id === editingId ? payload : x; });
    save(); closeFormModal(); showToast('Changes saved');
  } else {
    var dup = findDuplicate(payload);
    if (dup) { openDupModal(dup, payload); return; }
    library.push(payload);
    save(); closeFormModal(); showToast('Book added successfully');
  }
  persistCoversInBackground([payload.id]);
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'library') renderLibrary();
  if (currentView === 'wishlist') renderWishlist();
}
