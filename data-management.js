// ============================================================================
// data-management.js — Settings → Data Management: plain JSON export/import
// and clearing the active library
//
// Distinct from backup.js: these are direct, no-frills file operations (no
// backup-reminder bookkeeping, no opening Google Drive) triggered from the
// "Export", "Import", and "Clear Library" rows in Settings.
//
// Depends on: db.js (library, currentProfile, save), utils.js (showToast),
//             main.js (showView)
// Used by:    index.html Settings view: Export button, Import file input,
//             Clear Library button
// ============================================================================

function exportData(){
  var str=JSON.stringify(library,null,2);
  var blob=new Blob([str],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='bookshelf_'+(currentProfile||'library').replace(/[^a-z0-9]/gi,'_')+'_backup.json';a.click();
}

// JSON import now goes through the same safe flow as "Check a backup file"
// (backup-compare.js): it shows what is NOT already in your library and adds
// only those. The old version added anything whose ISBN + exact title didn't
// match, so books with no ISBN or slightly different titles were added again
// every time the same file was imported.
function importData(e){
  checkBackupFile(e);
}

function clearAllData(){
  if(!confirm('Clear entire library database? This action cannot be reversed.'))return;
  library=[];save();showView('dashboard');showToast('Library cleared');
}
