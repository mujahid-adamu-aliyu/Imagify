/* ================================================================
   IMAGIFY — Complete JavaScript
   Sections:
   1. Config & Supabase Init
   2. Auth Functions
   3. Rate Limiting
   4. Session Management
   5. UI / View Switching
   6. Dashboard Logic
   7. Guest Mode
   8. Utility Functions
   ================================================================ */


/* ================================================================
   1. CONFIG & SUPABASE INIT
   ================================================================ */

const SUPABASE_URL     = 'https://fdljvwhwtoyrlxcrkorq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGp2d2h3dG95cmx4Y3Jrb3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMzk2MjMsImV4cCI6MjEwODYxNTYyM30.qME7siVPQec4gm08QX5cYyhy6uXqpsd09pqf1yOjQuc';
const STORAGE_LIMIT_BYTES = 50 * 1024 * 1024; // 50MB

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const IS_DASHBOARD = document.getElementById('dashboardSidebar') !== null;
const IS_LANDING   = document.getElementById('landingPage') !== null;


/* ================================================================
   2. AUTH FUNCTIONS
   ================================================================ */

async function handleSignup() {
  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm  = document.getElementById('signupConfirm').value;
  const terms    = document.getElementById('signupTerms').checked;

  // Client-side validation
  let valid = true;

  if (!name || name.length < 2) {
    showFieldError('signupNameError', 'Full name must be at least 2 characters.');
    valid = false;
  }
  if (!isValidEmail(email)) {
    showFieldError('signupEmailError', 'Please enter a valid email address.');
    valid = false;
  }
  if (!password || password.length < 8) {
    showFieldError('signupPasswordError', 'Password must be at least 8 characters.');
    valid = false;
  }
  if (password !== confirm) {
    showFieldError('signupConfirmError', 'Passwords do not match.');
    valid = false;
  }
  if (!terms) {
    showFieldError('signupTermsError', 'You must agree to the terms to continue.');
    valid = false;
  }
  if (!valid) return;

  // Rate limit check
  const allowed = await checkRateLimit(email);
  if (!allowed) {
    const mins = await getLockoutMinutes(email);
    showAlert('signupAlert', 'error', `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
    return;
  }

  setLoading('signupBtn', true);
  clearAlert('signupAlert');

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name }
      }
    });

    if (error) throw error;

    await logAuthAttempt(email, true);
    resetGuestCount();

    showAlert('signupAlert', 'success', 'Account created! Check your email to verify your address, then log in.');
    setLoading('signupBtn', false);

  } catch (err) {
    await logAuthAttempt(email, false);
    showAlert('signupAlert', 'error', mapAuthError(err.message));
    setLoading('signupBtn', false);
  }
}

async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  let valid = true;

  if (!isValidEmail(email)) {
    showFieldError('loginEmailError', 'Please enter a valid email address.');
    valid = false;
  }
  if (!password) {
    showFieldError('loginPasswordError', 'This field is required.');
    valid = false;
  }
  if (!valid) return;

  // Rate limit check
  const allowed = await checkRateLimit(email);
  if (!allowed) {
    const mins = await getLockoutMinutes(email);
    showAlert('loginAlert', 'error', `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
    return;
  }

  setLoading('loginBtn', true);
  clearAlert('loginAlert');

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await logAuthAttempt(email, true);
    window.location.href = 'dashboard.html';

  } catch (err) {
    await logAuthAttempt(email, false);
    showAlert('loginAlert', 'error', mapAuthError(err.message));
    setLoading('loginBtn', false);
  }
}

async function handleGoogleSignIn() {
  try {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard.html'
      }
    });
    if (error) throw error;
  } catch (err) {
    showAlert('loginAlert', 'error', 'Google sign-in failed. Please try again.');
  }
}

async function handleReset() {
  const email = document.getElementById('resetEmail').value.trim();

  if (!isValidEmail(email)) {
    showFieldError('resetEmailError', 'Please enter a valid email address.');
    return;
  }

  setLoading('resetBtn', true);
  clearAlert('resetAlert');

  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html'
    });
    if (error) throw error;

    showAlert('resetAlert', 'success', 'Check your email for a reset link!');
    setLoading('resetBtn', false);

  } catch (err) {
    showAlert('resetAlert', 'error', 'Something went wrong. Please try again.');
    setLoading('resetBtn', false);
  }
}

async function handleSignOut() {
  try {
    await sb.auth.signOut();
    window.location.href = 'index.html';
  } catch (err) {
    window.location.href = 'index.html';
  }
}

async function handleResetFromSettings() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  try {
    await sb.auth.resetPasswordForEmail(user.email, {
      redirectTo: window.location.origin + '/index.html'
    });
    alert('Reset email sent! Check your inbox.');
  } catch (err) {
    alert('Failed to send reset email. Please try again.');
  }
}

