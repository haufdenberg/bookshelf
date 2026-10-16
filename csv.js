// ============================================================================
// csv.js — spreadsheet export / import (CSV)
//
// Export writes one row per book with friendly column headers; opens in
// Excel, Numbers and Google Sheets (UTF-8 BOM included so accents survive).
// Import accepts that same format AND Goodreads' "library export" CSV —
// columns are matched by header name, case-insensitively, so column order
// doesn't matter and unknown columns are ignored.
//
// Depends on: db.js (library, save, currentProfile), utils.js (showToast, esc),
//             duplicate-detection.js (findDuplicate), render-library.js
//             (getFilteredBooks), main.js (showView)
// Used by:    Settings → Data Management, Library toolbar "⬇ CSV" button
// ============================================================================

// [csv header, book field, kind]  kind: s=string, n=number, b=boolean, d=date, t=timestamp
var CSV_COLUMNS = [
  ['Title', 'title', 's'], ['Author', 'author', 's'], ['ISBN', 'isbn', 's'],
  ['Status', 'status', 's'], ['Rating', 'rating', 'n'], ['Genre', 'genre', 's'],
  ['Subgenre', 'subgenre', 's'], ['Series', 'seriesName', 's'], ['Series Number', 'seriesNum', 's'],
  ['Age Range', 'ageRange', 's'], ['Grade Level', 'grade', 's'], ['Tags', 'tags', 's'],
  ['Date Started', 'startDate', 'd'], ['Date Finished', 'finishDate', 'd'],
  ['In Read-Next Queue', 'queued', 'b'], ['Queue Position', 'queueOrder', 'n'],
  ['Loaned To', 'loanedTo', 's'], ['Loaned On', 'loanedDate', 'd'],
  ['Condition', 'condition', 's'], ['Format', 'format', 's'], ['Pages', 'pages', 's'],
  ['Quantity', 'quantity', 'n'], ['Shelf / Location', 'location', 's'],
  ['Publisher', 'publisher', 's'], ['Year', 'year', 's'], ['Language', 'language', 's'],
  ['Subjects', 'subjects', 's'], ['Cover URL', 'coverUrl', 's'],
  ['Description', 'description', 's'], ['Notes', 'notes', 's'], ['Date Added', 'addedAt', 't']
];

// Extra header names accepted on import (lowercase) → book field.
// Includes Goodreads' export columns.
var CSV_ALIASES = {
  'isbn13': 'isbn', 'isbn-13': 'isbn', 'isbn10': 'isbn', 'my rating': 'rating',
  'exclusive shelf': 'status', 'bookshelves': 'tags', 'number of pages': 'pages',
  'year published': 'year', 'original publication year': 'year', 'my review': 'notes',
  'private notes': 'notes', 'binding': 'format', 'date read': 'finishDate',
  'exact date read': 'finishDate', 'copies': 'quantity', 'owned copies': 'quantity',
  'series name': 'seriesName', 'shelf': 'location', 'location': 'location',
  'date started': 'startDate', 'date finished': 'finishDate', 'cover': 'coverUrl',
  'cover url': 'coverUrl', 'summary': 'description', 'categories': 'genre'
};

// ── Writing ────────────────────────────────────────────────────────────────
function csvCell(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  // Stop spreadsheet apps from running a cell as a formula (e.g. a title that
  // starts with "=" or "+"). A leading apostrophe is stripped again on import.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvFromBooks(books) {
  var lines = [CSV_COLUMNS.map(function(c) { return csvCell(c[0]); }).join(',')];
  books.forEach(function(b) {
    lines.push(CSV_COLUMNS.map(function(c) {
      var v = b[c[1]];
      if (c[2] === 'b') v = v ? 'Yes' : '';
      else if (c[2] === 't') v = v ? new Date(Number(v)).toISOString().slice(0, 10) : '';
      return csvCell(v);
    }).join(','));
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function downloadCsv(books, label) {
  if (!books.length) { showToast('No books to export'); return; }
  var blob = new Blob([csvFromBooks(books)], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  var stamp = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = 'bookshelf_' + (currentProfile || 'library').replace(/[^a-z0-9]/gi, '_') + '_' + label + '_' + stamp + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 5000);
  showToast('Exported ' + books.length + ' book' + (books.length === 1 ? '' : 's') + ' to CSV');
}

function exportCsvAll() { downloadCsv(library, 'all'); }
function exportCsvFiltered() { downloadCsv(getFilteredBooks(), 'filtered'); }

// ── Reading ────────────────────────────────────────────────────────────────
// Small RFC-4180 parser: quoted fields, "" escapes, newlines inside quotes.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  var rows = [], row = [], cell = '', i = 0, inQ = false;
  while (i < text.length) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } inQ = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; }
    else if (ch === ',') { row.push(cell); cell = ''; i++; }
    else if (ch === '\r') { i++; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else { cell += ch; i++; }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function(r) { return r.some(function(c) { return c.trim() !== ''; }); });
}

function csvHeaderMap(headerRow) {
  var byName = {};
  CSV_COLUMNS.forEach(function(c) { byName[c[0].toLowerCase()] = c[1]; });
  return headerRow.map(function(h) {
    var k = h.replace(/^﻿/, '').trim().toLowerCase();
    return byName[k] || CSV_ALIASES[k] || null;
  });
}

function csvNormalizeStatus(v) {
  var s = (v || '').trim().toLowerCase();
  if (!s) return 'Unread';
  if (s === 'read' || s === 'finished' || s === 'owned') return s === 'owned' ? 'Unread' : 'Read';
  if (s === 'reading' || s === 'currently-reading' || s === 'currently reading') return 'Reading';
  if (s === 'wishlist' || s === 'to-read' || s === 'want to read' || s === 'wish list') return 'Wishlist';
  if (s === 'unread') return 'Unread';
  return 'Unread';
}

