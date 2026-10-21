// ============================================================================
// profiles.js — multi-library ("profile") management, Supabase-backed
//
// A "profile" is a named library belonging to the signed-in user (e.g.
// "Home", "Classroom") — stored as a row in the `libraries` table. This file
// owns: fetching/rendering the list, the "Manage Libraries" modal, the
// sidebar quick-switch pills, and switching/creating/deleting libraries.
// Book data itself lives in the `books` table scoped by `library_id` — see
// db.js for that half, including ensureLibraryRow() which this file uses to
// resolve a library's name to its row id.
//
// Depends on: supabase-config.js (supabaseClient), auth.js (_supabaseUser),
//             db.js (currentProfile, _currentLibraryId, loadLibraryFromDB,
//             ensureLibraryRow), utils.js (esc, showToast),
//             render-dashboard.js / render-library.js (renderDashboard,
//             renderLibrary), main.js (showView), updates.js / backup.js
//             (checkAutoScan, checkBackupReminder)
// ============================================================================

var _profilesCache = []; // [{name, created_at}] — refreshed on demand, not kept in sync automatically

function fetchProfiles(callback) {
  if (!supabaseClient || !_supabaseUser) { callback([]); return; }  // not connected: show settings anyway
  supabaseClient.from('libraries').select('name,created_at').eq('user_id', _supabaseUser.id)
    .order('created_at').then(function(res) {
      _profilesCache = res.data || [];
      callback(_profilesCache);
    });
}

// ── Profile management ────────────────────────────────────────────────────────
function openProfileModal() {
  fetchProfiles(function() {
    renderProfileList();
    document.getElementById('profile-modal').classList.add('open');
  });
}
function closeProfileModal() {
  document.getElementById('profile-modal').classList.remove('open');
  document.getElementById('profile-new-input').value = '';
}

function renderProfileList() {
  var profiles = _profilesCache;
  var list = document.getElementById('profile-list');
  if (!profiles.length) {
    list.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--ink-faint);font-size:13px">No libraries yet.</div>';
    return;
  }
  var html = '';
  for (var pi = 0; pi < profiles.length; pi++) {
    var p = profiles[pi];
    var isActive = p.name === currentProfile;
    var safeName = esc(p.name);
    var border   = isActive ? 'var(--rust)'       : 'var(--border)';
    var bg       = isActive ? 'var(--rust-light)'  : 'white';
    var iconBg   = isActive ? 'var(--rust)'        : 'var(--cream-dark)';
    var iconClr  = isActive ? 'white'              : 'var(--ink-muted)';
    var titleClr = isActive ? 'var(--rust)'        : 'var(--ink)';
    var activeLabel = isActive
      ? ' <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--rust);opacity:0.8">(active)</span>'
      : '';
    var actionBtns = '';
    if (!isActive) {
      actionBtns =
        '<button data-action="switch" data-profile="' + safeName + '" ' +
          'style="padding:6px 14px;background:var(--ink);color:var(--on-ink);border:none;border-radius:7px;' +
          'font-size:12px;font-weight:500;cursor:pointer;font-family:DM Sans,sans-serif">Switch</button> ' +
        '<button data-action="delete" data-profile="' + safeName + '" ' +
          'style="padding:6px 10px;background:var(--surface);color:var(--rust);border:1px solid var(--rust-light);' +
          'border-radius:7px;font-size:11px;cursor:pointer;font-family:DM Sans,sans-serif">Delete</button>';
    }
    html +=
      '<div style="display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:10px;' +
        'margin-bottom:8px;border:2px solid ' + border + ';background:' + bg + '">' +
        '<div style="width:40px;height:40px;border-radius:9px;background:' + iconBg + ';' +
          'display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + iconClr + '" stroke-width="2">' +
            '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>' +
            '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' +
          '</svg>' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:600;color:' + titleClr + '">' + safeName + activeLabel + '</div>' +
          '<div style="font-size:11px;color:var(--ink-faint);margin-top:1px">' +
            'Created ' + new Date(p.created_at).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:4px;align-items:center;flex-shrink:0">' + actionBtns + '</div>' +
      '</div>';
  }
  list.innerHTML = html;
  // Attach delegated listeners (avoids inline onclick with special chars)
  list.onclick = function(ev) {
    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var profileName = btn.getAttribute('data-profile');
    // Decode HTML entities back to real string
    var tmp = document.createElement('textarea'); tmp.innerHTML = profileName; profileName = tmp.value;
    if (action === 'switch') switchProfile(profileName);
    if (action === 'delete') deleteProfile(profileName);
  };
}

function createProfile() {
  var inp = document.getElementById('profile-new-input');
  var name = inp.value.trim();
  if (!name) { showToast('Enter a library name'); return; }
  if (name.length > 40) { showToast('Name too long (max 40 chars)'); return; }
  if (_profilesCache.find(function(p) { return p.name.toLowerCase() === name.toLowerCase(); })) {
    showToast('A library with that name already exists'); return;
  }
  supabaseClient.from('libraries').insert({ user_id: _supabaseUser.id, name: name }).then(function(res) {
    if (res.error) { showToast('Could not create library'); return; }
    inp.value = '';
    switchProfile(name);
  });
}

