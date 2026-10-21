// ============================================================================
// bulk-add.js — #bulk-modal: spreadsheet-style multi-book entry
//
// Lets the user add several books at once in a table, one row per book,
// with a per-row lookup button to auto-fill title/author/etc. from an ISBN
// or title the way the main Auto-Fill button does, just condensed.
//
// Depends on: utils.js (toTitleCase, showToast), autofill.js (KNOWN_SERIES),
//             duplicate-detection.js (findDuplicate), db.js (library, save),
//             render-dashboard.js / render-library.js (renderDashboard,
//             renderLibrary), config.js (currentView)
// Used by:    index.html Settings → Quick Entry → "Bulk Add" button,
//             #bulk-modal's row buttons and "Save All Books" button
// ============================================================================

var BULK_ROW_COUNT=0;

function openBulkAdd(){
  BULK_ROW_COUNT=0;
  document.getElementById('bulk-tbody').innerHTML='';
  document.getElementById('bulk-status').textContent='';
  for(var i=0;i<5;i++)bulkAddRow();
  document.getElementById('bulk-modal').classList.add('open');
  setTimeout(function(){
    var first=document.querySelector('#bulk-tbody .bulk-isbn');
    if(first)first.focus();
  },100);
}

function closeBulkAdd(){
  document.getElementById('bulk-modal').classList.remove('open');
}

// Appends one empty row (ISBN/title, title, author, genre, series, series#,
// age, status, quantity, remove button) to the bulk-add table.
function bulkAddRow(){
  BULK_ROW_COUNT++;
  var n=BULK_ROW_COUNT;
  var tbody=document.getElementById('bulk-tbody');
  var tr=document.createElement('tr');
  tr.id='bulk-row-'+n;
  tr.setAttribute('data-row',n);
  tr.style.borderBottom='1px solid var(--border)';
  var cs='padding:4px;vertical-align:middle;';
  var is='width:100%;padding:5px 6px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:DM Sans,sans-serif;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
  var statusOpts=['Unread','Reading','Read','Wishlist'].map(function(s){return '<option'+(s==='Unread'?' selected':'')+'>'+s+'</option>';}).join('');
  tr.innerHTML=
    '<td style="'+cs+'text-align:center;color:var(--ink-faint);font-size:11px;padding-left:8px">'+n+'</td>'+
    '<td style="'+cs+'text-align:center"><div class="bulk-thumb" data-row="'+n+'" style="width:26px;height:38px;border-radius:3px;background:var(--cream-dark);overflow:hidden;margin:0 auto"></div></td>'+
    '<td style="'+cs+'">'+
      '<div style="display:flex;gap:3px">'+
        '<input class="bulk-isbn" data-row="'+n+'" type="text" placeholder="ISBN or title" style="'+is+'min-width:0;flex:1" onkeydown="if(event.key===\'Enter\'){event.preventDefault();bulkLookupRow('+n+');}">'+
        '<button type="button" onclick="bulkLookupRow('+n+')" data-lookup="'+n+'" style="padding:4px 7px;background:var(--ink);color:var(--on-ink);border:none;border-radius:6px;cursor:pointer;font-size:13px;flex-shrink:0" title="Auto-fill">&#8635;</button>'+
        '<button type="button" onclick="bulkScanRow('+n+')" style="padding:4px 6px;background:var(--cream-dark);color:var(--ink);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;flex-shrink:0" title="Scan barcode">&#128247;</button>'+
      '</div>'+
      '<div class="bulk-row-status" data-row="'+n+'" style="font-size:10px;min-height:13px;margin-top:2px"></div>'+
    '</td>'+
    '<td style="'+cs+'"><input class="bulk-title" data-row="'+n+'" type="text" placeholder="Required" style="'+is+'" onblur="bulkTitleCase('+n+')"></td>'+
    '<td style="'+cs+'"><input class="bulk-author" data-row="'+n+'" type="text" style="'+is+'"></td>'+
    '<td style="'+cs+'"><input class="bulk-genre" data-row="'+n+'" type="text" style="'+is+'"></td>'+
    '<td style="'+cs+'"><input class="bulk-series" data-row="'+n+'" type="text" style="'+is+'"></td>'+
    '<td style="'+cs+'"><input class="bulk-seriesnum" data-row="'+n+'" type="number" min="0" step="0.5" style="'+is+'"></td>'+
    '<td style="'+cs+'"><input class="bulk-age" data-row="'+n+'" type="text" style="'+is+'"></td>'+
    '<td style="'+cs+'"><input class="bulk-location" data-row="'+n+'" type="text" style="'+is+'"></td>'+
    '<td style="'+cs+'"><input class="bulk-tags" data-row="'+n+'" type="text" placeholder="a, b" style="'+is+'"></td>'+
    '<td style="'+cs+'"><select class="bulk-status" data-row="'+n+'" style="'+is+'padding-right:2px">'+statusOpts+'</select></td>'+
    '<td style="'+cs+'"><input class="bulk-qty" data-row="'+n+'" type="number" value="1" min="1" style="'+is+'"></td>'+
    '<td style="'+cs+'text-align:center"><button type="button" onclick="bulkRemoveRow('+n+')" style="background:none;border:none;cursor:pointer;color:var(--ink-faint);padding:2px;line-height:1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>';
  tr._extra={};
  tbody.appendChild(tr);
  return n;
}

