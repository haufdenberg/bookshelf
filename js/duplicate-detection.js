// ============================================================================
// duplicate-detection.js — #dup-modal: "this book is already in your
// library" compare-and-merge flow
//
// Triggered from forms.js's handleFormSubmit() when adding (not editing) a
// book that matches an existing entry by ISBN, or by normalized title+author.
// Shows a per-field "Keep Existing" / "Use New" / "Combine Both" picker,
// similar in spirit to the ISBN lookup-review system but comparing two full
// book records instead of form-vs-lookup values.
//
// Depends on: db.js (library, save), utils.js (esc, showToast),
//             modals.js (closeFormModal), render-dashboard.js /
//             render-library.js / wishlist.js (renderDashboard, renderLibrary,
//             renderWishlist)
// Used by:    forms.js (findDuplicate, openDupModal), index.html's
//             #dup-modal buttons (closeDupModal, confirmDupAdd)
// ============================================================================

var _pendingDupPayload=null;

// Looks for an existing library entry that's probably the same book as
// `payload`: an ISBN match on both sides is definitive; otherwise falls back
// to normalized title+author (so a title-searched entry still matches an
// ISBN-catalogued one and vice versa).
function findDuplicate(payload){
  var normTitle=function(s){return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'')};
  var normT=normTitle(payload.title);
  var normA=normTitle(payload.author);
  var pk=isbnKey(payload.isbn);
  return library.find(function(b){
    var bk=isbnKey(b.isbn);
    // Two valid ISBNs are decisive: same ISBN (10 or 13) = same book, different
    // ISBNs = different editions/volumes (e.g. the many "Animorphs" entries).
    if(pk && bk) return pk===bk;
    // Otherwise fall back to normalised title + author (catches title-searched
    // books against ISBN-catalogued ones and vice versa)
    return normT && normA &&
           normTitle(b.title)===normT &&
           normTitle(b.author)===normA;
  });
}

// Fields compared in the duplicate review dialog
var DUP_FIELDS=[
  {key:'isbn',       label:'ISBN'},
  {key:'subtitle',   label:'Subtitle'},
  {key:'year',       label:'Year'},
  {key:'genre',      label:'Genre'},
  {key:'subgenre',   label:'Subgenre'},
  {key:'ageRange',   label:'Age Range'},
  {key:'grade',      label:'Grade Level'},
  {key:'lexile',     label:'Lexile'},
  {key:'seriesName', label:'Series Name'},
  {key:'seriesNum',  label:'Series #'},
  {key:'pages',      label:'Pages'},
  {key:'publisher',  label:'Publisher'},
  {key:'language',   label:'Language'},
  {key:'format',     label:'Format'},
  {key:'condition',  label:'Condition'},
  {key:'location',   label:'Shelf Location'},
  {key:'subjects',   label:'Subjects',   isLong:true, canCombine:true},
  {key:'description',label:'Summary',    isLong:true, canCombine:true},
  {key:'notes',      label:'Notes',      isLong:true, canCombine:true},
  {key:'coverUrl',   label:'Cover',      isCover:true},
  {key:'rating',     label:'Rating'}
];

