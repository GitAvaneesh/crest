/**
 * ================================================================
 * CREST AI — chat.js
 * Application controller. Manages the full UI lifecycle:
 * - Supabase auth gate & session validation
 * - First-run username setup modal flow (Fixed display toggles)
 * - Dynamic auto-expanding textarea
 * - Send button enabled/disabled cursor logic
 * - Prompt submission, API fetch, and response rendering
 * - Quota counter management
 * - Scroll-lock to latest message
 * - Mobile sidebar open/close
 * - Alert banner utility
 * ================================================================
 */

/* ---------------------------------------------------------------
   1. SUPABASE CLIENT INITIALISATION
   Safely instantiated inside a try-catch so a misconfigured CDN
   load does not silently break the rest of the controller.
--------------------------------------------------------------- */
let supabaseClient;

try {
  const SUPABASE_URL     = "https://arydgubakjbbgijfgqee.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyeWRndWJha2piYmdpamZncWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTk0ODAsImV4cCI6MjA5NDU5NTQ4MH0." +
    "l_qLFevXcY7Ss8Qh4UN8_Rupl761woxiVuRhCFZsTpM";

  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase initialization completed successfully.");
  }
} catch (err) {
  console.error("Critical fault during authentication service connection setup:", err.message);
}

/* ---------------------------------------------------------------
   2. GLOBAL ENDPOINT PATH CONFIGURATIONS
--------------------------------------------------------------- */
const BACKEND_WORKER_URL = "https://crest-ai-backend.devavaneesh.workers.dev/";

/* ---------------------------------------------------------------
   3. INTERNAL RUNTIME APPLICATION STATE ENGINE
--------------------------------------------------------------- */
const appState = {
  currentUser: null,       // Stores auth data payload from active Supabase session
  isGenerating: false,     // Throttle guard to block overlapping prompt streams
  remainingQuota: 100      // Tracks current user's local interaction limits
};

/* ---------------------------------------------------------------
   4. CENTRALIZED DOM ELEMENT REFERENCE DICTIONARY
--------------------------------------------------------------- */
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

/**
 * Scans the DOM tree mapping live elements onto memory reference points.
 */
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

/* ---------------------------------------------------------------
   5. WORKSPACE TOP BAR DISPATCH NOTIFICATION HANDLERS
--------------------------------------------------------------- */

/**
 * Fires a drop-down banner notice across the top header layout viewport.
 */
function showAlert(messageText, autoDismissDelayMs = 5000) {
  if (!dom.alertBanner || !dom.alertText) return;
  
  dom.alertText.textContent = messageText;
  dom.alertBanner.classList.add("visible");
  
  if (autoDismissDelayMs > 0) {
    setTimeout(() => { dismissAlert(); }, autoDismissDelayMs);
  }
}

/**
 * Sweeps visibility states turning off notifications banner elements.
 */
function dismissAlert() {
  if (dom.alertBanner) {
    dom.alertBanner.classList.remove("visible");
  }
}

/* ---------------------------------------------------------------
   6. USER IDENTITY VALIDATION & AUTH CONTROLLERS
--------------------------------------------------------------- */

/**
 * Evaluates credentials sessions blocking page operations for unverified guests.
 */
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
    console.error("Identity setup exception:", err.message);
  }
}

/**
 * Syncs user data tables against profiles schemas checking username availability records.
 */
