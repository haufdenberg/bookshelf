// ============================================================================
// theme.js — light / dark / auto theme
//
// Loaded in <head> (before first paint) so the saved theme applies with no
// flash. The choice ("auto" | "light" | "dark") lives in localStorage, per
// browser/device; "auto" follows the operating system setting.
//
// Depends on: nothing
// Used by:    index.html <head>, Settings → Appearance (#cfg-theme select)
// ============================================================================

function getThemePref() {
  try { return localStorage.getItem('bookshelf-theme') || 'auto'; } catch (e) { return 'auto'; }
}

function applyTheme() {
  var pref = getThemePref();
  var dark = pref === 'dark' ||
    (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function setThemePref(pref) {
  try { localStorage.setItem('bookshelf-theme', pref); } catch (e) {}
  applyTheme();
}

function renderThemeSettings() {
  var sel = document.getElementById('cfg-theme');
  if (sel) sel.value = getThemePref();
}

applyTheme();
if (window.matchMedia) {
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) {}
}
