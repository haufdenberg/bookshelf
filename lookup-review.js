// ============================================================================
// lookup-review.js — "review changes before applying" system for ISBN/title
// lookups run while editing an existing book
//
// The idea: in Add mode, auto-fill can just write into empty fields freely.
// In Edit mode that's riskier — the book may already have curated data, so
// a lookup instead snapshots the form first, runs the fetch, and shows the
// user a side-by-side "Keep Mine" / "Use New" diff for every field that
// actually changed, rather than overwriting silently.
//
// Depends on: utils.js (esc, showToast), genre-fields.js (updateSubgenreOptions,
//             setSubgenreCombo, setAgeCombo), modals.js (setPill, setCoverPreview)
// Used by:    api.js (TODO) calls openLookupReview(snapshot, newValues) after
//             a lookup completes in Edit mode; index.html's
//             #lookup-review-modal buttons call selectAllLookup/closeLookupReview/
//             applyLookupReview (that modal's HTML hasn't been pasted yet).
//
// NOTE: openCopyFromBook/applyBookCopy ("Copy from Book") and the ISBN/title
// lookup functions themselves (lookupISBN, findSeriesInfo) live in their own
// files (copy-from-book.js, api.js) since they're separate features that
// happen to call into this review system.
// ============================================================================

var _lookupSnapshot = null;   // form state before lookup ran
var _lookupNewValues = null;  // what the lookup produced

// Describes every field eligible for review: which form element it lives in,
// its display label, and how it should be compared/rendered in the diff
// (plain text vs. a <select>-backed combo vs. a pill-group vs. long text
// vs. the cover image itself).
var _lookupFieldMeta = [
  {id:'f-title',      label:'Title'},
  {id:'f-subtitle',   label:'Subtitle'},
  {id:'f-author',     label:'Author'},
  {id:'f-year',       label:'Year'},
  {id:'f-pages',      label:'Pages'},
  {id:'f-publisher',  label:'Publisher'},
  {id:'f-language',   label:'Language'},
  {id:'f-subjects',   label:'Subjects'},
  {id:'f-genre',      label:'Genre',     isSelect:true},
  {id:'f-subgenre',   label:'Subgenre',  isSelect:true, dependsOn:'f-genre'},
  {id:'f-age',        label:'Age Range', isSelect:true},
  {id:'f-grade',      label:'Grade Level'},
  {id:'f-series',     label:'Series'},
  {id:'f-series-num', label:'Series #'},
  {id:'f-condition',  label:'Condition', isPill:true},
  {id:'f-format',     label:'Format',    isPill:true},
  {id:'f-desc',       label:'Summary', isLong:true},
  {id:'f-cover-url',  label:'Cover Image', isCover:true}
];

// Captures the current value of every reviewable field, e.g. right before an
// ISBN re-lookup overwrites them, so the "Keep Mine" option in the review UI
// has something to fall back to.
function snapshotForm(){
  var snap={};
  _lookupFieldMeta.forEach(function(f){
    snap[f.id]=document.getElementById(f.id).value;
  });
  return snap;
}

// Puts the form back exactly how it was before a lookup ran (used both when
// the user cancels the review, and internally while rebuilding combo fields).
function restoreSnapshot(snap){
  // Set genre first so subgenre options exist before we set subgenre value
  document.getElementById('f-genre').value=snap['f-genre']||'';
  updateSubgenreOptions();
  _lookupFieldMeta.forEach(function(f){
    if(f.id==='f-genre')return; // already set above
    if(f.id==='f-subgenre'){setSubgenreCombo(snap[f.id]||'');return;}
    if(f.id==='f-age'){setAgeCombo(snap[f.id]||'');return;}
    document.getElementById(f.id).value=snap[f.id]||'';
    if(f.isPill) setPill(f.id.replace('f-',''), snap[f.id]||'');
  });
  // Re-sync derived UI: format pill uses 'format' key, not derived from f.id stripping
  if(snap['f-format']!==undefined)setPill('format',snap['f-format']||'');
  setCoverPreview(document.getElementById('f-cover-url').value);
}

