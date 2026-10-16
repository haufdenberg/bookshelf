// ============================================================================
// barcode-scanner.js — camera ISBN scanner (#scan-modal)
//
// Uses the browser's built-in BarcodeDetector where available (Chrome/Edge/
// Android, recent Safari); otherwise lazy-loads the ZXing library from a CDN.
// Camera access requires https:// or localhost — it will not work from file://.
//
// Depends on: utils.js (showToast), api.js (lookupISBN)
// Used by:    index.html (📷 button next to the ISBN field in the book form)
// ============================================================================

var _scanStream = null;
var _scanActive = false;
var _scanReader = null;
var _scanCallback = null;
var _scanContinuous = false;
var _scanLast = { code: '', at: 0 };
var _scanCount = 0;

// continuous = true keeps the camera open after each hit (used by Bulk Add to
// scan a whole shelf); the user closes the dialog when finished.
function openBarcodeScanner(callback, continuous) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) {
    showToast('Camera scanning needs https:// (or localhost). You can still type the ISBN.');
    return;
  }
  _scanCallback = callback;
  _scanContinuous = !!continuous;
  _scanCount = 0;
  _scanLast = { code: '', at: 0 };
  document.getElementById('scan-status').textContent = 'Starting camera…';
  document.getElementById('scan-modal').classList.add('open');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then(function(stream) {
      _scanStream = stream;
      var video = document.getElementById('scan-video');
      video.srcObject = stream;
      video.play();
      _scanActive = true;
      document.getElementById('scan-status').textContent = 'Point the camera at the barcode on the back of the book';
      if ('BarcodeDetector' in window) startNativeScan(video);
      else startZxingScan(video);
    })
    .catch(function(err) {
      closeBarcodeScanner();
      showToast(err && err.name === 'NotAllowedError' ? 'Camera permission was denied' : 'Could not start the camera');
    });
}

function startNativeScan(video) {
  var detector;
  try { detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }); }
  catch (e) { startZxingScan(video); return; }
  (function tick() {
    if (!_scanActive) return;
    detector.detect(video).then(function(codes) {
      if (codes && codes.length) { handleScanResult(codes[0].rawValue); return; }
      setTimeout(tick, 250);
    }).catch(function() { setTimeout(tick, 400); });
  })();
}

function startZxingScan(video) {
  function begin() {
    _scanReader = new ZXing.BrowserMultiFormatReader();
    _scanReader.decodeFromVideoElement(video, function(result) {
      if (result && _scanActive) handleScanResult(result.getText());
    });
  }
  if (window.ZXing) { begin(); return; }
  var s = document.createElement('script');
  s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
  s.onload = begin;
  s.onerror = function() {
    document.getElementById('scan-status').textContent = 'Scanner library could not load — type the ISBN instead.';
  };
  document.head.appendChild(s);
}

function handleScanResult(text) {
  var digits = (text || '').replace(/[^0-9X]/gi, '');
  // Books use EAN-13 starting 978/979 (ISBN-13); ignore other barcodes and keep scanning.
  if (!/^97[89]\d{10}$/.test(digits)) {
    if (_scanActive && !('BarcodeDetector' in window)) return;
    document.getElementById('scan-status').textContent = 'That is not a book barcode — try the one with 978… under it';
    if (_scanActive) setTimeout(function() { if ('BarcodeDetector' in window) startNativeScan(document.getElementById('scan-video')); }, 600);
    return;
  }
  var cb = _scanCallback;
  if (_scanContinuous) {
    var now = Date.now();
    if (digits === _scanLast.code && now - _scanLast.at < 4000) { // same book still in view
      _scanLast.at = now;
      if ('BarcodeDetector' in window) setTimeout(function() { startNativeScan(document.getElementById('scan-video')); }, 300);
      return;
    }
    _scanLast = { code: digits, at: now };
    _scanCount++;
    document.getElementById('scan-status').textContent = '✓ ' + digits + ' added (' + _scanCount + ' scanned) — next book, or close when done';
    if (cb) cb(digits);
    if ('BarcodeDetector' in window) setTimeout(function() { if (_scanActive) startNativeScan(document.getElementById('scan-video')); }, 1200);
    return;
  }
  closeBarcodeScanner();
  if (cb) cb(digits);
}

function closeBarcodeScanner() {
  _scanActive = false;
  if (_scanReader) { try { _scanReader.reset(); } catch (e) {} _scanReader = null; }
  if (_scanStream) { _scanStream.getTracks().forEach(function(t) { t.stop(); }); _scanStream = null; }
  var video = document.getElementById('scan-video');
  if (video) video.srcObject = null;
  document.getElementById('scan-modal').classList.remove('open');
}

// Scan into the Add/Edit form's ISBN box and auto-run the lookup.
function scanIntoForm() {
  openBarcodeScanner(function(isbn) {
    document.getElementById('f-isbn').value = isbn;
    showToast('Scanned ' + isbn + ' — looking it up…');
    lookupISBN();
  });
}
