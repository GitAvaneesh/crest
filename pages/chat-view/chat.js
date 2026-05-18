// =========================================================================
// CREST AI — RECURSIVE REAL-TIME WORKSPACE PIPELINE CONTROLLER ENGINE
// =========================================================================

const SUPABASE_URL = "https://arydgubakjbbgijfgqee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyeWRndWJha2piYmdpamZncWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTk0ODAsImV4cCI6MjA5NDU5NTQ4MH0.l_qLFevXcY7Ss8Qh4UN8_Rupl761woxiVuRhCFZsTpM";

let supabase;
try {
  if (window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase engine successfully initialized for Crest Workspace.");
  } else {
    throw new Error("Global CDN script not detected in header context tree.");
  }
} catch (err) {
  console.error("Supabase Client Load Core Exception Fault:", err.message);
}

const BACKEND_WORKER_URL = "https://crest-ai-backend.devavaneesh.workers.dev/";

document.addEventListener('DOMContentLoaded', () => {
  const workspaceRuntime = new CrestWorkspaceEngine();
  workspaceRuntime.ignite();
});

class CrestWorkspaceEngine {
  constructor() {
    this.dom = {
      form: document.getElementById('promptSubmitForm'),
      textarea: document.getElementById('promptTextarea'),
      sendBtn: document.getElementById('promptSendBtn'),
      charCounter: document.getElementById('charCounter'),
      chatContainer: document.getElementById('chatThreadContainer'),
      emptyState: document.getElementById('emptyWelcomeState'),
      scrollArea: document.getElementById('chatScrollContainer'),
      sidebar: document.getElementById('chatSidebar'),
      mobileMenuToggle: document.getElementById('mobileMenuToggleBtn'),
      closeSidebarBtn: document.getElementById('closeSidebarBtn'),
      newChatBtn: document.getElementById('newChatBtn'),
      quotaDisplay: document.getElementById('quotaBalanceDisplay'),
      statusText: document.getElementById('pipelineStatusText'),
      alertBanner: document.getElementById('workspaceAlertSystem'),
      alertText: document.getElementById('workspaceAlertText'),
      userEmailLabel: document.getElementById('userProfileEmailDisplayLabel')
    };

    this.state = {
      activeSessionUser: null,
      activeConversationThreadId: null,
      activeEngineModel: 'gemini',
      isProcessingPayload: false,
      dailyQuotaBalance: 100
    };
  }

  async ignite() {
    console.log("Crest Architecture Initializing Lifecycle Pipeline...");
    
    if (!supabase) {
      this.triggerTopAlertNotification("Critical Initialization Fault: Remote database layer offline.");
      return;
    }

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      console.warn("Unauthorized terminal trace. Intercepting and rerouting to auth...");
      window.location.href = "/pages/auth/login.html";
      return;
    }

    this.state.activeSessionUser = session.user;
    if (this.dom.userEmailLabel) {
      this.dom.userEmailLabel.textContent = session.user.email;
    }

