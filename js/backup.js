// ============================================================================
// backup.js — backup reminders + manual JSON export for Google Drive
//
// There's no real Drive API integration here: "backup" means downloading a
// dated JSON snapshot and opening drive.google.com so the user can drag it
// in themselves. The reminder banner just nags based on how long it's been
// since the last recorded backup for the active profile.
//
// Depends on: db.js (library, currentProfile), utils.js (showToast)
// Used by:    index.html #backup-banner buttons, Settings view
// ============================================================================

var BACKUP_FREQ_KEY='bookshelf_backup_freq';
var BACKUP_SNOOZE_KEY='bookshelf_backup_snooze';

function getBackupKey(){return 'bookshelf_last_backup_'+(currentProfile||'Home');}
function getLastBackupDate(){var ts=parseInt(localStorage.getItem(getBackupKey())||'0');return ts?new Date(ts):null;}
function recordBackup(){localStorage.setItem(getBackupKey(),Date.now().toString());}
function getBackupFreqDays(){var v=parseInt(localStorage.getItem(BACKUP_FREQ_KEY)||'7');return isNaN(v)?7:v;}
function saveBackupFreq(){var sel=document.getElementById('backup-freq-sel');if(sel)localStorage.setItem(BACKUP_FREQ_KEY,sel.value);checkBackupReminder();}
function daysSinceBackup(){var last=getLastBackupDate();if(!last)return Infinity;return(Date.now()-last.getTime())/(1000*60*60*24);}

// Shows/hides the top-of-page #backup-banner based on backup frequency
// setting, snooze state, and how long it's actually been.
function checkBackupReminder(){
  var banner=document.getElementById('backup-banner');
  var msg=document.getElementById('backup-banner-msg');
  if(!banner||!msg)return;
  var freq=getBackupFreqDays();
  if(freq===0){banner.style.display='none';return;}
  var snooze=parseInt(localStorage.getItem(BACKUP_SNOOZE_KEY)||'0');
  if(snooze&&Date.now()<snooze){banner.style.display='none';return;}
  var days=daysSinceBackup();
  if(days>=freq){
    var daysText=days===Infinity?'You have never backed up this library.':'Last backup was '+Math.floor(days)+' day'+(Math.floor(days)!==1?'s':'')+' ago.';
    msg.textContent=(currentProfile||'Home')+' library needs a backup. '+daysText;
    banner.style.display='flex';
  }else{
    banner.style.display='none';
  }
}

function dismissBackupBanner(){var b=document.getElementById('backup-banner');if(b)b.style.display='none';}

function snoozeBackup(){
  localStorage.setItem(BACKUP_SNOOZE_KEY,(Date.now()+4*60*60*1000).toString());
  dismissBackupBanner();
  showToast('Backup reminder snoozed for 4 hours');
}

// Downloads a dated JSON snapshot of the current library, then opens Google
// Drive in a new tab so the user can drag the file in — there's no direct
// Drive API upload, this is a manual two-step "download, then drag" flow.
function backupNow(){
  // Download JSON
  var str=JSON.stringify(library,null,2);
  var blob=new Blob([str],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  var profileSlug=(currentProfile||'Home').replace(/[^a-z0-9]/gi,'_');
  var dateStr=new Date().toISOString().slice(0,10);
  a.download='bookshelf_'+profileSlug+'_'+dateStr+'.json';
  a.click();
  // Open Google Drive after brief delay
  setTimeout(function(){window.open('https://drive.google.com/drive/my-drive','_blank');},800);
  // Record and update UI
  recordBackup();
  dismissBackupBanner();
  showToast('Backup downloaded! Drag it into your Drive folder.');
  renderBackupSettings();
}

// Populates the Settings view's "Last backup: ..." line and syncs the
// frequency <select> to the stored preference — mirrors renderScanSettings()
// in updates.js.
function renderBackupSettings(){
  var el=document.getElementById('cfg-last-backup');
  if(!el)return;
  var last=getLastBackupDate();
  if(!last){el.textContent='Last backup: never';}
  else{
    var days=Math.floor(daysSinceBackup());
    var dateStr=last.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    el.textContent='Last backup: '+dateStr+' ('+(days===0?'today':days+' day'+(days!==1?'s':'')+' ago')+')';
  }
  var freqSel=document.getElementById('backup-freq-sel');
  if(freqSel)freqSel.value=String(getBackupFreqDays());
}