// Map Supabase errors to friendly messages
function mapAuthError(message) {
  if (!message) return 'Something went wrong. Please try again.';
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already exists')) return 'An account with this email already exists.';
  if (m.includes('email not confirmed')) return 'Please verify your email before logging in.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait and try again.';
  return 'Something went wrong. Please try again.';
}


/* ================================================================
   3. RATE LIMITING
   ================================================================ */

async function checkRateLimit(email) {
  try {
    const { data, error } = await sb.rpc('check_rate_limit', { p_identifier: email });
    if (error) return true; // fail open — don't block on DB error
    return data;
  } catch {
    return true;
  }
}

async function getLockoutMinutes(email) {
  try {
    const { data, error } = await sb.rpc('get_lockout_minutes', { p_identifier: email });
    if (error) return 15;
    return data || 15;
  } catch {
    return 15;
  }
}

async function logAuthAttempt(email, success) {
  try {
    await sb.rpc('log_auth_attempt', {
      p_identifier: email,
      p_success:    success,
      p_ip:         null
    });
  } catch {
    // Silent fail — don't block auth flow
  }
}


/* ================================================================
   4. SESSION MANAGEMENT
   ================================================================ */

async function initSession() {
  const { data: { session } } = await sb.auth.getSession();

  if (IS_LANDING) {
    if (session) {
      window.location.href = 'dashboard.html';
      return;
    }
  }

  if (IS_DASHBOARD) {
    if (!session) {
      window.location.href = 'index.html';
      return;
    }
    await loadDashboard(session);
  }

  // Listen for auth state changes
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (IS_DASHBOARD && !session) {
      window.location.href = 'index.html';
    }
    if (IS_LANDING && session) {
      window.location.href = 'dashboard.html';
    }
  });
}


/* ================================================================
   5. UI / VIEW SWITCHING
   ================================================================ */

// Open auth (modal on desktop, sheet on mobile)
function openAuth(view) {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.classList.add('active');
  showAuthView(view);
  document.addEventListener('keydown', handleEscKey);
}

function closeAuth() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  document.removeEventListener('keydown', handleEscKey);
}

function handleOverlayClick(event) {
  if (event.target === event.currentTarget) closeAuth();
}

function handleEscKey(e) {
  if (e.key === 'Escape') closeAuth();
}

// Switch between login / signup / reset
function showAuthView(view) {
  const views = ['login', 'signup', 'reset'];
  views.forEach(v => {
    const el = document.getElementById(`view${capitalize(v)}`);
    if (el) el.classList.toggle('active', v === view);
  });
}

// Dashboard view switching
function setActiveView(viewName) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update content views
  document.querySelectorAll('.dashboard-view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  // Close mobile sidebar on nav click
  if (window.innerWidth < 768) closeMobileSidebar();
}