    this.bindInterfaceEvents();
    this.updateCharacterMetricCounters();
    this.forceScrollAreaToCalculatedBottom();
  }

  bindInterfaceEvents() {
    if (this.dom.form) {
      this.dom.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.dispatchUserPromptInputVector();
      });
    }

    if (this.dom.textarea) {
      this.dom.textarea.addEventListener('input', () => {
        this.resizeInputTextareaHeightDynamically();
        this.updateCharacterMetricCounters();
      });

      this.dom.textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (this.dom.sendBtn && !this.dom.sendBtn.disabled) {
            this.dispatchUserPromptInputVector();
          }
        }
      });
    }

    if (this.dom.mobileMenuToggle) {
      this.dom.mobileMenuToggle.addEventListener('click', () => this.toggleMobileSidebarState(true));
    }
    if (this.dom.closeSidebarBtn) {
      this.dom.closeSidebarBtn.addEventListener('click', () => this.toggleMobileSidebarState(false));
    }

    if (this.dom.newChatBtn) {
      this.dom.newChatBtn.addEventListener('click', () => {
        if (this.dom.chatContainer) this.dom.chatContainer.innerHTML = '';
        if (this.dom.emptyState) this.dom.emptyState.style.display = 'block';
      });
    }

    document.querySelectorAll('.prompt-suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const structuralPromptString = card.querySelector('p').textContent;
        if (this.dom.textarea) {
          this.dom.textarea.value = structuralPromptString;
          this.resizeInputTextareaHeightDynamically();
          this.updateCharacterMetricCounters();
          this.dom.textarea.focus();
        }
      });
    });
  }

  toggleMobileSidebarState(shouldOpenSidebar) {
    if (!this.dom.sidebar) return;
    if (shouldOpenSidebar) {
      this.dom.sidebar.classList.add('open');
    } else {
      this.dom.sidebar.classList.remove('open');
    }
  }

  resizeInputTextareaHeightDynamically() {
    if (!this.dom.textarea) return;
    this.dom.textarea.style.height = 'auto';
    this.dom.textarea.style.height = `${Math.min(this.dom.textarea.scrollHeight, 200)}px`;
  }

  updateCharacterMetricCounters() {
    if (!this.dom.textarea || !this.dom.charCounter || !this.dom.sendBtn) return;
    const stringLengthMetric = this.dom.textarea.value.length;
    this.dom.charCounter.textContent = `${stringLengthMetric} / 4000`;

    if (stringLengthMetric > 4000) {
      this.dom.charCounter.style.color = 'var(--color-error-red)';
      this.dom.sendBtn.disabled = true;
    } else {
      this.dom.charCounter.style.color = 'var(--color-text-muted)';
      this.dom.sendBtn.disabled = stringLengthMetric === 0 || this.state.isProcessingPayload;
    }
  }

  forceScrollAreaToCalculatedBottom() {
    if (!this.dom.scrollArea) return;
    this.dom.scrollArea.scrollTo({
      top: this.dom.scrollArea.scrollHeight,
      behavior: 'smooth'
    });
  }

  triggerTopAlertNotification(warningTextString) {
    if (!this.dom.alertBanner || !this.dom.alertText) return;
    this.dom.alertText.textContent = warningTextString;
    this.dom.alertBanner.style.display = 'block';
  }

  async executeCloudflareSecureRoutingPipeline(rawMessageString) {
    try {
      const response = await fetch(BACKEND_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: rawMessageString,
          modelType: this.state.activeEngineModel
        })
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || `Server Node Error Status: ${response.status}`);
      }
      return data.response;

    } catch (pipelineError) {
      console.error("Tunnel Failure:", pipelineError.message);
      return "Crest is currently busy or handling a high volume of neural streams. Please give our core matrix a moment to clear up and try your prompt again!";
    }
  }

  async dispatchUserPromptInputVector() {
    if (!this.dom.textarea || this.state.isProcessingPayload) return;
    
    const userPromptText = this.dom.textarea.value.trim();
    if (!userPromptText) return;

    this.state.isProcessingPayload = true;
    this.dom.textarea.value = '';
    this.resizeInputTextareaHeightDynamically();
    this.updateCharacterMetricCounters();

    if (this.dom.emptyState) {
      this.dom.emptyState.style.display = 'none';
    }

    if (this.dom.statusText) {
      this.dom.statusText.textContent = "Pipeline Active: Analyzing Neural Streams...";
    }

    this.appendStructuralMessageBubbleFrame(userPromptText, 'user');
    const processingLoadingStubId = this.appendStructuralMessageBubbleFrame('Synthesizing Neural Metrics...', 'ai', true);

    this.state.dailyQuotaBalance = Math.max(0, this.state.dailyQuotaBalance - 1);
    if (this.dom.quotaDisplay) {
      this.dom.quotaDisplay.textContent = `Daily System Allocation Balance: ${this.state.dailyQuotaBalance} / 100 Free Nodes Transacted`;
    }

    const targetedGenerationResult = await this.executeCloudflareSecureRoutingPipeline(userPromptText);

    this.stripTargetedLoadingBubbleFrame(processingLoadingStubId);
    this.appendStructuralMessageBubbleFrame(targetedGenerationResult, 'ai');

    this.state.isProcessingPayload = false;
    this.updateCharacterMetricCounters();
    if (this.dom.statusText) {
      this.dom.statusText.textContent = "Pipeline Node Steady";
    }
  }

  appendStructuralMessageBubbleFrame(messageContentText, speakerIdentityNode, isLoaderStub = false) {
    if (!this.dom.chatContainer) return null;

    const wrapperNodeFrame = document.createElement('div');
    const systemGeneratedBubbleId = "msg_node_" + Math.random().toString(36).substr(2, 9);
    wrapperNodeFrame.id = systemGeneratedBubbleId;
    wrapperNodeFrame.className = `message-wrapper ${speakerIdentityNode}-wrapper`;

    // Premium inline asset paths matching your exact visual targets
    wrapperNodeFrame.innerHTML = `
      <div class="message-meta-strip">
        <div class="identity-avatar-container">
          <svg viewBox="0 0 24 24" style="width:12px; height:12px; fill:var(--color-text-muted);">
            ${speakerIdentityNode === 'user' 
              ? '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' 
              : '<path d="M12 2L2 22h20L12 2zm0 3.99L19.53 19H4.47L12 5.99z"/>'}
          </svg>
        </div>
        <span class="meta-identity-label">${speakerIdentityNode === 'user' ? 'Local Matrix User' : 'Crest Multi-Model Synapse'}</span>
      </div>
      <div class="message-bubble-body">
        <div class="rich-text-markdown-payload-container">
          <p>${messageContentText}</p>
        </div>
      </div>
    `;

    if (isLoaderStub) {
      wrapperNodeFrame.classList.add('system-pipeline-loader-active');
    }

    this.dom.chatContainer.appendChild(wrapperNodeFrame);
    this.forceScrollAreaToCalculatedBottom();
    
    return systemGeneratedBubbleId;
  }

  stripTargetedLoadingBubbleFrame(targetedNodeIdString) {
    const loadingTarget = document.getElementById(targetedNodeIdString);
    if (loadingTarget) loadingTarget.remove();
  }
}