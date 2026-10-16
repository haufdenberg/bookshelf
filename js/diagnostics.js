// ============================================================================
// diagnostics.js — Settings → "Check connection" and "Sync everything now"
//
// When rows don't show up in Supabase, the cause is usually one of: wrong
// URL/key, SQL not run, no library row yet, or a permissions (RLS) error.
// This runs each step and prints the exact message Supabase returns.
//
// Depends on: db.js (library, supabaseClient, _currentLibraryId, toDbRow,
//             chunkArray, SAVE_CHUNK_SIZE), auth.js (_supabaseUser), utils.js
// Used by:    Settings → Connection
// ============================================================================

function dgErr(e) {
  if (!e) return 'unknown error';
  return (e.message || String(e)) + (e.code ? ' [' + e.code + ']' : '') + (e.hint ? ' — hint: ' + e.hint : '') + (e.details ? ' — ' + e.details : '');
}

function dgLine(ok, label, detail) {
  var color = ok === true ? 'var(--sage)' : ok === false ? 'var(--rust)' : 'var(--ink-faint)';
  var mark = ok === true ? '✓' : ok === false ? '✗' : '•';
  return '<div style="display:flex;gap:8px;padding:4px 0;font-size:12px;line-height:1.5"><span style="color:' + color + ';font-weight:700;width:14px;flex-shrink:0">' + mark + '</span><div><strong>' + esc(label) + '</strong>' +
    (detail ? '<div style="color:var(--ink-muted);word-break:break-word">' + esc(detail) + '</div>' : '') + '</div></div>';
}

async function runDiagnostics() {
  var out = document.getElementById('cfg-diag-output');
  var html = '';
  function show() { out.innerHTML = html; }
  out.style.display = 'block';
  function add(ok, label, detail) { html += dgLine(ok, label, detail); show(); }

  // 1 config
  if (!supabaseClient) {
    add(false, 'Supabase is not configured', 'js/supabase-config.js still has the placeholder URL/key, or the Supabase script failed to load (check your internet connection).');
    return;
  }
  add(true, 'Supabase client created', typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '');

  // 2 session
  var sess = await supabaseClient.auth.getSession();
  if (!sess.data || !sess.data.session) { add(false, 'Not signed in', 'Sign in again.'); return; }
  add(true, 'Signed in as ' + sess.data.session.user.email, 'user id: ' + sess.data.session.user.id);

  // 3 libraries table + row
  var lib = await supabaseClient.from('libraries').select('id,name,user_id');
  if (lib.error) {
    var perm = lib.error.code === '42501';
    add(false, 'Cannot read the "libraries" table', dgErr(lib.error) + (perm
      ? '  → The tables exist but the signed-in role has no permission. Run the GRANT lines at the bottom of the latest supabase-schema.sql (or re-run the whole file).'
      : '  → Most likely supabase-schema.sql has not been run (or not fully). Run the whole file in SQL Editor.'));
    return;
  }
  add(true, 'libraries table reachable', lib.data.length + ' librar' + (lib.data.length === 1 ? 'y' : 'ies') + ' for you: ' + lib.data.map(function(l) { return l.name; }).join(', '));
  add(_currentLibraryId ? true : false, 'Active library selected in the app', _currentLibraryId ? _currentLibraryId : 'None. Nothing can be saved without one. Try the "Create library" step below.');

  // 4 books table
  var cnt = await supabaseClient.from('books').select('id', { count: 'exact', head: true });
  if (cnt.error) { add(false, 'Cannot read the "books" table', dgErr(cnt.error)); return; }
  add(true, 'books table reachable', 'Supabase holds ' + cnt.count + ' book(s) for you; this page has ' + library.length + ' in memory.');

  // 5 write test
  if (_currentLibraryId) {
    var testId = 'diag_' + Date.now();
    var ins = await supabaseClient.from('books').insert({ id: testId, library_id: _currentLibraryId, user_id: sess.data.session.user.id, title: 'Connection test' });
    if (ins.error) { add(false, 'Write test failed', dgErr(ins.error) + '  → This is the error that stops your books from saving.'); }
    else {
      await supabaseClient.from('books').delete().eq('id', testId);
      add(true, 'Write test passed', 'Inserted and removed a test row.');
    }
  }

  // 6 storage
  var st = await supabaseClient.storage.from('covers').list(sess.data.session.user.id, { limit: 1 });
  if (st.error && /slowdown|too many|429|rate/i.test(dgErr(st.error))) {
    add(null, 'Cover storage is busy', 'Supabase is rate-limiting storage right now (usually because covers are uploading). It is not an error — wait a minute and re-run the check.');
  } else {
    add(st.error ? false : true, 'Cover storage bucket', st.error ? dgErr(st.error) + '  → the "covers" bucket may be missing; re-run the schema.' : 'reachable');
  }
}

// Creates the home library row if it's missing, then reloads.
async function dgCreateLibrary() {
  var out = document.getElementById('cfg-diag-output'); out.style.display = 'block';
  var u = _supabaseUser; if (!supabaseClient || !u) { showToast('Sign in first'); return; }
  var r = await supabaseClient.from('libraries').insert({ user_id: u.id, name: 'Home' }).select('id').single();
  if (r.error) { out.innerHTML = dgLine(false, 'Could not create a library', dgErr(r.error)); return; }
  showToast('Library created — reloading…');
  setTimeout(function() { location.reload(); }, 800);
}

// Forces every book in memory up to Supabase (ignores the "already synced" cache).
async function syncEverythingNow() {
  var out = document.getElementById('cfg-diag-output'); out.style.display = 'block';
  if (!supabaseClient || !_supabaseUser) { out.innerHTML = dgLine(false, 'Not connected', 'Sign in first.'); return; }
  if (!_currentLibraryId) { out.innerHTML = dgLine(false, 'No active library', 'Use "Create library" first.'); return; }
  if (!library.length) { out.innerHTML = dgLine(null, 'Nothing to sync', 'Your library is empty in this page — import your CSV first.'); return; }
  var rows = library.map(toDbRow);
  var chunks = chunkArray(rows, 100);
  var done = 0, bad = [];
  for (var i = 0; i < chunks.length; i++) {
    out.innerHTML = dgLine(null, 'Syncing… ' + done + ' / ' + rows.length, '');
    var res = await supabaseClient.from('books').upsert(chunks[i]);
    if (!res.error) { done += chunks[i].length; continue; }
    // One bad row shouldn't block the rest — retry this chunk row by row.
    for (var j = 0; j < chunks[i].length; j++) {
      var one = await supabaseClient.from('books').upsert(chunks[i][j]);
      if (one.error) bad.push((chunks[i][j].title || chunks[i][j].id) + ' — ' + dgErr(one.error));
      else done++;
    }
  }
  _lastSyncedSnapshots = {};
  var badTitles = {};
  bad.forEach(function(b) { badTitles[b] = 1; });
  library.forEach(function(b) { _lastSyncedSnapshots[b.id] = JSON.stringify(b); });
  if (bad.length) {
    out.innerHTML = dgLine(false, 'Synced ' + done + ' of ' + rows.length + '; ' + bad.length + ' could not be saved', bad.slice(0, 8).join('\n')) +
      '<div style="font-size:11px;color:var(--ink-faint)">Send me these lines and I will fix them.</div>';
  } else {
    out.innerHTML = dgLine(true, 'Synced ' + done + ' books to Supabase', 'Refresh Table Editor → books to see them.');
  }
  showToast('Synced ' + done + ' books');
}