// Mobile sidebar
function toggleMobileSidebar() {
  const sidebar  = document.getElementById('dashboardSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  sidebar.classList.toggle('mobile-open');
  backdrop.classList.toggle('active');
}

function closeMobileSidebar() {
  const sidebar  = document.getElementById('dashboardSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  sidebar.classList.remove('mobile-open');
  backdrop.classList.remove('active');
}

// User menu dropdown
function toggleUserMenu() {
  const menu = document.getElementById('userMenu');
  if (!menu) return;
  menu.classList.toggle('open');

  // Close on outside click
  if (menu.classList.contains('open')) {
    setTimeout(() => {
      document.addEventListener('click', closeUserMenuOutside);
    }, 10);
  }
}

function closeUserMenuOutside(e) {
  const menu = document.getElementById('userMenu');
  if (menu && !menu.contains(e.target)) {
    menu.classList.remove('open');
    document.removeEventListener('click', closeUserMenuOutside);
  }
}

// Password show/hide toggle
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🙈' : '👁️';
}


/* ================================================================
   6. DASHBOARD LOGIC
   ================================================================ */

async function loadDashboard(session) {
  const user = session.user;
  const meta = user.user_metadata || {};
  const name = meta.full_name || meta.name || user.email.split('@')[0];
  const email = user.email;
  const initials = getInitials(name);

  // Greeting
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const firstName = name.split(' ')[0];
  const greetingEl = document.getElementById('homeGreeting');
  if (greetingEl) greetingEl.textContent = `Good ${timeOfDay}, ${firstName}! 👋`;

  // Navbar user info
  setTextContent('navUserName', name);
  setTextContent('dropdownName', name);
  setTextContent('dropdownEmail', email);
  setTextContent('settingsName', name);
  setTextContent('profileNameInput', name);

  // Avatar initials
  setAvatar('navAvatar', initials, meta.avatar_url);
  setAvatar('profileAvatar', initials, meta.avatar_url);

  // Profile info
  setTextContent('profileName', name);
  setTextContent('profileEmail', email);

  const joined = new Date(user.created_at);
  setTextContent('profileJoined', `Member since ${joined.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);

  // Storage
  await loadStorageUsage(user.id);

  // Recent files
  await loadRecentFiles(user.id);

  // File count
  await loadFileCount(user.id);
}

async function loadStorageUsage(userId) {
  try {
    const { data, error } = await sb.rpc('get_user_storage_bytes', { p_user_id: userId });
    if (error) return;

    const usedBytes = data || 0;
    const usedMB    = (usedBytes / (1024 * 1024)).toFixed(1);
    const pct       = Math.min((usedBytes / STORAGE_LIMIT_BYTES) * 100, 100).toFixed(1);
    const label     = `${usedMB} MB / 50 MB`;
    const labelShort = `${usedMB} MB`;

    setTextContent('sidebarStorageText', label);
    setTextContent('homeStorageUsed', labelShort);
    setTextContent('settingsStorageUsed', labelShort);
    setTextContent('profileStorageUsed', labelShort);

    const fillClass = pct > 90 ? 'danger' : pct > 70 ? 'warning' : '';

    ['sidebarStorageBar', 'homeStorageBar', 'settingsStorageBar'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.width = `${pct}%`;
      el.className = `progress-bar-fill ${fillClass}`;
    });

  } catch { /* silent */ }
}

async function loadRecentFiles(userId) {
  try {
    const { data, error } = await sb
      .from('files')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error || !data || data.length === 0) return;

    const container = document.getElementById('recentFilesContainer');
    if (!container) return;

    container.innerHTML = `<div class="recent-files-grid">${data.map(f => renderRecentFile(f)).join('')}</div>`;

  } catch { /* silent */ }
}

async function loadFileCount(userId) {
  try {
    const { count } = await sb
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    setTextContent('profileFileCount', count || 0);
  } catch { /* silent */ }
}

function renderRecentFile(file) {
  const toolEmoji = { compressor:'🗜️', resizer:'📐', converter:'🔄', cropper:'✂️', watermark:'💧', brightness:'☀️', base64:'🔡', 'bg-remover':'🤖' };
  const emoji = toolEmoji[file.tool_used] || '🖼️';
  const date  = new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `
    <div class="recent-file-card">
      <div class="recent-file-thumb">
        ${file.processed_url
          ? `<img src="${file.processed_url}" alt="${file.original_name}" loading="lazy" />`
          : emoji}
      </div>
      <div class="recent-file-info">
        <div class="recent-file-name">${file.original_name}</div>
        <div class="recent-file-meta">${file.tool_used} · ${date}</div>
      </div>
    </div>`;
}

async function filterHistory() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const filter = document.getElementById('historyFilter')?.value || 'all';
  const sort   = document.getElementById('historySort')?.value   || 'newest';

  try {
    let query = sb
      .from('files')
      .select('*')
      .eq('user_id', user.id);

    if (filter !== 'all') query = query.eq('tool_used', filter);

    if (sort === 'newest') query = query.order('created_at', { ascending: false });
    else if (sort === 'oldest') query = query.order('created_at', { ascending: true });
    else if (sort === 'largest') query = query.order('processed_size', { ascending: false });

    const { data, error } = await query;
    if (error) return;

    renderHistoryTable(data);
  } catch { /* silent */ }
}

function renderHistoryTable(files) {
  const container = document.getElementById('historyContainer');
  if (!container) return;

  if (!files || files.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <h4>No saved files</h4>
        <p>Process an image and save it to your account — it'll appear here.</p>
      </div>`;
    return;
  }

  const toolEmoji = { compressor:'🗜️', resizer:'📐', converter:'🔄', cropper:'✂️', watermark:'💧', brightness:'☀️', base64:'🔡', 'bg-remover':'🤖' };

  container.innerHTML = `
    <div class="history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Tool</th>
            <th>Original</th>
            <th>Processed</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${files.map(f => `
            <tr>
              <td>
                <div class="file-thumb-cell">
                  ${f.processed_url ? `<img src="${f.processed_url}" alt="${f.original_name}" loading="lazy" />` : (toolEmoji[f.tool_used] || '🖼️')}
                </div>
              </td>
              <td class="file-name-cell">${f.original_name}</td>
              <td><span class="tool-badge">${toolEmoji[f.tool_used] || ''} ${f.tool_used}</span></td>
              <td>${formatBytes(f.original_size)}</td>
              <td>${formatBytes(f.processed_size)}</td>
              <td>${new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
              <td>
                <div class="history-actions">
                  <a href="${f.processed_url}" download="${f.original_name}" class="btn btn-ghost btn-sm" title="Download">⬇️</a>
                  <button class="btn btn-ghost btn-sm" onclick="deleteFile('${f.id}')" title="Delete">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function deleteFile(fileId) {
  if (!confirm('Delete this file? This cannot be undone.')) return;

  try {
    const { error } = await sb.from('files').delete().eq('id', fileId);
    if (error) throw error;
    filterHistory();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      await loadStorageUsage(user.id);
      await loadRecentFiles(user.id);
      await loadFileCount(user.id);
    }
  } catch {
    alert('Failed to delete file. Please try again.');
  }
}

async function confirmClearHistory() {
  if (!confirm('Delete ALL saved files? This cannot be undone.')) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  try {
    const { error } = await sb.from('files').delete().eq('user_id', user.id);
    if (error) throw error;
    filterHistory();
    await loadStorageUsage(user.id);
    await loadRecentFiles(user.id);
    await loadFileCount(user.id);
  } catch {
    alert('Failed to clear files. Please try again.');
  }
}

async function updateDisplayName() {
  const nameInput = document.getElementById('settingsName') || document.getElementById('profileNameInput');
  const name = nameInput?.value.trim();

  if (!name || name.length < 2) {
    alert('Please enter a valid name (at least 2 characters).');
    return;
  }

  try {
    const { error } = await sb.auth.updateUser({ data: { full_name: name } });
    if (error) throw error;
    alert('Name updated successfully!');
    const initials = getInitials(name);
    setTextContent('navUserName', name);
    setTextContent('dropdownName', name);
    setTextContent('profileName', name);
    setAvatar('navAvatar', initials);
    setAvatar('profileAvatar', initials);
  } catch {
    alert('Failed to update name. Please try again.');
  }
}

async function confirmDeleteAccount() {
  if (!confirm('Delete your account permanently? All your data will be lost. This cannot be undone.')) return;
  alert('To delete your account, please contact support. This feature is coming soon.');
}


/* ================================================================
   7. GUEST MODE
   ================================================================ */

const GUEST_KEY      = 'imagify_guest_uses';
const GUEST_LIMIT    = 3;

function getGuestCount() {
  return parseInt(localStorage.getItem(GUEST_KEY) || '0', 10);
}

function incrementGuestCount() {
  const count = getGuestCount() + 1;
  localStorage.setItem(GUEST_KEY, count);
  return count;
}

function resetGuestCount() {
  localStorage.removeItem(GUEST_KEY);
}

// Call this before every tool use on dashboard when no session
async function checkGuestLimit() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) return true; // logged in — no limit

  const count = getGuestCount();
  if (count >= GUEST_LIMIT) {
    showGuestModal();
    return false;
  }

  incrementGuestCount();
  return true;
}

