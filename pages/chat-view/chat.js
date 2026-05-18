/**
 * ================================================================
 * CREST AI — chat.js
 * Application controller. Manages the full UI lifecycle:
 *   - Supabase auth gate & session validation
 *   - First-run username setup modal flow
 *   - Dynamic auto-expanding textarea
 *   - Send button enabled/disabled cursor logic
 *   - Prompt submission, API fetch, and response rendering
 *   - Quota counter management
 *   - Scroll-lock to latest message
 *   - Mobile sidebar open/close
 *   - Alert banner utility
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

  // window.supabase is exposed by the UMD CDN build loaded in chat.html
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (initError) {
  console.error("[Crest AI] Supabase initialisation failed:", initError);
}

/* ---------------------------------------------------------------
   2. BACKEND & APP CONFIGURATION CONSTANTS
--------------------------------------------------------------- */
/** Cloudflare Worker endpoint that proxies prompts to the AI model. */
const BACKEND_API_URL = "https://crest-ai-backend.devavaneesh.workers.dev/";

/** Maximum number of requests a user can make per session load. */
const MAX_QUOTA = 100;

/* ---------------------------------------------------------------
   3. REACTIVE APPLICATION STATE
--------------------------------------------------------------- */
const AppState = {
  /** The authenticated Supabase user object. Set during init. */
  user: null,

  /** Remaining prompt requests this session. Decremented on submit. */
  quotaRemaining: MAX_QUOTA,

  /** True while an AI response fetch is in flight. Blocks re-submission. */
  isGenerating: false,

  /** True once the first user message has been submitted. */
  hasStartedConversation: false,
};

/* ---------------------------------------------------------------
   4. DOM ELEMENT REFERENCES
   Grabbed once after DOMContentLoaded to avoid repeated queries.
--------------------------------------------------------------- */
let DOM = {};

/**
 * Binds every required DOM element to the DOM cache object.
 * Called once at the top of initApp().
 */
function bindDOMReferences() {
  DOM = {
    // Alert banner
    alertSystem:        document.getElementById("workspaceAlertSystem"),
    alertText:          document.getElementById("workspaceAlertText"),
    alertDismissBtn:    document.getElementById("alertDismissBtn"),

    // Username modal
    usernameModal:      document.getElementById("usernameModal"),
    modalUsernameInput: document.getElementById("modalUsernameInput"),
    modalErrorText:     document.getElementById("modalErrorText"),
    saveUsernameBtn:    document.getElementById("saveUsernameBtn"),

    // Sidebar
    chatSidebar:        document.getElementById("chatSidebar"),
    closeSidebarBtn:    document.getElementById("closeSidebarBtn"),
    newChatBtn:         document.getElementById("newChatBtn"),
    profileLabel:       document.getElementById("userProfileEmailDisplayLabel"),
    signOutBtn:         document.getElementById("signOutBtn"),

    // Topbar
    mobileMenuToggleBtn: document.getElementById("mobileMenuToggleBtn"),
    statusText:          document.getElementById("pipelineStatusText"),
    statusDot:           document.getElementById("statusDotIndicator"),

    // Chat area
    chatScrollContainer:  document.getElementById("chatScrollContainer"),
    emptyWelcomeState:    document.getElementById("emptyWelcomeState"),
    chatThreadContainer:  document.getElementById("chatThreadContainer"),
    suggestionCards:      document.querySelectorAll(".suggestion-card"),

    // Input panel
    promptSubmitForm:   document.getElementById("promptSubmitForm"),
    promptTextarea:     document.getElementById("promptTextarea"),
    charCounter:        document.getElementById("charCounter"),
    quotaBalanceDisplay: document.getElementById("quotaBalanceDisplay"),
    promptSendBtn:      document.getElementById("promptSendBtn"),
  };
}

/* ---------------------------------------------------------------
   5. ALERT BANNER UTILITIES
--------------------------------------------------------------- */

/**
 * Displays the global alert banner with the given message.
 * Auto-dismisses after the specified duration (default 5 seconds).
 * @param {string} message  - The text to display in the banner.
 * @param {number} [duration=5000] - Auto-dismiss delay in milliseconds.
 */
