/**
 * ================================================================
 * CREST AI — chat.js
 * High-Reliability Core Pipeline & Display Controller
 * ================================================================
 */

let supabaseClient;
try {
  const SUPABASE_URL     = "https://arydgubakjbbgijfgqee.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyeWRndWJha2piYmdpamZncWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTk0ODAsImV4cCI6MjA5NDU5NTQ4MH0." +
    "l_qLFevXcY7Ss8Qh4UN8_Rupl761woxiVuRhCFZsTpM";

  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase attached securely to runtime engine.");
  }
} catch (err) {
  console.error("Database Engine Mount Core Fault:", err.message);
}

const BACKEND_WORKER_URL = "https://crest-ai-backend.devavaneesh.workers.dev/";

const appState = {
  currentUser: null,
  isGenerating: false,
  remainingQuota: 100
};

const dom = {
  alertBanner: null,
  alertText: null,
  alertDismissBtn: null,
  usernameModal: null,
  modalInput: null,
  modalError: null,
  modalSubmitBtn: null,
  appLayout: null,
  chatSidebar: null,
  sidebarCloseBtn: null,
  newChatBtn: null,
  userEmailLabel: null,
  chatViewport: null,
  mobileMenuToggle: null,
  statusText: null,
  chatScrollArea: null,
  emptyWelcomeState: null,
  chatThreadContainer: null,
  promptSubmitForm: null,
  promptTextarea: null,
  charCounter: null,
  quotaDisplay: null,
  promptSendBtn: null,
  sidebarScrim: null
};

function bindDOMReferences() {
  dom.alertBanner         = document.getElementById("workspaceAlertSystem");
  dom.alertText           = document.getElementById("workspaceAlertText");
  dom.alertDismissBtn     = document.getElementById("alertDismissBtn");
  dom.usernameModal       = document.getElementById("usernameModal");
  dom.modalInput          = document.getElementById("modalUsernameInput");
  dom.modalError          = document.getElementById("modalErrorText");
  dom.modalSubmitBtn      = document.getElementById("saveUsernameBtn");
  dom.appLayout           = document.querySelector(".app-layout");
  dom.chatSidebar         = document.getElementById("chatSidebar");
  dom.sidebarCloseBtn     = document.getElementById("closeSidebarBtn");
  dom.newChatBtn          = document.getElementById("newChatBtn");
  dom.userEmailLabel      = document.getElementById("userProfileEmailDisplayLabel");
  dom.chatViewport        = document.querySelector(".chat-viewport");
  dom.mobileMenuToggle    = document.getElementById("mobileMenuToggleBtn");
  dom.statusText          = document.getElementById("pipelineStatusText");
  dom.chatScrollArea      = document.getElementById("chatScrollContainer");
  dom.emptyWelcomeState   = document.getElementById("emptyWelcomeState");
  dom.chatThreadContainer = document.getElementById("chatThreadContainer");
  dom.promptSubmitForm    = document.getElementById("promptSubmitForm");
  dom.promptTextarea      = document.getElementById("promptTextarea");
  dom.charCounter         = document.getElementById("charCounter");
  dom.quotaDisplay        = document.getElementById("quotaBalanceDisplay");
  dom.promptSendBtn       = document.getElementById("promptSendBtn");
  dom.sidebarScrim        = document.getElementById("sidebarScrim");
}

function showAlert(msg, duration = 5000) {
  if (!dom.alertBanner || !dom.alertText) return;
  dom.alertText.textContent = msg;
  dom.alertBanner.style.display = "flex";
  dom.alertBanner.classList.add("visible");
  if (duration > 0) {
    setTimeout(() => { dismissAlert(); }, duration);
  }
}

function dismissAlert() {
  if (dom.alertBanner) {
    dom.alertBanner.style.display = "none";
    dom.alertBanner.classList.remove("visible");
  }
}

async function checkAuthAndInit() {
  try {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    
    if (!session || !session.user) {
      window.location.href = "/pages/auth/login.html";
      return;
    }
    
    appState.currentUser = session.user;
    if (dom.userEmailLabel && appState.currentUser.email) {
      dom.userEmailLabel.textContent = appState.currentUser.email;
    }
    await loadUserProfileAndValidateIdentity();
  } catch (err) {
    console.error("Critical identity setup exception:", err.message);
  }
}