function deleteProfile(name) {
  if (name === currentProfile) { showToast('Cannot delete the active library — switch first'); return; }
  if (!confirm('Delete "' + name + '" and all its books? This cannot be undone.')) return;
  // The `books.library_id` foreign key is ON DELETE CASCADE (see
  // supabase-schema.sql), so deleting the library row removes its books too.
  supabaseClient.from('libraries').delete().eq('user_id', _supabaseUser.id).eq('name', name).then(function(res) {
    if (res.error) { showToast('Could not delete library'); return; }
    fetchProfiles(function() {
      renderProfileList();
      showToast('Library "' + name + '" deleted');
    });
  });
}

// `silent` suppresses the "Switched to X" toast — used for the initial
// load on app startup, where showing that toast would be noise.
function switchProfile(name, silent) {
  currentProfile = name;
  _activeOwnerId = null; // always resolves to the signed-in user's own libraries, not an admin "viewing as" target
  localStorage.setItem('bookshelf_last_profile', name);
  updateProfileBar();
  closeProfileModal();
  library = [];
  ensureLibraryRow(name, function(libId) {
    _currentLibraryId = libId;
    loadLibraryFromDB(function() {
      renderDashboard();
      renderLibrary();
      showView('dashboard');
      if (!silent) showToast('Switched to "' + name + '"');
      checkBackupReminder();
      checkAutoScan();
      if (typeof catalogAutoCheck === 'function') catalogAutoCheck();
    });
  });
}

function updateProfileBar() {
  var nameEl = document.getElementById('profile-bar-name');
  if (nameEl) nameEl.textContent = currentProfile || '—';
  if (typeof renderAccountMenu === 'function') renderAccountMenu();
  var qsEl = document.getElementById('sidebar-quick-switch');
  if (!qsEl) return;
  fetchProfiles(function(profiles) {
    var html = '';
    for (var pi = 0; pi < profiles.length; pi++) {
      var p = profiles[pi];
      var isActive = p.name === currentProfile;
      var safeName = esc(p.name);
      var borderColor = isActive ? 'var(--rust-mid)'     : 'rgba(255,255,255,0.15)';
      var bgColor     = isActive ? 'rgba(168,67,50,0.3)' : 'transparent';
      var textColor   = isActive ? '#F7F3ED'             : 'rgba(247,243,237,0.6)';
      var fontWeight  = isActive ? '600'                 : '400';
      html +=
        '<button data-qs-profile="' + safeName + '" data-qs-active="' + (isActive?'1':'0') + '" ' +
          'style="padding:4px 10px;border-radius:14px;border:1.5px solid ' + borderColor + ';' +
          'background:' + bgColor + ';color:' + textColor + ';font-size:11px;' +
          'font-family:DM Sans,sans-serif;font-weight:' + fontWeight + ';' +
          'cursor:pointer;white-space:nowrap;transition:all 0.15s">' +
          safeName +
        '</button>';
    }
    html +=
      '<button id="qs-add-btn" title="Manage libraries" ' +
        'style="padding:4px 9px;border-radius:14px;border:1.5px solid rgba(255,255,255,0.15);' +
        'background:transparent;color:rgba(247,243,237,0.4);font-size:14px;cursor:pointer;' +
        'line-height:1;transition:all 0.15s">+</button>';
    qsEl.innerHTML = html;
    // Delegated click — decode HTML entities so apostrophes work
    qsEl.onclick = function(ev) {
      var btn = ev.target.closest('[data-qs-profile]');
      if (btn) {
        var tmp = document.createElement('textarea');
        tmp.innerHTML = btn.getAttribute('data-qs-profile');
        var pname = tmp.value;
        if (btn.getAttribute('data-qs-active') === '1') openProfileModal();
        else switchProfile(pname);
        return;
      }
      if (ev.target.closest('#qs-add-btn')) openProfileModal();
    };
  });
}

// Called once, right after sign-in (see auth.js's initAuth() -> onReady()).
// Ensures the signed-in user has at least a "Home" library, then switches
// into whichever library they last used (or "Home" on a brand new account).
function initProfiles() {
  fetchProfiles(function(profiles) {
    var last = localStorage.getItem('bookshelf_last_profile');
    var ensureHome = function(cb) {
      if (profiles.find(function(p) { return p.name === 'Home'; })) { cb(); return; }
      supabaseClient.from('libraries').insert({ user_id: _supabaseUser.id, name: 'Home' }).then(function(r) {
        if (r.error) { console.error('Could not create Home library', r.error); showToast('Could not create your library: ' + r.error.message); }
        cb();
      });
    };
    ensureHome(function() {
      fetchProfiles(function(freshProfiles) {
        if (!freshProfiles.length) { showToast('No library found — open Settings → Connection → Check connection'); return; }
        var startProfile = (last && freshProfiles.find(function(p) { return p.name === last; }))
          ? last : freshProfiles[0].name;
        switchProfile(startProfile, true);
      });
    });
  });
}
