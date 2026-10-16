// ============================================================================
// modals.js — #detail-modal and #form-modal: open/close, tabs, and the
// small interactive widgets that live inside the form (pills, stars,
// cover image upload/drag-drop)
//
// Depends on: db.js (library, save), render-helpers.js (getEmoji, ageBadge,
//             conditionBadge), utils.js (esc, showToast, toTitleCase),
//             genre-fields.js (updateSubgenreOptions, setSubgenreCombo,
//             setAgeCombo), config.js (SPINE_COLORS, editingId, viewingId,
//             formRating, activeTab)
// Used by:    index.html onclick handlers, wishlist.js, render-library.js,
//             render-dashboard.js (all link into openBook/openEditModal)
// ============================================================================

// ── Detail modal (#detail-modal) ─────────────────────────────────────────────

function openBook(id) {
  var b = library.find(function(x) { return x.id === id; }); if (!b) return;
  viewingId = id;
  var mc = document.getElementById('dm-cover');
  var spine = document.getElementById('dm-spine');
  var em = document.getElementById('dm-emoji');

  var existingImg = document.getElementById('dm-cover-img');
  if (existingImg) existingImg.remove();

  var hv = 0; for (var i = 0; i < b.title.length; i++) { hv = ((hv << 5) - hv + b.title.charCodeAt(i)) | 0; }
  var dmColor = SPINE_COLORS[Math.abs(hv) % SPINE_COLORS.length];
  // Shared fallback used both when there's no cover at all, and when a
  // stored cover URL fails to load (see img.onerror below).
  var showEmojiFallback = function() {
    spine.style.display = ''; em.style.display = ''; em.textContent = getEmoji(b.title);
    mc.className = 'modal-cover';
    mc.style.background = spineTint(dmColor);
    spine.style.background = 'rgba(0,0,0,0.1)';
  };

  if (b.coverUrl) {
    spine.style.display = 'none'; em.style.display = 'none'; mc.className = 'modal-cover'; mc.style.background = '';
    var img = document.createElement('img'); img.id = 'dm-cover-img'; img.src = b.coverUrl; img.alt = '';
    img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
    img.onerror = function() { img.remove(); showEmojiFallback(); };
    mc.appendChild(img);
  } else {
    showEmojiFallback();
  }
  document.getElementById('dm-title').textContent = b.title;
  var dmSub = document.getElementById('dm-subtitle');
  if (b.subtitle) { dmSub.textContent = b.subtitle; dmSub.style.display = ''; } else { dmSub.style.display = 'none'; }
  document.getElementById('dm-author').textContent = b.author || 'Unknown author';
  var tags = [];
  if (b.genre) tags.push('<span class="tag genre-tag">' + esc(b.genre) + (b.subgenre ? ' › ' + esc(b.subgenre) : '') + ' </span>');
  if (b.status) tags.push('<span class="tag read-tag">' + esc(b.status) + '</span>');
  if (b.ageRange) tags.push(ageBadge(b.ageRange));
  if (b.condition) tags.push(conditionBadge(b.condition));
  if (b.format) tags.push('<span class="tag" style="background:var(--gold-light);color:var(--gold)">' + esc(b.format) + '</span>');
  if (b.seriesName) tags.push('<span class="tag" style="background:var(--cream-dark);color:var(--ink-muted)">📚 ' + esc(b.seriesName) + (b.seriesNum ? ' #' + b.seriesNum : '') + '</span>');
  document.getElementById('dm-tags').innerHTML = tags.join('');
  var meta = [['ISBN', b.isbn || '—'], ['Year', b.year || '—'], ['Pages', b.pages || '—'], ['Format', b.format || '—'], ['Publisher', b.publisher || '—'], ['Language', b.language || '—'], ['Grade', b.grade || '—'], ['Condition', b.condition || '—'], ['Qty', (b.quantity || 1).toString()], ['Location', b.location || '—'], ['Rating', b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : '—'], ['Added', new Date(b.addedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })], ['Started', b.startDate ? formatDateLocal(b.startDate) : '—'], ['Finished', b.finishDate ? formatDateLocal(b.finishDate) : '—'], ['Status', b.status || '—']];
  document.getElementById('dm-meta').innerHTML = meta.map(function(kv) { return '<div><div class="meta-label">' + kv[0] + '</div><div class="meta-value ' + (kv[1] === '—' ? 'muted' : '') + '">' + (kv[0] === 'Rating' ? '<span style="color:var(--gold)">' + kv[1] + '</span>' : esc(kv[1])) + '</div></div>'; }).join('');
  var tagsWrap = document.getElementById('dm-tags-wrap');
  if (b.tags) { tagsWrap.style.display = ''; document.getElementById('dm-tags-chips').innerHTML = b.tags.split(',').map(function(s) { return s.trim(); }).filter(Boolean).map(function(s) { return '<span class="subject-chip" style="background:var(--gold-light);color:var(--gold)">' + esc(s) + '</span>'; }).join(''); } else tagsWrap.style.display = 'none';

  var qBtn = document.getElementById('dm-queue-btn');
  if (qBtn) qBtn.textContent = b.queued ? '✓ In queue (remove)' : '📚 Add to queue';
  var loanWrap = document.getElementById('dm-loan-wrap');
  if (b.loanedTo) {
    loanWrap.style.display = 'flex';
    document.getElementById('dm-loan-text').textContent = 'Loaned to ' + b.loanedTo + (b.loanedDate ? ' on ' + formatDateLocal(b.loanedDate) : '');
  } else loanWrap.style.display = 'none';

  var sw = document.getElementById('dm-subjects-wrap');
  if (b.subjects) { sw.style.display = ''; document.getElementById('dm-subjects').innerHTML = b.subjects.split(',').map(function(s) { return s.trim(); }).filter(Boolean).map(function(s) { return '<span class="subject-chip">' + esc(s) + '</span>'; }).join(''); } else sw.style.display = 'none';
  var dw = document.getElementById('dm-desc-wrap');
  if (b.description) { dw.style.display = ''; document.getElementById('dm-desc').textContent = b.description; } else dw.style.display = 'none';
  var nw = document.getElementById('dm-notes-wrap');
  if (b.notes) { nw.style.display = ''; document.getElementById('dm-notes').textContent = b.notes; } else nw.style.display = 'none';
  var isWishlist = b.status === 'Wishlist';
  var statusBtn = document.getElementById('dm-status-btn');
  var addLibBtn = document.getElementById('dm-add-library-btn');
  if (isWishlist) {
    statusBtn.style.display = 'none';
    addLibBtn.style.display = '';
  } else {
    statusBtn.style.display = '';
    addLibBtn.style.display = 'none';
    var statuses = ['Unread', 'Reading', 'Read'];
    var curr = statuses.indexOf(b.status);
    statusBtn.textContent = 'Mark as ' + statuses[(curr + 1) % statuses.length];
  }
  document.getElementById('detail-modal').classList.add('open');
}