// Renders #dup-modal: diffs `existing` vs. the incoming `payload` across
// DUP_FIELDS, showing only fields that actually differ, each as a
// Keep-Existing/Use-New picker (plus a Combine option for long text fields).
function openDupModal(existing, payload){
  _pendingDupPayload=payload;
  var incomingQty=parseInt(payload.quantity)||1;

  // Find fields that differ between existing and incoming
  var diffFields=DUP_FIELDS.filter(function(f){
    var ev=String(existing[f.key]||'').trim();
    var pv=String(payload[f.key]||'').trim();
    return pv!=='' && ev!==pv;
  });

  // Build the modal content
  var header='<strong>'+esc(existing.title)+'</strong> by '+esc(existing.author)+' is already in your library'+(existing.quantity>1?' (×'+existing.quantity+')':'')+'.';

  var rowsHtml='';
  for(var i=0;i<diffFields.length;i++){
    var f=diffFields[i];
    var ev=String(existing[f.key]||'').trim();
    var pv=String(payload[f.key]||'').trim();
    var existDisplay, newDisplay;
    if(f.isCover){
      existDisplay=ev?'<img src="'+esc(ev)+'" style="width:56px;height:80px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">':'<span style="color:var(--ink-faint);font-size:12px">None</span>';
      newDisplay=pv?'<img src="'+esc(pv)+'" style="width:56px;height:80px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">':'<span style="color:var(--ink-faint);font-size:12px">None</span>';
    } else if(f.isLong){
      existDisplay='<div style="font-size:11px;color:var(--ink-muted);max-height:60px;overflow:hidden;line-height:1.5">'+(ev?esc(ev.slice(0,200))+(ev.length>200?'…':''):'<em style="color:var(--ink-faint)">(empty)</em>')+'</div>';
      newDisplay='<div style="font-size:11px;color:var(--ink-muted);max-height:60px;overflow:hidden;line-height:1.5">'+esc(pv.slice(0,200))+(pv.length>200?'…':'')+'</div>';
    } else {
      existDisplay='<div style="font-size:13px;color:var(--ink)">'+(ev?esc(ev):'<em style="color:var(--ink-faint)">(empty)</em>')+'</div>';
      newDisplay='<div style="font-size:13px;color:var(--ink)">'+esc(pv)+'</div>';
    }

    var combineBtn=f.canCombine&&ev&&pv?
      '<div data-dup-field="'+f.key+'" data-dup-choice="combine" onclick="selectDupField(this)" '+
        'style="border:2px solid var(--border);border-radius:6px;padding:8px;cursor:pointer;margin-top:6px;background:var(--gold-light)">'+
        '<div style="font-size:10px;font-weight:600;color:var(--gold);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px">Combine Both</div>'+
        '<div style="font-size:11px;color:var(--ink-muted)">Merge into one entry</div>'+
      '</div>':'';

    rowsHtml+='<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;background:var(--surface)">'+
      '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.7px;color:var(--ink-faint);margin-bottom:8px">'+esc(f.label)+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
        '<div data-dup-field="'+f.key+'" data-dup-choice="existing" onclick="selectDupField(this)" class="lr-option lr-mine active" '+
          'style="border:2px solid var(--rust);border-radius:6px;padding:10px;cursor:pointer;background:var(--rust-light)">'+
          '<div style="font-size:10px;font-weight:600;color:var(--rust);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">✓ Keep Existing</div>'+
          existDisplay+
        '</div>'+
        '<div data-dup-field="'+f.key+'" data-dup-choice="new" onclick="selectDupField(this)" class="lr-option lr-new" '+
          'style="border:2px solid var(--border);border-radius:6px;padding:10px;cursor:pointer">'+
          '<div style="font-size:10px;font-weight:600;color:var(--ink-faint);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">Use New</div>'+
          newDisplay+
        '</div>'+
      '</div>'+
      combineBtn+
    '</div>';
  }

  var noChanges=diffFields.length===0;
  document.getElementById('dup-modal-title').textContent=noChanges?'Book Already in Library':'Compare & Merge';
  document.getElementById('dup-modal-header-msg').innerHTML=header;
  document.getElementById('dup-modal-diff-section').innerHTML=
    noChanges
      ? '<div style="font-size:13px;color:var(--ink-muted);padding:4px 0">No field differences found — only the quantity will be updated.</div>'
      : '<div style="font-size:12px;color:var(--ink-faint);margin-bottom:10px">'+diffFields.length+' field'+(diffFields.length!==1?'s':'')+' differ. Choose which version to keep for each:</div>'+rowsHtml;

  document.getElementById('dup-modal-qty-label').textContent='Also add +'+incomingQty+' to quantity';
  document.getElementById('dup-modal-qty-cb').checked=true;

  // Update confirm button
  var confirmBtn=document.getElementById('dup-modal-confirm');
  if(confirmBtn)confirmBtn.textContent=noChanges?'Update Quantity':'Apply Choices';

  document.getElementById('dup-modal').classList.add('open');
}