function showAlert(message, duration = 5000) {
  DOM.alertText.textContent = message;
  DOM.alertSystem.classList.add("visible");

  // Clear any existing auto-dismiss timer
  if (AppState._alertTimer) {
    clearTimeout(AppState._alertTimer);
  }

  // Set auto-dismiss
  AppState._alertTimer = setTimeout(() => {
    dismissAlert();
  }, duration);
}

/**
 * Hides the alert banner immediately.
 */
function dismissAlert() {
  DOM.alertSystem.classList.remove("visible");
}

/* ---------------------------------------------------------------
   6. STATUS BAR UTILITIES
--------------------------------------------------------------- */

/**
 * Updates the topbar status text and dot indicator.
 * @param {"ready"|"thinking"} state - The status to display.
 */
function setStatus(state) {
  if (state === "thinking") {
    DOM.statusText.textContent = "Thinking...";
    DOM.statusDot.classList.add("thinking");
  } else {
    DOM.statusText.textContent = "Ready";
    DOM.statusDot.classList.remove("thinking");
  }
}

/* ---------------------------------------------------------------
   7. TEXTAREA AUTO-EXPAND & SEND BUTTON LOGIC
--------------------------------------------------------------- */

/**
 * Handles the `input` event on the textarea.
 *  - Resets height to `auto` first so scrollHeight collapses correctly.
 *  - Sets height to scrollHeight so it expands to fit the content.
 *  - Caps at 160px (CSS max-height) after which the textarea scrolls.
 *  - Updates the character counter label.
 *  - Enables or disables the send button depending on content.
 */
function handleTextareaInput() {
  const textarea  = DOM.promptTextarea;
  const sendBtn   = DOM.promptSendBtn;
  const rawValue  = textarea.value;
  const charCount = rawValue.length;

  // --- Dynamic height expansion ---
  // Reset to auto so the browser recalculates the natural scrollHeight
  textarea.style.height = "auto";
  // Expand to scrollHeight (capped by CSS max-height: 160px)
  textarea.style.height = `${textarea.scrollHeight}px`;

  // --- Character counter ---
  DOM.charCounter.textContent = `${charCount} / 4000`;

  // --- Send button enable / disable ---
  const hasContent = rawValue.trim().length > 0;
  sendBtn.disabled     = !hasContent;
  sendBtn.setAttribute("aria-disabled", String(!hasContent));
}

/**
 * Resets the textarea to its base single-line height after submit.
 * Also resets the character counter.
 */
function resetTextarea() {
  const textarea = DOM.promptTextarea;
  textarea.value        = "";
  textarea.style.height = "24px"; // Exact base height specified in the design brief
  DOM.charCounter.textContent = "0 / 4000";

  // Ensure the send button is immediately disabled again
  DOM.promptSendBtn.disabled = true;
  DOM.promptSendBtn.setAttribute("aria-disabled", "true");
}

/* ---------------------------------------------------------------
   8. QUOTA COUNTER MANAGEMENT
--------------------------------------------------------------- */

/**
 * Decrements the session quota by 1 and updates the display label.
 * The counter goes down to 0 and does not go negative.
 */
function decrementQuota() {
  if (AppState.quotaRemaining > 0) {
    AppState.quotaRemaining -= 1;
  }
  updateQuotaDisplay();
}

/**
 * Syncs the quota balance label with the current AppState value.
 */
function updateQuotaDisplay() {
  DOM.quotaBalanceDisplay.textContent =
    `${AppState.quotaRemaining} remaining request${AppState.quotaRemaining !== 1 ? "s" : ""}`;
}

/* ---------------------------------------------------------------
   9. MESSAGE RENDERING — SCROLL UTILITY
--------------------------------------------------------------- */

/**
 * Smoothly scrolls the conversation area to the very bottom.
 * Called after every new message or loading stub is injected.
 */
