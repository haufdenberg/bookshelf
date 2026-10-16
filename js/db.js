// ============================================================================
// db.js — Supabase-backed persistence layer
//
// Replaces the original IndexedDB implementation. Keeps the exact same
// external interface the rest of the app already depends on, so nothing
// outside this file (and profiles.js) needed to change:
//   - `library`       global array of book objects, camelCase fields
//   - `save()`         call after mutating `library` — syncs to Supabase
//   - `loadLibraryFromDB(callback)`  (re)loads `library` from Supabase
//   - `currentProfile`  the *name* of the active library (e.g. "Home"),
//                        kept as a plain string for compatibility with
//                        profiles.js and everywhere else that reads it
//
// Also owns: mapping between the app's camelCase book fields and Postgres's
// snake_case columns, `_currentLibraryId` (the Supabase row id behind
// whatever `currentProfile` name is active), and `_activeOwnerId` — whose
// books these actually are. Normally that's just the signed-in user
// (_supabaseUser.id). An admin "viewing as" someone else (see account.js's
// admin panel) points `_activeOwnerId` at that other person instead, so
// anything saved while browsing their library is correctly attributed to
// THEM, not the admin — see toDbRow().
//
// save() only uploads books that actually changed since the last successful
// sync (tracked via `_lastSyncedSnapshots`, a per-id content fingerprint),
// rather than re-sending the whole library on every save — important once a
// library gets into the hundreds of books, since otherwise something as
// small as marking one book "Read" would re-upload everything every time.
// Uploads are also chunked (SAVE_CHUNK_SIZE rows per request) so a large
// one-time import (e.g. restoring hundreds of books, some with embedded
// cover images) doesn't risk hitting a single request's size limit.
//
// Depends on: supabase-config.js (supabaseClient), auth.js (_supabaseUser),
//             utils.js (showToast), render-helpers.js (updateGlobalSidebarStats)
// Used by:    everywhere the original IndexedDB db.js was used
// ============================================================================

var library = [];
var currentProfile = '';
var _currentLibraryId = null;
var _activeOwnerId = null;     // whose library this is; null = the signed-in user themself
var _lastSyncedSnapshots = {}; // id -> JSON.stringify(book) as of the last successful sync/load
var SAVE_CHUNK_SIZE = 200;     // rows per upsert request

// ── camelCase (app) <-> snake_case (Postgres) field mapping ──────────────────
// Only fields whose names actually differ need an entry here — everything
// else (title, author, isbn, genre, subgenre, year, subjects, grade, status,
// condition, format, pages, quantity, location, publisher, language,
// description, notes, rating, tags, queued) maps 1:1 by the same name on
// both sides.
var BOOK_FIELD_TO_DB = {
  seriesName: 'series_name',
  seriesNum: 'series_num',
  ageRange: 'age_range',
  coverUrl: 'cover_url',
  addedAt: 'added_at',
  startDate: 'start_date',
  finishDate: 'finish_date',
  loanedTo: 'loaned_to',
  loanedDate: 'loaned_date',
  queueOrder: 'queue_order'
};
var BOOK_FIELD_FROM_DB = (function() {
  var rev = {};
  Object.keys(BOOK_FIELD_TO_DB).forEach(function(k) { rev[BOOK_FIELD_TO_DB[k]] = k; });
  return rev;
})();

// Postgres `date` columns reject '' (empty string) — has to be null instead.
var DATE_DB_COLUMNS = ['start_date', 'finish_date', 'loaned_date', 'queue_order']; // also queue_order (integer) — '' -> null

// The only columns that exist on the `books` table. Anything else on a book
// object (old backup fields such as "_pk", experimental fields…) is ignored
// instead of making the whole upload fail with "column not found".
var BOOK_DB_COLUMNS = ['title', 'subtitle', 'author', 'isbn', 'genre', 'subgenre', 'year', 'subjects',
  'series_name', 'series_num', 'age_range', 'grade', 'status', 'condition', 'format', 'pages', 'quantity',
  'location', 'publisher', 'language', 'cover_url', 'description', 'notes', 'rating', 'added_at',
  'start_date', 'finish_date', 'tags', 'loaned_to', 'loaned_date', 'queued', 'queue_order'];
var BOOK_INT_COLUMNS = ['quantity', 'rating', 'queue_order'];

