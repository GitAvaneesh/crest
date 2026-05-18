// =========================================================================
// CREST AI — COMPREHENSIVE AUTHENTICATION INTERACTIVE LOGIC PIPELINE
// =========================================================================

import { loginWithGoogle as googleLogin, loginWithEmail, signUpWithEmail, redirectIfLoggedIn } from '/lib/auth.js';
import supabase from '/lib/supabase.js';

// Enforce proactive redirection if active tokens exist in client memory buffer
redirectIfLoggedIn();

// ── GLOBAL APPLICATION UTILITY ATTACHMENTS (Exposing to Global Scope) ──

window.showMessage = function(messageTextString, visibilityThemeType) {
  const outputDisplayNode = document.getElementById('authMessage');
  if (!outputDisplayNode) return;
  outputDisplayNode.textContent = messageTextString;
  outputDisplayNode.className = `auth-message ${visibilityThemeType}`;
};

window.clearMessage = function() {
  const outputDisplayNode = document.getElementById('authMessage');
  if (!outputDisplayNode) return;
  outputDisplayNode.textContent = '';
  outputDisplayNode.className = 'auth-message';
};

window.togglePassword = function(targetInputIdElement) {
  const inputDomNode = document.getElementById(targetInputIdElement);
  if (!inputDomNode) return;
  inputDomNode.type = inputDomNode.type === 'password' ? 'text' : 'password';
};

window.switchTab = function(tabTargetMode) {
  const loginFormNode   = document.getElementById('loginForm');
  const signupFormNode  = document.getElementById('signupForm');
  const loginTabBtn     = document.getElementById('loginTab');
  const signupTabBtn    = document.getElementById('signupTab');
  const authSwitchLabel = document.getElementById('authSwitch');

  window.clearMessage();

  if (tabTargetMode === 'login') {
    if (loginFormNode) loginFormNode.style.display   = 'block';
    if (signupFormNode) signupFormNode.style.display  = 'none';
    if (loginTabBtn) loginTabBtn.classList.add('active');
    if (signupTabBtn) signupTabBtn.classList.remove('active');
    if (authSwitchLabel) {
      authSwitchLabel.innerHTML = `Don't have an account? <a href="#" onclick="window.switchTab('signup'); return false;">Sign up free</a>`;
    }
  } else {
    if (loginFormNode) loginFormNode.style.display   = 'none';
    if (signupFormNode) signupFormNode.style.display  = 'block';
    if (loginTabBtn) loginTabBtn.classList.remove('active');
    if (signupTabBtn) signupTabBtn.classList.add('active');
    if (authSwitchLabel) {
      authSwitchLabel.innerHTML = `Already have an account? <a href="#" onclick="window.switchTab('login'); return false;">Log in</a>`;
    }
  }
};

// ── FIXED GOOGLE OAUTH INTERCEPTOR VIA WINDOW SCOPE ──
window.handleGoogle = async function() {
  try {
    window.clearMessage();
    await googleLogin();
  } catch (handshakeError) {
    console.error("OAuth handshake loop error caught:", handshakeError);
    window.showMessage(handshakeError.message || 'Google authentication failed. Please try again.', 'error');
  }
};

// ── EMAIL AUTHENTICATION RUNTIME LIFECYCLES ──
window.handleLogin = async function(executionEvent) {
  if (executionEvent) executionEvent.preventDefault();

  const emailPayloadString    = document.getElementById('loginEmail').value.trim();
  const passwordPayloadString = document.getElementById('loginPassword').value;
  const loginSubmissionBtn    = document.getElementById('loginBtn');

  window.clearMessage();

  if (!emailPayloadString || !passwordPayloadString) {
    window.showMessage('Required authentication credentials are missing.', 'error');
    return;
  }

  loginSubmissionBtn.disabled    = true;
  loginSubmissionBtn.textContent = 'Verifying Identity...';

  try {
    await loginWithEmail(emailPayloadString, passwordPayloadString);
    window.location.href = '/pages/chat-view/chat.html';
  } catch (authHandshakeFault) {
    console.error("Auth verification error:", authHandshakeFault);
    window.showMessage(authHandshakeFault.message || 'Identity assertion failed. Check credentials.', 'error');
    loginSubmissionBtn.disabled    = false;
    loginSubmissionBtn.textContent = 'Authenticate Session';
  }
};

window.handleSignup = async function(executionEvent) {
  if (executionEvent) executionEvent.preventDefault();

  const inputNameString      = document.getElementById('signupName').value.trim();
  const inputEmailString     = document.getElementById('signupEmail').value.trim();
  const inputPasswordString  = document.getElementById('signupPassword').value;
  const inputConfirmString   = document.getElementById('signupConfirm').value;
  const signupSubmissionBtn  = document.getElementById('signupBtn');

  window.clearMessage();

  if (!inputNameString || !inputEmailString || !inputPasswordString || !inputConfirmString) {
    window.showMessage('All registration fields are mandatory.', 'error');
    return;
  }

  if (inputPasswordString.length < 8) {
    window.showMessage('Password must contain at least 8 characters.', 'error');
    return;
  }

  if (inputPasswordString !== inputConfirmString) {
    window.showMessage('Passwords do not match.', 'error');
    return;
  }

  signupSubmissionBtn.disabled    = true;
  signupSubmissionBtn.textContent = 'Provisioning Account...';

  try {
    await signUpWithEmail(inputEmailString, inputPasswordString, inputNameString);
    window.showMessage('Account created successfully! Please check your email verification link.', 'success');
    signupSubmissionBtn.disabled    = false;
    signupSubmissionBtn.textContent = 'Provision Account Node';
  } catch (registryFault) {
    console.error("Downstream registration database block error:", registryFault);
    window.showMessage(registryFault.message || 'Account provisioning failed.', 'error');
    signupSubmissionBtn.disabled    = false;
    signupSubmissionBtn.textContent = 'Provision Account Node';
  }
};

window.handleForgotPassword = async function() {
  const targetRecoveryEmail = document.getElementById('loginEmail').value.trim();

  window.clearMessage();

  if (!targetRecoveryEmail) {
    window.showMessage('Please type your email address into the input field above first.', 'error');
    return;
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(targetRecoveryEmail, {
      redirectTo: `${window.location.origin}/pages/auth/reset-password.html`
    });
    if (error) throw error;
    window.showMessage('Recovery password link sent! Check your inbox folder.', 'success');
  } catch (resetExecutionFault) {
    console.error("Reset transmission error:", resetExecutionFault);
    window.showMessage('Failed to deliver password recovery token across network.', 'error');
  }
};

// Check for deep links or setup on initial load
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('mode') === 'signup') {
  window.switchTab('signup');
}
const urlError = urlParams.get('error');
if (urlError) {
  window.showMessage(decodeURIComponent(urlError), 'error');
}