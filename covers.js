// ============================================================================
// covers.js — permanent cover storage (Supabase Storage "covers" bucket)
//
// Cover links found on the web (Google Books, Open Library, …) can break or
// change. This module copies each cover into YOUR Supabase storage and swaps
// the book's coverUrl for the permanent link. Uploaded image files (which
// were previously stored as huge inline data: strings in the database row)
// are moved to storage the same way.
//
// Files are stored at covers/<your-user-id>/<book-id>.jpg (the schema's
// storage policy only lets you write inside your own folder). Images are
// downscaled to max 600px tall JPEG, usually 30–80 KB each.
//
// Many sites don't allow browsers to download their images directly (CORS).
// When a direct download fails we retry through the free images.weserv.nl
// image proxy, which only ever sees the public cover URL, never your data.
// If that fails too, the original link is left untouched.
//
// Depends on: db.js (library, save, supabaseClient), auth.js (_supabaseUser),
//             utils.js (showToast)
// Used by:    forms.js / bulk-add.js (background save after adding),
//             Settings → Cover Storage ("Save all covers permanently")
// ============================================================================

var COVER_BUCKET = 'covers';
var COVER_MAX_H = 600;
var _coverMigrationRunning = false;

// True when the URL points somewhere other than our own storage bucket.
function needsPermanentCover(url) {
  if (!url) return false;
  if (url.indexOf('data:image') === 0) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  return url.indexOf('/storage/v1/object/public/' + COVER_BUCKET + '/') < 0;
}

function fetchCoverBlob(url) {
  if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) {
    return fetch(url).then(function(r) { return r.blob(); });
  }
  var direct = url.replace(/^http:\/\//i, 'https://');
  function check(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.blob().then(function(b) {
      if (!b.type || b.type.indexOf('image/') !== 0 || b.size < 500) throw new Error('not an image');
      return b;
    });
  }
  return fetch(direct).then(check).catch(function() {
    var proxied = 'https://images.weserv.nl/?url=' + encodeURIComponent(direct.replace(/^https?:\/\//i, ''));
    return fetch(proxied).then(check);
  });
}

// Downscale + re-encode as JPEG. Resolves with the original blob if the
// browser can't decode it (so we still store something rather than fail).
function shrinkCover(blob) {
  return new Promise(function(resolve) {
    var objUrl = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function() {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { URL.revokeObjectURL(objUrl); resolve(blob); return; }
      if (h > COVER_MAX_H) { w = Math.round(w * COVER_MAX_H / h); h = COVER_MAX_H; }
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // flatten transparency for JPEG
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objUrl);
      c.toBlob(function(out) { resolve(out || blob); }, 'image/jpeg', 0.85);
    };
    img.onerror = function() { URL.revokeObjectURL(objUrl); resolve(blob); };
    img.src = objUrl;
  });
}

// Supabase rate-limits storage ("SlowDown" / 429 / 503). Wait and try again
// with growing pauses instead of giving up on the cover.
function uploadWithRetry(path, blob, attempt) {
  return supabaseClient.storage.from(COVER_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg', cacheControl: '31536000' })
    .then(function(res) {
      var msg = res.error ? ((res.error.message || '') + ' ' + (res.error.statusCode || res.error.status || '')) : '';
      var throttled = res.error && /slowdown|too many|rate|429|503|timeout/i.test(msg);
      if (throttled && attempt < 5) {
        return new Promise(function(r) { setTimeout(r, 1500 * Math.pow(2, attempt)); })
          .then(function() { return uploadWithRetry(path, blob, attempt + 1); });
      }
      return res;
    });
}

// Resolves true on success (book.coverUrl updated in memory, caller saves).
function persistCover(book) {
  if (!supabaseClient || !_supabaseUser || !needsPermanentCover(book.coverUrl)) return Promise.resolve(false);
  var path = _supabaseUser.id + '/' + book.id + '.jpg';
  return fetchCoverBlob(book.coverUrl)
    .then(shrinkCover)
    .then(function(blob) { return uploadWithRetry(path, blob, 0); })
    .then(function(res) {
      if (res.error) throw res.error;
      var pub = supabaseClient.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
      book.coverUrl = pub + '?v=' + Date.now().toString(36); // cache-bust if replaced later
      return true;
    })
    .catch(function(e) { console.warn('Cover not stored for "' + book.title + '"', e); return false; });
}

// Quiet background version used right after adding/editing a book.
function persistCoversInBackground(ids) {
  if (!supabaseClient || _coverMigrationRunning) return;
  var books = ids.map(function(id) { return library.find(function(b) { return b.id === id; }); })
    .filter(function(b) { return b && needsPermanentCover(b.coverUrl); });
  if (!books.length) return;
  // Small worker pool (2 at a time) so a big import doesn't open hundreds of uploads at once.
  var idx = 0, anyOk = false;
  function next() {
    if (idx >= books.length) return Promise.resolve();
    var book = books[idx++];
    return persistCover(book).then(function(ok) {
      if (ok) anyOk = true;
      if (ok && idx % 25 === 0) save();
      return next();
    });
  }
  var workers = [];
  for (var i = 0; i < Math.min(2, books.length); i++) workers.push(next());
  Promise.all(workers).then(function() {
    if (anyOk) {
      save();
      if (typeof currentView !== 'undefined' && currentView === 'library') renderLibrary();
    }
  });
}

// ── Settings → Cover Storage ────────────────────────────────────────────────
function renderCoverSettings() {
  var el = document.getElementById('cfg-cover-status');
  var btn = document.getElementById('cfg-cover-btn');
  if (!el) return;
  var withCover = library.filter(function(b) { return b.coverUrl; });
  var pending = withCover.filter(function(b) { return needsPermanentCover(b.coverUrl); });
  el.textContent = withCover.length
    ? (withCover.length - pending.length) + ' of ' + withCover.length + ' covers stored permanently'
    : 'No covers yet';
  if (btn) btn.style.display = pending.length && supabaseClient ? '' : 'none';
}

function migrateAllCovers() {
  if (_coverMigrationRunning) return;
  var pending = library.filter(function(b) { return needsPermanentCover(b.coverUrl); });
  if (!pending.length) { showToast('All covers are already stored'); return; }
  if (!confirm('Copy ' + pending.length + ' cover image' + (pending.length === 1 ? '' : 's') + ' into your Supabase storage? This can take a few minutes — keep this tab open.')) return;
  _coverMigrationRunning = true;
  var el = document.getElementById('cfg-cover-status');
  var btn = document.getElementById('cfg-cover-btn');
  if (btn) btn.disabled = true;
  var done = 0, ok = 0, idx = 0, WORKERS = 2;

  function next() {
    if (idx >= pending.length) return Promise.resolve();
    var book = pending[idx++];
    return persistCover(book).then(function(success) {
      done++; if (success) ok++;
      if (el) el.textContent = 'Saving covers… ' + done + ' / ' + pending.length;
      if (ok && ok % 25 === 0 && success) save(); // periodic checkpoint
      return next();
    });
  }
  var workers = [];
  for (var i = 0; i < WORKERS; i++) workers.push(next());
  Promise.all(workers).then(function() {
    _coverMigrationRunning = false;
    if (btn) btn.disabled = false;
    save();
    showToast(ok + ' cover' + (ok === 1 ? '' : 's') + ' stored' + (done - ok ? ', ' + (done - ok) + ' could not be downloaded (left as links)' : ''));
    renderCoverSettings();
    if (currentView === 'library') renderLibrary();
  });
}
