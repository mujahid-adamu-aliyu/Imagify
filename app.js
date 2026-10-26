/**
 * IMAGIFY — Pure Client-side Application Logic
 * Integrates Supabase Auth, Rate Limiting, View Switching, and Guest Tracking.
 */

// 1. Supabase Initialization (Exact Credentials)
const SUPABASE_URL = 'https://fdljvwhwtoyrlxcrkorq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGp2d2h3dG95cmx4Y3Jrb3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMzk2MjMsImV4cCI6MjEwODYxNTYyM30.qME7siVPQec4gm08QX5cYyhy6uXqpsd09pqf1yOjQuc';

const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Determine Current Page
const isDashboard = window.location.pathname.endsWith('dashboard.html');

// 2. State & Session Management
document.addEventListener('DOMContentLoaded', async () => {
  if (!supabase) {
    console.error('Supabase client failed to initialize');
    return;
  }

  // Session guard
  const { data: { session } } = await supabase.auth.getSession();

  if (isDashboard) {
    if (!session) {
      window.location.replace('index.html');
      return;
    }
    initDashboard(session.user);
  } else {
    if (session) {
      window.location.replace('dashboard.html');
      return;
    }
    initLanding();
  }

  // Real-time auth state listener
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && !isDashboard) {
      window.location.replace('dashboard.html');
    } else if (event === 'SIGNED_OUT' && isDashboard) {
      window.location.replace('index.html');
    }
  });
});

/* ==========================================================================
   LANDING & AUTH LOGIC
   ========================================================================== */

function initLanding() {
  const authOverlay = document.getElementById('authOverlay');
  const loginView = document.getElementById('loginView');
  const signupView = document.getElementById('signupView');
  const resetView = document.getElementById('resetView');
  const closeBtn = document.getElementById('modalCloseBtn');

  // Open modal/sheet helpers
  window.openAuth = (view = 'login') => {
    authOverlay.classList.add('active');
    authOverlay.setAttribute('aria-hidden', 'false');
    showAuthView(view);
  };

  window.closeAuth = () => {
    authOverlay.classList.remove('active');
    authOverlay.setAttribute('aria-hidden', 'true');
    clearAllErrors();
  };

  function showAuthView(view) {
    loginView.style.display = view === 'login' ? 'block' : 'none';
    signupView.style.display = view === 'signup' ? 'block' : 'none';
    resetView.style.display = view === 'reset' ? 'block' : 'none';
    clearAllErrors();
  }

  // Trigger buttons
  document.getElementById('navLoginBtn')?.addEventListener('click', () => openAuth('login'));
  document.getElementById('navSignupBtn')?.addEventListener('click', () => openAuth('signup'));
  document.getElementById('heroGetStartedBtn')?.addEventListener('click', () => openAuth('signup'));

  // Switch links
  document.getElementById('toResetBtn')?.addEventListener('click', () => showAuthView('reset'));
  document.getElementById('toSignupBtn')?.addEventListener('click', () => showAuthView('signup'));
  document.getElementById('toLoginFromSignupBtn')?.addEventListener('click', () => showAuthView('login'));
  document.getElementById('toLoginFromResetBtn')?.addEventListener('click', () => showAuthView('login'));

  // Modal dismiss
  closeBtn?.addEventListener('click', closeAuth);
  authOverlay?.addEventListener('click', (e) => {
    if (e.target === authOverlay) closeAuth();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && authOverlay?.classList.contains('active')) closeAuth();
  });

  // Password visibility toggles
  document.querySelectorAll('.btn-toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isPassword ? 'ph-bold ph-eye-slash' : 'ph-bold ph-eye';
      }
    });
  });

  // Attach submit listeners
  initAuthSubmits();
}

