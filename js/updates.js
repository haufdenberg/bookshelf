// ============================================================================
// updates.js — periodic "scan my library for updated info" feature
//
// Compares each book's stored fields (series, age range, grade, genre,
// subjects, summary) against fresh API data and surfaces anything that
// looks newer/more complete as a suggested update the user can accept or
// ignore in the #view-updates tab.
//
// Depends on: db.js (library, currentProfile, save), config.js (SPINE_COLORS),
//             utils.js (esc, showToast, toTitleCase), render-helpers.js
//             (getEmoji), autofill.js (cleanSummary, KNOWN_SERIES),
//             modals.js (openBook), main.js (showView)
// Used by:    Settings view (Automatic Updates section), the Updates nav
//             badge, index.html's "Scan Now" button
// ============================================================================

var SCAN_FREQ_KEY='bookshelf_scan_freq';
var SCAN_LAST_KEY='bookshelf_scan_last_';
var _pendingUpdates=[]; // [{book, fields:[{key,label,current,suggested}]}]

function getScanFreqDays(){var v=parseInt(localStorage.getItem(SCAN_FREQ_KEY)||'7');return isNaN(v)?7:v;}
function saveScanFreq(){var s=document.getElementById('scan-freq-sel');if(s)localStorage.setItem(SCAN_FREQ_KEY,s.value);}
function getScanLastKey(){return SCAN_LAST_KEY+(currentProfile||'Home');}
function getLastScanDate(){var ts=parseInt(localStorage.getItem(getScanLastKey())||'0');return ts?new Date(ts):null;}
function recordScan(){localStorage.setItem(getScanLastKey(),Date.now().toString());}
function daysSinceScan(){var last=getLastScanDate();if(!last)return Infinity;return(Date.now()-last.getTime())/(1000*60*60*24);}

// Called on load/profile-switch — kicks off a scan automatically if it's
// been longer than the configured frequency since the last one.
function checkAutoScan(){
  var freq=getScanFreqDays();
  if(freq===0)return;
  if(daysSinceScan()>=freq)runUpdateScan(false);
}

// Populates the Settings view's "Last scan: ..." line and syncs the
// frequency <select> to the stored preference.
function renderScanSettings(){
  var el=document.getElementById('cfg-last-scan');
  if(!el)return;
  var last=getLastScanDate();
  if(!last){el.textContent='Last scan: never';}
  else{
    var days=Math.floor(daysSinceScan());
    var ds=last.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    el.textContent='Last scan: '+ds+' ('+(days===0?'today':days+' day'+(days!==1?'s':'')+' ago')+')';
  }
  var s=document.getElementById('scan-freq-sel');
  if(s)s.value=String(getScanFreqDays());
}

// Updates the little count badge next to "Updates" in the sidebar nav to
// reflect how many pending suggestions haven't been dismissed/ignored.
function updateBadge(){
  var badge=document.getElementById('updates-badge');
  if(!badge)return;
  var n=_pendingUpdates.filter(function(u){return u.fields.some(function(f){return!f.ignored;});}).length;
  badge.textContent=n;
  badge.style.display=n>0?'inline':'none';
}

// Fields we compare and their display labels (drives both the diff logic in
// fetchUpdatesForBook and the row labels in #view-updates).
var UPDATE_FIELDS=[
  {key:'seriesName',  label:'Series Name'},
  {key:'seriesNum',   label:'Series #'},
  {key:'ageRange',    label:'Age Range'},
  {key:'grade',       label:'Grade Level'},
  {key:'genre',       label:'Genre'},
  {key:'subgenre',    label:'Subgenre'},
  {key:'lexile',      label:'Lexile'},
  {key:'subjects',    label:'Subjects'},
  {key:'description', label:'Summary'}
];

