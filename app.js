/* ═══════════════════════════════════════════════════════════════
   app.js — Imageify Application Logic
   Author: Mujahid Adamu Aliyu / MJ Web Technologies
   Scope: Auth, Guest System, Toast, Bottom Sheet, Drawer,
          Pending Image Save, Form Validation, UI State
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── 1. SUPABASE SETUP ── */
const SUPABASE_URL      = 'https://fdljvwhwtoyrlxcrkorq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGp2d2h3dG95cmx4Y3Jrb3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMzk2MjMsImV4cCI6MjEwODYxNTYyM30.qME7siVPQec4gm08QX5cYyhy6uXqpsd09pqf1yOjQuc';

let supabase;
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  console.error('[Imageify] Supabase init failed:', err);
}

/* ═══════════════════════════════════════════════════════════════
   2. GUEST USAGE SYSTEM
   Tracks how many times a non-logged-in user has used a tool.
   Stored in localStorage. Limit: 3 uses before nudge modal.
═══════════════════════════════════════════════════════════════ */
const GUEST_USAGE_LIMIT = 3;
const GUEST_USAGE_KEY   = 'imageify_guest_usage';

/**
 * Get the current guest usage count from localStorage.
 * @returns {number}
 */
function getGuestUsageCount() {
  try {
    return parseInt(localStorage.getItem(GUEST_USAGE_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

/**
 * Increment the guest usage counter by 1.
 * @returns {number} new count
 */
function incrementGuestUsage() {
  const count = getGuestUsageCount() + 1;
  try {
    localStorage.setItem(GUEST_USAGE_KEY, String(count));
  } catch { /* storage unavailable */ }
  return count;
}

/**
 * Check whether the guest has hit the usage limit.
 * @returns {boolean}
 */
function isGuestLimitReached() {
  return getGuestUsageCount() >= GUEST_USAGE_LIMIT;
}

/**
 * Reset guest usage — called after a successful sign-up.
 */
function resetGuestUsage() {
  try {
    localStorage.removeItem(GUEST_USAGE_KEY);
  } catch { /* noop */ }
}

/**
 * Show the "You've hit your limit" modal nudge.
 */
function showGuestNudgeModal() {
  const modal = document.getElementById('guestNudgeModal');
  if (!modal) return;
  modal.classList.add('modal-overlay--visible');
  modal.setAttribute('aria-hidden', 'false');
}

/**
 * Close the guest nudge modal.
 */
function closeGuestNudgeModal() {
  const modal = document.getElementById('guestNudgeModal');
  if (!modal) return;
  modal.classList.remove('modal-overlay--visible');
  modal.setAttribute('aria-hidden', 'true');
}

/**
 * Call this before every tool action on the dashboard.
 * Increments usage and shows the modal if the limit is hit.
 * @returns {boolean} true if the user can proceed, false if blocked.
 */
function checkGuestAccess() {
  const user = getCurrentUser();
  if (user) return true; // logged in — no limits

  if (isGuestLimitReached()) {
    showGuestNudgeModal();
    return false;
  }

  incrementGuestUsage();
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   3. TOAST NOTIFICATION SYSTEM
   showToast(message, type)
   type: 'success' | 'error' | 'warning'
   Auto-dismisses after 3 seconds. Has a close button.
═══════════════════════════════════════════════════════════════ */
const TOAST_DURATION_MS = 3000;

const TOAST_ICONS = {
  success: 'ph-fill ph-check-circle',
  error:   'ph-fill ph-x-circle',
  warning: 'ph-fill ph-warning',
};

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'} type
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');

  toast.innerHTML = `
    <i class="toast__icon ${TOAST_ICONS[type] || TOAST_ICONS.success}"></i>
    <span class="toast__body">${escapeHtml(message)}</span>
    <button class="toast__close" aria-label="Dismiss notification">
      <i class="ph ph-x"></i>
    </button>
  `;

  container.appendChild(toast);

  // Close button
  toast.querySelector('.toast__close').addEventListener('click', () => dismissToast(toast));

  // Auto dismiss
  const timer = setTimeout(() => dismissToast(toast), TOAST_DURATION_MS);
  toast._timer = timer;
}

function dismissToast(toast) {
  if (!toast || toast._dismissed) return;
  toast._dismissed = true;
  clearTimeout(toast._timer);
  toast.classList.add('toast--exit');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
}

/* ═══════════════════════════════════════════════════════════════
   4. PENDING SAVE SYSTEM
   When a guest processes an image and then logs in/signs up,
   we auto-upload that image to their Supabase storage.
═══════════════════════════════════════════════════════════════ */
const PENDING_IMAGE_KEY = 'imageify_pending_image';

/**
 * Store a processed image so it can be uploaded post-auth.
 * @param {string} base64String - The base64 data URL of the image.
 * @param {string} fileName     - Suggested file name.
 * @param {string} toolUsed     - e.g. 'compress', 'resize'.
 */
function storePendingImage(base64String, fileName, toolUsed) {
  try {
    const payload = JSON.stringify({ base64String, fileName, toolUsed, storedAt: Date.now() });
    localStorage.setItem(PENDING_IMAGE_KEY, payload);
  } catch (err) {
    console.warn('[Imageify] Could not store pending image:', err);
  }
}

/**
 * Retrieve the pending image record.
 * @returns {{ base64String: string, fileName: string, toolUsed: string, storedAt: number } | null}
 */
function getPendingImage() {
  try {
    const raw = localStorage.getItem(PENDING_IMAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clear the pending image record.
 */
function clearPendingImage() {
  try {
    localStorage.removeItem(PENDING_IMAGE_KEY);
  } catch { /* noop */ }
}

/**
 * Called after successful auth. Uploads any pending image to Supabase storage.
 */
async function handlePendingImageAfterAuth() {
  const pending = getPendingImage();
  if (!pending) return;

  try {
    const user = getCurrentUser();
    if (!user) return;

    // Convert base64 → Blob
    const base64Data = pending.base64String.split(',')[1];
    const mimeMatch  = pending.base64String.match(/data:(.*?);base64/);
    const mimeType   = mimeMatch ? mimeMatch[1] : 'image/png';
    const byteChars  = atob(base64Data);
    const byteArr    = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: mimeType });

    const safeName = `${user.id}/${Date.now()}_${pending.fileName}`;
    const { error } = await supabase.storage.from('user-images').upload(safeName, blob, {
      contentType: mimeType,
      upsert: false,
    });

    if (error) throw error;

    clearPendingImage();
    showToast('Your image was saved to your account!', 'success');
  } catch (err) {
    console.error('[Imageify] Pending image upload failed:', err);
    clearPendingImage(); // don't retry forever
  }
}

/* ═══════════════════════════════════════════════════════════════
   5. AUTH FUNCTIONS
═══════════════════════════════════════════════════════════════ */

/**
 * Sign in with email + password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user, error }>}
 */
async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { user: data?.user || null, error };
}

/**
 * Sign up with email + password and full name metadata.
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user, error }>}
 */
async function signUpWithEmail(name, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  return { user: data?.user || null, error };
}

/**
 * Sign in with Google OAuth (popup/redirect).
 */
async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/dashboard.html` },
  });
  if (error) showToast(error.message, 'error');
}

/**
 * Send a password reset email.
 * @param {string} email
 * @returns {Promise<{ error }>}
 */
async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/index.html`,
  });
  return { error };
}

/**
 * Sign the current user out.
 */
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast('Sign out failed. Try again.', 'error');
    return;
  }
  window.location.href = 'index.html';
}