function scrollToBottom() {
  const scrollArea = DOM.chatScrollContainer;
  scrollArea.scrollTo({
    top:      scrollArea.scrollHeight,
    behavior: "smooth",
  });
}

/* ---------------------------------------------------------------
   10. MESSAGE RENDERING — USER BUBBLE
--------------------------------------------------------------- */

/**
 * Creates and appends a user message row to the chat thread.
 * @param {string} text - The raw prompt text from the textarea.
 */
function appendUserMessage(text) {
  const row = document.createElement("div");
  row.classList.add("message-row", "user-wrapper");

  // Accessible meta identity label
  const meta = document.createElement("div");
  meta.classList.add("message-row__meta");
  meta.textContent = "YOU";

  // Bubble wraps the text
  const bubble = document.createElement("div");
  bubble.classList.add("message-bubble");
  // Use textContent (not innerHTML) to safely display user text as plain text
  bubble.textContent = text;

  row.appendChild(meta);
  row.appendChild(bubble);
  DOM.chatThreadContainer.appendChild(row);

  scrollToBottom();
  return row;
}

/* ---------------------------------------------------------------
   11. MESSAGE RENDERING — LOADING / GENERATING STUB
--------------------------------------------------------------- */

/**
 * Injects the animated "Generating..." loading indicator into the
 * chat thread. Returns the created row element so it can be
 * replaced with the final AI response once the fetch completes.
 * @returns {HTMLElement} The loading row DOM node.
 */
function appendLoadingBubble() {
  const row = document.createElement("div");
  row.classList.add("message-row", "ai-wrapper");
  row.setAttribute("id", "loadingBubbleRow");

  // Meta label
  const meta = document.createElement("div");
  meta.classList.add("message-row__meta");
  meta.textContent = "CREST";

  // Three-dot bounce animation container
  const bubble = document.createElement("div");
  bubble.classList.add("message-bubble", "generating-bubble");
  bubble.setAttribute("aria-label", "Generating response");

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.classList.add("generating-bubble__dot");
    bubble.appendChild(dot);
  }

  row.appendChild(meta);
  row.appendChild(bubble);
  DOM.chatThreadContainer.appendChild(row);

  scrollToBottom();
  return row;
}

/* ---------------------------------------------------------------
   12. MESSAGE RENDERING — AI RESPONSE BUBBLE
--------------------------------------------------------------- */

/**
 * Removes the loading stub and renders the final AI response text.
 * Applies the `.rich-text-markdown-payload-container` wrapper so
 * that CSS enforces the premium editorial serif typography rule.
 *
 * The response text is rendered as plain paragraphs split on
 * newlines. For richer markdown you could integrate a library like
 * marked.js — this implementation keeps zero extra dependencies.
 *
 * @param {HTMLElement} loadingRow - The loading stub row to replace.
 * @param {string}      responseText - The AI-returned text string.
 */