async function loadUserProfileAndValidateIdentity() {
  try {
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("id", appState.currentUser.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (profile && profile.username && profile.username.trim() !== "") {
      if (dom.userEmailLabel) dom.userEmailLabel.textContent = profile.username;
      displayUsernameSetupModal(false);
    } else {
      displayUsernameSetupModal(true);
    }
  } catch (err) {
    console.error("Profile resolution sync error:", err.message);
    displayUsernameSetupModal(true);
  }
}

function displayUsernameSetupModal(showModal) {
  if (!dom.usernameModal) return;
  if (showModal) {
    dom.usernameModal.style.display = "flex";
    dom.usernameModal.classList.add("visible");
  } else {
    dom.usernameModal.style.display = "none";
    dom.usernameModal.classList.remove("visible");
  }
}

function showModalError(errorTextString) {
  if (dom.modalError) {
    dom.modalError.textContent = errorTextString;
    dom.modalError.style.display = "block";
    dom.modalError.classList.add("visible");
  }
}

function clearModalError() {
  if (dom.modalError) {
    dom.modalError.textContent = "";
    dom.modalError.style.display = "none";
    dom.modalError.classList.remove("visible");
  }
}

async function handleUsernameFormSubmission() {
  if (!dom.modalInput || !dom.modalSubmitBtn) return;
  const chosenUsername = dom.modalInput.value.trim();
  clearModalError();
  
  if (!chosenUsername) return showModalError("Username cannot be left entirely blank.");
  if (chosenUsername.length < 3) return showModalError("Username must contain at least 3 characters.");
  const contentFilterRegex = /^[a-zA-Z0-9_]+$/;
  if (!contentFilterRegex.test(chosenUsername)) return showModalError("Letters, numbers, and underscores only.");
  
  try {
    dom.modalSubmitBtn.disabled = true;
    dom.modalSubmitBtn.textContent = "Saving...";
    
    const { data: collisionCheck } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("username", chosenUsername)
      .maybeSingle();
      
    if (collisionCheck) {
      showModalError("Username is already taken.");
      return;
    }
    
    const { error: upsertError } = await supabaseClient
      .from("profiles")
      .upsert({ id: appState.currentUser.id, username: chosenUsername }, { onConflict: 'id' });
      
    if (upsertError) throw upsertError;
    if (dom.userEmailLabel) dom.userEmailLabel.textContent = chosenUsername;
    displayUsernameSetupModal(false);
    showAlert("Workspace ready. Welcome to Crest AI!", 4000);
  } catch (err) {
    showModalError("Failed to update profile identity parameters.");
  } finally {
    dom.modalSubmitBtn.disabled = false;
    dom.modalSubmitBtn.textContent = "Complete Setup";
  }
}

function handleTextareaInputLifecycle() {
  if (!dom.promptTextarea || !dom.charCounter || !dom.promptSendBtn) return;
  const metricsLength = dom.promptTextarea.value.length;
  dom.charCounter.textContent = `${metricsLength} / 4000`;
  
  dom.promptTextarea.style.height = "24px";
  dom.promptTextarea.style.height = `${Math.min(dom.promptTextarea.scrollHeight, 160)}px`;
  
  if (dom.promptTextarea.value.trim().length > 0 && !appState.isGenerating) {
    dom.promptSendBtn.disabled = false;
    dom.promptSendBtn.removeAttribute("aria-disabled");
  } else {
    dom.promptSendBtn.disabled = true;
    dom.promptSendBtn.setAttribute("aria-disabled", "true");
  }
}

function performInputFormLayoutReset() {
  dom.promptTextarea.value = "";
  dom.promptTextarea.style.height = "24px";
  dom.charCounter.textContent = "0 / 4000";
  dom.promptSendBtn.disabled = true;
}

function forceScrollAreaToCalculatedBottom() {
  if (!dom.chatScrollArea) return;
  setTimeout(() => { dom.chatScrollArea.scrollTop = dom.chatScrollArea.scrollHeight; }, 30);
}

function updateQuotaDisplay() {
  if (dom.quotaDisplay) dom.quotaDisplay.textContent = `${appState.remainingQuota} remaining requests`;
}

function appendStructuralMessageBubbleFrame(messageContentText, speakerIdentityNode, isLoaderStub = false) {
  if (!dom.chatThreadContainer) return null;
  const wrapperNodeFrame = document.createElement("div");
  const bubbleId = "msg_" + Math.random().toString(36).substr(2, 9);
  
  wrapperNodeFrame.id = bubbleId;
  wrapperNodeFrame.className = `message ${speakerIdentityNode === 'user' ? 'message--user' : 'message--assistant'}`;
  
  const icon = speakerIdentityNode === "user"
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline></svg>`;

  let bodyHTML = "";
  if (speakerIdentityNode === "ai" && window.marked) {
    marked.setOptions({ gfm: true, breaks: true });
    bodyHTML = marked.parse(messageContentText);
  } else {
    bodyHTML = `<p>${messageContentText.replace(/\n/g, '<br>')}</p>`;
  }

  wrapperNodeFrame.innerHTML = `
    <div class="message__avatar">${icon}</div>
    <div class="message__content">
      <div class="message__sender">${speakerIdentityNode === "user" ? "You" : "Crest AI"}</div>
      <div class="message__body">${bodyHTML}</div>
    </div>`;
  
  if (isLoaderStub) wrapperNodeFrame.classList.add("system-pipeline-loader-active");
  dom.chatThreadContainer.appendChild(wrapperNodeFrame);
  forceScrollAreaToCalculatedBottom();
  return bubbleId;
}

function stripTargetedLoadingBubbleFrame(id) {
  const node = document.getElementById(id);
  if (node) node.remove();
}

async function dispatchUserPromptInputVector() {
  if (appState.isGenerating) return;
  const payload = dom.promptTextarea.value.trim();
  if (!payload) return;
  
  try {
    appState.isGenerating = true;
    dom.promptSendBtn.disabled = true;
    if (dom.statusText) dom.statusText.textContent = "Thinking...";
    if (dom.emptyWelcomeState) dom.emptyWelcomeState.style.display = "none";
    
    appendStructuralMessageBubbleFrame(payload, "user");
    performInputFormLayoutReset();
    
    appState.remainingQuota = Math.max(0, appState.remainingQuota - 1);
    updateQuotaDisplay();
    
    const loaderId = appendStructuralMessageBubbleFrame("Crest is pondering...", "ai", true);
    
    const res = await fetch(BACKEND_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: payload })
    });
    
    stripTargetedLoadingBubbleFrame(loaderId);
    
    if (!res.ok) throw new Error("Status Error");
    const data = await res.json();
    
    if (data.status === "busy") {
      showAlert("Crest is busy right now. Try again in a minute.", 6000);
      return;
    }
    
    if (data.response) {
      appendStructuralMessageBubbleFrame(data.response, "ai");
    }
  } catch (err) {
    console.error(err);
    showAlert("Crest is busy right now. Try again in a minute.", 6000);
  } finally {
    appState.isGenerating = false;
    if (dom.statusText) dom.statusText.textContent = "Ready";
    handleTextareaInputLifecycle();
  }
}

function handleSuggestionCardClick(event) {
  const card = event.currentTarget;
  const desc = card.querySelector(".suggestion-card__desc");
  if (desc && dom.promptTextarea) {
    dom.promptTextarea.value = desc.textContent.trim();
    dom.promptTextarea.focus();
    handleTextareaInputLifecycle();
  }
}

function toggleMobileSidebarState(open) {
  if (!dom.chatSidebar || !dom.sidebarScrim) return;
  if (open) {
    dom.chatSidebar.classList.add("open");
    dom.sidebarScrim.classList.add("visible");
  } else {
    dom.chatSidebar.classList.remove("open");
    dom.sidebarScrim.classList.remove("visible");
  }
}

function registerEventListeners() {
  if (dom.alertDismissBtn) dom.alertDismissBtn.addEventListener("click", dismissAlert);
  if (dom.modalSubmitBtn) dom.modalSubmitBtn.addEventListener("click", handleUsernameFormSubmission);
  if (dom.promptTextarea) {
    dom.promptTextarea.addEventListener("input", handleTextareaInputLifecycle);
    dom.promptTextarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!dom.promptSendBtn.disabled) dispatchUserPromptInputVector();
      }
    });
  }
  if (dom.promptSubmitForm) {
    dom.promptSubmitForm.addEventListener("submit", (e) => {
      e.preventDefault();
      dispatchUserPromptInputVector();
    });
  }
  if (dom.mobileMenuToggle) dom.mobileMenuToggle.addEventListener("click", () => toggleMobileSidebarState(true));
  if (dom.sidebarCloseBtn) dom.sidebarCloseBtn.addEventListener("click", () => toggleMobileSidebarState(false));
  if (dom.sidebarScrim) dom.sidebarScrim.addEventListener("click", () => toggleMobileSidebarState(false));
  if (dom.newChatBtn) {
    dom.newChatBtn.addEventListener("click", () => {
      if (dom.chatThreadContainer) dom.chatThreadContainer.innerHTML = "";
      if (dom.emptyWelcomeState) dom.emptyWelcomeState.style.display = "block";
      dismissAlert();
      toggleMobileSidebarState(false);
    });
  }
  document.querySelectorAll(".suggestion-card").forEach(card => {
    card.addEventListener("click", handleSuggestionCardClick);
  });
}

function initApp() {
  bindDOMReferences();
  registerEventListeners();
  updateQuotaDisplay();
  if (supabaseClient) checkAuthAndInit();
}

document.addEventListener("DOMContentLoaded", initApp);