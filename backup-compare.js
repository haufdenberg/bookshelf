// ============================================================================
// backup-compare.js — Settings → "Check a backup file"
//
// Answers "did everything in my backup make it into the app?". Pick a JSON
// backup (or a CSV) and it lists every book in the file that is NOT in your
// library right now, with a button to add just those.
//
// A file book counts as "already in the library" when:
//   • it has the same id, or
//   • both have a valid ISBN and they match (ISBN-10 and -13 of the same book
//     match each other), or
//   • neither has a valid ISBN and title + author match.
// Two books with the same title but DIFFERENT valid ISBNs are separate
// (e.g. the 8 different "Animorphs" volumes, or hardcover vs paperback).
//
// Depends on: db.js (library, save), utils.js (isbnKey, esc, showToast),
//             csv.js (parseCsv, csvHeaderMap, csvRowToBook)
// Used by:    Settings → Data Management
// ============================================================================

var _cmpMissing = [];

function bcNorm(s) { return (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''); }

function bcSame(a, b) {
  if (a.id && b.id && a.id === b.id) return true;
  var ka = isbnKey(a.isbn), kb = isbnKey(b.isbn);
  if (ka && kb) return ka === kb;
  return !!(bcNorm(a.title) && bcNorm(a.title) === bcNorm(b.title) && bcNorm(a.author) === bcNorm(b.author));
}

function checkBackupFile(e) {
  var file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var items = [];
    try {
      if (/\.csv$/i.test(file.name)) {
        var rows = parseCsv(ev.target.result), map = csvHeaderMap(rows[0] || []);
        for (var i = 1; i < rows.length; i++) { var bk = csvRowToBook(map, rows[i], i); if (bk) items.push(bk); }
      } else {
        var data = JSON.parse(ev.target.result);
        items = (Array.isArray(data) ? data : (data.books || [])).filter(function(x) { return x && x.title; });
      }
    } catch (err) { showToast('Could not read that file'); return; }

    var present = 0, selfDupes = 0, missing = [];
    items.forEach(function(it) {
      if (library.some(function(b) { return bcSame(b, it); })) { present++; return; }
      if (missing.some(function(m) { return bcSame(m, it); })) { selfDupes++; return; }
      missing.push(it);
    });
    _cmpMissing = missing;
    var list = missing.slice(0, 40).map(function(b) {
      return '<li>' + esc(b.title) + (b.author ? ' — <span style="color:var(--ink-muted)">' + esc(b.author) + '</span>' : '') +
        (b.isbn ? ' <span style="color:var(--ink-faint)">(' + esc(b.isbn) + ')</span>' : '') + '</li>';
    }).join('');
    document.getElementById('compare-body').innerHTML =
      '<div style="font-size:13px;line-height:1.8"><div>Books in the file: <strong>' + items.length + '</strong></div>' +
      '<div>Already in your library: <strong style="color:var(--sage)">' + present + '</strong></div>' +
      (selfDupes ? '<div>Repeats inside the file (same book listed twice): <strong>' + selfDupes + '</strong></div>' : '') +
      '<div>Missing from your library: <strong style="color:' + (missing.length ? 'var(--rust)' : 'var(--sage)') + '">' + missing.length + '</strong></div></div>' +
      (missing.length
        ? '<ul style="font-size:12px;padding-left:18px;line-height:1.7;margin-top:10px;max-height:260px;overflow:auto">' + list + (missing.length > 40 ? '<li style="color:var(--ink-faint)">…and ' + (missing.length - 40) + ' more</li>' : '') + '</ul>'
        : '<div style="margin-top:10px;font-size:13px">✓ Everything in this file is already in your library.</div>');
    document.getElementById('compare-add-btn').style.display = missing.length ? '' : 'none';
    document.getElementById('compare-add-btn').textContent = 'Add ' + missing.length + ' missing book' + (missing.length === 1 ? '' : 's');
    document.getElementById('compare-modal').classList.add('open');
  };
  reader.readAsText(file, 'utf-8');
}

function closeCompareModal() { document.getElementById('compare-modal').classList.remove('open'); _cmpMissing = []; }

function addMissingFromBackup() {
  var ids = {};
  library.forEach(function(b) { ids[b.id] = true; });
  var n = 0;
  _cmpMissing.forEach(function(b, i) {
    var copy = JSON.parse(JSON.stringify(b));
    if (!copy.id || ids[copy.id]) copy.id = 'b_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 9999);
    ids[copy.id] = true;
    delete copy._pk;
    if (!copy.addedAt) copy.addedAt = Date.now() + i;
    if (!copy.status) copy.status = 'Unread';
    if (!copy.quantity) copy.quantity = 1;
    library.push(copy); n++;
  });
  save();
  closeCompareModal();
  showView('dashboard');
  showToast('Added ' + n + ' book' + (n === 1 ? '' : 's') + ' from the backup');
  persistCoversInBackground(library.slice(-n).map(function(b) { return b.id; }));
}
