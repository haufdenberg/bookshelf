// ============================================================================
// account.js — Settings → Account: change password, and set up / turn off
// two-factor authentication (TOTP, i.e. an authenticator app like Google
// Authenticator, Authy, 1Password, etc.)
//
// (The sign-in side of 2FA — the code prompt — lives in auth.js.)
//
// Depends on: supabase-config.js (supabaseClient), utils.js (showToast)
// Used by:    index.html Settings → Account rows, #password-modal, #mfa-modal,
//             settings.js (renderMfaSettings), modal-shortcuts.js
// ============================================================================

// ── Change password ─────────────────────────────────────────────────────────
function openPasswordModal() {
  document.getElementById('password-new').value = '';
  document.getElementById('password-new2').value = '';
  document.getElementById('password-error').style.display = 'none';
  document.getElementById('password-modal').classList.add('open');
  document.getElementById('password-new').focus();
}
function closePasswordModal() {
  document.getElementById('password-modal').classList.remove('open');
}

function handlePasswordChange(e) {
  e.preventDefault();
  var pw = document.getElementById('password-new').value;
  var pw2 = document.getElementById('password-new2').value;
  var errEl = document.getElementById('password-error');
  var btn = document.getElementById('password-save-btn');
  var fail = function(msg) { errEl.textContent = msg; errEl.style.display = ''; };
  errEl.style.display = 'none';
  if (pw.length < 6) { fail('Password must be at least 6 characters.'); return; }
  if (pw !== pw2) { fail('The two passwords don\'t match.'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  supabaseClient.auth.updateUser({ password: pw }).then(function(res) {
    btn.disabled = false; btn.textContent = 'Update Password';
    if (res.error) { fail(res.error.message); return; }
    closePasswordModal();
    showToast('Password updated');
  });
}

// ── Two-factor authentication: status shown in Settings ─────────────────────
function renderMfaSettings() {
  var statusEl = document.getElementById('cfg-mfa-status');
  var btn = document.getElementById('cfg-mfa-btn');
  if (!statusEl || !btn || !supabaseClient) return;
  supabaseClient.auth.mfa.listFactors().then(function(res) {
    var verified = (res.data && res.data.totp) || [];
    if (verified.length) {
      statusEl.textContent = 'On';
      btn.textContent = 'Turn Off';
      btn.onclick = function() { disableMfa(verified[0].id); };
    } else {
      statusEl.textContent = 'Off';
      btn.textContent = 'Set Up';
      btn.onclick = startMfaEnroll;
    }
  });
}

// ── Setting up 2FA ──────────────────────────────────────────────────────────
var _mfaEnrollFactorId = null; // the not-yet-verified factor during setup

function startMfaEnroll() {
  var btn = document.getElementById('cfg-mfa-btn');
  if (btn) btn.disabled = true;
  // An abandoned earlier setup leaves an unverified factor behind, and a
  // second enroll would then collide with it — so clear those out first.
  supabaseClient.auth.mfa.listFactors().then(function(res) {
    var stale = ((res.data && res.data.all) || []).filter(function(f) { return f.status !== 'verified'; });
    return Promise.all(stale.map(function(f) { return supabaseClient.auth.mfa.unenroll({ factorId: f.id }); }));
  }).then(function() {
    return supabaseClient.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Bookshelf' });
  }).then(function(res) {
    if (btn) btn.disabled = false;
    if (res.error) { showToast('Could not start setup: ' + res.error.message); return; }
    _mfaEnrollFactorId = res.data.id;
    var qr = (res.data.totp && res.data.totp.qr_code) || '';
    // The QR comes back as an SVG; make sure it's usable as an <img> source
    if (qr.indexOf('data:') !== 0) qr = 'data:image/svg+xml;utf-8,' + encodeURIComponent(qr);
    document.getElementById('mfa-qr').src = qr;
    document.getElementById('mfa-secret').textContent = (res.data.totp && res.data.totp.secret) || '';
    document.getElementById('mfa-code').value = '';
    document.getElementById('mfa-error').style.display = 'none';
    document.getElementById('mfa-modal').classList.add('open');
    document.getElementById('mfa-code').focus();
  });
}

function handleMfaEnrollConfirm(e) {
  e.preventDefault();
  var code = document.getElementById('mfa-code').value.replace(/\s+/g, '');
  var errEl = document.getElementById('mfa-error');
  var btn = document.getElementById('mfa-confirm-btn');
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Verifying…';
  supabaseClient.auth.mfa.challengeAndVerify({ factorId: _mfaEnrollFactorId, code: code }).then(function(res) {
    btn.disabled = false; btn.textContent = 'Turn On';
    if (res.error) { errEl.textContent = res.error.message; errEl.style.display = ''; return; }
    _mfaEnrollFactorId = null; // verified — keep it
    document.getElementById('mfa-modal').classList.remove('open');
    showToast('Two-factor authentication is on');
    renderMfaSettings();
  });
}

// Closing the setup dialog without finishing discards the half-made factor
function cancelMfaEnroll() {
  document.getElementById('mfa-modal').classList.remove('open');
  if (_mfaEnrollFactorId) {
    supabaseClient.auth.mfa.unenroll({ factorId: _mfaEnrollFactorId });
    _mfaEnrollFactorId = null;
  }
}

// ── Turning 2FA off ─────────────────────────────────────────────────────────
function disableMfa(factorId) {
  if (!confirm('Turn off two-factor authentication? Signing in will only need your password.')) return;
  supabaseClient.auth.mfa.unenroll({ factorId: factorId }).then(function(res) {
    if (res.error) { showToast('Could not turn off: ' + res.error.message); return; }
    showToast('Two-factor authentication is off');
    renderMfaSettings();
  });
}

// ============================================================================
// Admin: browsing every family member's library
//
// An admin is granted (server-side, via Row Level Security — see
// supabase-schema.sql) read/write access to every user's libraries and
// books, not just their own. This section is the UI for that: a "Browse All
// Libraries" button in Settings (shown only to an actual admin), a picker
// modal, and "entering" a chosen library by pointing db.js's
// _currentLibraryId/_activeOwnerId at it instead of the admin's own.
// ============================================================================

var _isAdmin = false;
var _adminOwnProfile = null; // the admin's own currentProfile name, so "Exit" can return to it

// Checked once after sign-in (see main.js). Caches the result in _isAdmin
// and shows/hides the Settings → Admin section accordingly.
function checkAdminStatus(callback) {
  supabaseClient.from('user_roles').select('role').eq('user_id', _supabaseUser.id).maybeSingle()
    .then(function(res) {
      _isAdmin = !!(res.data && res.data.role === 'admin');
      var section = document.getElementById('admin-settings-section');
      if (section) section.style.display = _isAdmin ? '' : 'none';
      if (callback) callback(_isAdmin);
    });
}

function openAdminBrowseModal() {
  var list = document.getElementById('admin-browse-list');
  list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--ink-faint);font-size:13px">Loading…</div>';
  document.getElementById('admin-browse-modal').classList.add('open');

  Promise.all([
    supabaseClient.rpc('admin_list_users'),
    supabaseClient.from('libraries').select('id,user_id,name'),
    supabaseClient.from('books').select('library_id')
  ]).then(function(results) {
    var usersRes = results[0], libsRes = results[1], booksRes = results[2];
    if (usersRes.error || libsRes.error || booksRes.error) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--rust);font-size:13px">Could not load libraries.</div>';
      return;
    }
    var emailById = {};
    (usersRes.data || []).forEach(function(u) { emailById[u.user_id] = u.email; });
    var countByLib = {};
    (booksRes.data || []).forEach(function(b) { countByLib[b.library_id] = (countByLib[b.library_id] || 0) + 1; });

    var libs = libsRes.data || [];
    if (!libs.length) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--ink-faint);font-size:13px">No libraries found yet.</div>';
      return;
    }
    // Group by owner, own account first
    libs.sort(function(a, b) {
      if (a.user_id === _supabaseUser.id) return -1;
      if (b.user_id === _supabaseUser.id) return 1;
      return (emailById[a.user_id] || '').localeCompare(emailById[b.user_id] || '');
    });

    list.innerHTML = libs.map(function(l) {
      var isMine = l.user_id === _supabaseUser.id;
      var owner = isMine ? 'You' : (emailById[l.user_id] || 'Unknown user');
      var count = countByLib[l.id] || 0;
      return '<div style="display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:10px;margin-bottom:8px;border:1px solid var(--border);background:var(--surface)">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:600;color:var(--ink)">' + esc(l.name) + '</div>' +
          '<div style="font-size:11px;color:var(--ink-faint);margin-top:1px">' + esc(owner) + ' · ' + count + ' book' + (count !== 1 ? 's' : '') + '</div>' +
        '</div>' +
        (isMine
          ? '<span style="font-size:11px;color:var(--ink-faint)">Use the library switcher</span>'
          : '<button class="btn btn-secondary" style="font-size:12px" onclick="enterLibraryAsAdmin(\'' + l.id + '\',\'' + l.user_id + '\',\'' + esc(l.name).replace(/'/g, "\\'") + '\',\'' + esc(owner).replace(/'/g, "\\'") + '\')">View</button>') +
      '</div>';
    }).join('');
  });
}

function closeAdminBrowseModal() {
  document.getElementById('admin-browse-modal').classList.remove('open');
}

// Points the app at someone else's library. Mirrors what switchProfile()
// does, but sources the library id/owner directly (picked from the browse
// list) instead of resolving the signed-in user's own library by name.
function enterLibraryAsAdmin(libraryId, ownerId, libraryName, ownerLabel) {
  if (!_adminOwnProfile) _adminOwnProfile = currentProfile; // remember how to get back
  closeAdminBrowseModal();
  _currentLibraryId = libraryId;
  _activeOwnerId = ownerId;
  currentProfile = libraryName;
  library = [];
  loadLibraryFromDB(function() {
    renderDashboard();
    renderLibrary();
    showView('dashboard');
    document.getElementById('admin-view-msg').textContent = 'Viewing ' + ownerLabel + '\u2019s library: ' + libraryName;
    document.getElementById('admin-view-banner').style.display = 'flex';
    showToast('Viewing ' + ownerLabel + '\u2019s "' + libraryName + '"');
  });
}

function exitAdminView() {
  document.getElementById('admin-view-banner').style.display = 'none';
  switchProfile(_adminOwnProfile || 'Home', true);
  _adminOwnProfile = null;
}