// Fetches fresh data for one book from Google Books, Open Library, and the
// local KNOWN_SERIES map, and returns only the fields that differ from what's
// currently stored (as {key,label,current,suggested,ignored} rows ready for
// the Updates view / renderUpdates()).
async function fetchUpdatesForBook(book){
  var suggestions={};
  var isbn=book.isbn;
  var title=book.title;
  var author=book.author;

  // ── Google Books ──
  try{
    var q=isbn?('isbn:'+isbn):encodeURIComponent('intitle:'+title+(author?' inauthor:'+author.split(' ').slice(-1)[0]:''));
    var gr=await fetch('https://www.googleapis.com/books/v1/volumes?q='+q+'&maxResults=3');
    var gd=await gr.json();
    if(gd.items&&gd.items[0]){
      var vi=gd.items[0].volumeInfo||{};
      var si=gd.items[0].seriesInfo;
      if(si&&si.shortSeriesBookTitle&&si.shortSeriesBookTitle!==book.seriesName)
        suggestions.seriesName=si.shortSeriesBookTitle;
      if(si&&si.volumeSeries&&si.volumeSeries[0]&&si.volumeSeries[0].orderNumber&&String(si.volumeSeries[0].orderNumber)!==String(book.seriesNum))
        suggestions.seriesNum=String(si.volumeSeries[0].orderNumber);
      if(vi.categories&&vi.categories.length){
        var cats=vi.categories.join(', ');
        if(cats&&cats!==book.subjects&&!book.subjects)suggestions.subjects=cats;
      }
      if(vi.description&&(!book.description||book.description.length<50)){
        var cleaned=cleanSummary(vi.description);
        if(cleaned&&cleaned!==book.description)suggestions.description=cleaned;
      }
      // maturityRating→age inference
      if(!book.ageRange&&vi.maturityRating==='NOT_MATURE'){
        // Try categories for age
        var detectedAge=null;
        if(vi.categories)vi.categories.forEach(function(c){
          var cl=c.toLowerCase();
          if(cl.includes('juvenile')||cl.includes('children'))detectedAge='Middle Grade (Ages 8–12)';
          else if(cl.includes('young adult'))detectedAge='Young Adult (Ages 13–17)';
        });
        if(detectedAge&&detectedAge!==book.ageRange)suggestions.ageRange=detectedAge;
      }
    }
  }catch(e){}

  // ── Open Library ──
  try{
    if(isbn){
      var olr=await fetch('https://openlibrary.org/api/books?bibkeys=ISBN:'+isbn+'&format=json&jscmd=data');
      var old=await olr.json();
      var olkey='ISBN:'+isbn;
      if(old[olkey]){
        var bk=old[olkey];
        if(bk.subjects&&bk.subjects.length&&!book.subjects){
          var subList=bk.subjects.slice(0,10).map(function(s){return typeof s==='string'?s:s.name}).filter(Boolean).join(', ');
          if(subList)suggestions.subjects=suggestions.subjects||subList;
        }
        // works→series
        if(bk.works&&bk.works[0]&&!suggestions.seriesName&&!book.seriesName){
          try{
            var wr=await fetch('https://openlibrary.org'+bk.works[0].key+'.json');
            var wd=await wr.json();
            if(wd.series&&wd.series.length){
              var rs=wd.series[0];
              var nm=rs.match(/#\s*(\d+\.?\d*)|(?:[,\s]+(?:book|vol\.?|volume)?\s*)(\d+\.?\d*)\s*$/i);
              if(nm){
                var en=(nm[1]||nm[2]||'').trim();
                var ename=rs.replace(/#\s*\d+\.?\d*/,'').replace(/[,\s]+(?:book|vol\.?|volume)?\s*\d+\.?\d*\s*$/i,'').replace(/\s*[,\-]\s*$/,'').trim();
                if(ename)suggestions.seriesName=suggestions.seriesName||ename;
                if(en)suggestions.seriesNum=suggestions.seriesNum||en;
              }else{
                suggestions.seriesName=suggestions.seriesName||rs.trim();
              }
            }
            if(!book.description&&wd.description){
              var dt=typeof wd.description==='string'?wd.description:(wd.description.value||'');
              var dc=cleanSummary(dt);
              if(dc)suggestions.description=suggestions.description||dc;
            }
          }catch(e2){}
        }
      }
    }else if(title){
      // OL search for series
      var olsq=encodeURIComponent(title+(author?' '+author.split(' ').slice(-1)[0]:''));
      var olsr=await fetch('https://openlibrary.org/search.json?q='+olsq+'&fields=series&limit=5');
      var olsd=await olsr.json();
      if(olsd.docs&&!book.seriesName){
        for(var oi=0;oi<olsd.docs.length;oi++){
          var doc=olsd.docs[oi];
          if(doc.series&&doc.series.length){
            suggestions.seriesName=suggestions.seriesName||doc.series[0].replace(/#\s*\d+\.?\d*/,'').replace(/\s*[,\-]\s*$/,'').trim();
            break;
          }
        }
      }
    }
  }catch(e){}

  // ── KNOWN_SERIES exact match ──
  if(!suggestions.seriesName&&!book.seriesName&&title){
    var t=title.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    for(var ki=0;ki<KNOWN_SERIES.length;ki++){
      var entry=KNOWN_SERIES[ki];
      if(entry.titles[t]!==undefined){
        suggestions.seriesName=entry.s;
        suggestions.seriesNum=String(entry.titles[t]);
        break;
      }
    }
  }

  // Build field list — only include if different from current
  var fields=[];
  UPDATE_FIELDS.forEach(function(f){
    var sug=suggestions[f.key];
    if(!sug)return;
    var cur=book[f.key]||'';
    if(String(sug).trim()===String(cur).trim())return;
    // Don't suggest shorter/worse descriptions
    if(f.key==='description'&&cur&&cur.length>sug.length)return;
    fields.push({key:f.key,label:f.label,current:cur,suggested:String(sug).trim(),ignored:false});
  });

  return fields;
}

// Runs fetchUpdatesForBook() across every owned (non-wishlist) book that has
// an ISBN or title, throttled to one request per 1.5s to stay polite to the
// free APIs, showing a progress bar in #updates-container while it works.
async function runUpdateScan(manual){
  var btn=document.getElementById('scan-now-btn');
  var booksToScan=library.filter(function(b){return b.status!=='Wishlist'&&(b.isbn||b.title);});
  if(!booksToScan.length){
    if(manual)showToast('No books to scan');
    return;
  }

  // Show progress in updates view
  var container=document.getElementById('updates-container');
  if(container){
    container.innerHTML='<div style="padding:32px;text-align:center;color:var(--ink-muted)">'+
      '<div style="font-size:14px;font-weight:500;margin-bottom:8px">Scanning '+booksToScan.length+' books…</div>'+
      '<div id="scan-progress-bar" style="height:6px;background:var(--cream-dark);border-radius:4px;overflow:hidden;width:280px;margin:0 auto">'+
        '<div id="scan-progress-fill" style="height:100%;background:var(--rust);border-radius:4px;width:0%;transition:width 0.3s"></div>'+
      '</div>'+
      '<div id="scan-progress-text" style="font-size:12px;color:var(--ink-faint);margin-top:8px">0 / '+booksToScan.length+'</div>'+
    '</div>';
  }
  if(btn){btn.disabled=true;btn.textContent='Scanning…';}

  _pendingUpdates=[];
  var existing=_pendingUpdates;

  for(var i=0;i<booksToScan.length;i++){
    var book=booksToScan[i];
    // Throttle — 1 book per 1.5s to avoid rate limiting
    if(i>0)await new Promise(function(r){setTimeout(r,1500);});
    var fields=await fetchUpdatesForBook(book);
    if(fields.length>0){
      _pendingUpdates.push({book:book,fields:fields});
    }
    // Update progress
    var pct=Math.round(((i+1)/booksToScan.length)*100);
    var pf=document.getElementById('scan-progress-fill');
    var pt=document.getElementById('scan-progress-text');
    if(pf)pf.style.width=pct+'%';
    if(pt)pt.textContent=(i+1)+' / '+booksToScan.length;
  }

  recordScan();
  if(btn){btn.disabled=false;btn.textContent='Scan Now';}
  renderScanSettings();
  updateBadge();

  if(manual||_pendingUpdates.length>0){
    showView('updates');
    renderUpdates();
  }
  if(_pendingUpdates.length===0&&manual){
    showToast('All books are up to date!');
  }
}

// Renders #view-updates: one card per book with pending suggestions, each
// suggestion shown as current → suggested with Accept/Ignore buttons.
function renderUpdates(){
  var container=document.getElementById('updates-container');
  if(!container)return;
  var visible=_pendingUpdates.filter(function(u){return u.fields.some(function(f){return!f.ignored;});});

  if(_pendingUpdates.length===0){
    container.innerHTML=
      '<div class="empty-state">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;margin-bottom:12px;opacity:0.35"><polyline points="20 6 9 17 4 12"/></svg>'+
        '<div class="empty-title">No updates found</div>'+
        '<div class="empty-sub">Run a scan to check for new series, summaries, and reading level info.</div>'+
        '<div style="margin-top:16px"><button class="btn btn-primary" onclick="runUpdateScan(true)">Scan Now</button></div>'+
      '</div>';
    return;
  }

  if(visible.length===0){
    container.innerHTML=
      '<div class="empty-state">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;margin-bottom:12px;opacity:0.35"><polyline points="20 6 9 17 4 12"/></svg>'+
        '<div class="empty-title">All caught up!</div>'+
        '<div class="empty-sub">You\'ve reviewed all suggested updates.</div>'+
        '<div style="margin-top:16px"><button class="btn btn-secondary" onclick="runUpdateScan(true)">Scan Again</button></div>'+
      '</div>';
    return;
  }

  var lastScan=getLastScanDate();
  var scanStr=lastScan?'Last scanned '+lastScan.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
  var html=
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">'+
      '<div>'+
        '<div style="font-size:13px;color:var(--ink-muted)"><strong style="color:var(--ink)">'+visible.length+'</strong> book'+(visible.length!==1?'s':'')+' with suggested updates</div>'+
        (scanStr?'<div style="font-size:11px;color:var(--ink-faint);margin-top:2px">'+scanStr+'</div>':'') +
      '</div>'+
      '<div style="display:flex;gap:8px">'+
        '<button class="btn btn-secondary" style="font-size:12px" onclick="acceptAllUpdates()">Accept All</button>'+
        '<button class="btn btn-secondary" style="font-size:12px" onclick="ignoreAllUpdates()">Ignore All</button>'+
        '<button class="btn btn-secondary" style="font-size:12px" onclick="runUpdateScan(true)">Rescan</button>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:12px">';

  visible.forEach(function(u,ui){
    var b=u.book;
    var hv=0;for(var ci=0;ci<b.title.length;ci++){hv=((hv<<5)-hv+b.title.charCodeAt(ci))|0}
    var cl=SPINE_COLORS[Math.abs(hv)%SPINE_COLORS.length];
    var coverHtml=b.coverUrl?'<img src="'+esc(b.coverUrl)+'" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0" onerror="handleCoverError(this,\''+getEmoji(b.title)+'\',\''+cl+'\',\'20px\')">':'<span style="font-size:20px;position:relative;z-index:1">'+getEmoji(b.title)+'</span>';

    var activeFields=u.fields.filter(function(f){return!f.ignored;});
    var fieldRows=activeFields.map(function(f,fi){
      var curDisplay=f.current?('<span style="color:var(--ink-muted);font-size:12px">'+esc(f.current.slice(0,80))+(f.current.length>80?'…':'')+'</span>'):'<span style="color:var(--ink-faint);font-size:12px;font-style:italic">(not set)</span>';
      var sugDisplay='<span style="color:var(--ink);font-size:12px;font-weight:500">'+esc(f.suggested.slice(0,80))+(f.suggested.length>80?'…':'')+'</span>';
      return '<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--ink-faint);margin-bottom:3px">'+esc(f.label)+(f.src==='catalog'?' · household catalog':'')+'</div>'+
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'+
            curDisplay+
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>'+
            sugDisplay+
          '</div>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex-shrink:0;padding-top:2px">'+
          '<button data-uid="'+ui+'" data-fi="'+fi+'" data-action="accept" style="padding:4px 10px;background:var(--sage);color:white;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:500">Accept</button>'+
          '<button data-uid="'+ui+'" data-fi="'+fi+'" data-action="ignore" style="padding:4px 8px;background:var(--cream-dark);color:var(--ink-muted);border:none;border-radius:6px;font-size:11px;cursor:pointer">Ignore</button>'+
        '</div>'+
      '</div>';
    }).join('');

    html+=
      '<div class="update-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px">'+
        '<div style="display:flex;gap:12px;margin-bottom:10px">'+
          '<div style="width:44px;height:64px;border-radius:4px;background:'+spineTint(cl)+';flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;border:1px solid var(--border)">'+coverHtml+'</div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:13px;font-weight:600;color:var(--ink);cursor:pointer" onclick="openBook(\''+b.id+'\')" >'+esc(b.title)+'</div>'+
            '<div style="font-size:11px;color:var(--ink-muted)">'+esc(b.author||'Unknown')+'</div>'+
            '<div style="font-size:11px;color:var(--rust);margin-top:2px">'+activeFields.length+' suggestion'+(activeFields.length!==1?'s':'')+'</div>'+
          '</div>'+
        '</div>'+
        fieldRows+
      '</div>';
  });

  html+='</div>';
  container.innerHTML=html;

  // Delegate events on the update cards
  container.onclick=function(ev){
    var btn=ev.target.closest('[data-action]');
    if(!btn)return;
    var uid=parseInt(btn.getAttribute('data-uid'));
    var fi=parseInt(btn.getAttribute('data-fi'));
    var action=btn.getAttribute('data-action');
    var update=_pendingUpdates.filter(function(u){return u.fields.some(function(f){return!f.ignored;})})[uid];
    if(!update)return;
    var activeFields=update.fields.filter(function(f){return!f.ignored;});
    var field=activeFields[fi];
    if(!field)return;
    if(action==='accept'){
      update.book[field.key]=field.suggested;
      field.ignored=true;
      save();
      showToast(field.label+' updated for "'+update.book.title+'"');
    }else{
      if(field.src==='catalog'&&typeof catalogRememberIgnore==='function')catalogRememberIgnore(update.book,field);
      field.ignored=true;
    }
    updateBadge();
    renderUpdates();
  };
}

function acceptAllUpdates(){
  _pendingUpdates.forEach(function(u){
    u.fields.forEach(function(f){
      if(!f.ignored){u.book[f.key]=f.suggested;f.ignored=true;}
    });
  });
  save();
  updateBadge();
  renderUpdates();
  showToast('All suggestions accepted!');
}

function ignoreAllUpdates(){
  _pendingUpdates.forEach(function(u){
    u.fields.forEach(function(f){f.ignored=true;});
  });
  updateBadge();
  renderUpdates();
}