function toDbRow(book) {
  var ownerId = _activeOwnerId || _supabaseUser.id;
  var row = { id: String(book.id), library_id: _currentLibraryId, user_id: ownerId };
  Object.keys(book).forEach(function(k) {
    if (k === 'id') return;
    var dbKey = BOOK_FIELD_TO_DB[k] || k;
    if (BOOK_DB_COLUMNS.indexOf(dbKey) < 0) return;
    row[dbKey] = book[k];
  });
  DATE_DB_COLUMNS.forEach(function(col) {
    if (row[col] === '' || row[col] === undefined) { if (col in row) row[col] = null; }
  });
  // Dates must be YYYY-MM-DD; integers must be numbers; guard against bad old data.
  ['start_date', 'finish_date', 'loaned_date'].forEach(function(col) {
    if (row[col] && !/^\d{4}-\d{2}-\d{2}$/.test(String(row[col]))) row[col] = null;
  });
  BOOK_INT_COLUMNS.forEach(function(col) {
    if (!(col in row)) return;
    var n = parseInt(row[col], 10);
    row[col] = isNaN(n) ? (col === 'queue_order' ? null : (col === 'quantity' ? 1 : 0)) : n;
  });
  if ('added_at' in row) { var t = Number(row.added_at); row.added_at = isFinite(t) && t > 0 ? Math.round(t) : Date.now(); }
  if ('queued' in row) row.queued = !!row.queued;
  if (!row.title) row.title = 'Untitled';
  return row;
}

function fromDbRow(row) {
  var book = { id: row.id };
  Object.keys(row).forEach(function(dbKey) {
    if (dbKey === 'id' || dbKey === 'library_id' || dbKey === 'user_id' || dbKey === 'created_at') return;
    var jsKey = BOOK_FIELD_FROM_DB[dbKey] || dbKey;
    book[jsKey] = row[dbKey] === null ? '' : row[dbKey];
  });
  return book;
}

function chunkArray(arr, size) {
  var out = [];
  for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Loading the active library's books ───────────────────────────────────────
function loadLibraryFromDB(callback) {
  if (!supabaseClient || !_currentLibraryId) { library = []; callback(); return; }
  supabaseClient.from('books').select('*').eq('library_id', _currentLibraryId)
    .then(function(res) {
      if (res.error) {
        console.error('Failed to load books', res.error);
        showToast('Could not load your library — check your connection');
        library = [];
      } else {
        library = (res.data || []).map(fromDbRow);
      }
      _lastSyncedSnapshots = {};
      library.forEach(function(b) { _lastSyncedSnapshots[b.id] = JSON.stringify(b); });
      callback();
    });
}

// Uploads only the books that actually changed since the last successful
// sync (by comparing each book's current JSON fingerprint against what was
// last synced), deletes any row that was synced before but no longer
// exists in `library`, and chunks large uploads into multiple requests.
//
// Callers don't await this (matching the old fire-and-forget IndexedDB
// pattern) — on failure we surface a toast rather than throwing, so a
// dropped connection doesn't break the calling code's flow. Failed rows
// are simply left out of the updated snapshot, so the next save() retries
// them automatically.
function save() {
  updateGlobalSidebarStats();
  if (!supabaseClient || !_supabaseUser) return;
  if (!_currentLibraryId) {
    console.warn('save(): no active library — nothing was synced');
    showToast('Not saved to the cloud: no library found. Settings → Connection → Check connection.');
    return;
  }

  var currentIds = library.map(function(b) { return b.id; });
  var toDelete = Object.keys(_lastSyncedSnapshots).filter(function(id) { return currentIds.indexOf(id) === -1; });

  var changedBooks = [];
  var newSnapshots = {};
  library.forEach(function(book) {
    var snap = JSON.stringify(book);
    newSnapshots[book.id] = snap;
    if (_lastSyncedSnapshots[book.id] !== snap) changedBooks.push(book);
  });

  if (!changedBooks.length && !toDelete.length) return; // nothing to sync

  var chunks = chunkArray(changedBooks.map(toDbRow), SAVE_CHUNK_SIZE);
  var ops = chunks.map(function(chunk) { return supabaseClient.from('books').upsert(chunk); });
  if (toDelete.length) ops.push(supabaseClient.from('books').delete().in('id', toDelete));

  Promise.all(ops).then(function(results) {
    var failed = results.filter(function(r) { return r && r.error; });
    if (failed.length) {
      console.error('Sync error', failed[0].error);
      showToast('Sync failed: ' + (failed[0].error.message || 'unknown error') + ' (Settings → Connection for details)');
      return; // leave snapshots stale so the next save() retries these rows
    }
    _lastSyncedSnapshots = newSnapshots;
  });
}

// ── Resolving a library NAME to its Supabase row id ─────────────────────────
// Creates the row on first use (e.g. the very first time "Home" is needed),
// mirroring the old behavior where profiles were implicitly created. Always
// resolves within the SIGNED-IN user's own libraries — admins browsing
// someone else's library use enterLibraryAsAdmin() (account.js) instead,
// which sets _currentLibraryId/_activeOwnerId directly from a library they
// already picked, rather than resolving by name.
function ensureLibraryRow(name, callback) {
  supabaseClient.from('libraries').select('id').eq('user_id', _supabaseUser.id).eq('name', name).maybeSingle()
    .then(function(res) {
      if (res.data) { callback(res.data.id); return; }
      supabaseClient.from('libraries').insert({ user_id: _supabaseUser.id, name: name }).select('id').single()
        .then(function(insertRes) {
          if (insertRes.error) { showToast('Could not create library "' + name + '"'); callback(null); return; }
          callback(insertRes.data.id);
        });
    });
}