// Diffs `snapshot` (what was in the form) against `newValues` (what a
// lookup produced) and renders the #lookup-review-modal side-by-side
// "Keep Mine" / "Use New" picker for every field that actually changed.
// If nothing changed, skips the modal entirely.
function openLookupReview(snapshot, newValues){
  _lookupSnapshot=snapshot;
  _lookupNewValues=newValues;

  var changed=_lookupFieldMeta.filter(function(f){
    var mine=(snapshot[f.id]||'').trim();
    var fresh=(newValues[f.id]||'').trim();
    if(mine===fresh) return false; // no change at all
    if(!fresh) return false;       // lookup found nothing — nothing to offer
    // Always surface if both sides have a value (genuine conflict)
    // or if the lookup found something new
    return true;
  });

  if(!changed.length){
    // Nothing really changed — just keep new values silently
    showToast('Lookup complete — no fields changed');
    return;
  }

  var rows=document.getElementById('lookup-review-rows');
  rows.innerHTML=changed.map(function(f,i){
    var mine=snapshot[f.id]||'';
    var fresh=newValues[f.id]||'';

    var mineDisplay, freshDisplay;
    if(f.isCover){
      mineDisplay=mine?'<img src="'+esc(mine)+'" style="width:56px;height:80px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">':'<span style="color:var(--ink-faint);font-size:12px">None</span>';
      freshDisplay=fresh?'<img src="'+esc(fresh)+'" style="width:56px;height:80px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">':'<span style="color:var(--ink-faint);font-size:12px">None</span>';
    } else if(f.isLong){
      mineDisplay='<div style="font-size:11px;color:var(--ink-muted);max-height:60px;overflow:hidden;line-height:1.5">'+esc((mine||'').slice(0,200))+(mine.length>200?'…':'')+'</div>';
      freshDisplay='<div style="font-size:11px;color:var(--ink-muted);max-height:60px;overflow:hidden;line-height:1.5">'+esc((fresh||'').slice(0,200))+(fresh.length>200?'…':'')+'</div>';
    } else if(f.isPill||f.isSelect){
      var badgeStyle=function(v){return v?'<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:500;background:var(--cream-dark);color:var(--ink-muted)">'+esc(v)+'</span>':'<span style="color:var(--ink-faint);font-size:12px">(not set)</span>';};
      mineDisplay=badgeStyle(mine);
      freshDisplay=badgeStyle(fresh);
    } else {
      mineDisplay='<div style="font-size:13px;color:var(--ink)">'+esc(mine||'(empty)')+'</div>';
      freshDisplay='<div style="font-size:13px;color:var(--ink)">'+esc(fresh)+'</div>';
    }

    return '<div class="lookup-review-row" data-field="'+f.id+'" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;background:var(--surface)">'+
      '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.7px;color:var(--ink-faint);margin-bottom:8px">'+esc(f.label)+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
        '<div class="lr-option lr-mine active" data-choice="mine" onclick="selectLookupField(this)" style="border:2px solid var(--rust);border-radius:6px;padding:10px;cursor:pointer;background:var(--rust-light)">'+
          '<div style="font-size:10px;font-weight:600;color:var(--rust);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">✓ Keep Mine</div>'+
          mineDisplay+
        '</div>'+
        '<div class="lr-option lr-new" data-choice="new" onclick="selectLookupField(this)" style="border:2px solid var(--border);border-radius:6px;padding:10px;cursor:pointer">'+
          '<div style="font-size:10px;font-weight:600;color:var(--ink-faint);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">Use New</div>'+
          freshDisplay+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');

  document.getElementById('lookup-review-modal').classList.add('open');
}

// Click handler for one side of a review row — marks that side "active" and
// restyles both options (rust = keeping the original, sage = taking the new
// value) so the choice is visually obvious at a glance.
function selectLookupField(el){
  var row=el.closest('.lookup-review-row');
  var opts=row.querySelectorAll('.lr-option');
  opts.forEach(function(o){
    var isThis=(o===el);
    o.classList.toggle('active',isThis);
    o.style.borderColor=isThis?(o.classList.contains('lr-mine')?'var(--rust)':'var(--sage)'):'var(--border)';
    o.style.background=isThis?(o.classList.contains('lr-mine')?'var(--rust-light)':'var(--sage-light)'):'white';
    o.querySelector('div').style.color=isThis?(o.classList.contains('lr-mine')?'var(--rust)':'var(--sage)'):'var(--ink-faint)';
    o.querySelector('div').textContent=isThis?(o.classList.contains('lr-mine')?'✓ Keep Mine':'✓ Use New'):(o.classList.contains('lr-mine')?'Keep Mine':'Use New');
  });
}

// "Keep All Mine" / "Use All New" bulk-action buttons in the review modal.
function selectAllLookup(choice){
  document.querySelectorAll('.lookup-review-row').forEach(function(row){
    var target=row.querySelector('.lr-'+choice);
    if(target)selectLookupField(target);
  });
}

// Cancel — discard the lookup's new values and put the form back exactly
// how it was before the lookup ran.
function closeLookupReview(){
  document.getElementById('lookup-review-modal').classList.remove('open');
  // Restore snapshot so the user's original values are back
  if(_lookupSnapshot)restoreSnapshot(_lookupSnapshot);
  _lookupSnapshot=null;_lookupNewValues=null;
}

// Confirm — reads each row's chosen side (mine vs. new) and writes the
// resulting value set into the form, in dependency-safe order (genre before
// subgenre, since the subgenre dropdown's options depend on genre).
function applyLookupReview(){
  if(!_lookupSnapshot||!_lookupNewValues)return;
  // For each row, apply mine or new
  // Build a map of fieldId→chosen value
  var chosen={};
  document.querySelectorAll('.lookup-review-row').forEach(function(row){
    var fieldId=row.getAttribute('data-field');
    var activeOpt=row.querySelector('.lr-option.active');
    var choice=activeOpt?activeOpt.getAttribute('data-choice'):'mine';
    chosen[fieldId]=choice==='new'?(_lookupNewValues[fieldId]||''):(_lookupSnapshot[fieldId]||'');
  });
  // Apply in dependency-safe order: genre first, then subgenre, then everything else
  // Step A: genre
  var genreChosen=chosen.hasOwnProperty('f-genre')?chosen['f-genre']:document.getElementById('f-genre').value;
  document.getElementById('f-genre').value=genreChosen;
  updateSubgenreOptions(); // populate subgenre options before setting value
  // Step B: subgenre
  var subChosen=chosen.hasOwnProperty('f-subgenre')?chosen['f-subgenre']:document.getElementById('f-subgenre').value;
  setSubgenreCombo(subChosen);
  // Step C: all other fields
  _lookupFieldMeta.forEach(function(f){
    if(f.id==='f-genre'||f.id==='f-subgenre')return; // already handled
    var val=chosen.hasOwnProperty(f.id)?chosen[f.id]:document.getElementById(f.id).value;
    if(f.id==='f-age'){setAgeCombo(val);return;}
    document.getElementById(f.id).value=val;
    if(f.isPill) setPill(f.id.replace('f-',''), val);
  });
  // Sync derived UI
  setCoverPreview(document.getElementById('f-cover-url').value);
  document.getElementById('lookup-review-modal').classList.remove('open');
  _lookupSnapshot=null;_lookupNewValues=null;
  showToast('Changes applied');
}