function replaceLoadingWithResponse(loadingRow, responseText) {
  // Build the final AI message row
  const row = document.createElement("div");
  row.classList.add("message-row", "ai-wrapper");

  // Meta label
  const meta = document.createElement("div");
  meta.classList.add("message-row__meta");
  meta.textContent = "CREST";

  // Outer bubble container
  const bubble = document.createElement("div");
  bubble.classList.add("message-bubble");

  // Inner prose container — targeted by the CSS serif typography rule
  const proseContainer = document.createElement("div");
  proseContainer.classList.add("rich-text-markdown-payload-container");

  // Safely convert the response text into paragraph elements.
  // Split on double-newlines for paragraph breaks; single newlines
  // become <br> inside paragraphs.
  const paragraphs = responseText.split(/\n{2,}/);

  paragraphs.forEach((paraText) => {
    const trimmed = paraText.trim();
    if (!trimmed) return; // skip empty blocks

    // Check for code blocks (``` ... ```)
    if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
      const pre  = document.createElement("pre");
      const code = document.createElement("code");
      // Strip the surrounding backtick fences
      const codeContent = trimmed.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
      code.textContent = codeContent;
      pre.appendChild(code);
      proseContainer.appendChild(pre);
      return;
    }

    // Heading detection: lines starting with # / ## / ###
    if (/^#{1,4}\s/.test(trimmed)) {
      const level   = (trimmed.match(/^(#{1,4})\s/) || ["", "#"])[1].length;
      const heading = document.createElement(`h${level}`);
      heading.textContent = trimmed.replace(/^#{1,4}\s/, "");
      proseContainer.appendChild(heading);
      return;
    }

    // Regular paragraph — single newlines become <br> within the para
    const p = document.createElement("p");
    const lines = trimmed.split("\n");
    lines.forEach((line, idx) => {
      p.appendChild(document.createTextNode(line));
      if (idx < lines.length - 1) {
        p.appendChild(document.createElement("br"));
      }
    });
    proseContainer.appendChild(p);
  });

  bubble.appendChild(proseContainer);
  row.appendChild(meta);
  row.appendChild(bubble);

  // Replace the loading stub with the completed response row
  DOM.chatThreadContainer.replaceChild(row, loadingRow);

  scrollToBottom();
}

/* ---------------------------------------------------------------
   13. WELCOME STATE MANAGEMENT
--------------------------------------------------------------- */

/**
 * Hides the empty welcome state panel and marks the conversation
 * as started in AppState so it is only triggered once.
 */
function hideWelcomeState() {
  if (!AppState.hasStartedConversation) {
    DOM.emptyWelcomeState.classList.add("hidden");
    AppState.hasStartedConversation = true;
  }
}

/* ---------------------------------------------------------------
   14. CORE PROMPT SUBMISSION FLOW
--------------------------------------------------------------- */

/**
 * Handles the form submit event.
 *  1. Validates content and quota.
 *  2. Hides the welcome state on first submission.
 *  3. Appends the user bubble.
 *  4. Resets and locks the textarea.
 *  5. Appends the loading stub and updates status.
 *  6. Fires the POST fetch to the Cloudflare Worker.
 *  7. On success: replaces stub with AI response.
 *  8. On error: replaces stub with an error message.
 *  9. Always unlocks the interface and resets status.
 *
 * @param {Event} event - The form submit DOM event.
 */
async function handlePromptSubmit(event) {
  // Stop the browser from navigating / reloading the page
  event.preventDefault();

  const promptText = DOM.promptTextarea.value.trim();

  // Guard: no empty submissions
  if (!promptText) return;

  // Guard: quota exhausted
  if (AppState.quotaRemaining <= 0) {
    showAlert("You have used all your available requests for this session.");
    return;
  }

  // Guard: prevent concurrent submissions while generating
  if (AppState.isGenerating) return;

  // --- Lock the interface ---
  AppState.isGenerating = true;
  DOM.promptSendBtn.disabled = true;
  DOM.promptSendBtn.setAttribute("aria-disabled", "true");
  DOM.promptTextarea.setAttribute("readonly", "true");
  setStatus("thinking");

  // --- Hide welcome state on first submit ---
  hideWelcomeState();

  // --- Append user message ---
  appendUserMessage(promptText);

  // --- Clear and reset the textarea ---
  resetTextarea();
  decrementQuota();

  // --- Append the loading stub ---
  const loadingRow = appendLoadingBubble();

  // --- Fire the network request ---
  try {
    const response = await fetch(BACKEND_API_URL, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // Payload structure expected by the Cloudflare Worker
      body: JSON.stringify({ message: promptText }),
    });

    if (!response.ok) {
      // Non-2xx HTTP status — surface a user-friendly error
      throw new Error(`Server returned status ${response.status}.`);
    }

    const data = await response.json();

    // The worker returns: { response: "AI text output string" }
    const aiText = data.response || "No response was returned from the server.";

    // Replace the loading bubble with the formatted AI response
    replaceLoadingWithResponse(loadingRow, aiText);

  } catch (fetchError) {
    console.error("[Crest AI] Fetch error:", fetchError);

    // Replace loading bubble with a visible error message
    replaceLoadingWithResponse(
      loadingRow,
      "Something went wrong reaching the server. Please try again in a moment."
    );

    showAlert("Could not reach Crest. Please check your connection and try again.");
  } finally {
    // --- Unlock the interface regardless of success or failure ---
    AppState.isGenerating = false;
    DOM.promptTextarea.removeAttribute("readonly");
    setStatus("ready");

    // Re-enable the send button only if the textarea has content
    // (unlikely after reset, but safe to check)
    const hasContent = DOM.promptTextarea.value.trim().length > 0;
    DOM.promptSendBtn.disabled = !hasContent;
    DOM.promptSendBtn.setAttribute("aria-disabled", String(!hasContent));
  }
}

/* ---------------------------------------------------------------
   15. USERNAME MODAL FLOW
--------------------------------------------------------------- */

/**
 * Reveals the username setup modal overlay.
 * Removes the `.hidden` class so the CSS opacity transition fires.
 */
function openUsernameModal() {
  DOM.usernameModal.classList.remove("hidden");
  // Focus the input for immediate keyboard entry
  setTimeout(() => DOM.modalUsernameInput.focus(), 100);
}

/**
 * Hides the username setup modal overlay.
 * Adds the `.hidden` class to trigger the CSS fade-out transition.
 */
function closeUsernameModal() {
  DOM.usernameModal.classList.add("hidden");
}

/**
 * Validates the username string against the format rules:
 *  - 3 to 20 characters long.
 *  - Only letters, numbers, and underscores.
 * @param {string} value
 * @returns {{ valid: boolean, error: string }}
 */
function validateUsernameFormat(value) {
  if (!value || value.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters long." };
  }
  if (value.length > 20) {
    return { valid: false, error: "Username cannot exceed 20 characters." };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    return { valid: false, error: "Only letters, numbers, and underscores are allowed." };
  }
  return { valid: true, error: "" };
}

/**
 * Handles the "Complete Setup" button click inside the modal.
 *  1. Validates format.
 *  2. Checks database uniqueness.
 *  3. Upserts the username into the profiles table.
 *  4. Updates the sidebar label and closes the modal.
 */
async function handleSaveUsername() {
  const inputValue   = DOM.modalUsernameInput.value.trim();
  const errorDisplay = DOM.modalErrorText;
  const saveBtn      = DOM.saveUsernameBtn;

  // Clear any previous error
  errorDisplay.textContent = "";

  // --- Format validation ---
  const { valid, error } = validateUsernameFormat(inputValue);
  if (!valid) {
    errorDisplay.textContent = error;
    DOM.modalUsernameInput.focus();
    return;
  }

  // --- Lock the button to prevent double-clicks ---
  saveBtn.disabled     = true;
  saveBtn.textContent  = "Checking...";

  try {
    // --- Check uniqueness: query for any profile with this username ---
    const { data: existingProfiles, error: checkError } = await supabaseClient
      .from("profiles")
      .select("id")
      .eq("username", inputValue)
      .limit(1);

    if (checkError) throw checkError;

    if (existingProfiles && existingProfiles.length > 0) {
      // Username already taken
      errorDisplay.textContent = "That username is already taken. Please choose another.";
      saveBtn.disabled    = false;
      saveBtn.textContent = "Complete Setup";
      DOM.modalUsernameInput.focus();
      return;
    }

    // --- Upsert the username into the authenticated user's profile row ---
    const { error: upsertError } = await supabaseClient
      .from("profiles")
      .upsert({ id: AppState.user.id, username: inputValue });

    if (upsertError) throw upsertError;

    // --- Update the sidebar profile label with the new username ---
    DOM.profileLabel.textContent = inputValue;

    // --- Close the modal ---
    closeUsernameModal();

    showAlert(`Welcome to Crest, ${inputValue}.`);

  } catch (err) {
    console.error("[Crest AI] Username save error:", err);
    errorDisplay.textContent = "An error occurred. Please try again.";
    saveBtn.disabled    = false;
    saveBtn.textContent = "Complete Setup";
  }
}

/* ---------------------------------------------------------------
   16. AUTHENTICATION FLOW
--------------------------------------------------------------- */

/**
 * Checks for an active Supabase session.
 * If none exists, bounces the user to the login page.
 * If authenticated, loads the user profile and initialises the UI.
 */
async function checkAuthAndInit() {
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();

    if (sessionError || !sessionData?.session) {
      // No active session — redirect to the login page
      window.location.href = "/pages/auth/login.html";
      return;
    }

    // Store the user object in AppState for use throughout the app
    AppState.user = sessionData.session.user;

    // --- Pre-populate the sidebar label with the email as a fallback ---
    const email = AppState.user.email || "Account";
    DOM.profileLabel.textContent = email;

    // --- Query the profiles table for an existing username ---
    const { data: profileData, error: profileError } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("id", AppState.user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      // PGRST116 = no rows returned (normal for new users) — any other
      // error is unexpected and should be logged.
      console.error("[Crest AI] Profile fetch error:", profileError);
    }

    if (profileData?.username) {
      // Username exists — update the sidebar with the real username
      DOM.profileLabel.textContent = profileData.username;
    } else {
      // No username set — open the first-run setup modal
      openUsernameModal();
    }

  } catch (authErr) {
    console.error("[Crest AI] Auth init error:", authErr);
    // Bounce to login on any unrecoverable auth error
    window.location.href = "/pages/auth/login.html";
  }
}

/**
 * Signs the current user out via Supabase Auth and redirects to login.
 */
async function handleSignOut() {
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {
    console.warn("[Crest AI] Sign-out error:", e);
  } finally {
    window.location.href = "/pages/auth/login.html";
  }
}

/* ---------------------------------------------------------------
   17. MOBILE SIDEBAR MANAGEMENT
--------------------------------------------------------------- */

/**
 * Injects and manages the overlay scrim element used behind the
 * sidebar on mobile. Created lazily on first call.
 * @returns {HTMLElement} The scrim DOM node.
 */
function getOrCreateScrim() {
  let scrim = document.getElementById("sidebarScrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.id = "sidebarScrim";
    scrim.classList.add("sidebar-scrim");
    // Clicking the scrim closes the sidebar
    scrim.addEventListener("click", closeMobileSidebar);
    document.body.appendChild(scrim);
  }
  return scrim;
}

/**
 * Opens the sidebar on mobile by adding the `.open` class and
 * showing the scrim overlay.
 */
function openMobileSidebar() {
  DOM.chatSidebar.classList.add("open");
  getOrCreateScrim().classList.add("visible");
  DOM.mobileMenuToggleBtn.setAttribute("aria-expanded", "true");
}

/**
 * Closes the sidebar on mobile and hides the scrim.
 */
function closeMobileSidebar() {
  DOM.chatSidebar.classList.remove("open");
  const scrim = document.getElementById("sidebarScrim");
  if (scrim) scrim.classList.remove("visible");
  DOM.mobileMenuToggleBtn.setAttribute("aria-expanded", "false");
}

/* ---------------------------------------------------------------
   18. SUGGESTION CARD HANDLER
--------------------------------------------------------------- */

/**
 * When a suggestion card is clicked, populate the textarea with
 * the card's data-suggestion text, trigger the input handler to
 * enable the send button and expand height, then focus the textarea.
 * @param {MouseEvent} event
 */
function handleSuggestionCardClick(event) {
  const card = event.currentTarget;
  const suggestion = card.getAttribute("data-suggestion") || "";

  if (!suggestion) return;

  DOM.promptTextarea.value = suggestion;
  // Trigger the resize + button-enable logic
  handleTextareaInput();
  DOM.promptTextarea.focus();
  // Move caret to the end of the inserted text
  DOM.promptTextarea.setSelectionRange(suggestion.length, suggestion.length);
}

/* ---------------------------------------------------------------
   19. KEYBOARD SHORTCUTS
--------------------------------------------------------------- */

/**
 * Handles keydown events on the textarea.
 *  - Enter (without Shift) submits the form.
 *  - Shift+Enter inserts a newline (default behaviour — no action needed).
 * @param {KeyboardEvent} event
 */
function handleTextareaKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    // Prevent the default newline insertion
    event.preventDefault();

    // Only submit if the button is currently active
    if (!DOM.promptSendBtn.disabled && !AppState.isGenerating) {
      DOM.promptSubmitForm.requestSubmit();
    }
  }
}