/**
 * Get the currently authenticated user (synchronous from session).
 * @returns {object|null}
 */
function getCurrentUser() {
  try {
    return supabase?.auth?.getUser
      ? null  // getUser() is async; use onAuthStateChange for live updates
      : null;
  } catch {
    return null;
  }
}

/** Cached user reference updated by auth state listener. */
let _currentUser = null;

/**
 * Register a callback that fires whenever auth state changes.
 * @param {(user: object|null) => void} callback
 */
function onAuthStateChange(callback) {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    _currentUser = session?.user ?? null;
    callback(_currentUser);
  });
}

/* ═══════════════════════════════════════════════════════════════
   6. FORM VALIDATION
═══════════════════════════════════════════════════════════════ */

/**
 * Validate an email address.
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase().trim());
}

/**
 * Validate a password (min 8 chars).
 * @param {string} password
 * @returns {{ valid: boolean, message: string }}
 */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters.' };
  }
  return { valid: true, message: '' };
}

/**
 * Check that two passwords match.
 * @param {string} pass
 * @param {string} confirm
 * @returns {boolean}
 */
function validatePasswordMatch(pass, confirm) {
  return pass === confirm;
}

/**
 * Show an error message on a form input.
 * @param {HTMLInputElement} inputEl
 * @param {string} message
 */