async function loadUserProfileAndValidateIdentity() {
  try {
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("id", appState.currentUser.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (profile && profile.username && profile.username.trim() !== "") {
      if (dom.userEmailLabel) {
        dom.userEmailLabel.textContent = profile.username;
      }
      displayUsernameSetupModal(false);
    } else {
      displayUsernameSetupModal(true);
    }
  } catch (err) {
    console.error("Profile resolution sync error:", err.message);
    displayUsernameSetupModal(true);
  }
}

/* ---------------------------------------------------------------
   7. INITIAL ACCOUNT SETUP ACCOUNT MODAL FLOWS
--------------------------------------------------------------- */

/**
 * Dispatches full-screen interface blocking overlays requiring profiles setup steps.
 */
function displayUsernameSetupModal(shouldBeVisible) {
  if (!dom.usernameModal) return;
  
  if (shouldBeVisible) {
    dom.usernameModal.classList.add("visible");
  } else {
    dom.usernameModal.classList.remove("visible");
  }
}

/**
 * Injects input field formatting warnings on setup modal drawers.
 */
function showModalError(errorTextString) {
  if (dom.modalError) {
    dom.modalError.textContent = errorTextString;
    dom.modalError.classList.add("visible");
  }
}

/**
 * Purges active fault warnings clearing overlay boundaries.
 */
function clearModalError() {
  if (dom.modalError) {
    dom.modalError.textContent = "";
    dom.modalError.classList.remove("visible");
  }
}

/**
 * Handles incoming verification event data validating input limits.
 */
async function handleUsernameFormSubmission() {
  if (!dom.modalInput || !dom.modalSubmitBtn) return;

  const chosenUsername = dom.modalInput.value.trim();
  clearModalError();

  if (!chosenUsername) {
    return showModalError("Username cannot be left entirely blank.");
  }
  if (chosenUsername.length < 3) {
    return showModalError("Username must contain at least 3 characters.");
  }

  const alphaNumericRegexFilter = /^[a-zA-Z0-9_]+$/;
  if (!alphaNumericRegexFilter.test(chosenUsername)) {
    return showModalError("Letters, numbers, and underscores only.");
  }

  try {
    dom.modalSubmitBtn.disabled = true;
    dom.modalSubmitBtn.textContent = "Saving to workspace...";

    const { data: databaseCollisionMatch, error: checkError } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("username", chosenUsername)
      .maybeSingle();

    if (checkError) throw checkError;

    if (databaseCollisionMatch) {
      showModalError("Username is already taken. Please choose another.");
      dom.modalSubmitBtn.disabled = false;
      dom.modalSubmitBtn.textContent = "Complete Setup";
      return;
    }

    const { error: upsertError } = await supabaseClient
      .from("profiles")
      .upsert({ id: appState.currentUser.id, username: chosenUsername });

    if (upsertError) throw upsertError;

    if (dom.userEmailLabel) {
      dom.userEmailLabel.textContent = chosenUsername;
    }

    displayUsernameSetupModal(false);
    showAlert("Workspace integration setup completed successfully. Welcome!", 4000);
  } catch (err) {
    console.error("Backend write configuration failure:", err);
    showModalError("Failed to update profile identity parameters.");
    dom.modalSubmitBtn.disabled = false;
    dom.modalSubmitBtn.textContent = "Complete Setup";
  }
}

/* ---------------------------------------------------------------
   8. AUTO-EXPANDING MESSAGE TEXTAREA ENGINE CONTROLLERS
--------------------------------------------------------------- */

/**
 * Monitors active input events checking buffer thresholds and dynamically adjusts input textboxes.
 */
function handleTextareaInputLifecycle() {
  if (!dom.promptTextarea || !dom.charCounter || !dom.promptSendBtn) return;

  const inputLengthMetrics = dom.promptTextarea.value.length;
  dom.charCounter.textContent = `${inputLengthMetrics} / 4000`;

  dom.promptTextarea.style.height = "24px";
  const dynamicallyCalculatedHeight = dom.promptTextarea.scrollHeight;
  dom.promptTextarea.style.height = `${Math.min(dynamicallyCalculatedHeight, 160)}px`;

  const isBufferPopulated = dom.promptTextarea.value.trim().length > 0;

  if (isBufferPopulated && !appState.isGenerating) {
    dom.promptSendBtn.disabled = false;
    dom.promptSendBtn.removeAttribute("aria-disabled");
  } else {
    dom.promptSendBtn.disabled = true;
    dom.promptSendBtn.setAttribute("aria-disabled", "true");
  }
}

/**
 * Clears typing containers wiping remaining storage states.
 */
function performInputFormLayoutReset() {
  if (!dom.promptTextarea || !dom.charCounter || !dom.promptSendBtn) return;
  
  dom.promptTextarea.value = "";
  dom.promptTextarea.style.height = "24px";
  dom.charCounter.textContent = "0 / 4000";
  dom.promptSendBtn.disabled = true;
  dom.promptSendBtn.setAttribute("aria-disabled", "true");
}

/* ---------------------------------------------------------------
   9. INTERFACE SCROLL MECHANICS OVERRIDE HANDLERS
--------------------------------------------------------------- */

/**
 * Forces container positioning downwards to retain sight lines on new arrivals.
 */
function forceScrollAreaToCalculatedBottom() {
  if (!dom.chatScrollArea) return;
  
  setTimeout(() => {
    dom.chatScrollArea.scrollTop = dom.chatScrollArea.scrollHeight;
  }, 30);
}

/* ---------------------------------------------------------------
   10. QUOTA METRIC MANAGEMENT TRACKERS
--------------------------------------------------------------- */

/**
 * Updates dynamic labels printing accurate residual allowances.
 */
function updateQuotaDisplay() {
  if (dom.quotaDisplay) {
    dom.quotaDisplay.textContent = `${appState.remainingQuota} remaining requests`;
  }
}

/* ---------------------------------------------------------------
   11. TEXT THREAD COMPONENT COMPILERS
--------------------------------------------------------------- */

/**
 * Generates structured blocks inserting dialogue rows.
 */
function appendStructuralMessageBubbleFrame(messageContentRawText, speakerIdentityNode, isLoaderStub = false) {
  if (!dom.chatThreadContainer) return null;

  const wrapperNodeFrame = document.createElement("div");
  const uniqueGeneratedBubbleId = "msg_" + Math.random().toString(36).substr(2, 9);
  
  wrapperNodeFrame.id = uniqueGeneratedBubbleId;
  wrapperNodeFrame.className = `message ${speakerIdentityNode === 'user' ? 'message--user' : 'message--assistant'}`;

  const messageDirectionIconSvg = speakerIdentityNode === "user"
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-user" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-cpu" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>`;

  const senderLabelString = speakerIdentityNode === "user" ? "You" : "Crest AI";

  let bodyHTMLContentString = "";
  if (speakerIdentityNode === "ai" && window.marked && !isLoaderStub) {
    try {
      marked.setOptions({ gfm: true, breaks: true });
      bodyHTMLContentString = marked.parse(messageContentRawText);
    } catch (markdownParseError) {
      console.error("Markdown parsing subsystem failure:", markdownParseError);
      bodyHTMLContentString = `<p>${messageContentRawText.replace(/\n/g, '<br>')}</p>`;
    }
  } else {
    bodyHTMLContentString = `<p>${messageContentRawText.replace(/\n/g, '<br>')}</p>`;
  }

  wrapperNodeFrame.innerHTML = `
    <div class="message__avatar">
      ${messageDirectionIconSvg}
    </div>
    <div class="message__content">
      <div class="message__sender">${senderLabelString}</div>
      <div class="message__body">${bodyHTMLContentString}</div>
    </div>
  `;

  if (isLoaderStub) {
    wrapperNodeFrame.classList.add("system-pipeline-loader-active");
  }

  dom.chatThreadContainer.appendChild(wrapperNodeFrame);
  forceScrollAreaToCalculatedBottom();

  return uniqueGeneratedBubbleId;
}

/**
 * Removes target elements safely off core views during transitions.
 */
function stripTargetedLoadingBubbleFrame(targetBubbleIdString) {
  if (!targetBubbleIdString) return;
  const targetElementNode = document.getElementById(targetBubbleIdString);
  if (targetElementNode) {
    targetElementNode.remove();
  }
}

/* ---------------------------------------------------------------
   12. API NETWORK VECTOR COMMUNICATION INTERFACES
--------------------------------------------------------------- */

/**
 * Handles outgoing query processing events, communicating with edge servers.
 */
async function dispatchUserPromptInputVector() {
  if (appState.isGenerating) return;

  const promptPayloadString = dom.promptTextarea.value.trim();
  if (!promptPayloadString) return;

  try {
    appState.isGenerating = true;
    dom.promptSendBtn.disabled = true;
    dom.promptSendBtn.setAttribute("aria-disabled", "true");
    
    if (dom.statusText) dom.statusText.textContent = "Thinking...";
    if (dom.emptyWelcomeState) dom.emptyWelcomeState.style.display = "none";

    appendStructuralMessageBubbleFrame(promptPayloadString, "user");
    performInputFormLayoutReset();

    appState.remainingQuota = Math.max(0, appState.remainingQuota - 1);
    updateQuotaDisplay();

    const pipelinePlaceholderStubId = appendStructuralMessageBubbleFrame(
      "Crest is pondering changes...",
      "ai",
      true
    );

    const backendNetworkResponsePayload = await fetch(BACKEND_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: promptPayloadString })
    });

    stripTargetedLoadingBubbleFrame(pipelinePlaceholderStubId);

    if (!backendNetworkResponsePayload.ok) {
      throw new Error(`Cloud connection status returned unsafe error code: ${backendNetworkResponsePayload.status}`);
    }

    const compiledResponseDataPayload = await backendNetworkResponsePayload.json();

    if (compiledResponseDataPayload.status === "busy") {
      showAlert("Crest is currently handling peak traffic requests. Please attempt this request again in a minute.", 6000);
      return;
    }

    if (compiledResponseDataPayload.response) {
      appendStructuralMessageBubbleFrame(compiledResponseDataPayload.response, "ai");
    }

  } catch (criticalTransmissionError) {
    console.error("Critical edge networking fault encountered:", criticalTransmissionError.message);
    showAlert("Crest is currently handling peak traffic requests. Please attempt this request again in a minute.", 6000);
  } finally {
    appState.isGenerating = false;
    if (dom.statusText) dom.statusText.textContent = "Ready";
    handleTextareaInputLifecycle();
    forceScrollAreaToCalculatedBottom();
  }
}

/* ---------------------------------------------------------------
   13. DASHBOARD SUGGESTION BUTTON ROUTINES
--------------------------------------------------------------- */

/**
 * Transfers quick-click suggestions cleanly onto target messaging panels.
 */
function handleSuggestionCardClick(mouseInteractionEvent) {
  const matchingTargetCardNode = mouseInteractionEvent.currentTarget;
  const targetDescLabelNode = matchingTargetCardNode.querySelector(".suggestion-card__desc");
  
  if (targetDescLabelNode && dom.promptTextarea) {
    dom.promptTextarea.value = targetDescLabelNode.textContent.trim();
    dom.promptTextarea.focus();
    handleTextareaInputLifecycle();
  }
}

/* ---------------------------------------------------------------
   14. MOBILE LAYOUT RESPONSIVENESS OVERLAY VIEWS
--------------------------------------------------------------- */

/**
 * Coordinates sidebar tracking animations on reduced layout formats.
 */
function toggleMobileSidebarState(shouldBeOpen) {
  if (!dom.chatSidebar || !dom.sidebarScrim) return;

  if (shouldBeOpen) {
    dom.chatSidebar.classList.add("open");
    dom.sidebarScrim.classList.add("visible");
  } else {
    dom.chatSidebar.classList.remove("open");
    dom.sidebarScrim.classList.remove("visible");
  }
}

/* ---------------------------------------------------------------
   15. EVENT SUBSCRIBER SCHEDULER BINDINGS
--------------------------------------------------------------- */

/**
 * Registers interaction boundaries onto defined memory objects.
 */
function registerEventListeners() {
  if (dom.alertDismissBtn) {
    dom.alertDismissBtn.addEventListener("click", dismissAlert);
  }

  if (dom.modalSubmitBtn) {
    dom.modalSubmitBtn.addEventListener("click", handleUsernameFormSubmission);
  }

  if (dom.promptTextarea) {
    dom.promptTextarea.addEventListener("input", handleTextareaInputLifecycle);
    
    dom.promptTextarea.addEventListener("keydown", (keyboardEventContext) => {
      if (keyboardEventContext.key === "Enter" && !keyboardEventContext.shiftKey) {
        keyboardEventContext.preventDefault();
        if (!dom.promptSendBtn.disabled && !appState.isGenerating) {
          dispatchUserPromptInputVector();
        }
      }
    });
  }

  if (dom.promptSubmitForm) {
    dom.promptSubmitForm.addEventListener("submit", (formSubmissionEventContext) => {
      formSubmissionEventContext.preventDefault();
      if (!dom.promptSendBtn.disabled && !appState.isGenerating) {
        dispatchUserPromptInputVector();
      }
    });
  }

  if (dom.mobileMenuToggle) {
    dom.mobileMenuToggle.addEventListener("click", () => {
      toggleMobileSidebarState(true);
    });
  }

  if (dom.sidebarCloseBtn) {
    dom.sidebarCloseBtn.addEventListener("click", () => {
      toggleMobileSidebarState(false);
    });
  }

  if (dom.sidebarScrim) {
    dom.sidebarScrim.addEventListener("click", () => {
      toggleMobileSidebarState(false);
    });
  }

  if (dom.newChatBtn) {
    dom.newChatBtn.addEventListener("click", () => {
      if (dom.chatThreadContainer) {
        dom.chatThreadContainer.innerHTML = "";
      }
      if (dom.emptyWelcomeState) {
        dom.emptyWelcomeState.style.display = "block";
      }
      dismissAlert();
      toggleMobileSidebarState(false);
    });
  }

  const suggestionCardsList = document.querySelectorAll(".suggestion-card");
  suggestionCardsList.forEach(card => {
    card.addEventListener("click", handleSuggestionCardClick);
  });
}

/* ---------------------------------------------------------------
   16. MASTER BOOT SEQUENCE INITIALIZER
--------------------------------------------------------------- */

/**
 * Runs the application setup cycle. Called on DOMContentLoaded.
 */
async function initApp() {
  bindDOMReferences();
  registerEventListeners();
  updateQuotaDisplay();

  if (!supabaseClient) {
    showAlert(
      "Failed to establish a connection with the backend authentication service. Please refresh your browser window page context.",
      0
    );
    return;
  }

  await checkAuthAndInit();
}

/**
 * Hold initial processing loops until layout elements load completely.
 */
document.addEventListener("DOMContentLoaded", initApp);