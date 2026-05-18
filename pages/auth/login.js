// pages/auth/login.js — Crest AI
// Completely self-contained script — Zero external file imports required!

// ── DIRECT CONFIGURATION MATRIX ──
const SUPABASE_URL = "https://arydgubakjbbgijfgqee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyeWRndWJha2piYmdpamZncWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTk0ODAsImV4cCI6MjA5NDU5NTQ4MH0.l_qLFevXcY7Ss8Qh4UN8_Rupl761woxiVuRhCFZsTpM";

// Safe initialize check to prevent browser engine panics
let supabase;
try {
  if (window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase engine successfully initialized for Auth Workspace.");
  } else {
    throw new Error("Supabase CDN script was missing from HTML headers.");
  }
} catch (err) {
  console.error("Supabase Client Init Error:", err.message);
}

// Proactive redirect if a session token is active in memory
if (supabase) {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      window.location.href = '/pages/chat-view/chat.html';
    }
  });
}

// ── EXPOSE GLOBAL WINDOW HOOKS IMMEDIATELY (Prevents early HTML click crashes) ──
window.switchTab            = switchTab;
window.togglePassword       = togglePassword;
window.handleGoogle         = handleGoogle;
window.handleLogin          = handleLogin;
window.handleSignup         = handleSignup;
window.handleForgotPassword = handleForgotPassword;

// Parse initial URL parameters cleanly with proper syntax termination
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('mode') === 'signup') {
  setTimeout(() => { window.switchTab('signup'); }, 50);
}
const urlError = urlParams.get('error');
if (urlError) {
  showMessage(decodeURIComponent(urlError), 'error');
}

// ── Tab Switching Mechanics ──────────────────────────────────
function switchTab(tab) {
  const loginForm   = document.getElementById('loginForm');
  const signupForm  = document.getElementById('signupForm');
  const loginTab    = document.getElementById('loginTab');
  const signupTab   = document.getElementById('signupTab');
  const authSwitch  = document.getElementById('authSwitch');

  clearMessage();

  if (tab === 'login') {
    if (loginForm) loginForm.style.display  = 'block';
    if (signupForm) signupForm.style.display = 'none';
    if (loginTab) loginTab.classList.add('active');
    if (signupTab) signupTab.classList.remove('active');
    if (authSwitch) authSwitch.innerHTML = `Don't have an account? <a href="#" onclick="window.switchTab('signup'); return false;">Sign up free</a>`;
  } else {
    if (loginForm) loginForm.style.display  = 'none';
    if (signupForm) signupForm.style.display = 'block';
    if (loginTab) loginTab.classList.remove('active');
    if (signupTab) signupTab.classList.add('active');
    if (authSwitch) authSwitch.innerHTML = `Already have an account? <a href="#" onclick="window.switchTab('login'); return false;">Log in</a>`;
  }
}

// ── Interface Utilities ───────────────────────────────────────
function togglePassword(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function showMessage(msg, type) {
  const box = document.getElementById('authMessage');
  if (!box) return;
  box.textContent = msg;
  box.className = `auth-message ${type}`;
}

function clearMessage() {
  const box = document.getElementById('authMessage');
  if (!box) return;
  box.textContent = '';
  box.className = 'auth-message';
}

// ── Google OAuth Handshake ────────────────────────────────────
async function handleGoogle() {
  if (!supabase) return;
  try {
    clearMessage();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/pages/chat-view/chat.html'
      }
    });
    if (error) throw error;
  } catch (err) {
    showMessage(err.message || 'Google login failed.', 'error');
  }
}

// ── Email Session Verification ────────────────────────────────
async function handleLogin(e) {
  if (e) e.preventDefault();
  if (!supabase) return;

  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const btn   = document.getElementById('loginBtn');

  clearMessage();

  if (!email || !pass) {
    showMessage('Please enter email and password.', 'error');
    return;
  }

  if (btn) {
    btn.disabled    = true;
    btn.textContent = 'Verifying...';
  }

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: pass
    });
    if (error) throw error;

    window.location.href = '/pages/chat-view/chat.html';
  } catch (err) {
    showMessage(err.message || 'Login failed. Check your entries.', 'error');
    if (btn) {
      btn.disabled    = false;
      btn.textContent = 'Authenticate Session';
    }
  }
}

// ── New User Provisioning ────────────────────────────────────
async function handleSignup(e) {
  if (e) e.preventDefault();
  if (!supabase) return;

  const name    = document.getElementById('signupName').value.trim();
  const email   = document.getElementById('signupEmail').value.trim();
  const pass    = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;
  const btn     = document.getElementById('signupBtn');

  clearMessage();

  if (!name || !email || !pass || !confirm) {
    showMessage('All fields are required.', 'error');
    return;
  }

  if (pass.length < 8) {
    showMessage('Password must be at least 8 characters.', 'error');
    return;
  }

  if (pass !== confirm) {
    showMessage('Passwords do not match.', 'error');
    return;
  }

  if (btn) {
    btn.disabled    = true;
    btn.textContent = 'Creating account...';
  }

  try {
    const { error } = await supabase.auth.signUp({
      email: email,
      password: pass,
      options: {
        data: { full_name: name }
      }
    });
    if (error) throw error;

    showMessage('Signup successful! Check your email for a confirmation link.', 'success');
    if (btn) {
      btn.disabled    = false;
      btn.textContent = 'Provision Account Node';
    }
  } catch (err) {
    showMessage(err.message || 'Signup failed. Please try again.', 'error');
    if (btn) {
      btn.disabled    = false;
      btn.textContent = 'Provision Account Node';
    }
  }
}

// ── Reset Matrix Trigger ─────────────────────────────────────
async function handleForgotPassword() {
  if (!supabase) return;
  const email = document.getElementById('loginEmail').value.trim();

  if (!email) {
    showMessage('Enter your email above first.', 'error');
    return;
  }

  try {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/pages/auth/reset-password.html`
    });
    showMessage('Password reset email sent! Check your inbox.', 'success');
  } catch(e) {
    showMessage('Failed to send reset email. Try again.', 'error');
  }
}

// ── Keyboard Interface Maps ───────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const loginForm = document.getElementById('loginForm');
  if (loginForm && loginForm.style.display !== 'none') {
    window.handleLogin(e);
  } else {
    window.handleSignup(e);
  }
});