/* ---------------------------------------------------------------
   20. NEW CHAT / RESET CONVERSATION
--------------------------------------------------------------- */

/**
 * Clears the chat thread, resets AppState flags, shows the welcome
 * state again, and resets the textarea. Allows starting fresh.
 */
function handleNewChat() {
  // Clear all rendered messages
  DOM.chatThreadContainer.innerHTML = "";

  // Reset conversation tracking
  AppState.hasStartedConversation = false;
  AppState.isGenerating           = false;

  // Show the welcome state again
  DOM.emptyWelcomeState.classList.remove("hidden");

  // Reset the textarea and send button
  resetTextarea();
  setStatus("ready");

  // Close the sidebar on mobile after tapping "New conversation"
  closeMobileSidebar();

  // Focus the input
  DOM.promptTextarea.focus();
}

/* ---------------------------------------------------------------
   21. EVENT LISTENER REGISTRATION
--------------------------------------------------------------- */

/**
 * Registers all event listeners after DOM references are bound.
 * Groups handlers by feature area for clarity.
 */
function registerEventListeners() {
  // --- Alert banner dismiss ---
  DOM.alertDismissBtn.addEventListener("click", dismissAlert);

  // --- Textarea dynamic resize + button enable/disable ---
  DOM.promptTextarea.addEventListener("input", handleTextareaInput);

  // --- Enter key submits the form (Shift+Enter for newline) ---
  DOM.promptTextarea.addEventListener("keydown", handleTextareaKeydown);

  // --- Form submission ---
  DOM.promptSubmitForm.addEventListener("submit", handlePromptSubmit);

  // --- Username modal confirm ---
  DOM.saveUsernameBtn.addEventListener("click", handleSaveUsername);

  // --- Allow Enter key in the modal username input to trigger save ---
  DOM.modalUsernameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSaveUsername();
    }
  });

  // --- Sign out ---
  DOM.signOutBtn.addEventListener("click", handleSignOut);

  // --- New conversation ---
  DOM.newChatBtn.addEventListener("click", handleNewChat);

  // --- Mobile sidebar open (hamburger) ---
  DOM.mobileMenuToggleBtn.addEventListener("click", openMobileSidebar);

  // --- Mobile sidebar close (X button inside sidebar) ---
  DOM.closeSidebarBtn.addEventListener("click", closeMobileSidebar);

  // --- Suggestion cards ---
  DOM.suggestionCards.forEach((card) => {
    card.addEventListener("click", handleSuggestionCardClick);
  });
}

/* ---------------------------------------------------------------
   22. APPLICATION BOOT SEQUENCE
--------------------------------------------------------------- */

/**
 * Top-level initialiser. Called on DOMContentLoaded.
 * Runs the full startup sequence in order:
 *   1. Bind DOM references.
 *   2. Register all event listeners.
 *   3. Initialise quota display.
 *   4. Check auth state and load user profile.
 */
async function initApp() {
  // 1. Bind all DOM element references
  bindDOMReferences();

  // 2. Register event listeners
  registerEventListeners();

  // 3. Initialise the quota display with the max value
  updateQuotaDisplay();

  // 4. Guard: abort if Supabase failed to initialise
  if (!supabaseClient) {
    showAlert(
      "Failed to connect to the authentication service. Please refresh the page.",
      0 // Persist indefinitely — no auto-dismiss
    );
    return;
  }

  // 5. Run the auth gate — checks session, loads profile, opens modal if needed
  await checkAuthAndInit();
}

/* ---------------------------------------------------------------
   23. ENTRY POINT
--------------------------------------------------------------- */

/**
 * Wait for the full DOM to be ready before bootstrapping the app.
 * This ensures all elements referenced by bindDOMReferences() exist.
 */
document.addEventListener("DOMContentLoaded", initApp);