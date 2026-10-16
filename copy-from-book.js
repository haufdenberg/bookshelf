// ============================================================================
// copy-from-book.js — "Copy from Book" panel in the Add/Edit form
//
// Lets the user pick an existing library book and pull selected shared
// fields (author, genre, publisher, age range, language, format, shelf
// location) into the current form — handy when adding book #4 of a series
// you've already catalogued books #1-3 of.
//
// Depends on: db.js (library), utils.js (esc, showToast),
//             genre-fields.js (updateSubgenreOptions, setSubgenreCombo,
//             setAgeCombo), modals.js (setPill, switchTab)
// Used by:    index.html "Copy from Book" button (#copy-series-btn) and the
//             checkboxes in #copy-fields-group
// ============================================================================

// Builds the candidate list shown in #copy-from-panel: books already sharing
// the in-progress form's series name are sorted to the top, then the rest by
// most-recently-added.
function openCopyFromBook(){
  var panel=document.getElementById('copy-from-panel');
  var listEl=document.getElementById('copy-from-list');
  if(!panel||!listEl)return;

  // Build candidate list — prioritise books with same series, then recent books
  var currentSeries=document.getElementById('f-series').value.trim().toLowerCase();
  var candidates=library.filter(function(b){return b.status!=='Wishlist';});

  // Sort: same series first, then by addedAt desc
  candidates.sort(function(a,b){
    var aMatch=currentSeries&&(a.seriesName||'').toLowerCase()===currentSeries;
    var bMatch=currentSeries&&(b.seriesName||'').toLowerCase()===currentSeries;
    if(aMatch&&!bMatch)return -1;
    if(!aMatch&&bMatch)return 1;
    return b.addedAt-a.addedAt;
  });
  candidates=candidates.slice(0,12);

  if(!candidates.length){
    showToast('No books in library to copy from yet');
    return;
  }

  var html='';
  for(var i=0;i<candidates.length;i++){
    var b=candidates[i];
    var isSeriesMatch=currentSeries&&(b.seriesName||'').toLowerCase()===currentSeries;
    html+='<button type="button" data-bid="'+esc(b.id)+'" onclick="applyBookCopy(\''+esc(b.id)+'\')" '+
      'style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface);cursor:pointer;text-align:left;width:100%;transition:background 0.15s;font-family:\'DM Sans\',sans-serif" '+
      'onmouseover="this.style.background=\'var(--cream-dark)\'" onmouseout="this.style.background=\'white\'">' +
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:12px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(b.title)+'</div>'+
        '<div style="font-size:11px;color:var(--ink-muted)">'+esc(b.author||'')+(b.seriesName?' · <em>'+esc(b.seriesName)+'</em>':'')+'</div>'+
      '</div>'+
      (isSeriesMatch?'<span style="font-size:10px;background:var(--sage-light);color:var(--sage);border-radius:10px;padding:2px 7px;white-space:nowrap;font-weight:500">Same series</span>':'')+
    '</button>';
  }
  listEl.innerHTML=html;
  panel.style.display='';
}

function closeCopyFromBook(){
  var panel=document.getElementById('copy-from-panel');
  if(panel)panel.style.display='none';
}

// Applies the checked fields (see #copy-fields-group in index.html) from the
// chosen source book into the current form — only into fields that are
// currently empty, so it never clobbers something the user already typed.
function applyBookCopy(id){
  var b=library.find(function(x){return x.id===id;});
  if(!b)return;

  if(document.getElementById('cp-author').checked&&b.author&&!document.getElementById('f-author').value)
    document.getElementById('f-author').value=b.author;
  if(document.getElementById('cp-genre').checked&&b.genre&&!document.getElementById('f-genre').value){
    document.getElementById('f-genre').value=b.genre;
    updateSubgenreOptions();
    if(b.subgenre)setSubgenreCombo(b.subgenre);
  }
  if(document.getElementById('cp-series').checked&&b.seriesName&&!document.getElementById('f-series').value)
    document.getElementById('f-series').value=b.seriesName;
  if(document.getElementById('cp-publisher').checked&&b.publisher&&!document.getElementById('f-publisher').value)
    document.getElementById('f-publisher').value=b.publisher;
  if(document.getElementById('cp-age').checked&&b.ageRange&&!document.getElementById('f-age').value)
    setAgeCombo(b.ageRange);
  if(document.getElementById('cp-language').checked&&b.language&&!document.getElementById('f-language').value)
    document.getElementById('f-language').value=b.language;
  if(document.getElementById('cp-format').checked&&b.format){
    document.getElementById('f-format').value=b.format;
    setPill('format',b.format);
  }
  if(document.getElementById('cp-location').checked&&b.location&&!document.getElementById('f-location').value)
    document.getElementById('f-location').value=b.location;

  // Auto-suggest next series number
  if(document.getElementById('cp-series').checked&&b.seriesNum&&!document.getElementById('f-series-num').value){
    var next=parseFloat(b.seriesNum)+1;
    document.getElementById('f-series-num').value=Number.isInteger(next)?next:next.toFixed(1);
  }

  closeCopyFromBook();
  showToast('Copied info from "'+b.title+'"');

  // Switch to Details tab so user can see what filled in
  switchTab('details');
  setTimeout(function(){switchTab('info');},100);
}
