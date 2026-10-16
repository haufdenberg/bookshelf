// ============================================================================
// genre-fields.js — Genre / Subgenre / Age Range dropdown behavior
//
// These "combo" fields (a <select> of common values + an "Other…" option that
// reveals a free-text <input>) are used in two places: the Add/Edit Book form
// (#f-genre, #f-subgenre-sel, #f-age-sel) and the Library filter bar
// (#filter-genre, #filter-subgenre). This file owns populating and syncing
// both.
//
// Depends on: config.js (SUBGENRES)
// Used by:    index.html inline onchange handlers, forms.js (when populating
//             the form for edit), main.js (initial population on load).
// ============================================================================

function populateGenreDropdowns() {
  var gSel = document.getElementById('f-genre');
  var filterG = document.getElementById('filter-genre');
  gSel.innerHTML = '<option value="">Select genre…</option>';
  filterG.innerHTML = '<option value="">All Genres</option>';
  Object.keys(SUBGENRES).sort().forEach(function(g) {
    var opt = document.createElement('option'); opt.value = g; opt.textContent = g;
    gSel.appendChild(opt);
    var opt2 = document.createElement('option'); opt2.value = g; opt2.textContent = g;
    filterG.appendChild(opt2);
  });
}

function updateSubgenreOptions() {
  var g = document.getElementById('f-genre').value;
  var subSel = document.getElementById('f-subgenre-sel');
  if (!subSel) return;
  var currentVal = document.getElementById('f-subgenre').value;
  subSel.innerHTML = '<option value="">Select subgenre…</option>';
  var inList = false;
  if (g && SUBGENRES[g]) {
    SUBGENRES[g].forEach(function(sg) {
      var opt = document.createElement('option'); opt.value = sg; opt.textContent = sg;
      subSel.appendChild(opt);
      if (sg === currentVal) inList = true;
    });
  }
  // Always add Other option
  var otherOpt = document.createElement('option');
  otherOpt.value = '__other__'; otherOpt.textContent = 'Other…';
  subSel.appendChild(otherOpt);
  // Restore current value
  if (currentVal) {
    if (inList) {
      subSel.value = currentVal;
      document.getElementById('f-subgenre-other').style.display = 'none';
    } else if (currentVal) {
      subSel.value = '__other__';
      document.getElementById('f-subgenre-other').style.display = '';
      document.getElementById('f-subgenre-other').value = currentVal;
    }
  }
  updateFilterSubgenres();
}

function handleSubgenreChange() {
  var sel = document.getElementById('f-subgenre-sel');
  var otherInput = document.getElementById('f-subgenre-other');
  var hidden = document.getElementById('f-subgenre');
  if (sel.value === '__other__') {
    otherInput.style.display = '';
    otherInput.focus();
    hidden.value = otherInput.value || '';
  } else {
    otherInput.style.display = 'none';
    hidden.value = sel.value;
  }
}

function handleAgeChange() {
  var sel = document.getElementById('f-age-sel');
  var otherInput = document.getElementById('f-age-other');
  var hidden = document.getElementById('f-age');
  if (sel.value === '__other__') {
    otherInput.style.display = '';
    otherInput.focus();
    hidden.value = otherInput.value || '';
  } else {
    otherInput.style.display = 'none';
    hidden.value = sel.value;
  }
}

// Programmatically set the genre/subgenre combo (e.g. when loading a book
// for editing, or after an ISBN auto-fill), routing to "Other…" if the value
// isn't one of the known subgenres for the selected genre.
function setSubgenreCombo(val) {
  var sel = document.getElementById('f-subgenre-sel');
  var otherInput = document.getElementById('f-subgenre-other');
  var hidden = document.getElementById('f-subgenre');
  if (!sel) return;
  hidden.value = val;
  // Check if val is one of the options
  var found = false;
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === val) { found = true; break; }
  }
  if (!val) {
    sel.value = ''; otherInput.style.display = 'none'; otherInput.value = '';
  } else if (found) {
    sel.value = val; otherInput.style.display = 'none'; otherInput.value = '';
  } else {
    sel.value = '__other__'; otherInput.style.display = ''; otherInput.value = val;
  }
}

// Same idea as setSubgenreCombo(), for the Age Range combo.
function setAgeCombo(val) {
  var sel = document.getElementById('f-age-sel');
  var otherInput = document.getElementById('f-age-other');
  var hidden = document.getElementById('f-age');
  if (!sel) return;
  hidden.value = val;
  var standardAges = ['Pre-K (Ages 0–4)','Early Reader (Ages 5–8)','Middle Grade (Ages 8–12)','Young Adult (Ages 13–17)','Adult (18+)'];
  if (!val) {
    sel.value = ''; otherInput.style.display = 'none'; otherInput.value = '';
  } else if (standardAges.indexOf(val) > -1) {
    sel.value = val; otherInput.style.display = 'none'; otherInput.value = '';
  } else {
    sel.value = '__other__'; otherInput.style.display = ''; otherInput.value = val;
  }
}

// Rebuilds the Library filter bar's Subgenre dropdown to match whichever
// Genre is currently selected there.
function updateFilterSubgenres() {
  var g = document.getElementById('filter-genre').value;
  var subSel = document.getElementById('filter-subgenre');
  subSel.innerHTML = '<option value="">All Subgenres</option>';
  if (g && SUBGENRES[g]) {
    SUBGENRES[g].forEach(function(sg) {
      var opt = document.createElement('option'); opt.value = sg; opt.textContent = sg;
      subSel.appendChild(opt);
    });
  }
}