// Click handler for one side of a duplicate-review row — same active/inactive
// restyling pattern as lookup-review.js's selectLookupField(), extended with
// a third "combine" state (gold) for long-text fields.
function selectDupField(el){
  var field=el.getAttribute('data-dup-field');
  var choice=el.getAttribute('data-dup-choice');
  // Deactivate all options for this field
  var all=document.querySelectorAll('[data-dup-field="'+field+'"]');
  all.forEach(function(o){
    var isThis=(o===el);
    var oc=o.getAttribute('data-dup-choice');
    o.style.borderColor=isThis?(oc==='existing'?'var(--rust)':oc==='new'?'var(--sage)':'var(--gold)'):'var(--border)';
    o.style.background=isThis?(oc==='existing'?'var(--rust-light)':oc==='new'?'var(--sage-light)':'var(--gold-light)'):'white';
    var lbl=o.querySelector('div');
    if(lbl){
      lbl.style.color=isThis?(oc==='existing'?'var(--rust)':oc==='new'?'var(--sage)':'var(--gold)'):'var(--ink-faint)';
      if(isThis)lbl.textContent=(oc==='existing'?'✓ Keep Existing':oc==='new'?'✓ Use New':'✓ Combine Both');
      else lbl.textContent=(oc==='existing'?'Keep Existing':oc==='new'?'Use New':'Combine Both');
    }
  });
}

function closeDupModal(){
  document.getElementById('dup-modal').classList.remove('open');
  _pendingDupPayload=null;
}

// Applies whichever choice is active for each differing field (existing/new/
// combine), bumps quantity if the checkbox is checked, and either updates the
// existing record or — if somehow no match is found anymore — adds the
// payload as a new book.
function confirmDupAdd(){
  if(!_pendingDupPayload)return;
  var existing=findDuplicate(_pendingDupPayload);
  if(existing){
    // Apply field choices
    DUP_FIELDS.forEach(function(f){
      var chosen=document.querySelector('[data-dup-field="'+f.key+'"][style*="border-color"]');
      // Find the active (selected) option
      var opts=document.querySelectorAll('[data-dup-field="'+f.key+'"]');
      var activeChoice='existing'; // default
      opts.forEach(function(o){
        var bg=o.style.background||'';
        if(bg.includes('rust-light')||bg.includes('sage-light')||bg.includes('gold-light')){
          activeChoice=o.getAttribute('data-dup-choice');
        }
      });
      if(activeChoice==='new'){
        existing[f.key]=_pendingDupPayload[f.key];
      } else if(activeChoice==='combine'){
        // Combine: join both values, dedup lines/sentences
        var ev=String(existing[f.key]||'').trim();
        var pv=String(_pendingDupPayload[f.key]||'').trim();
        if(ev&&pv&&ev!==pv) existing[f.key]=ev+'\n\n'+pv;
        else if(pv) existing[f.key]=pv;
      }
      // 'existing' = keep as-is, no change
    });
    // Handle quantity
    var qtyCb=document.getElementById('dup-modal-qty-cb');
    if(qtyCb&&qtyCb.checked){
      var addQty=parseInt(_pendingDupPayload.quantity)||1;
      existing.quantity=(parseInt(existing.quantity)||1)+addQty;
    }
    // Use better cover if new one found and existing has none
    if(!existing.coverUrl&&_pendingDupPayload.coverUrl)existing.coverUrl=_pendingDupPayload.coverUrl;
    save();
    showToast('Book updated successfully');
  } else {
    library.push(_pendingDupPayload);
    save();
    showToast('Book added');
  }
  closeDupModal();
  closeFormModal();
  if(currentView==='dashboard')renderDashboard();
  if(currentView==='library')renderLibrary();
  if(currentView==='wishlist')renderWishlist();
}