function showGuestModal() {
  const overlay = document.getElementById('guestModalOverlay');
  if (overlay) overlay.classList.add('active');
}

function continueAsGuest() {
  const overlay = document.getElementById('guestModalOverlay');
  if (overlay) overlay.classList.remove('active');
}


/* ================================================================
   8. UTILITY FUNCTIONS
   ================================================================ */

// Email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Capitalize first letter
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Get initials from name
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Set text content safely
function setTextContent(id, text) {
  const el = document.getElementById(id);
  if (el) {
    if (el.tagName === 'INPUT') el.value = text;
    else el.textContent = text;
  }
}

// Set avatar (initials or image)
function setAvatar(id, initials, imageUrl) {
  const el = document.getElementById(id);
  if (!el) return;
  if (imageUrl) {
    el.innerHTML = `<img src="${imageUrl}" alt="Avatar" />`;
  } else {
    el.textContent = initials;
  }
}

// Format bytes to human-readable
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Show field-level error
function showFieldError(errorId, message) {
  const el = document.getElementById(errorId);
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
  // Also mark input as error
  const input = el.previousElementSibling?.tagName === 'INPUT'
    ? el.previousElementSibling
    : el.closest('.form-group')?.querySelector('.form-input');
  if (input) input.classList.add('error');
}

// Clear field error on input
function clearError(errorId, input) {
  const el = document.getElementById(errorId);
  if (el) {
    el.textContent = '';
    el.classList.remove('visible');
  }
  if (input) input.classList.remove('error');
}

// Show alert block (success or error)
function showAlert(containerId, type, message) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const icon = type === 'success' ? '✅' : '⚠️';
  container.innerHTML = `
    <div class="alert alert-${type}">
      <span class="alert-icon">${icon}</span>
      <span>${message}</span>
    </div>`;
}

function clearAlert(containerId) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = '';
}

// Loading state on buttons
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = `<span class="btn-spinner"></span> Loading...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
  }
}


/* ================================================================
   INIT
   ================================================================ */
document.addEventListener('DOMContentLoaded', initSession);