function closeDetailModal() { document.getElementById('detail-modal').classList.remove('open'); viewingId = null; }
function editCurrentBook() { var id = viewingId; closeDetailModal(); openEditModal(id); }

function cycleStatus() {
  var b = library.find(function(x) { return x.id === viewingId; }); if (!b) return;
  var statuses = ['Unread', 'Reading', 'Read'];
  b.status = statuses[(statuses.indexOf(b.status) + 1) % statuses.length];
  save(); showToast('Marked as ' + b.status); openBook(viewingId);
  if (currentView === 'library') renderLibrary();
}

function markReturned() {
  var b = library.find(function(x) { return x.id === viewingId; }); if (!b) return;
  b.loanedTo = ''; b.loanedDate = '';
  save(); showToast('Marked as returned'); openBook(viewingId);
  if (currentView === 'library') renderLibrary();
}

function deleteCurrentBook() {
  if (!confirm('Delete this book?')) return;
  var removed = library.find(function(b) { return b.id === viewingId; });
  library = library.filter(function(b) { return b.id !== viewingId; }); save(); closeDetailModal();
  if (currentView === 'library') renderLibrary(); if (currentView === 'dashboard') renderDashboard();
  offerUndoDelete(removed, 'Book deleted');
}

// Shows a toast with an Undo button. Undo puts the book back and saves again,
// which re-inserts it into the database (the delete already synced).
function offerUndoDelete(book, msg) {
  if (!book) { showToast(msg); return; }
  showToastAction(msg + '.', 'Undo', function() {
    if (library.some(function(b) { return b.id === book.id; })) return;
    library.push(book); save(); updateGlobalSidebarStats();
    if (currentView === 'library') renderLibrary();
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'wishlist') renderWishlist();
    showToast('Restored "' + book.title + '"');
  });
}

// ── Form modal (#form-modal) — tabs ─────────────────────────────────────────

function switchTab(t) {
  activeTab = t;
  var tabs = ['info', 'details', 'cover', 'notes'];
  tabs.forEach(function(x) {
    document.getElementById('tab-' + x).classList.toggle('active', x === t);
    document.getElementById('tab-btn-' + x).classList.toggle('active', x === t);
  });
}

// ── Form modal — open/close for Add / Add-to-Wishlist / Edit ────────────────

function openAddWishlistModal() {
  openAddModal();
  // After form resets, pre-select Wishlist status
  document.getElementById('f-status').value = 'Wishlist';
}

function openAddModal() {
  editingId = null; activeTab = 'info';
  document.getElementById('book-form').reset();
  formRating = 0; updateStars(0);
  document.getElementById('form-modal-title').textContent = 'Add New Book';
  document.getElementById('f-condition').value = 'Good';
  setPill('condition', 'Good');
  document.getElementById('f-format').value = 'Paperback';
  setPill('format', 'Paperback');
  document.getElementById('f-subtitle').value = '';
  setSubgenreCombo('');
  setAgeCombo('');
  document.getElementById('lookup-status').className = 'lookup-status';
  document.getElementById('lookup-status').textContent = '';
  document.getElementById('f-cover-url').value = '';
  setCoverPreview('');
  switchTab('info');
  document.getElementById('form-modal').classList.add('open');
}

