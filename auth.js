// ============================================================================
// auth.js — Supabase authentication gate: sign up, sign in, sign out,
// session restore, forgot-password, password-recovery landing, and the
// two-factor (TOTP) challenge shown at sign-in
//
// The gate (#auth-gate) is one card that swaps between "panels":
//   main    — email + password (sign in / create account)
//   forgot  — request a password-reset email
//   newpw   — choose a new password (after clicking the emailed link)
//   mfa     — enter the 6-digit code from an authenticator app
//
// Depends on: supabase-config.js (supabaseClient), utils.js (showToast)
// Used by:    main.js (initAuth), index.html #auth-gate forms,
//             account.js (signOut), Settings → Account
// ============================================================================

var _supabaseUser = null;
var _authOnReady = null;    // app-startup callback handed to initAuth()
var _appStarted = false;    // guards against starting the app twice
var _recoveryMode = false;  // true while handling a password-reset link
var _mfaFactorId = null;    // the verified TOTP factor being challenged

// Figures out whether someone's already signed in. If so (and any 2FA
// challenge is satisfied) reveals the app and calls onReady(); otherwise
// shows the gate. Also reacts to later sign-in/sign-out/recovery events.
function initAuth(onReady) {
  _authOnReady = onReady;
  if (!supabaseClient) {
    showAuthError('Supabase isn\'t configured yet — edit js/supabase-config.js with your project URL and anon key, and make sure you\'ve run supabase-schema.sql.');
    showAuthGate();
    return;
  }

  // Password-reset emails link back to this page with "type=recovery" in
  // the URL hash. Note it early so we don't mistake that temporary
  // recovery session for a normal sign-in.
  _recoveryMode = /[#&]type=recovery/.test(location.hash);

  supabaseClient.auth.getSession().then(function(res) {
    var session = res.data && res.data.session;
    if (session && session.user) {
      _supabaseUser = session.user;
      if (_recoveryMode) showNewPasswordPanel(); else proceedAfterSignIn();
    } else {
      showAuthGate();
    }
  });

  supabaseClient.auth.onAuthStateChange(function(event, session) {
    if (event === 'PASSWORD_RECOVERY') {
      _recoveryMode = true;
      if (session && session.user) _supabaseUser = session.user;
      showNewPasswordPanel();
    } else if (event === 'SIGNED_IN' && session && session.user && !_supabaseUser) {
      _supabaseUser = session.user;
      if (_recoveryMode) showNewPasswordPanel(); else proceedAfterSignIn();
    } else if (event === 'SIGNED_OUT') {
      // Simplest correct way to fully reset all the in-memory app state
      // (library, currentProfile, _currentLibraryId, etc.) is to reload.
      location.reload();
    }
  });
}

// ── Gate visibility + panel switching ────────────────────────────────────────
function showAuthGate() {
  document.getElementById('auth-gate').style.display = 'flex';
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('main').style.display = 'none';
}
function hideAuthGate() {
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('sidebar').style.display = '';
  document.getElementById('main').style.display = '';
}

var AUTH_PANEL_IDS = ['auth-form', 'auth-toggle-text', 'auth-forgot-form', 'auth-newpw-form', 'auth-mfa-form', 'auth-otp-form'];
var AUTH_PANELS = {
  main:   ['auth-form', 'auth-toggle-text'],
  forgot: ['auth-forgot-form'],
  newpw:  ['auth-newpw-form'],
  mfa:    ['auth-mfa-form'],
  otp:    ['auth-otp-form']
};
var AUTH_PANEL_TITLES = {
  forgot: 'Reset Your Password',
  newpw:  'Choose a New Password',
  mfa:    'Two-Factor Verification',
  otp:    'Sign In With Email'
};

function showAuthPanel(name) {
  AUTH_PANEL_IDS.forEach(function(id) { document.getElementById(id).style.display = 'none'; });
  AUTH_PANELS[name].forEach(function(id) { document.getElementById(id).style.display = ''; });
  clearAuthError();
  if (name === 'main') {
    setAuthMode(document.getElementById('auth-form').getAttribute('data-mode') || 'signin');
  } else {
    document.getElementById('auth-title').textContent = AUTH_PANEL_TITLES[name];
  }
}

function showAuthError(msg) {
  var info = document.getElementById('auth-info');
  if (info) { info.style.display = 'none'; info.textContent = ''; }
  var el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = ''; }
}
function showAuthInfo(msg) {
  var err = document.getElementById('auth-error');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  var el = document.getElementById('auth-info');
  if (el) { el.textContent = msg; el.style.display = ''; }
}
function clearAuthError() {
  ['auth-error', 'auth-info'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  });
}