// Goodreads writes dates as 2024/03/15; we want 2024-03-15.
function csvNormalizeDate(v) {
  v = (v || '').trim();
  if (!v) return '';
  var m = v.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  var d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function csvRowToBook(map, cells, seq) {
  var b = {};
  map.forEach(function(field, idx) {
    if (!field) return;
    var v = (cells[idx] || '').trim();
    if (v.charAt(0) === "'" && /^'[=+\-@]/.test(v)) v = v.slice(1);  // undo formula guard
    if (field === 'isbn') v = v.replace(/^="?(.*?)"?$/, '$1');            // Goodreads ="978…" ISBNs
    if (b[field] === undefined || b[field] === '') b[field] = v;
  });
  if (!b.title) return null;
  b.id = 'b_' + Date.now() + '_' + seq + '_' + Math.floor(Math.random() * 9999);
  b.author = (b.author || '').replace(/\s+/g, ' ');
  b.isbn = (b.isbn || '').replace(/[^0-9X]/gi, '');
  if (!/^(97[89]\d{10}|\d{9}[\dX])$/i.test(b.isbn)) b.isbn = '';
  b.status = csvNormalizeStatus(b.status);
  b.rating = Math.max(0, Math.min(5, parseInt(b.rating, 10) || 0));
  b.quantity = Math.max(1, parseInt(b.quantity, 10) || 1);
  b.startDate = csvNormalizeDate(b.startDate);
  b.finishDate = csvNormalizeDate(b.finishDate);
  b.loanedDate = csvNormalizeDate(b.loanedDate);
  var q = (b.queued || '').toLowerCase();
  b.queued = q === 'yes' || q === 'true' || q === '1';
  b.queueOrder = b.queued ? (parseInt(b.queueOrder, 10) || '') : '';
  if (b.status === 'Read' && !b.finishDate && b.addedAt === undefined) b.finishDate = '';
  var added = b.addedAt ? new Date(b.addedAt).getTime() : NaN;
  b.addedAt = isNaN(added) ? Date.now() + seq : added;
  b.condition = b.condition || 'Good';
  b.format = b.format || 'Paperback';
  b.language = b.language || 'English';
  ['subgenre', 'seriesName', 'seriesNum', 'ageRange', 'grade', 'tags', 'loanedTo', 'pages', 'location',
   'publisher', 'year', 'subjects', 'coverUrl', 'description', 'notes', 'genre'].forEach(function(k) {
    if (b[k] === undefined) b[k] = '';
  });
  return b;
}

var _csvPending = null; // {books:[...], dupes:n, skipped:n} waiting for confirmation

function importCsv(e) {
  var file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var rows;
    try { rows = parseCsv(ev.target.result); } catch (err) { showToast('Could not read that CSV'); return; }
    if (rows.length < 2) { showToast('That file has no book rows'); return; }
    var map = csvHeaderMap(rows[0]);
    if (map.indexOf('title') < 0) { showToast('No "Title" column found in the first row'); return; }
    var fresh = [], dupes = 0, skipped = 0;
    for (var i = 1; i < rows.length; i++) {
      var book = csvRowToBook(map, rows[i], i);
      if (!book) { skipped++; continue; }
      if (findDuplicate(book) || fresh.some(function(x) { return isSameBook(x, book); })) { dupes++; continue; }
      fresh.push(book);
    }
    _csvPending = { books: fresh, dupes: dupes, skipped: skipped, columns: map.filter(Boolean).length };
    showCsvPreview();
  };
  reader.readAsText(file, 'utf-8');
}

function isSameBook(a, b) {
  var ka = isbnKey(a.isbn), kb = isbnKey(b.isbn);
  if (ka && kb) return ka === kb;
  return (a.title || '').toLowerCase() === (b.title || '').toLowerCase() &&
         (a.author || '').toLowerCase() === (b.author || '').toLowerCase();
}

function showCsvPreview() {
  var p = _csvPending;
  var sample = p.books.slice(0, 5).map(function(b) {
    return '<li>' + esc(b.title) + (b.author ? ' — <span style="color:var(--ink-muted)">' + esc(b.author) + '</span>' : '') + '</li>';
  }).join('');
  document.getElementById('csv-preview-body').innerHTML =
    '<div style="font-size:14px;margin-bottom:8px"><strong>' + p.books.length + '</strong> new book' + (p.books.length === 1 ? '' : 's') + ' ready to import</div>' +
    '<div style="font-size:12px;color:var(--ink-muted);margin-bottom:10px">' +
      p.dupes + ' already in your library (skipped) · ' + p.skipped + ' row' + (p.skipped === 1 ? '' : 's') + ' without a title (skipped) · ' + p.columns + ' columns recognised</div>' +
    (sample ? '<ul style="font-size:12px;padding-left:18px;line-height:1.7">' + sample + (p.books.length > 5 ? '<li style="color:var(--ink-faint)">…and ' + (p.books.length - 5) + ' more</li>' : '') + '</ul>' : '');
  document.getElementById('csv-import-confirm').disabled = !p.books.length;
  document.getElementById('csv-preview-modal').classList.add('open');
}

function closeCsvPreview() {
  document.getElementById('csv-preview-modal').classList.remove('open');
  _csvPending = null;
}

function confirmCsvImport() {
  if (!_csvPending) return;
  var books = _csvPending.books;
  books.forEach(function(b) { library.push(b); });
  save();
  closeCsvPreview();
  showView('dashboard');
  showToast('Imported ' + books.length + ' book' + (books.length === 1 ? '' : 's') + ' from CSV');
  persistCoversInBackground(books.filter(function(b) { return b.coverUrl; }).map(function(b) { return b.id; }));
}