function openEditModal(id) {
  var b = library.find(function(x) { return x.id === id; }); if (!b) return;
  editingId = id; activeTab = 'info';
  document.getElementById('form-modal-title').textContent = 'Edit Book';
  document.getElementById('f-title').value = b.title || '';
  document.getElementById('f-author').value = b.author || '';
  document.getElementById('f-subtitle').value = b.subtitle || '';
  document.getElementById('f-isbn').value = b.isbn || '';
  document.getElementById('f-genre').value = b.genre || '';
  updateSubgenreOptions();
  // Restore subgenre into combo
  setSubgenreCombo(b.subgenre || '');
  document.getElementById('f-year').value = b.year || '';
  document.getElementById('f-subjects').value = b.subjects || '';
  document.getElementById('f-series').value = b.seriesName || '';
  document.getElementById('f-series-num').value = b.seriesNum || '';
  setAgeCombo(b.ageRange || '');
  document.getElementById('f-grade').value = b.grade || '';
  document.getElementById('f-status').value = b.status || 'Unread';
  document.getElementById('f-start-date').value = b.startDate || '';
  document.getElementById('f-finish-date').value = b.finishDate || '';
  document.getElementById('f-tags').value = b.tags || '';
  document.getElementById('f-queued').checked = !!b.queued;
  document.getElementById('f-loaned-to').value = b.loanedTo || '';
  document.getElementById('f-loaned-date').value = b.loanedDate || '';
  document.getElementById('f-condition').value = b.condition || '';
  setPill('condition', b.condition || '');
  document.getElementById('f-format').value = b.format || '';
  setPill('format', b.format || '');
  document.getElementById('f-pages').value = b.pages || '';
  document.getElementById('f-quantity').value = b.quantity || 1;
  document.getElementById('f-location').value = b.location || '';
  document.getElementById('f-publisher').value = b.publisher || '';
  document.getElementById('f-language').value = b.language || 'English';
  document.getElementById('f-cover-url').value = b.coverUrl || '';
  setCoverPreview(b.coverUrl || '');
  document.getElementById('f-desc').value = b.description || '';
  document.getElementById('f-notes').value = b.notes || '';
  formRating = b.rating || 0; updateStars(formRating);
  document.getElementById('lookup-status').textContent = '';
  switchTab('info');
  document.getElementById('form-modal').classList.add('open');
}

function closeFormModal() { document.getElementById('form-modal').classList.remove('open'); editingId = null; }

// ── Form modal — small interactive widgets ──────────────────────────────────

function setPill(type, val) {
  document.getElementById('f-' + type).value = val;
  var btns = document.querySelectorAll('#f-' + type + '-group .pill-btn');
  btns.forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-value') === val); });
}

function setFormRating(r) { formRating = r; updateStars(r); }
function updateStars(r) {
  var stars = document.querySelectorAll('#star-row .star');
  stars.forEach(function(s, idx) { s.classList.toggle('active', idx < r); });
}

function setCoverPreview(url) {
  var box = document.getElementById('f-cover-preview-box');
  var em = document.getElementById('f-cover-preview-emoji');
  var existing = document.getElementById('f-preview-img');
  if (existing) existing.remove();
  if (url) {
    em.style.display = 'none';
    var img = document.createElement('img'); img.id = 'f-preview-img'; img.src = url; img.alt = '';
    img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; img.style.position = 'absolute'; img.style.inset = '0';
    img.onerror = function() { img.remove(); em.style.display = ''; };
    box.appendChild(img);
  } else {
    em.style.display = '';
  }
}

// ── Cover image upload (file picker + drag & drop), client-side compressed ──

function handleCoverFileSelect(e) {
  var file = e.target.files[0]; if (!file) return;
  processCoverFile(file);
}

function setupDragAndDrop() {
  var dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', function() { dz.classList.remove('drag-over'); });
  dz.addEventListener('drop', function(e) {
    e.preventDefault(); dz.classList.remove('drag-over');
    var file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processCoverFile(file);
  });
}

function triggerFileSelect() { document.getElementById('f-cover-file').click(); }

// Resizes to at most 240×360 and re-encodes as JPEG @ 75% quality so covers
// stay small enough to live inline in IndexedDB as data URLs.
function processCoverFile(file) {
  if (file.size > 1.5 * 1024 * 1024) { showToast('File too large (Max 1.5MB)'); return; }
  var r = new FileReader();
  r.onload = function(ev) {
    var raw = ev.target.result;
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var maxW = 240, maxH = 360;
      var w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        if (w / h > maxW / maxH) { h = Math.round(h * maxW / w); w = maxW; } else { w = Math.round(w * maxH / h); h = maxH; }
      }
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
      var compressed = canvas.toDataURL('image/jpeg', 0.75);
      document.getElementById('f-cover-url').value = compressed;
      setCoverPreview(compressed);
      showToast('Image attached and optimized ✓');
    };
    img.src = raw;
  };
  r.readAsDataURL(file);
}
