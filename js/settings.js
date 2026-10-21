// ============================================================================
// settings.js — #view-settings rendering
//
// Depends on: db.js (library, currentProfile), profiles.js (fetchProfiles),
//             auth.js (_supabaseUser), account.js (renderMfaSettings),
//             backup.js (renderBackupSettings), updates.js (renderScanSettings)
// Used by:    main.js / showView('settings')
// ============================================================================

function renderSettings() {
  document.getElementById('cfg-total').textContent = library.length + ' catalog items';
  var str = JSON.stringify(library);
  var size = str ? Math.round((str.length * 2) / 1024) : 0;
  document.getElementById('cfg-storage').textContent = size + ' KB (no hard limit)';
  document.getElementById('cfg-profile').textContent = currentProfile || '—';
  var emailEl = document.getElementById('cfg-account-email');
  if (emailEl) emailEl.textContent = (_supabaseUser && _supabaseUser.email) || '—';
  fetchProfiles(function(profiles) {
    document.getElementById('cfg-profile-count').textContent = profiles.length + ' librar' + (profiles.length === 1 ? 'y' : 'ies');
  });
  renderThemeSettings();
  if (typeof renderCatalogSettings === 'function') renderCatalogSettings();
  renderDupSettingsRow();
  renderCoverSettings();
  renderMfaSettings();
  renderBackupSettings();
  renderScanSettings();
}