// Toggles the main form between "Sign In" and "Create Your Account" — same
// fields either way, just a different Supabase call and copy.
function setAuthMode(mode) {
  document.getElementById('auth-title').textContent = mode === 'signup' ? 'Create Your Account' : 'Sign In';
  document.getElementById('auth-submit-btn').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
  document.getElementById('auth-toggle-text').innerHTML = mode === 'signup'
    ? 'Already have an account? <a href="#" onclick="setAuthMode(\'signin\');return false;">Sign in</a>'
    : 'New here? <a href="#" onclick="setAuthMode(\'signup\');return false;">Create an account</a>';
  document.getElementById('auth-form').setAttribute('data-mode', mode);
  // "Forgot password?" only makes sense when signing in
  document.getElementById('auth-forgot-link').style.display = mode === 'signin' ? '' : 'none';
  clearAuthError();
}

// ── Sign in / sign up ────────────────────────────────────────────────────────
function handleAuthSubmit(e) {
  e.preventDefault();
  if (!supabaseClient) { showAuthError('Supabase isn\'t configured yet.'); return; }
  var mode = document.getElementById('auth-form').getAttribute('data-mode') || 'signin';
  var email = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-password').value;
  var btn = document.getElementById('auth-submit-btn');
  clearAuthError();
  btn.disabled = true; btn.textContent = 'Please wait…';

  var action = mode === 'signup'
    ? supabaseClient.auth.signUp({ email: email, password: password })
    : supabaseClient.auth.signInWithPassword({ email: email, password: password });

  action.then(function(res) {
    btn.disabled = false; btn.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
    if (res.error) { showAuthError(res.error.message); return; }
    if (mode === 'signup' && res.data && res.data.user && !res.data.session) {
      // Email confirmation is required before a session is issued
      setAuthMode('signin');
      showAuthInfo('Account created — check your email to confirm it, then sign in.');
      return;
    }
    // If a session came back, onAuthStateChange (above) picks it up and
    // continues (2FA check, then reveal the app) — nothing else to do here.
  });
}

// After any successful sign-in: if the account has 2FA and this session
// hasn't passed it yet, ask for the code; otherwise let them in.
function proceedAfterSignIn() {
  supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel().then(function(res) {
    if (res.error || !res.data) {
      showAuthGate();
      showAuthError('Could not verify your sign-in security level. Please refresh and try again.');
      return;
    }
    if (res.data.nextLevel === 'aal2' && res.data.currentLevel !== 'aal2') startMfaChallenge();
    else finishSignIn();
  });
}

function finishSignIn() {
  hideAuthGate();
  if (!_appStarted) {
    _appStarted = true;
    if (_authOnReady) _authOnReady();
  }
}

// ── Two-factor challenge at sign-in ─────────────────────────────────────────
function startMfaChallenge() {
  supabaseClient.auth.mfa.listFactors().then(function(res) {
    var factors = (res.data && res.data.totp) || [];
    showAuthGate();
    if (res.error || !factors.length) {
      showAuthError('Could not load your two-factor settings. Please refresh and try again.');
      return;
    }
    _mfaFactorId = factors[0].id;
    showAuthPanel('mfa');
    var input = document.getElementById('auth-mfa-code');
    input.value = '';
    input.focus();
  });
}

function handleMfaSubmit(e) {
  e.preventDefault();
  var code = document.getElementById('auth-mfa-code').value.replace(/\s+/g, '');
  var btn = document.getElementById('auth-mfa-btn');
  clearAuthError();
  btn.disabled = true; btn.textContent = 'Verifying…';
  supabaseClient.auth.mfa.challengeAndVerify({ factorId: _mfaFactorId, code: code }).then(function(res) {
    btn.disabled = false; btn.textContent = 'Verify';
    if (res.error) { showAuthError(res.error.message); return; }
    finishSignIn();
  });
}

function cancelMfaChallenge() {
  _mfaFactorId = null;
  signOut();
}

// ── Forgot password ─────────────────────────────────────────────────────────
function showForgotPassword() {
  var typed = document.getElementById('auth-email').value.trim();
  showAuthPanel('forgot');
  document.getElementById('auth-forgot-email').value = typed;
}

function backToSignIn() {
  showAuthPanel('main');
}

