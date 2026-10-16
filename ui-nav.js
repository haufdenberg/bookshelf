// ============================================================================
// ui-nav.js — account menu (top-right) and tabbed Settings
//
// Account menu: a round avatar in the top bar with a dropdown for the signed-in
// email, switching library, light/dark theme, Settings, and Sign out — so
// signing out is one click from anywhere instead of buried in Settings.
//
// Settings tabs: Account / Library & Data / Advanced. Each .settings-section in
// index.html carries data-settings-tab="…"; showSettingsTab() hides the others.
// The last-used tab is remembered per device.
//
// Depends on: auth.js (_supabaseUser, signOut), profiles.js (currentProfile via db.js,
//             openProfileModal), theme.js (getThemePref, setThemePref), main.js (showView)
// Used by:    index.html (topbar #account-menu-wrap, Settings tab bar), main.js
// ============================================================================

// ── Account menu ────────────────────────────────────────────────────────────
function renderAccountMenu() {
  var wrap = document.getElementById('account-menu-wrap');
  if (!wrap) return;
  var email = (_supabaseUser && _supabaseUser.email) || '';
  var initial = (email.charAt(0) || '?').toUpperCase();
  document.getElementById('account-avatar').textContent = initial;
  var themeLabel = { auto: 'Theme: match device', light: 'Theme: light', dark: 'Theme: dark' }[getThemePref()];
  var lib = (typeof currentProfile !== 'undefined' && currentProfile) ? currentProfile : '—';
  document.getElementById('account-dropdown').innerHTML =
    '<div class="am-head"><div class="am-email">' + esc(email || 'Not signed in') + '</div>' +
      '<div class="am-sub">Library: ' + esc(lib) + '</div></div>' +
    '<button class="am-item" onclick="closeAccountMenu();openProfileModal()">📚 Switch library</button>' +
    '<button class="am-item" onclick="cycleTheme()">🌓 ' + themeLabel + '</button>' +
    '<button class="am-item" onclick="closeAccountMenu();showView(\'settings\');showSettingsTab(\'account\')">⚙️ Account settings</button>' +
    '<div class="am-sep"></div>' +
    '<button class="am-item am-danger" onclick="closeAccountMenu();signOut()">↩ Sign out</button>';
}

function toggleAccountMenu(e) {
  if (e) e.stopPropagation();
  var dd = document.getElementById('account-dropdown');
  var open = dd.classList.toggle('open');
  document.getElementById('account-avatar').setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) renderAccountMenu();
}
function closeAccountMenu() {
  var dd = document.getElementById('account-dropdown');
  if (dd) dd.classList.remove('open');
  var a = document.getElementById('account-avatar');
  if (a) a.setAttribute('aria-expanded', 'false');
}
function cycleTheme() {
  var next = { auto: 'light', light: 'dark', dark: 'auto' }[getThemePref()];
  setThemePref(next);
  renderAccountMenu();
  renderThemeSettings();
}

document.addEventListener('click', function(e) {
  var wrap = document.getElementById('account-menu-wrap');
  if (wrap && !wrap.contains(e.target)) closeAccountMenu();
});
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeAccountMenu(); });

// ── Settings tabs ───────────────────────────────────────────────────────────
var SETTINGS_TABS = ['account', 'data', 'advanced'];

function showSettingsTab(tab) {
  if (SETTINGS_TABS.indexOf(tab) < 0) tab = 'account';
  document.querySelectorAll('#view-settings .settings-section').forEach(function(sec) {
    sec.classList.toggle('tab-hidden', sec.getAttribute('data-settings-tab') !== tab);
  });
  document.querySelectorAll('#settings-tabs .settings-tab').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  try { localStorage.setItem('bookshelf-settings-tab', tab); } catch (e) {}
}

function initSettingsTabs() {
  var saved = 'account';
  try { saved = localStorage.getItem('bookshelf-settings-tab') || 'account'; } catch (e) {}
  showSettingsTab(saved);
}