function showFieldError(inputEl, message) {
  if (!inputEl) return;
  inputEl.classList.add('input-field--error');
  const errorEl = document.getElementById(`${inputEl.id}-error`);
  if (errorEl) errorEl.textContent = message;
}

/**
 * Clear an error message on a form input.
 * @param {HTMLInputElement} inputEl
 */
function clearFieldError(inputEl) {
  if (!inputEl) return;
  inputEl.classList.remove('input-field--error');
  const errorEl = document.getElementById(`${inputEl.id}-error`);
  if (errorEl) errorEl.textContent = '';
}

/**
 * Clear all field errors in a container.
 * @param {string} prefix - prefix for input IDs (e.g. 'signin' or 'bs-signin')
 * @param {string[]} fields
 */
function clearAllErrors(prefix, fields) {
  fields.forEach(f => {
    const el = document.getElementById(`${prefix}-${f}`);
    if (el) clearFieldError(el);
  });
}

/* ═══════════════════════════════════════════════════════════════
   7. UI STATE MANAGEMENT — Desktop Auth Panel
═══════════════════════════════════════════════════════════════ */

/**
 * Switch the desktop auth panel to a given state.
 * @param {'signin'|'signup'|'forgot'} state
 */
function showAuthState(state) {
  const forms = {
    signin: document.getElementById('form-signin'),
    signup: document.getElementById('form-signup'),
    forgot: document.getElementById('form-forgot'),
  };
  const tabs = {
    signin: document.getElementById('tab-signin'),
    signup: document.getElementById('tab-signup'),
  };

  // Hide all forms
  Object.values(forms).forEach(f => f && f.classList.add('auth-form--hidden'));

  // Show the requested form
  if (forms[state]) forms[state].classList.remove('auth-form--hidden');

  // Update tab active state
  Object.entries(tabs).forEach(([key, tab]) => {
    if (!tab) return;
    const isActive = key === state;
    tab.classList.toggle('auth-tab--active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  // Hide tab row when on forgot state
  const tabRow = document.querySelector('.auth-card .auth-tabs');
  if (tabRow) tabRow.style.display = state === 'forgot' ? 'none' : '';
}

/**
 * Toggle show/hide on a password input.
 * @param {string} inputId
 * @param {HTMLButtonElement} btn
 */
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  const icon = btn.querySelector('i');
  if (icon) {
    icon.className = isHidden ? 'ph ph-eye-slash' : 'ph ph-eye';
  }
  btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
}

/**
 * Put a button into a loading state or restore it.
 * @param {HTMLButtonElement} buttonEl
 * @param {boolean} isLoading
 * @param {string} [loadingText]
 */
function setButtonLoading(buttonEl, isLoading, loadingText = 'Loading…') {
  if (!buttonEl) return;
  if (isLoading) {
    buttonEl.classList.add('btn--loading');
    buttonEl.disabled = true;
    buttonEl.setAttribute('aria-busy', 'true');
    const textEl = buttonEl.querySelector('.btn-text');
    if (textEl) {
      buttonEl._originalText = textEl.textContent;
      textEl.textContent = loadingText;
    }
  } else {
    buttonEl.classList.remove('btn--loading');
    buttonEl.disabled = false;
    buttonEl.setAttribute('aria-busy', 'false');
    const textEl = buttonEl.querySelector('.btn-text');
    if (textEl && buttonEl._originalText) {
      textEl.textContent = buttonEl._originalText;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   8. FORM HANDLERS — Desktop
═══════════════════════════════════════════════════════════════ */

/**
 * Handle desktop (or bottom sheet) sign-in form submission.
 * @param {string} [prefix=''] - '' for desktop, 'bs' for bottom sheet
 */
async function handleSignIn(prefix = '') {
  const p      = prefix ? `${prefix}-` : '';
  const email  = document.getElementById(`${p}signin-email`);
  const pass   = document.getElementById(`${p}signin-password`);
  const btn    = document.getElementById(`${p}signinBtn`);
  let valid = true;

  clearAllErrors(`${p}signin`, ['email', 'password']);

  if (!email?.value.trim() || !validateEmail(email.value)) {
    showFieldError(email, 'Please enter a valid email address.');
    valid = false;
  }
  if (!pass?.value) {
    showFieldError(pass, 'Please enter your password.');
    valid = false;
  }
  if (!valid) return;

  setButtonLoading(btn, true, 'Signing in…');

  const { user, error } = await signInWithEmail(email.value.trim(), pass.value);

  setButtonLoading(btn, false);

  if (error) {
    showToast(friendlyAuthError(error.message), 'error');
    return;
  }

  showToast('Welcome back!', 'success');
  await handlePendingImageAfterAuth();
  resetGuestUsage();
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
}

/**
 * Handle desktop (or bottom sheet) sign-up form submission.
 * @param {string} [prefix='']
 */
async function handleSignUp(prefix = '') {
  const p       = prefix ? `${prefix}-` : '';
  const name    = document.getElementById(`${p}signup-name`);
  const email   = document.getElementById(`${p}signup-email`);
  const pass    = document.getElementById(`${p}signup-password`);
  const confirm = document.getElementById(`${p}signup-confirm`);
  const btn     = document.getElementById(`${p}signupBtn`);
  let valid = true;

  clearAllErrors(`${p}signup`, ['name', 'email', 'password', 'confirm']);

  if (!name?.value.trim()) {
    showFieldError(name, 'Please enter your full name.');
    valid = false;
  }
  if (!email?.value.trim() || !validateEmail(email.value)) {
    showFieldError(email, 'Please enter a valid email address.');
    valid = false;
  }
  const passCheck = validatePassword(pass?.value || '');
  if (!passCheck.valid) {
    showFieldError(pass, passCheck.message);
    valid = false;
  }
  if (!validatePasswordMatch(pass?.value || '', confirm?.value || '')) {
    showFieldError(confirm, 'Passwords do not match.');
    valid = false;
  }
  if (!valid) return;

  setButtonLoading(btn, true, 'Creating account…');

  const { user, error } = await signUpWithEmail(
    name.value.trim(),
    email.value.trim(),
    pass.value
  );

  setButtonLoading(btn, false);

  if (error) {
    showToast(friendlyAuthError(error.message), 'error');
    return;
  }

  showToast('Account created! Check your email to confirm.', 'success');
  await handlePendingImageAfterAuth();
  resetGuestUsage();
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
}

/**
 * Handle password reset request.
 * @param {string} [prefix='']
 */
async function handlePasswordReset(prefix = '') {
  const p     = prefix ? `${prefix}-` : '';
  const email = document.getElementById(`${p}forgot-email`);
  const btn   = document.getElementById(`${p}resetBtn`);

  if (!email) return;

  const errorEl = document.getElementById(`${p}forgot-email-error`);
  if (errorEl) errorEl.textContent = '';
  email.classList.remove('input-field--error');

  if (!email.value.trim() || !validateEmail(email.value)) {
    showFieldError(email, 'Please enter a valid email address.');
    return;
  }

  setButtonLoading(btn, true, 'Sending…');

  const { error } = await sendPasswordReset(email.value.trim());

  setButtonLoading(btn, false);

  if (error) {
    showToast(friendlyAuthError(error.message), 'error');
    return;
  }

  // Show success state
  const defaultEl = document.getElementById(`${p}forgot-default`);
  const successEl = document.getElementById(`${p}forgot-success`);
  if (defaultEl) defaultEl.classList.add('auth-form--hidden');
  if (successEl) successEl.classList.remove('auth-form--hidden');
}

/**
 * Convert raw Supabase auth error messages to friendlier strings.
 * @param {string} raw
 * @returns {string}
 */
function friendlyAuthError(raw = '') {
  const map = {
    'Invalid login credentials':  'Incorrect email or password.',
    'Email not confirmed':         'Please verify your email first.',
    'User already registered':     'This email is already in use.',
    'Password should be at least': 'Password must be at least 6 characters.',
    'over_email_send_rate_limit':  'Too many attempts. Try again in a minute.',
  };
  for (const [key, msg] of Object.entries(map)) {
    if (raw.includes(key)) return msg;
  }
  return raw || 'Something went wrong. Please try again.';
}

/* ═══════════════════════════════════════════════════════════════
   9. BOTTOM SHEET — Mobile Auth
═══════════════════════════════════════════════════════════════ */
let _sheetOpen = false;
let _sheetDragStartY = 0;
let _sheetCurrentY = 0;
let _sheetDragging = false;

/**
 * Open the bottom sheet, optionally on a specific tab.
 * @param {'signin'|'signup'} [tab='signin']
 */
function openBottomSheet(tab = 'signin') {
  const sheet    = document.getElementById('bottomSheet');
  const backdrop = document.getElementById('bottomSheetBackdrop');
  if (!sheet || _sheetOpen) return;

  _sheetOpen = true;
  sheet.classList.add('bottom-sheet--open');
  sheet.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('bottom-sheet-backdrop--visible');
  document.body.style.overflow = 'hidden';

  showBottomSheetState(tab);
}

/**
 * Close the bottom sheet.
 */
function closeBottomSheet() {
  const sheet    = document.getElementById('bottomSheet');
  const backdrop = document.getElementById('bottomSheetBackdrop');
  if (!sheet || !_sheetOpen) return;

  _sheetOpen = false;
  sheet.style.transform = '';
  sheet.classList.remove('bottom-sheet--open');
  sheet.setAttribute('aria-hidden', 'true');
  backdrop.classList.remove('bottom-sheet-backdrop--visible');
  document.body.style.overflow = '';
}

/**
 * Switch the bottom sheet auth state.
 * @param {'signin'|'signup'|'forgot'} state
 */
function showBottomSheetState(state) {
  const forms = {
    signin: document.getElementById('bs-form-signin'),
    signup: document.getElementById('bs-form-signup'),
    forgot: document.getElementById('bs-form-forgot'),
  };
  const tabs = {
    signin: document.getElementById('bs-tab-signin'),
    signup: document.getElementById('bs-tab-signup'),
  };

  Object.values(forms).forEach(f => f && f.classList.add('auth-form--hidden'));
  if (forms[state]) forms[state].classList.remove('auth-form--hidden');

  Object.entries(tabs).forEach(([key, tab]) => {
    if (!tab) return;
    const isActive = key === state;
    tab.classList.toggle('auth-tab--active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  const bsTabRow = document.querySelector('#bottomSheet .auth-tabs');
  if (bsTabRow) bsTabRow.style.display = state === 'forgot' ? 'none' : '';
}

/**
 * Initialize drag-to-close on the bottom sheet.
 * Ignores drags that start on input elements.
 */
function initDragToClose() {
  const sheet = document.getElementById('bottomSheet');
  if (!sheet) return;

  sheet.addEventListener('touchstart', (e) => {
    const target = e.target;
    // Ignore if touching an input, textarea, select, or button
    if (target.closest('input, textarea, select, button, .auth-tabs')) return;

    _sheetDragging    = true;
    _sheetDragStartY  = e.touches[0].clientY;
    _sheetCurrentY    = 0;
    sheet.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', (e) => {
    if (!_sheetDragging) return;
    const deltaY = e.touches[0].clientY - _sheetDragStartY;
    if (deltaY < 0) return; // don't drag upward
    _sheetCurrentY = deltaY;
    sheet.style.transform = `translateY(${deltaY}px)`;
  }, { passive: true });

  sheet.addEventListener('touchend', () => {
    if (!_sheetDragging) return;
    _sheetDragging = false;
    sheet.style.transition = '';

    if (_sheetCurrentY > 120) {
      closeBottomSheet();
    } else {
      sheet.style.transform = '';
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   10. DRAWER — Mobile Hamburger Menu
═══════════════════════════════════════════════════════════════ */
let _drawerOpen   = false;
let _drawerStartX = 0;
let _drawerCurrX  = 0;
let _drawerDragging = false;

/**
 * Open the mobile drawer.
 */
function openDrawer() {
  const drawer   = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const btn      = document.getElementById('hamburgerBtn');
  if (!drawer || _drawerOpen) return;

  _drawerOpen = true;
  drawer.classList.add('drawer--open');
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('drawer-backdrop--visible');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

/**
 * Close the mobile drawer.
 */
function closeDrawer() {
  const drawer   = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const btn      = document.getElementById('hamburgerBtn');
  if (!drawer || !_drawerOpen) return;

  _drawerOpen = false;
  drawer.style.transform = '';
  drawer.classList.remove('drawer--open');
  drawer.setAttribute('aria-hidden', 'true');
  backdrop.classList.remove('drawer-backdrop--visible');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

/**
 * Initialize swipe-right-to-close on the mobile drawer.
 */
function initDrawerDrag() {
  const drawer = document.getElementById('mobileDrawer');
  if (!drawer) return;

  drawer.addEventListener('touchstart', (e) => {
    _drawerDragging = true;
    _drawerStartX   = e.touches[0].clientX;
    _drawerCurrX    = 0;
    drawer.style.transition = 'none';
  }, { passive: true });

  drawer.addEventListener('touchmove', (e) => {
    if (!_drawerDragging) return;
    const deltaX = e.touches[0].clientX - _drawerStartX;
    if (deltaX < 0) return; // only drag right
    _drawerCurrX = deltaX;
    drawer.style.transform = `translateX(${deltaX}px)`;
  }, { passive: true });

  drawer.addEventListener('touchend', () => {
    if (!_drawerDragging) return;
    _drawerDragging = false;
    drawer.style.transition = '';

    if (_drawerCurrX > 80) {
      closeDrawer();
    } else {
      drawer.style.transform = '';
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   11. ISLAND SCROLL BEHAVIOUR
   Island becomes slightly more opaque as the user scrolls,
   making it more readable against varied content.
═══════════════════════════════════════════════════════════════ */
function initIslandScroll() {
  const island = document.getElementById('islandDesktop');
  const islandMobile = document.getElementById('islandMobile');
  if (!island && !islandMobile) return;

  const handler = () => {
    const scrollY   = window.scrollY || document.documentElement.scrollTop;
    const progress  = Math.min(scrollY / 200, 1); // 0 → 1 over first 200px
    const opacity   = 0.72 + progress * 0.23;      // 0.72 → 0.95
    const shadow    = `0 ${4 + progress * 4}px ${24 + progress * 16}px rgba(0,0,0,${0.10 + progress * 0.08})`;

    if (island) {
      island.style.background = `rgba(255,255,255,${opacity})`;
      island.style.boxShadow  = shadow;
    }
    if (islandMobile) {
      islandMobile.style.background = `rgba(255,255,255,${opacity})`;
      islandMobile.style.boxShadow  = shadow;
    }
  };

  window.addEventListener('scroll', handler, { passive: true });
}

/* ═══════════════════════════════════════════════════════════════
   12. SMOOTH SCROLL FOR ISLAND NAV LINKS
═══════════════════════════════════════════════════════════════ */
function initSmoothScroll() {
  document.querySelectorAll('.island-link[href^="#"], .drawer__link[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href').slice(1);
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   13. GUEST MODE — Continue without account
═══════════════════════════════════════════════════════════════ */
function continueAsGuest() {
  closeBottomSheet();
  window.location.href = 'dashboard.html';
}

/**
 * Scroll to the auth panel on desktop (for hero CTA buttons).
 */
function scrollToAuth() {
  const panel = document.getElementById('authPanel');
  if (panel) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ═══════════════════════════════════════════════════════════════
   14. AUTH STATE REDIRECT GUARD
   If user is already logged in, skip index and go to dashboard.
═══════════════════════════════════════════════════════════════ */
function initAuthRedirect() {
  if (!supabase) return;

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      window.location.replace('dashboard.html');
    }
  });

  onAuthStateChange((user) => {
    if (user && window.location.pathname.includes('index')) {
      window.location.replace('dashboard.html');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   15. HELPER UTILITIES
═══════════════════════════════════════════════════════════════ */

/**
 * Escape HTML to prevent XSS in toast messages.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Check if we're on a mobile viewport.
 * @returns {boolean}
 */
function isMobile() {
  return window.innerWidth <= 768;
}

/* ═══════════════════════════════════════════════════════════════
   16. EVENT LISTENERS & INIT
   Wire up all interactive elements and kick off behaviours.
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // ── Auth redirect guard (index.html only) ──
  if (document.getElementById('authPanel') || document.getElementById('bottomSheet')) {
    initAuthRedirect();
  }

  // ── Desktop auth tab clicks ──
  document.querySelectorAll('.auth-card .auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      if (target) showAuthState(target);
    });
  });

  // ── Keyboard: submit forms on Enter ──
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const active = document.activeElement;
    if (!active) return;

    // Desktop forms
    if (active.closest('#form-signin'))  handleSignIn();
    if (active.closest('#form-signup'))  handleSignUp();
    if (active.closest('#form-forgot'))  handlePasswordReset();

    // Bottom sheet forms
    if (active.closest('#bs-form-signin'))  handleSignIn('bs');
    if (active.closest('#bs-form-signup'))  handleSignUp('bs');
    if (active.closest('#bs-form-forgot'))  handlePasswordReset('bs');
  });

  // ── Island scroll effect ──
  initIslandScroll();

  // ── Smooth scroll for nav links ──
  initSmoothScroll();

  // ── Mobile: drag to close sheet & drawer ──
  initDragToClose();
  initDrawerDrag();

  // ── Close modal on backdrop click ──
  const guestModal = document.getElementById('guestNudgeModal');
  if (guestModal) {
    guestModal.addEventListener('click', (e) => {
      if (e.target === guestModal) closeGuestNudgeModal();
    });
  }

  // ── Close bottom sheet on Escape key ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (_sheetOpen)  closeBottomSheet();
      if (_drawerOpen) closeDrawer();
      closeGuestNudgeModal();
    }
  });

  // ── Phosphor icons init (if using the @phosphor-icons/web package) ──
  // The CDN version auto-initialises, so nothing needed here.

  console.log('[Imageify] App initialised ✓');
});

/* ═══════════════════════════════════════════════════════════════
   17. EXPORTS (for dashboard.html access — global scope)
   All functions are on the global window object since this
   is a vanilla JS project with no module bundler.
═══════════════════════════════════════════════════════════════ */
// window.* is implicit in browser globals, no export needed.
// dashboard.html can call: signOut(), showToast(), checkGuestAccess(),
// storePendingImage(), getCurrentUser(), onAuthStateChange(), etc.
