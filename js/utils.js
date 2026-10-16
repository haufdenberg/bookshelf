// ============================================================================
// utils.js — small generic string helpers with no app-state dependencies
//
// Depends on: nothing (pure functions, aside from applyTitleCase() touching
//             the DOM for the one form field it's bound to).
// Used by:    everywhere HTML is built from user data (XSS-safety via esc()),
//             and the "Book Title" field's onblur handler.
// ============================================================================

function esc(str) {
  if (!str) return '';
  return str.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Title case conversion ────────────────────────────────────────────────────
// Articles, conjunctions, prepositions that stay lowercase (unless first/last word)
var TC_LOWER = new Set([
  'a','an','the','and','but','or','nor','for','yet','so',
  'as','at','by','in','of','off','on','per','to','up','via',
  'with','from','into','onto','over','past','than','till',
  'upon','with','within','without','amid','among','anti',
  'down','near','next','plus','save','since','than','through',
  'under','until','like'
]);

function toTitleCase(str) {
  if (!str) return str;
  // Detect Spanish: if language field says Spanish/Español/es, skip
  var lang = (document.getElementById('f-language') || {value:''}).value.toLowerCase();
  if (lang === 'spanish' || lang === 'español' || lang === 'es') return str;
  var words = str.split(/(\s+|[-–—\/])/); // split on spaces and hyphens/dashes/slashes, keeping delimiters
  var result = '';
  var wordIndex = 0; // count actual words (not delimiters)
  var totalWords = words.filter(function(w){ return w.trim().length > 0; }).length;
  var actualIdx = 0;
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (!w.trim()) { result += w; continue; } // delimiter — keep as-is
    actualIdx++;
    var lower = w.toLowerCase();
    var isFirst = actualIdx === 1;
    var isLast  = actualIdx === totalWords;
    // Always capitalise first word, last word, and any word after a colon
    var prevNonSpace = result.replace(/\s+$/,'');
    var afterColon = prevNonSpace.length > 0 && prevNonSpace[prevNonSpace.length-1] === ':';
    // Uppercase: first, last, after colon, or not in the lower-set
    if (isFirst || isLast || afterColon || !TC_LOWER.has(lower)) {
      // Preserve ALL-CAPS acronyms (e.g. "ISBN", "USA")
      if (w === w.toUpperCase() && w.length > 1 && /^[A-Z]+$/.test(w)) {
        result += w;
      } else {
        result += w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }
    } else {
      result += lower;
    }
  }
  return result;
}

function applyTitleCase() {
  var el = document.getElementById('f-title');
  if (el && el.value) el.value = toTitleCase(el.value);
}

// Formats a "YYYY-MM-DD" date-only string (from an <input type="date">) for
// display. Appending T00:00:00 forces it to parse as LOCAL midnight rather
// than UTC midnight — without that, browsers west of UTC would display the
// previous day (e.g. "2026-03-03" rendering as "Mar 2, 2026").
function formatDateLocal(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Toast notifications ──────────────────────────────────────────────────────
var _toastTimer = null;
function showToast(msg) {
  var t = document.getElementById('toast'); t.textContent = msg;
  t.classList.remove('has-action'); t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2500);
}

// Toast with a clickable action button (e.g. "Undo") that stays up longer.
function showToastAction(msg, label, fn, ms) {
  var t = document.getElementById('toast');
  t.innerHTML = '';
  t.appendChild(document.createTextNode(msg + ' '));
  var btn = document.createElement('button');
  btn.textContent = label;
  btn.className = 'toast-action';
  btn.onclick = function() { t.classList.remove('show'); clearTimeout(_toastTimer); fn(); };
  t.appendChild(btn);
  t.classList.add('has-action', 'show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { t.classList.remove('show'); }, ms || 8000);
}

// ── ISBN comparison key ──────────────────────────────────────────────────────
// Turns a valid ISBN-10 or ISBN-13 into its ISBN-13 digits so "0439244196" and
// "9780439244190" (the same book) compare equal. Anything that isn't a valid-
// looking ISBN (blank, a title typed into the ISBN box, …) returns ''.
function isbnKey(raw) {
  var s = (raw || '').toString().replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^97[89]\d{10}$/.test(s)) return s;
  if (/^\d{9}[\dX]$/.test(s)) {
    var core = '978' + s.slice(0, 9), sum = 0;
    for (var i = 0; i < 12; i++) sum += parseInt(core[i], 10) * (i % 2 ? 3 : 1);
    return core + ((10 - (sum % 10)) % 10);
  }
  return '';
}