function initAuthSubmits() {
  // 1. Google OAuth
  const handleGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/dashboard.html' }
      });
      if (error) throw error;
    } catch (err) {
      alert(err.message || 'Google authentication failed');
    }
  };
  document.getElementById('loginGoogleBtn')?.addEventListener('click', handleGoogle);
  document.getElementById('signupGoogleBtn')?.addEventListener('click', handleGoogle);

  // 2. Login submit
  const loginForm = document.getElementById('loginForm');
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const submitBtn = document.getElementById('loginSubmitBtn');

    if (!email) return setInlineError('loginEmail', 'This field is required.');
    if (!validateEmail(email)) return setInlineError('loginEmail', 'Please enter a valid email address.');
    if (!password) return setInlineError('loginPassword', 'This field is required.');

    // Check rate limit RPC before showing loading
    const isAllowed = await checkRateLimit(email);
    if (!isAllowed) {
      const minutes = await getLockoutMinutes(email);
      setFormAlert('loginAlert', `Too many failed attempts. Try again in ${minutes} minutes.`, 'error');
      return;
    }

    setBtnLoading(submitBtn, true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        await logAuthAttempt(email, false);
        setFormAlert('loginAlert', mapAuthError(error.message), 'error');
      } else {
        await logAuthAttempt(email, true);
        window.location.replace('dashboard.html');
      }
    } catch (err) {
      setFormAlert('loginAlert', 'Something went wrong. Please try again.', 'error');
    } finally {
      setBtnLoading(submitBtn, false);
    }
  });

  // 3. Signup submit
  const signupForm = document.getElementById('signupForm');
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const fullName = document.getElementById('signupFullName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const terms = document.getElementById('signupTerms').checked;
    const submitBtn = document.getElementById('signupSubmitBtn');

    if (!fullName || fullName.length < 2) return setInlineError('signupFullName', 'Full name must be at least 2 characters.');
    if (!email || !validateEmail(email)) return setInlineError('signupEmail', 'Please enter a valid email address.');
    if (!password || password.length < 8) return setInlineError('signupPassword', 'Password must be at least 8 characters.');
    if (password !== confirmPassword) return setInlineError('signupConfirmPassword', 'Passwords do not match.');
    if (!terms) return setInlineError('signupTerms', 'You must agree to the terms to continue.');

    const isAllowed = await checkRateLimit(email);
    if (!isAllowed) {
      const minutes = await getLockoutMinutes(email);
      setFormAlert('signupAlert', `Too many failed attempts. Try again in ${minutes} minutes.`, 'error');
      return;
    }

    setBtnLoading(submitBtn, true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) {
        await logAuthAttempt(email, false);
        setFormAlert('signupAlert', mapAuthError(error.message), 'error');
      } else {
        await logAuthAttempt(email, true);
        localStorage.setItem('imagify_guest_uses', '0'); // Reset guest counter
        window.location.replace('dashboard.html');
      }
    } catch (err) {
      setFormAlert('signupAlert', 'Something went wrong. Please try again.', 'error');
    } finally {
      setBtnLoading(submitBtn, false);
    }
  });

  // 4. Password Reset Submit
  const resetForm = document.getElementById('resetForm');
  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const email = document.getElementById('resetEmail').value.trim();
    const submitBtn = document.getElementById('resetSubmitBtn');

    if (!email || !validateEmail(email)) return setInlineError('resetEmail', 'Please enter a valid email address.');

    setBtnLoading(submitBtn, true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html#reset'
      });
      if (error) {
        setFormAlert('resetAlert', mapAuthError(error.message), 'error');
      } else {
        setFormAlert('resetAlert', 'Check your email for a reset link!', 'success');
      }
    } catch (err) {
      setFormAlert('resetAlert', 'Something went wrong. Please try again.', 'error');
    } finally {
      setBtnLoading(submitBtn, false);
    }
  });
}

/* ==========================================================================
   DASHBOARD WORKSPACE LOGIC
   ========================================================================== */

async function initDashboard(user) {
  // Render user display
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Creator';
  const email = user.email || '';
  const initials = name.slice(0, 2).toUpperCase();

  const nameDisplay = document.getElementById('userNameDisplay');
  const avatar = document.getElementById('userAvatar');
  const greeting = document.getElementById('greetingMessage');
  const profileName = document.getElementById('profileNameDisplay');
  const profileEmail = document.getElementById('profileEmailDisplay');
  const profileAvatar = document.getElementById('profileBigAvatar');

  if (nameDisplay) nameDisplay.textContent = name;
  if (avatar) avatar.textContent = initials;
  if (profileName) profileName.textContent = name;
  if (profileEmail) profileEmail.textContent = email;
  if (profileAvatar) profileAvatar.textContent = initials;

  if (greeting) {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    greeting.textContent = `Good ${timeOfDay}, ${name}! 👋`;
  }

  // Load storage usage
  loadStorage(user.id);

  // View navigation
  initNavigation();

  // User menu dropdown toggle
  const userBtn = document.getElementById('userMenuBtn');
  const userDropdown = document.getElementById('userDropdown');
  userBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown?.classList.toggle('active');
  });

  document.addEventListener('click', () => userDropdown?.classList.remove('active'));

  // Mobile menu sidebar toggle
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('dashboardSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');

  mobileBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('mobile-open');
    backdrop?.classList.toggle('active');
  });

  backdrop?.addEventListener('click', () => {
    sidebar?.classList.remove('mobile-open');
    backdrop?.classList.remove('active');
  });

  // Logout listener
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.replace('index.html');
  });

  // Guest usage test buttons
  document.querySelectorAll('.upload-dropzone button').forEach(btn => {
    btn.addEventListener('click', () => handleToolUse());
  });

  document.getElementById('guestDismissBtn')?.addEventListener('click', () => {
    document.getElementById('guestModal')?.classList.remove('active');
  });
}

function initNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const views = document.querySelectorAll('.dashboard-view');

  function switchView(targetView) {
    views.forEach(v => v.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));

    const activeViewEl = document.getElementById(`view-${targetView}`);
    if (activeViewEl) activeViewEl.classList.add('active');

    const activeNavEl = document.querySelector(`.sidebar-nav [data-view="${targetView}"]`);
    if (activeNavEl) activeNavEl.classList.add('active');

    // Close mobile sidebar if open
    document.getElementById('dashboardSidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebarBackdrop')?.classList.remove('active');
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  // Quick tools in home view
  document.querySelectorAll('[data-open-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.getAttribute('data-open-tool');
      if (tool) switchView(tool);
    });
  });

  // Dropdown profile/settings navigation
  document.querySelectorAll('.dropdown-item[data-view]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      if (view) switchView(view);
    });
  });
}

// 3. Storage Bar RPC
async function loadStorage(userId) {
  try {
    const { data: bytes, error } = await supabase.rpc('get_user_storage_bytes', { p_user_id: userId });
    const usedBytes = (!error && typeof bytes === 'number') ? bytes : 0;
    const mbUsed = (usedBytes / (1024 * 1024)).toFixed(1);
    const maxMb = 50;
    const percent = Math.min((mbUsed / maxMb) * 100, 100);

    const storageText = document.getElementById('storageText');
    const storageFill = document.getElementById('storageFill');
    if (storageText) storageText.textContent = `${mbUsed} MB of ${maxMb} MB`;
    if (storageFill) storageFill.style.width = `${percent}%`;
  } catch (e) {
    console.warn('Storage check failed:', e);
  }
}

// 4. Guest Mode Tracker
function handleToolUse() {
  let uses = parseInt(localStorage.getItem('imagify_guest_uses') || '0', 10);
  if (uses >= 3) {
    const guestModal = document.getElementById('guestModal');
    if (guestModal) guestModal.classList.add('active');
  } else {
    uses += 1;
    localStorage.setItem('imagify_guest_uses', uses.toString());
  }
}

/* ==========================================================================
   SUPABASE RATE LIMIT RPCs & HELPERS
   ========================================================================== */

async function checkRateLimit(email) {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', { p_identifier: email });
    return error ? true : Boolean(data);
  } catch {
    return true;
  }
}

async function getLockoutMinutes(email) {
  try {
    const { data, error } = await supabase.rpc('get_lockout_minutes', { p_identifier: email });
    return (!error && typeof data === 'number') ? data : 15;
  } catch {
    return 15;
  }
}

async function logAuthAttempt(email, success) {
  try {
    await supabase.rpc('log_auth_attempt', {
      p_identifier: email,
      p_success: success,
      p_ip: null
    });
  } catch (err) {
    console.warn('Attempt log failed:', err);
  }
}

/* ==========================================================================
   VALIDATION & UI HELPERS
   ========================================================================== */

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setInlineError(fieldId, message) {
  const errorEl = document.getElementById(`${fieldId}Error`);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('active');
  }
  const input = document.getElementById(fieldId);
  input?.addEventListener('input', () => {
    errorEl.textContent = '';
    errorEl.classList.remove('active');
  }, { once: true });
}

function clearAllErrors() {
  document.querySelectorAll('.inline-error').forEach(el => {
    el.textContent = '';
    el.classList.remove('active');
  });
  document.querySelectorAll('.form-alert').forEach(el => {
    el.className = 'form-alert';
    el.style.display = 'none';
    el.textContent = '';
  });
}

function setFormAlert(alertId, message, type = 'error') {
  const alertEl = document.getElementById(alertId);
  if (alertEl) {
    alertEl.textContent = message;
    alertEl.className = `form-alert alert-${type}`;
    alertEl.style.display = 'block';
  }
}

function setBtnLoading(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle('loading', isLoading);
}

function mapAuthError(msg = '') {
  if (msg.includes('Invalid login credentials')) return 'Wrong email or password.';
  if (msg.includes('User already registered')) return 'An account with this email already exists.';
  if (msg.includes('Email not confirmed')) return 'Please verify your email before logging in.';
  return 'Something went wrong. Please try again.';
}