function handleForgotSubmit(e) {
  e.preventDefault();
  if (!supabaseClient) { showAuthError('Supabase isn\'t configured yet.'); return; }
  if (location.protocol === 'file:') {
    showAuthError('Password-reset emails link back to a web address, so this only works once the app is hosted online (not opened as a file from your computer).');
    return;
  }
  var email = document.getElementById('auth-forgot-email').value.trim();
  var btn = document.getElementById('auth-forgot-btn');
  clearAuthError();
  btn.disabled = true; btn.textContent = 'Sending…';
  // The link in the email sends them back to this same page. That address
  // must be listed under Supabase → Authentication → URL Configuration.
  supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function(res) {
    btn.disabled = false; btn.textContent = 'Send Reset Link';
    if (res.error) { showAuthError(res.error.message); return; }
    showAuthInfo('If an account exists for ' + email + ', a reset link is on its way. Check your inbox (and spam folder).');
  });
}

// ── Choosing a new password (after clicking the emailed link) ───────────────
function showNewPasswordPanel() {
  showAuthGate();
  showAuthPanel('newpw');
}

function handleNewPasswordSubmit(e) {
  e.preventDefault();
  var pw = document.getElementById('auth-newpw').value;
  var pw2 = document.getElementById('auth-newpw2').value;
  var btn = document.getElementById('auth-newpw-btn');
  clearAuthError();
  if (pw.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
  if (pw !== pw2) { showAuthError('The two passwords don\'t match.'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  supabaseClient.auth.updateUser({ password: pw }).then(function(res) {
    btn.disabled = false; btn.textContent = 'Save New Password';
    if (res.error) { showAuthError(res.error.message); return; }
    _recoveryMode = false;
    if (res.data && res.data.user) _supabaseUser = res.data.user;
    // Drop the recovery tokens from the address bar
    try { history.replaceState(null, '', location.pathname + location.search); } catch (err) {}
    showToast('Password updated');
    proceedAfterSignIn();
  });
}

function signOut() {
  if (!supabaseClient) return;
  supabaseClient.auth.signOut();
}

// ── Passwordless sign-in: email link or 6-digit code ─────────────────────────
// Supabase emails a one-time link (and, if your email template includes
// {{ .Token }}, a 6-digit code). Clicking the link signs this browser in via
// onAuthStateChange above; typing the code calls verifyOtp. Accounts with an
// authenticator app still get the 2FA prompt afterward.
function showOtpPanel() {
  document.getElementById('auth-otp-step1').style.display = '';
  document.getElementById('auth-otp-step2').style.display = 'none';
  var e = document.getElementById('auth-email').value.trim();
  if (e) document.getElementById('auth-otp-email').value = e;
  showAuthPanel('otp');
}

function handleOtpSend(e) {
  if (e) e.preventDefault();
  if (!supabaseClient) { showAuthError('Supabase isn\'t configured yet.'); return; }
  var email = document.getElementById('auth-otp-email').value.trim();
  var btn = document.getElementById('auth-otp-send-btn');
  clearAuthError();
  btn.disabled = true; btn.textContent = 'Sending…';
  var opts = { shouldCreateUser: true };
  if (/^https?:/.test(location.protocol)) opts.emailRedirectTo = location.origin + location.pathname;
  supabaseClient.auth.signInWithOtp({ email: email, options: opts }).then(function(res) {
    btn.disabled = false; btn.textContent = 'Email me a sign-in link';
    if (res.error) { showAuthError(res.error.message); return; }
    document.getElementById('auth-otp-step1').style.display = 'none';
    document.getElementById('auth-otp-step2').style.display = '';
    document.getElementById('auth-otp-sent-to').textContent = email;
    document.getElementById('auth-otp-code').focus();
    showAuthInfo('Email sent. Click the link in it on this device, or type the 6-digit code below.');
  });
}

function handleOtpVerify(e) {
  e.preventDefault();
  var email = document.getElementById('auth-otp-email').value.trim();
  var token = document.getElementById('auth-otp-code').value.replace(/\s+/g, '');
  var btn = document.getElementById('auth-otp-verify-btn');
  clearAuthError();
  btn.disabled = true; btn.textContent = 'Checking…';
  supabaseClient.auth.verifyOtp({ email: email, token: token, type: 'email' }).then(function(res) {
    btn.disabled = false; btn.textContent = 'Sign In';
    if (res.error) { showAuthError(res.error.message); return; }
    if (res.data && res.data.session && !_supabaseUser) {
      _supabaseUser = res.data.session.user;
      proceedAfterSignIn();
    }
  });
}