function bulkRemoveRow(n){var tr=document.getElementById('bulk-row-'+n);if(tr)tr.remove();}

function bulkClearAll(){
  if(!confirm('Clear all rows?'))return;
  BULK_ROW_COUNT=0;
  document.getElementById('bulk-tbody').innerHTML='';
  document.getElementById('bulk-status').textContent='';
  for(var i=0;i<5;i++)bulkAddRow();
}

function bulkTitleCase(n){
  var inp=document.querySelector('.bulk-title[data-row="'+n+'"]');
  if(inp&&inp.value)inp.value=toTitleCase(inp.value);
}

function bulkRowStatus(n,msg,color){
  var el=document.querySelector('.bulk-row-status[data-row="'+n+'"]');
  if(el){el.textContent=msg;el.style.color=color||'var(--ink-faint)';}
}

// Per-row "Auto-Fill" (↻) handler — a condensed version of api.js's
// lookupISBN(): a single Google Books call fills title/author/genre/series/
// age-range, then falls back to an Open Library series search and finally
// the local KNOWN_SERIES map if series is still blank.
async function bulkLookupRow(n){
  var isbnEl=document.querySelector('.bulk-isbn[data-row="'+n+'"]');
  var btn=document.querySelector('[data-lookup="'+n+'"]');
  if(!isbnEl||!isbnEl.value.trim()){bulkRowStatus(n,'Enter ISBN or title first','var(--rust)');return;}
  var raw=isbnEl.value.trim();
  var isbn=raw.replace(/[^0-9X]/gi,'');
  var isTitleSearch=!isbn||!/^(97[89]\d{10}|\d{9}[\dX])$/i.test(isbn);
  if(btn){btn.disabled=true;btn.textContent='...';}
  bulkRowStatus(n,'Searching\u2026','var(--ink-faint)');
  var filled=false;
  try{
    var q=isTitleSearch?encodeURIComponent('intitle:'+raw):'isbn:'+isbn;
    var r=await fetch('https://www.googleapis.com/books/v1/volumes?q='+q+'&maxResults=3');
    var d=await r.json();
    if(d.items&&d.items[0]){
      var vi=d.items[0].volumeInfo||{};
      var si=d.items[0].seriesInfo;
      var set=function(cls,val){var el=document.querySelector('.'+cls+'[data-row="'+n+'"]');if(el&&val&&!el.value)el.value=val;};
      var tEl=document.querySelector('.bulk-title[data-row="'+n+'"]');
      var aEl=document.querySelector('.bulk-author[data-row="'+n+'"]');
      if(vi.title&&(!tEl.value||isTitleSearch))tEl.value=toTitleCase(vi.title);
      if(vi.authors&&(!aEl.value||isTitleSearch))aEl.value=vi.authors.join(', ');
      if(isTitleSearch&&vi.industryIdentifiers){
        var i13=vi.industryIdentifiers.find(function(x){return x.type==='ISBN_13';});
        if(i13)isbnEl.value=i13.identifier;
        else{var i10=vi.industryIdentifiers.find(function(x){return x.type==='ISBN_10';});if(i10)isbnEl.value=i10.identifier;}
      }
      if(vi.categories&&vi.categories.length)set('bulk-genre',vi.categories[0].split('/')[0].trim());
      if(si&&si.shortSeriesBookTitle)set('bulk-series',si.shortSeriesBookTitle);
      if(si&&si.volumeSeries&&si.volumeSeries[0]&&si.volumeSeries[0].orderNumber)set('bulk-seriesnum',si.volumeSeries[0].orderNumber);
      if(vi.categories){
        var cats=vi.categories.join(' ').toLowerCase();
        var ageEl=document.querySelector('.bulk-age[data-row="'+n+'"]');
        if(ageEl&&!ageEl.value){
          if(cats.includes('juvenile')||cats.includes("children's"))ageEl.value='Middle Grade (Ages 8\u201312)';
          else if(cats.includes('young adult'))ageEl.value='Young Adult (Ages 13\u201317)';
        }
      }
      var rowEl=document.getElementById('bulk-row-'+n);
      if(rowEl){
        var ex=rowEl._extra=rowEl._extra||{};
        var img=vi.imageLinks&&(vi.imageLinks.thumbnail||vi.imageLinks.smallThumbnail);
        if(img&&!ex.coverUrl)ex.coverUrl=img.replace(/^http:/,'https:');
        if(vi.publisher&&!ex.publisher)ex.publisher=vi.publisher;
        if(vi.publishedDate&&!ex.year)ex.year=String(vi.publishedDate).slice(0,4);
        if(vi.pageCount&&!ex.pages)ex.pages=String(vi.pageCount);
        if(vi.description&&!ex.description)ex.description=vi.description.replace(/<[^>]*>/g,'');
        if(vi.language&&!ex.language)ex.language=vi.language==='es'?'Spanish':(vi.language==='en'?'English':vi.language);
      }
      filled=true;
    }
  }catch(e){}
  // Open Library cover as a fallback when Google had no picture
  var rowEl2=document.getElementById('bulk-row-'+n);
  if(rowEl2&&!(rowEl2._extra&&rowEl2._extra.coverUrl)){
    var cleanIsbn=(document.querySelector('.bulk-isbn[data-row="'+n+'"]').value||'').replace(/[^0-9X]/gi,'');
    if(/^(97[89]\d{10}|\d{9}[\dX])$/i.test(cleanIsbn)){
      try{
        var cr=await fetch('https://covers.openlibrary.org/b/isbn/'+cleanIsbn+'-M.jpg?default=false',{method:'HEAD'});
        if(cr.ok){rowEl2._extra=rowEl2._extra||{};rowEl2._extra.coverUrl='https://covers.openlibrary.org/b/isbn/'+cleanIsbn+'-M.jpg';}
      }catch(e){}
    }
  }
  bulkShowThumb(n);
  if(!document.querySelector('.bulk-series[data-row="'+n+'"]').value){
    try{
      var titleQ=document.querySelector('.bulk-title[data-row="'+n+'"]').value||raw;
      var olr=await fetch('https://openlibrary.org/search.json?q='+encodeURIComponent(titleQ)+'&fields=series&limit=5');
      var old=await olr.json();
      if(old.docs){for(var oi=0;oi<old.docs.length;oi++){if(old.docs[oi].series&&old.docs[oi].series.length){var rs=old.docs[oi].series[0].replace(/#\s*\d+\.?\d*/,'').replace(/\s*[,\-]\s*$/,'').trim();if(rs){document.querySelector('.bulk-series[data-row="'+n+'"]').value=rs;break;}}}}
    }catch(e){}
  }
  var tVal=document.querySelector('.bulk-title[data-row="'+n+'"]').value;
  if(tVal&&!document.querySelector('.bulk-series[data-row="'+n+'"]').value){
    var t=tVal.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    for(var ki=0;ki<KNOWN_SERIES.length;ki++){var ke=KNOWN_SERIES[ki];if(ke.titles[t]!==undefined){document.querySelector('.bulk-series[data-row="'+n+'"]').value=ke.s;document.querySelector('.bulk-seriesnum[data-row="'+n+'"]').value=ke.titles[t];break;}}
  }
  try{var catRow=await applyCatalogToBulkRow(n,document.querySelector('.bulk-isbn[data-row="'+n+'"]').value);if(catRow)filled=true;}catch(e){}
  if(btn){btn.disabled=false;btn.textContent='\u21bb';}
  bulkRowStatus(n,filled?'\u2713 Found':'Not found \u2014 fill manually',filled?'var(--sage)':'var(--rust)');
}

// "Save All Books" handler: validates every non-empty row (title + author
// required), merges into existing library entries via findDuplicate() (just
// bumping quantity rather than creating a second copy), reports a summary,
// and clears out the successfully-saved rows so failed ones stay put for
// correction.
function bulkSaveAll(){
  var rows=document.querySelectorAll('#bulk-tbody tr');
  var saved=0,skipped=0,dupes=0,errors=[],savedIds=[];
  rows.forEach(function(tr){
    var n=tr.getAttribute('data-row');if(!n)return;
    var title=(document.querySelector('.bulk-title[data-row="'+n+'"]').value||'').trim();
    var author=(document.querySelector('.bulk-author[data-row="'+n+'"]').value||'').trim();
    if(!title){skipped++;return;}
    if(!author){errors.push('Row '+n+': "'+title+'" needs an author');return;}
    var ex=tr._extra||{};
    var rawIsbn=(document.querySelector('.bulk-isbn[data-row="'+n+'"]').value||'').replace(/[^0-9X]/gi,'');
    var validIsbn=/^(97[89]\d{10}|\d{9}[\dX])$/i.test(rawIsbn)?rawIsbn:'';
    var payload={
      id:'b_'+Date.now()+'_'+Math.floor(Math.random()*9999),
      title:toTitleCase(title),author:author,
      isbn:validIsbn,
      genre:(document.querySelector('.bulk-genre[data-row="'+n+'"]').value||'').trim(),
      seriesName:(document.querySelector('.bulk-series[data-row="'+n+'"]').value||'').trim(),
      seriesNum:(document.querySelector('.bulk-seriesnum[data-row="'+n+'"]').value||'').trim(),
      ageRange:(document.querySelector('.bulk-age[data-row="'+n+'"]').value||'').trim(),
      status:document.querySelector('.bulk-status[data-row="'+n+'"]').value||'Unread',
      quantity:parseInt(document.querySelector('.bulk-qty[data-row="'+n+'"]').value)||1,
      condition:'Good',format:'Paperback',language:'English',
      subgenre:'',subjects:'',grade:'',
      year:ex.year||'',pages:ex.pages||'',publisher:ex.publisher||'',
      location:(document.querySelector('.bulk-location[data-row="'+n+'"]').value||'').trim(),
      tags:(document.querySelector('.bulk-tags[data-row="'+n+'"]').value||'').trim(),
      coverUrl:ex.coverUrl||'',description:ex.description||'',notes:'',rating:0,
      addedAt:Date.now()+saved
    };
    if(ex.language)payload.language=ex.language;
    if(payload.status==='Read')payload.finishDate=formatDateLocalInput(new Date());
    if(payload.status==='Reading')payload.startDate=formatDateLocalInput(new Date());
    var dup=findDuplicate(payload);
    if(dup){dup.quantity=(parseInt(dup.quantity)||1)+payload.quantity;dupes++;bulkRowStatus(n,'\u2713 Updated qty','var(--sage)');}
    else{library.push(payload);savedIds.push(payload.id);saved++;bulkRowStatus(n,'\u2713 Saved','var(--sage)');}
  });
  if(saved>0||dupes>0)save();
  persistCoversInBackground(savedIds);
  var msg=saved+' book'+(saved!==1?'s':'')+' added';
  if(dupes)msg+=', '+dupes+' duplicate'+(dupes!==1?'s':'')+' updated';
  if(skipped)msg+=', '+skipped+' empty row'+(skipped!==1?'s':'')+' skipped';
  if(errors.length)msg+=' — '+errors.join(' | ');
  document.getElementById('bulk-status').textContent=msg;
  document.getElementById('bulk-status').style.color=errors.length?'var(--rust)':'var(--sage)';
  showToast(msg);
  if(saved>0||dupes>0){if(currentView==='dashboard')renderDashboard();if(currentView==='library')renderLibrary();}
  // Remove saved rows, keep failed ones
  document.querySelectorAll('#bulk-tbody tr').forEach(function(tr){
    var n=tr.getAttribute('data-row');
    var st=document.querySelector('.bulk-row-status[data-row="'+n+'"]');
    if(st&&(st.textContent.includes('Saved')||st.textContent.includes('Updated')))tr.remove();
  });
  if(document.querySelectorAll('#bulk-tbody tr').length===0)for(var i=0;i<3;i++)bulkAddRow();
}

// ── New helpers: thumbnails, paste list, look up all, scanning ──────────────
function formatDateLocalInput(d){
  var m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return d.getFullYear()+'-'+m+'-'+day;
}

function bulkShowThumb(n){
  var tr=document.getElementById('bulk-row-'+n);
  var box=document.querySelector('.bulk-thumb[data-row="'+n+'"]');
  if(!tr||!box)return;
  var url=tr._extra&&tr._extra.coverUrl;
  box.innerHTML=url?'<img src="'+esc(url)+'" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">':'';
}

function bulkTogglePaste(){
  var p=document.getElementById('bulk-paste-panel');
  p.style.display=p.style.display==='none'?'block':'none';
  if(p.style.display==='block')document.getElementById('bulk-paste-text').focus();
}

// Puts a value into the first row whose ISBN/title box is empty (adding a
// row if all are in use) and returns the row number.
function bulkEmptyRowFor(value){
  var inputs=document.querySelectorAll('#bulk-tbody .bulk-isbn');
  for(var i=0;i<inputs.length;i++){
    var n=inputs[i].getAttribute('data-row');
    var t=document.querySelector('.bulk-title[data-row="'+n+'"]');
    if(!inputs[i].value&&t&&!t.value){inputs[i].value=value;return n;}
  }
  var nn=bulkAddRow();
  document.querySelector('.bulk-isbn[data-row="'+nn+'"]').value=value;
  return nn;
}

async function bulkImportPaste(){
  var lines=document.getElementById('bulk-paste-text').value.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
  if(!lines.length){showToast('Nothing to add');return;}
  var rows=lines.map(bulkEmptyRowFor);
  document.getElementById('bulk-paste-text').value='';
  bulkTogglePaste();
  await bulkRunLookups(rows);
}

// Looks up rows one at a time (keeps us under Google Books' rate limit).
async function bulkRunLookups(rows){
  var st=document.getElementById('bulk-status');
  for(var i=0;i<rows.length;i++){
    st.style.color='var(--ink-muted)';
    st.textContent='Looking up '+(i+1)+' of '+rows.length+'…';
    await bulkLookupRow(rows[i]);
    await new Promise(function(r){setTimeout(r,250);});
  }
  st.style.color='var(--sage)';
  st.textContent='Lookup finished — review the rows, then Save All Books';
}

function bulkLookupAll(){
  var rows=[];
  document.querySelectorAll('#bulk-tbody tr').forEach(function(tr){
    var n=tr.getAttribute('data-row');
    var isbn=document.querySelector('.bulk-isbn[data-row="'+n+'"]').value.trim();
    var title=document.querySelector('.bulk-title[data-row="'+n+'"]').value.trim();
    if(isbn&&!title)rows.push(n);
  });
  if(!rows.length){showToast('No rows waiting for a lookup');return;}
  bulkRunLookups(rows);
}

function bulkScanRow(n){
  openBarcodeScanner(function(isbn){
    document.querySelector('.bulk-isbn[data-row="'+n+'"]').value=isbn;
    bulkLookupRow(n);
  });
}

// Camera stays open; each new barcode lands in the next empty row and is
// looked up in the background.
function bulkScanShelf(){
  openBarcodeScanner(function(isbn){
    var n=bulkEmptyRowFor(isbn);
    bulkLookupRow(n);
  },true);
}

// Same safety net as the book form: closing with typed rows asks first.
function bulkIsDirty(){
  var dirty=false;
  document.querySelectorAll('#bulk-tbody tr').forEach(function(tr){
    var n=tr.getAttribute('data-row');if(!n)return;
    ['bulk-isbn','bulk-title','bulk-author','bulk-genre','bulk-series'].forEach(function(c){
      var el=document.querySelector('.'+c+'[data-row="'+n+'"]');if(el&&el.value.trim())dirty=true;
    });
  });
  return dirty;
}
function requestCloseBulkAdd(){
  if(bulkIsDirty()&&!confirm('Close Bulk Add? Rows you have not saved will be lost.'))return;
  closeBulkAdd();
}
