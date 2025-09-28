// main.js - Main application initialization and coordination

// Global request state
let currentRequest = null;

// Comprehensive tool call and LLM tracking
let toolCallCycles = []; // Nested array: [cycle1[], cycle2[], ...]
let llmCalls = [];
let totalCost = 0;
let totalTokens = 0;
let currentPersona = '';
let currentQuestions = [];
let currentSetupData = {};
let currentFormData = {};

// Quota/limits error handling state
let continuationState = {
    isActive: false,
    savedFormData: null,
    savedContext: null,
    countdownTimer: null,
    remainingSeconds: 0,
    retryCount: 0,
    maxAutoRetries: 3,
    autoRetryEnabled: true,
    // State tracking for true continuation
    workState: {
        researchPlan: null,
        toolCallCycles: [],
        llmCalls: [],
        searchResults: [],
        currentIteration: 0,
        totalCost: 0,
        totalTokens: 0,
        persona: '',
        questions: [],
        setupData: {}
    }
};

// Toast notification system
function showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;

    container.appendChild(toast);

    // Auto remove after duration
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// Quota/limits error detection
function isQuotaLimitError(errorMessage) {
    if (!errorMessage) {
        return false;
    }
    
    const quotaIndicators = [
        'quota exceeded',
        'rate limit',
        'rate limited',
        'too many requests',
        'retry after',
        'usage limit',
        'billing limit',
        'insufficient quota',
        'api limit exceeded',
        'requests per minute',
        'requests per hour',
        'requests per day',
        'rate_limit_exceeded',
        'quota_exceeded',
        'insufficient_quota',
        'billing_quota_exceeded',
        'daily_limit_exceeded',
        'monthly_limit_exceeded',
        'throttled',
        'throttling',
        '429', // HTTP status code for Too Many Requests
        'overloaded',
        'capacity exceeded'
    ];
    
    const lowerMessage = errorMessage.toLowerCase();
    const isQuotaError = quotaIndicators.some(indicator => lowerMessage.includes(indicator));
    
    return isQuotaError;
}

// Start countdown timer for continuation
function startContinuationCountdown() {
    const continueBtn = document.getElementById('continue-btn');
    if (!continueBtn) return;
    
    // Use the remainingSeconds value already set by handleQuotaError (don't overwrite)
    // If not set, default to 60 seconds
    if (!continuationState.remainingSeconds || continuationState.remainingSeconds < 1) {
        continuationState.remainingSeconds = 60;
    }
    continuationState.isActive = true;
    
    function updateCountdown() {
        if (!continuationState.isActive) return;
        
        if (continuationState.remainingSeconds > 0) {
            continueBtn.textContent = `Continue in ${continuationState.remainingSeconds}s`;
            continuationState.remainingSeconds--;
            continuationState.countdownTimer = setTimeout(updateCountdown, 1000);
        } else {
            // Auto-trigger continuation
            continueBtn.textContent = 'Continuing...';
            continueBtn.disabled = true;
            
            // Also disable stop button during auto-continuation
            const stopBtn = document.getElementById('stop-btn');
            if (stopBtn) {
                stopBtn.disabled = true;
                stopBtn.textContent = 'Continuing...';
            }
            
            setTimeout(() => {
                triggerContinuation();
            }, 500);
        }
    }
    
    updateCountdown();
}

// Parse wait time from error message
function parseWaitTimeFromMessage(errorMessage) {
    // Enhanced patterns for wait times including milliseconds, decimal seconds, and minutes
    const patterns = [
        // Milliseconds patterns (e.g., "Please try again in 28ms")
        /try again in\s+(\d+(?:\.\d+)?)\s*ms(?:illiseconds?)?/i,
        /wait\s+(\d+(?:\.\d+)?)\s*ms(?:illiseconds?)?/i,
        /retry after\s+(\d+(?:\.\d+)?)\s*ms(?:illiseconds?)?/i,
        /rate limit.+?(\d+(?:\.\d+)?)\s*ms(?:illiseconds?)?/i,
        /limit.+?(\d+(?:\.\d+)?)\s*ms(?:illiseconds?)?/i,
        
        // Decimal seconds patterns (e.g., "Please try again in 15.446s")
        /try again in\s+(\d+(?:\.\d+)?)\s*s(?:econds?)?/i,
        /wait\s+(\d+(?:\.\d+)?)\s*s(?:econds?)?/i,
        /retry after\s+(\d+(?:\.\d+)?)\s*s(?:econds?)?/i,
        /rate limit.+?(\d+(?:\.\d+)?)\s*s(?:econds?)?/i,
        /limit.+?(\d+(?:\.\d+)?)\s*s(?:econds?)?/i,
        
        // Integer seconds patterns
        /wait\s+(\d+)\s*seconds?/i,
        /try again in\s+(\d+)\s*seconds?/i,
        /retry after\s+(\d+)\s*seconds?/i,
        /rate limit.+?(\d+)\s*seconds?/i,
        /limit.+?(\d+)\s*seconds?/i,
        
        // Minutes patterns
        /wait\s+(\d+)\s*minutes?/i,
        /try again in\s+(\d+)\s*minutes?/i,
        /retry after\s+(\d+)\s*minutes?/i,
        /rate limit.+?(\d+)\s*minutes?/i,
        /limit.+?(\d+)\s*minutes?/i
    ];
    
    for (const pattern of patterns) {
        const match = errorMessage.match(pattern);
        if (match) {
            const value = parseFloat(match[1]);
            const isMinutes = /minutes?/i.test(match[0]);
            const isMilliseconds = /ms(?:illiseconds?)?/i.test(match[0]);
            
            let seconds;
            if (isMilliseconds) {
                seconds = value / 1000; // Convert milliseconds to seconds
            } else if (isMinutes) {
                seconds = value * 60; // Convert minutes to seconds
            } else {
                seconds = value; // Already in seconds
            }
            
            // Round up to ensure we don't retry too early
            seconds = Math.ceil(seconds);
            
            // Ensure minimum wait time of 1 second
            const result = Math.max(1, seconds);
            console.log(`🔍 Parsed "${match[0]}" from error -> ${result}s (original: ${value}${isMilliseconds ? 'ms' : isMinutes ? 'min' : 's'})`);
            return result;
        }
    }
    
    // Default fallback
    return 60;
}

// Stop countdown timer
function stopContinuationCountdown() {
    continuationState.isActive = false;
    if (continuationState.countdownTimer) {
        clearTimeout(continuationState.countdownTimer);
        continuationState.countdownTimer = null;
    }
}

// Stop countdown and reset to normal UI state
function stopCountdownAndReset() {
    console.log('🛑 User stopped countdown timer');
    
    // Stop the countdown
    stopContinuationCountdown();
    
    // Reset continuation state
    continuationState.isActive = false;
    continuationState.savedFormData = null;
    continuationState.savedContext = null;
    
    // Reset UI to normal state
    const submitBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    const continueBtn = document.getElementById('continue-btn');
    const statusElement = document.getElementById('status');
    
    if (submitBtn) {
        submitBtn.style.display = 'inline-block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Request';
    }
    
    if (stopBtn) {
        stopBtn.style.display = 'none';
    }
    
    if (continueBtn) {
        continueBtn.style.display = 'none';
    }
    
    if (statusElement) {
        statusElement.textContent = 'Countdown stopped by user. You can start a new request.';
    }
    
    // Update button state
    updateSubmitButton();
}

// Reset work state for new requests
function resetWorkState() {
    continuationState.workState = {
        researchPlan: null,
        completedToolCalls: [],
        searchResults: [],
        currentIteration: 0,
        allInformation: null
    };
}

// Handle quota/limits error
function handleQuotaError(errorMessage, formData, existingResponse) {
    
    // Always use the error message from the LLM response for quota/rate error determination
    // Parse wait time from error message, default to 60s if not found
    let waitSeconds = 60;
    if (typeof errorMessage === 'string' && errorMessage.length > 0) {
        waitSeconds = parseWaitTimeFromMessage(errorMessage);
        if (!waitSeconds || isNaN(waitSeconds) || waitSeconds < 1) waitSeconds = 60;
        console.log(`🔄 Quota error - parsed wait time: ${waitSeconds}s from message: "${errorMessage}"`);
    }
    continuationState.remainingSeconds = waitSeconds;
    
    // Save comprehensive state for continuation
    continuationState.savedFormData = { ...formData };
    continuationState.savedContext = {
        existingResponse: existingResponse,
        timestamp: new Date().toISOString(),
        // Include comprehensive work state for true continuation
        workState: {
            researchPlan: continuationState.workState.researchPlan,
            toolCallCycles: [...toolCallCycles],
            llmCalls: [...llmCalls],
            searchResults: [...continuationState.workState.searchResults],
            currentIteration: continuationState.workState.currentIteration,
            totalCost: totalCost,
            totalTokens: totalTokens,
            persona: currentPersona,
            questions: [...currentQuestions],
            setupData: { ...currentSetupData }
        }
    };
    
    // Show/hide buttons
    showContinuationUI();
    
    // Start countdown with parsed timing
    startContinuationCountdown();
    
    // Show error message with dynamic timing
    const statusElement = document.getElementById('status');
    if (statusElement) {
        const autoRetryText = continuationState.autoRetryEnabled && continuationState.retryCount < continuationState.maxAutoRetries 
            ? ` (Auto-retry ${continuationState.retryCount + 1}/${continuationState.maxAutoRetries})`
            : ' (Manual continue required)';
        statusElement.textContent = `⏳ Rate limit reached. Will continue in ${waitSeconds} seconds...${autoRetryText}`;
    }
    // Add information to steps
    const stepsElement = document.getElementById('steps');
    if (stepsElement) {
        stepsElement.innerHTML += `
            <div style="margin: 10px 0; padding: 15px; background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%); border-radius: 8px; color: white;">
                <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <span>⏳</span> Rate Limit Reached
                </div>
                <div style="opacity: 0.9; margin-bottom: 8px;">${errorMessage}</div>
                <div style="opacity: 0.8; font-size: 0.9em;">Continuing automatically in ${waitSeconds} seconds. You can click Continue to proceed immediately, or Stop to cancel.</div>
            </div>
        `;
    }
}

// Show continuation UI (hide submit, show continue and stop)
function showContinuationUI() {
    const submitBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    const continueBtn = document.getElementById('continue-btn');
    
    if (submitBtn) {
        submitBtn.style.display = 'none';
    }
    
    if (stopBtn) {
        stopBtn.style.display = 'inline-block';
        stopBtn.disabled = false;
        stopBtn.textContent = 'Stop';
        stopBtn.onclick = stopCountdownAndReset;
    }
    
    if (continueBtn) {
        continueBtn.style.display = 'inline-block';
        continueBtn.disabled = false;
        continueBtn.onclick = triggerContinuation;
    }
}

// Hide continuation UI (show submit, hide continue)
function hideContinuationUI() {
    // Don't hide continuation UI if quota handling is active
    if (continuationState.isActive) {
        console.log('🔄 Prevented hideContinuationUI() - quota handling is active');
        return;
    }
    
    const submitBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    const continueBtn = document.getElementById('continue-btn');
    
    if (submitBtn) submitBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (continueBtn) continueBtn.style.display = 'none';
    
    // Reset continuation state completely (successful completion)
    stopContinuationCountdown();
    continuationState.isActive = false;
    continuationState.savedFormData = null;
    continuationState.savedContext = null;
    continuationState.retryCount = 0;
    continuationState.autoRetryEnabled = true;
}

// Trigger continuation
function triggerContinuation() {
    if (!continuationState.savedFormData) {
        console.error('No saved form data for continuation');
        return;
    }
    
    // Stop countdown
    stopContinuationCountdown();
    
    // Add comprehensive continuation context to form data
    const formData = {
        ...continuationState.savedFormData,
        continuation: true,
        continuationContext: {
            ...continuationState.savedContext,
            workState: {
                researchPlan: continuationState.savedContext?.workState?.researchPlan,
                toolCallCycles: toolCallCycles,
                llmCalls: llmCalls,
                searchResults: continuationState.savedContext?.workState?.searchResults || [],
                currentIteration: toolCallCycles.length,
                totalCost: totalCost,
                totalTokens: totalTokens,
                persona: currentPersona,
                questions: currentQuestions,
                setupData: currentSetupData
            }
        },
        retryAttempt: continuationState.retryCount
    };
    
    // Debug: Log the exact continuation structure being sent
    console.log('📦 CONTINUATION PAYLOAD STRUCTURE:', {
        continuation: formData.continuation,
        hasContext: !!formData.continuationContext,
        hasWorkState: !!formData.continuationContext?.workState,
        workStateKeys: formData.continuationContext?.workState ? Object.keys(formData.continuationContext.workState) : [],
        toolCallCyclesData: {
            length: toolCallCycles.length,
            structure: toolCallCycles.map((cycle, i) => ({
                cycle: i + 1,
                calls: cycle.length,
                completed: cycle.filter(tc => tc.completed).length,
                sample: cycle[0] ? {
                    hasRequest: !!cycle[0].request,
                    hasResponse: !!cycle[0].response,
                    requestKeys: cycle[0].request ? Object.keys(cycle[0].request) : [],
                    functionName: cycle[0].request?.function?.name
                } : null
            }))
        }
    });
    
    console.log('📤 CONTINUATION REQUEST:', {
        persona: currentPersona,
        questions: currentQuestions.length,
        toolCallCycles: toolCallCycles.length,
        totalToolCalls: toolCallCycles.reduce((sum, cycle) => sum + cycle.length, 0),
        completedToolCalls: toolCallCycles.reduce((sum, cycle) => sum + cycle.filter(tc => tc.completed).length, 0),
        llmCalls: llmCalls.length,
        totalCost: totalCost,
        totalTokens: totalTokens,
        fullContinuationData: {
            workState: {
                toolCallCycles: toolCallCycles.map((cycle, i) => `Cycle ${i+1}: ${cycle.length} calls`),
                llmCalls: llmCalls.length,
                persona: currentPersona ? 'present' : 'missing',
                questions: currentQuestions.length
            }
        }
    });
    
    // Reset form state but keep retry tracking
    const currentRetryCount = continuationState.retryCount;
    const autoRetryEnabled = continuationState.autoRetryEnabled;
    
    continuationState.savedFormData = null;
    continuationState.savedContext = null;
    
    // Hide continuation UI and show stop button for actual request
    const submitBtn = document.getElementById('submit-btn');
    const continueBtn = document.getElementById('continue-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    if (submitBtn) submitBtn.style.display = 'none';
    if (continueBtn) continueBtn.style.display = 'none';
    if (stopBtn) {
        stopBtn.style.display = 'inline-block';
        stopBtn.disabled = false;
        stopBtn.textContent = 'Stop';
        // Reset stop button onclick to normal request stopping behavior
        stopBtn.onclick = null;
    }
    
    // Show status
    const statusElement = document.getElementById('status');
    if (statusElement) {
        const retryText = currentRetryCount > 0 ? ` (Retry ${currentRetryCount})` : '';
        statusElement.textContent = `Continuing request...${retryText}`;
    }
    
    // Make the request with continuation context
    makeStreamingRequest(formData);
}

// Global function for continuation button clicks (referenced in HTML)
function continueRequest() {
    triggerContinuation();
}

// Auto-resize textarea functionality
function setupAutoResizeTextarea() {
    const textarea = document.getElementById('prompt');
    if (!textarea) return;

    // Force textarea to start empty and at 1 row
    textarea.value = '';
    textarea.rows = 1;
    
    // Calculate actual one-row height based on line-height and padding
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 8;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 8;
    const borderTop = parseFloat(computedStyle.borderTopWidth) || 2;
    const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 2;
    const minHeight = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom;

    function resizeTextarea() {
        // Reset height to get accurate scrollHeight
        textarea.style.height = 'auto';
        
        // For empty textarea, force it to minimum height
        if (textarea.value.trim() === '') {
            textarea.style.height = minHeight + 'px';
            return;
        }
        
        // Calculate new height with proper bounds
        const scrollHeight = textarea.scrollHeight;
        const newHeight = Math.max(minHeight, Math.min(scrollHeight, 200));
        
        textarea.style.height = newHeight + 'px';
    }

    // Add event listeners
    textarea.addEventListener('input', resizeTextarea);
    textarea.addEventListener('paste', () => setTimeout(resizeTextarea, 0));
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            setTimeout(resizeTextarea, 0);
        }
    });
    
    // Force initial height to exactly 1 row, override any CSS
    textarea.style.height = minHeight + 'px';
    textarea.style.minHeight = minHeight + 'px';
    
    // Also resize after a short delay to handle any dynamic content
    setTimeout(resizeTextarea, 100);
}

// Button state management
function setButtonState(state, options = {}) {
    const submitBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    const continueBtn = document.getElementById('continue-btn');
    if (!submitBtn || !stopBtn || !continueBtn) return;

    // Hide all by default
    submitBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    continueBtn.style.display = 'none';

    if (state === 'signin') {
        submitBtn.textContent = 'Sign in or add API key';
        submitBtn.className = 'compact-btn submit-btn disabled-btn';
        submitBtn.disabled = true;
        submitBtn.style.display = 'inline-block';
    } else if (state === 'send') {
        submitBtn.textContent = 'Send Request';
        submitBtn.className = 'compact-btn submit-btn';
        submitBtn.disabled = !!options.disabled;
        submitBtn.style.display = 'inline-block';
    } else if (state === 'stop') {
        stopBtn.textContent = 'Stop';
        stopBtn.className = 'compact-btn stop-btn';
        stopBtn.disabled = false;
        stopBtn.style.display = 'inline-block';
    } else if (state === 'paused') {
        continueBtn.textContent = options.text || 'Paused';
        continueBtn.className = 'compact-btn continue-btn paused-btn';
        continueBtn.disabled = !!options.disabled;
        continueBtn.style.display = 'inline-block';
    } else if (state === 'retry') {
        continueBtn.textContent = options.text || 'Retry';
        continueBtn.className = 'compact-btn continue-btn retry-btn';
        continueBtn.disabled = !!options.disabled;
        continueBtn.style.display = 'inline-block';
        stopBtn.textContent = 'Stop';
        stopBtn.className = 'compact-btn stop-btn';
        stopBtn.disabled = false;
        stopBtn.style.display = 'inline-block';
    }
}

// Disable submit button if prompt is empty
function updateSubmitButton() {
    const promptInput = document.getElementById('prompt');
    const submitBtn = document.getElementById('submit-btn');
    // Check auth and API key
    let isAuthenticated = false;
    if (window.ensureValidToken) {
        isAuthenticated = window.isGoogleTokenValid && window.isGoogleTokenValid(window.googleAccessToken);
    }
    const groqKeyInput = document.getElementById('groq_api_key');
    const openaiKeyInput = document.getElementById('openai_api_key');
    const hasLocalKey = (groqKeyInput && groqKeyInput.value.trim()) || (openaiKeyInput && openaiKeyInput.value.trim());
    if (!isAuthenticated && !hasLocalKey) {
        setButtonState('signin');
    } else {
        setButtonState('send', { disabled: !promptInput || promptInput.value.trim() === '' });
    }
}

// Initialize the application
function initializeApp() {
    // Check for OAuth redirect first, then initialize Google services
    if (!handleOAuthRedirect()) {
        // Initialize Google OAuth when the page loads
        setTimeout(initializeGoogleOAuth, 1000); // Delay to ensure Google script is loaded
    }
    
    // Initialize settings
    initializeSettings();
    
    // Initialize sample queries
    initializeSampleQueries();
    
    // Set up auto-resize textarea
    setupAutoResizeTextarea();

    // Set up login button handler
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    // Set up form submission handler
    const form = document.getElementById('llm-form');
    const submitBtn = document.getElementById('submit-btn');
    const promptInput = document.getElementById('prompt');

    if (form) {
        form.addEventListener('submit', handleFormSubmission);
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleFormSubmission(e);
        });
    }

    if (promptInput) {
        // Restore prompt from localStorage if available
        const savedPrompt = localStorage.getItem('llmproxy_prompt');
        if (savedPrompt !== null) {
            promptInput.value = savedPrompt;
        }
        promptInput.addEventListener('input', () => {
            localStorage.setItem('llmproxy_prompt', promptInput.value);
            updateSubmitButton();
        });
        // Initial state
        updateSubmitButton();
    }
    
    // Update UI state
    updateModelAvailability();
    updateSubmitButton();
}

// Handle form submission for LLM requests
async function handleFormSubmission(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    const responseContainer = document.getElementById('response-container');
    
    // Clear previous tool executions
    if (typeof resetToolExecutions === 'function') {
        resetToolExecutions();
    }
    
    // Hide persona and questions containers at start of new search
    const personaEl = document.getElementById('persona-container');
    const researchEl = document.getElementById('research-questions-container');
    const layoutEl = document.querySelector('.persona-questions-layout');
    
    if (personaEl) {
        personaEl.style.display = 'none';
    }
    if (researchEl) {
        researchEl.style.display = 'none';
    }
    if (layoutEl) {
        layoutEl.classList.add('hidden');
    }
    
    // Hide submit button and show stop button
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) {
        submitBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
    }
    
    // Show loading message
    responseContainer.className = 'response-container loading';
    disableResponseActions();
    responseContainer.style.display = 'block';
    responseContainer.textContent = 'Sending request...';
    
    // Hide persona and research questions containers from previous requests
    const personaContainer = document.getElementById('persona-container');
    if (personaContainer) {
        personaContainer.style.display = 'none';
    }
    
    const researchQuestionsContainer = document.getElementById('research-questions-container');
    if (researchQuestionsContainer) {
        researchQuestionsContainer.style.display = 'none';
    }
    
    // Get the selected model to determine which API key to use
    const modelElement = document.getElementById('model');
    console.log('🔧 DEBUG: Model element:', modelElement);
    let selectedModel = modelElement ? modelElement.value : '';
    console.log('🔧 DEBUG: Selected model value (raw):', selectedModel);
    
    // Fallback to default if model is empty or undefined
    if (!selectedModel) {
        selectedModel = 'groq:llama-3.1-8b-instant';
        console.log('🔧 DEBUG: Using fallback model:', selectedModel);
    }
    
    const isGroqModel = selectedModel.startsWith('groq:');
    const isOpenaiModel = selectedModel.startsWith('openai:');
    
    // Get the appropriate API key
    let apiKey;
    if (isGroqModel) {
        const groqKeyInput = document.getElementById('groq_api_key');
        apiKey = groqKeyInput ? groqKeyInput.value : '';
    } else if (isOpenaiModel) {
        const openaiKeyInput = document.getElementById('openai_api_key');
        apiKey = openaiKeyInput ? openaiKeyInput.value : '';
    }
    
    // Validate that we have either a local API key or a valid Google login
    const hasLocalKey = apiKey && apiKey.trim();
    
    // Check authentication status with token validation
    let isAuthenticated = false;
    if (window.ensureValidToken) {
        // Use the new authentication check that validates token and refreshes if needed
        isAuthenticated = await window.ensureValidToken();
    } else {
        // Fallback to basic check
        isAuthenticated = window.isGoogleTokenValid && window.isGoogleTokenValid(window.googleAccessToken);
    }
    

    
    if (!hasLocalKey && !isAuthenticated) {
        responseContainer.className = 'response-container response-error';
        if (window.googleUser && window.googleAccessToken) {
            responseContainer.textContent = 'Error: Your authentication has expired. Please sign in again to continue.';
        } else {
            responseContainer.textContent = 'Error: Please sign in with Google or provide an API key in Settings to proceed.';
        }
        submitBtn.style.display = 'inline-block';
        if (stopBtn) stopBtn.style.display = 'none';
        return;
    }

        // Collect form data
    const promptInput = document.getElementById('prompt');
    const accessSecretInput = document.getElementById('access_secret');
    
    const formData = {
        // Only include apiKey if user provided one; otherwise server may use env keys for authorized accounts
        ...(hasLocalKey ? { apiKey: apiKey } : {}),
        model: selectedModel,
        query: promptInput ? promptInput.value : '',
        accessSecret: accessSecretInput ? accessSecretInput.value : '',
        // Include Google token if authenticated
        ...(isAuthenticated && window.googleAccessToken ? { google_token: window.googleAccessToken } : {})
    };

    // Save comprehensive form data for potential continuation
    window.lastFormData = { ...formData };
    currentFormData = {
        query: formData.query,
        model: formData.model,
        accessSecret: formData.accessSecret,
        google_token: formData.google_token
    };
    
    // Reset tracking state for new request if not continuing
    if (!formData.continuation) {
        toolCallCycles = [];
        llmCalls = [];
        totalCost = 0;
        totalTokens = 0;
        currentPersona = '';
        currentQuestions = [];
        currentSetupData = {};
    }

    // Make the streaming request
    return makeStreamingRequest(formData);
}

// Make streaming request (can be called for initial request or continuation)
async function makeStreamingRequest(formData) {
    const responseContainer = document.getElementById('response-container');
    const submitBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    // Check if this is a continuation request
    const isContinuation = formData.continuation === true;
    let existingContent = '';
    
    if (isContinuation && continuationState.savedContext?.existingResponse) {
        // Save existing content to preserve it
        existingContent = continuationState.savedContext.existingResponse;
        console.log('🔄 Continuation request - preserving existing content');
    } else {
        // Reset work state for new requests
        resetWorkState();
    }
    
    // Set a reasonable default timeout (90 seconds)
    const timeoutMs = 90000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);
    
    try {
        // Use the Lambda URL that should be set globally during template processing
        let effectiveLambdaUrl = window.LAMBDA_URL || 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/';
        
        // Add streaming parameter to ensure Lambda uses streaming mode
        const url = new URL(effectiveLambdaUrl);
        url.searchParams.set('stream', 'true');
        effectiveLambdaUrl = url.toString();
        
        console.log('🌐 Making request to:', effectiveLambdaUrl);
        console.log('📝 Request payload keys:', Object.keys(formData));
        
        // Update loading message (don't clear existing content for continuation)
        if (isContinuation) {
            // For continuation, just update status
            const statusElement = document.getElementById('status');
            if (statusElement) statusElement.textContent = 'Continuing request...';
        } else {
            responseContainer.textContent = 'Sending request...';
        }
        
        const response = await fetch(effectiveLambdaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'  // Request streaming response
            },
            body: JSON.stringify(formData),
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal
        });
        
        console.log('📡 Response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });
        
        // Clear the timeout since we got a response
        clearTimeout(timeoutId);
        
        // Check if response is streaming
        const contentType = response.headers.get('content-type');
        console.log('📋 Content-Type:', contentType);
        
        if (contentType && contentType.includes('text/event-stream')) {
            if (typeof handleStreamingResponse === 'function') {
                await handleStreamingResponse(response, responseContainer, controller, existingContent);
            } else {
                console.error('handleStreamingResponse function not found');
                responseContainer.textContent = 'Error: Streaming handler not available';
            }
            return;
        }
        
        // Handle regular JSON response
        const responseData = await response.text();
        console.log('LLM Response:', responseData);
        
        if (response.ok) {
            try {
                const jsonData = JSON.parse(responseData);
                const answer = jsonData.response || jsonData.answer || 'No response found';
                
                responseContainer.className = 'response-container response-success';
                responseContainer.style.fontFamily = 'inherit';
                responseContainer.innerHTML = `<div class="answer-content">${answer.replace(/\n/g, '<br>')}</div>`;
            } catch (parseError) {
                responseContainer.className = 'response-container response-success';
                responseContainer.textContent = `Success (${response.status}):\n\n${responseData}`;
            }
        } else {
            responseContainer.className = 'response-container response-error';
            responseContainer.style.fontFamily = 'monospace';
            responseContainer.textContent = `Error (${response.status}):\n\n${responseData}`;
        }
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Request error:', error);
        
        responseContainer.className = 'response-container response-error';
        
        if (error.name === 'AbortError') {
            responseContainer.textContent = `Request Timeout Error:\n\nThe request timed out after 90 seconds.`;
        } else {
            responseContainer.textContent = `Network Error:\n\n${error.message}`;
        }
    } finally {
        // Reset UI unless we're in continuation mode
        if (!continuationState.isActive) {
            // Show submit button and hide stop button
            submitBtn.style.display = 'inline-block';
            if (stopBtn) stopBtn.style.display = 'none';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Request';
        }
    }
}

// Helper functions for streaming response
function resetModelToFastest() {
    try {
        const select = document.getElementById('model');
        if (!select) return;
        const prefer = ['groq:llama-3.1-8b-instant', 'openai:gpt-4o-mini'];
        for (const val of prefer) {
            const opt = select.querySelector(`option[value="${val}"]`);
            if (opt && !opt.disabled) {
                select.value = val;
                return;
            }
        }
        const firstEnabled = Array.from(select.options).find(o => o.value && !o.disabled);
        if (firstEnabled) select.value = firstEnabled.value;
    } catch (e) {
        console.warn('resetModelToFastest failed:', e);
    }
}

/**
 * Handle streaming Server-Sent Events response
 */
async function handleStreamingResponse(response, responseContainer, controller, existingContent = '') {
    console.log('🔄 Starting streaming response handler with existingContent:', existingContent ? 'yes' : 'no');
    
    // Initialize state variables for streaming
    const digestMap = new Map();
    const metaMap = new Map();
    const resultsState = { byIteration: {} };
    
    // Check if we're in continuation mode
    const isContinuation = existingContent && existingContent.length > 0;
    
    // Clear and prepare response container for streaming (preserve existing content in continuation mode)
    responseContainer.className = 'response-container';
    if (isContinuation) {
        // For continuation, keep existing content and add continuation marker
        console.log('🔄 Preserving existing content for continuation');
        const continuationMarker = `
        <div style="margin: 16px 0; padding: 12px; background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%); border-radius: 8px; color: white; text-align: center; font-weight: bold;">
            <span>🔄</span> Continuing after rate limit...
        </div>`;
        responseContainer.innerHTML = existingContent + continuationMarker + `
        <div id="streaming-response" style="margin-bottom: 16px;">
            <div style="padding: 15px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.2em;">🎯</span> Final Response
                    <div class="response-header-actions">
                        <button type="button" id="copy-response-btn" class="action-btn copy-btn" disabled title="Copy response to clipboard">
                            📋 Copy
                        </button>
                        <button type="button" id="share-response-btn" class="action-btn share-btn" disabled title="Share response via email">
                            📧 Share
                        </button>
                    </div>
                </h3>
            </div>
            <div id="final-answer" style="padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #28a745; line-height: 1.6; color:#212529;">
                <em>Working on it… you'll see the final answer here as soon as it's ready.</em>
            </div>
        </div>
        <div id="streaming-metadata" style="margin-top: 8px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h4 style="margin: 0 0 10px 0; color: #495057; display: flex; align-items: center; gap: 8px;">
                <span>📊</span> Search Summary
            </h4>
            <div id="metadata-content"></div>
            <ul id="search-summary-list" style="margin: 10px 0 0 0; padding-left: 20px;"></ul>
        </div>
        <div style="margin-top: 16px; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <h3 style="margin: 0 0 8px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.2em;">🔄</span> Real-time Search Progress
            </h3>
            <div id="streaming-status" style="opacity: 0.95;">Connected! Waiting for data...</div>
        </div>
        <div id="active-searches" style="margin:10px 0; padding:10px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; display:none;"></div>
        <div id="streaming-steps" style="margin: 10px 0 16px 0;"></div>
        <div id="tools-panel" class="tools-panel" style="display:none; margin:10px 0; padding:10px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px;">
            <h3 style="margin:0 0 8px 0; color:#495057;">Tool calls</h3>
            <div id="tools-log"></div>
        </div>
        <div id="full-results-tree"></div>
        
        <!-- Expandable Tools Section -->
        <div id="expandable-tools-section" style="margin-top: 20px; display: none;">
            <div onclick="toggleToolsDetails()" style="background: linear-gradient(135deg, #6c757d 0%, #495057 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                <span id="tools-toggle-icon">▼</span> Tool Executions
                <span id="tools-count-badge" style="background: rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.9em; margin-left: auto;">0</span>
            </div>
            <div id="expandable-tools-content" style="background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px; max-height: 400px; overflow-y: auto; display: none;">
                <!-- Tool executions will be dynamically added here -->
            </div>
        </div>
    `;
    } else {
        // For new requests, create fresh HTML structure
        responseContainer.innerHTML = `
        <div id="streaming-response" style="margin-bottom: 16px;">
            <div style="padding: 15px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.2em;">🎯</span> Final Response
                    <div class="response-header-actions">
                        <button type="button" id="copy-response-btn" class="action-btn copy-btn" disabled title="Copy response to clipboard">
                            📋 Copy
                        </button>
                        <button type="button" id="share-response-btn" class="action-btn share-btn" disabled title="Share response via email">
                            📧 Share
                        </button>
                    </div>
                </h3>
            </div>
            <div id="final-answer" style="padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #28a745; line-height: 1.6; color:#212529;">
                <em>Working on it… you'll see the final answer here as soon as it's ready.</em>
            </div>
        </div>
        <div id="streaming-metadata" style="margin-top: 8px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h4 style="margin: 0 0 10px 0; color: #495057; display: flex; align-items: center; gap: 8px;">
                <span>📊</span> Search Summary
            </h4>
            <div id="metadata-content"></div>
            <ul id="search-summary-list" style="margin: 10px 0 0 0; padding-left: 20px;"></ul>
        </div>
        <div style="margin-top: 16px; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <h3 style="margin: 0 0 8px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.2em;">🔄</span> Real-time Search Progress
            </h3>
            <div id="streaming-status" style="opacity: 0.95;">Connected! Waiting for data...</div>
        </div>
        <div id="active-searches" style="margin:10px 0; padding:10px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; display:none;"></div>
        <div id="streaming-steps" style="margin: 10px 0 16px 0;"></div>
        <div id="tools-panel" class="tools-panel" style="display:none; margin:10px 0; padding:10px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px;">
            <h3 style="margin:0 0 8px 0; color:#495057;">Tool calls</h3>
            <div id="tools-log"></div>
        </div>
        <div id="full-results-tree"></div>
        
        <!-- Expandable Tools Section -->
        <div id="expandable-tools-section" style="margin-top: 20px; display: none;">
            <div onclick="toggleToolsDetails()" style="background: linear-gradient(135deg, #6c757d 0%, #495057 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                <span id="tools-toggle-icon">▼</span> Tool Executions
                <span id="tools-count-badge" style="background: rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.9em; margin-left: auto;">0</span>
            </div>
            <div id="expandable-tools-content" style="background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px; max-height: 400px; overflow-y: auto; display: none;">
                <!-- Tool executions will be dynamically added here -->
            </div>
        </div>
    `;
    }
    
    const statusElement = document.getElementById('streaming-status');
    const stepsElement = document.getElementById('streaming-steps');
    const toolsPanel = document.getElementById('tools-panel');
    const toolsLog = document.getElementById('tools-log');
    const responseElement = document.getElementById('streaming-response');
    const answerElement = document.getElementById('final-answer');
    const metadataElement = document.getElementById('streaming-metadata');
    const metadataContent = document.getElementById('metadata-content');
    const searchSummaryList = document.getElementById('search-summary-list');
    const fullResultsTree = document.getElementById('full-results-tree');
    const activeSearchesEl = document.getElementById('active-searches');
    
    // Get the stop button from the form area
    const formStopBtn = document.getElementById('stop-btn');
    
    // Track active searches and countdowns
    const activeTimers = new Map(); // key -> { start, maxMs, intervalId, barInner, label }
    const SEARCH_MAX_MS = 15000; // UI estimate per-search timeout (ms)

    function ensureActiveHeaderVisible() {
        if (activeTimers.size > 0) {
            activeSearchesEl.style.display = 'block';
            if (!activeSearchesEl.__header) {
                const h = document.createElement('div');
                h.style.cssText = 'font-weight:600; color:#495057; margin-bottom:8px;';
                h.textContent = 'Active searches';
                activeSearchesEl.appendChild(h);
                activeSearchesEl.__header = h;
            }
        } else {
            activeSearchesEl.style.display = 'none';
        }
    }

    function startSearchTimer(iteration, term, index, total) {
        const key = `${iteration}|${term}`;
        if (activeTimers.has(key)) return;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin:6px 0;';
        const label = document.createElement('div');
        label.style.cssText = 'font-size:0.9em; color:#495057; margin-bottom:4px; display:flex; justify-content:space-between; gap:8px;';
        label.innerHTML = `<span>(${index}/${total}) "${term}"</span><span class="time">${Math.round(SEARCH_MAX_MS/1000)}s</span>`;
        const bar = document.createElement('div');
        bar.style.cssText = 'height:10px; background:#e9ecef; border-radius:6px; overflow:hidden;';
        const inner = document.createElement('div');
        inner.style.cssText = 'height:100%; width:0%; background:linear-gradient(90deg, #ffda79, #f0932b); transition:width 0.2s linear;';
        bar.appendChild(inner);
        wrap.appendChild(label);
        wrap.appendChild(bar);
        activeSearchesEl.appendChild(wrap);
        ensureActiveHeaderVisible();
        const start = Date.now();
        const intervalId = setInterval(() => {
            const elapsed = Date.now() - start;
            const pct = Math.min(100, (elapsed/SEARCH_MAX_MS)*100);
            inner.style.width = pct + '%';
            const remain = Math.max(0, Math.ceil((SEARCH_MAX_MS - elapsed)/1000));
            const timeEl = label.querySelector('.time');
            if (timeEl) timeEl.textContent = `${remain}s`;
            if (elapsed >= SEARCH_MAX_MS) {
                // Mark as timed out visually but keep it until we get results or completion
                inner.style.background = 'linear-gradient(90deg, #ff6b6b, #c44569)';
                clearInterval(intervalId);
            }
        }, 200);
        activeTimers.set(key, { start, maxMs: SEARCH_MAX_MS, intervalId, barInner: inner, label, wrap });
    }

    function stopSearchTimer(iteration, term, status = 'done') {
        const key = `${iteration}|${term}`;
        const t = activeTimers.get(key);
        if (!t) return;
        if (t.intervalId) clearInterval(t.intervalId);
        // Update color based on status
        if (status === 'done') {
            t.barInner.style.width = '100%';
            t.barInner.style.background = 'linear-gradient(90deg, #2ecc71, #27ae60)';
        } else if (status === 'stopped') {
            t.barInner.style.background = 'linear-gradient(90deg, #6c757d, #495057)';
        } else if (status === 'error') {
            t.barInner.style.background = 'linear-gradient(90deg, #ff6b6b, #c44569)';
        }
        // Remove after short delay to keep feedback visible
        setTimeout(() => {
            if (t.wrap && t.wrap.parentElement) t.wrap.parentElement.removeChild(t.wrap);
            activeTimers.delete(key);
            ensureActiveHeaderVisible();
        }, 800);
    }

    function stopAllTimers(status = 'stopped') {
        for (const key of Array.from(activeTimers.keys())) {
            const [iter, term] = key.split('|');
            stopSearchTimer(iter, term, status);
        }
    }

    // Wire Stop button from form
    if (formStopBtn) {
        formStopBtn.addEventListener('click', () => {
            try { controller && controller.abort(); } catch {}
            formStopBtn.disabled = true;
            formStopBtn.textContent = 'Stopping...';
            statusElement.textContent = '⏹️ Stopping — no further requests will be made.';
            stopAllTimers('stopped');
            // Also stop any continuation countdown and reset UI
            hideContinuationUI();
        });
    }
    
    function renderResultsSection(title, results, digest, meta) {
        const details = document.createElement('details');
        details.className = 'search-results-section';
        details.open = false;
        const summary = document.createElement('summary');
        summary.innerHTML = `<strong>${title}</strong> (${results.length} total)`;
        details.appendChild(summary);
        
        // Sub-question heading and keywords badges
        if (meta && (meta.subQuestion || (Array.isArray(meta.keywords) && meta.keywords.length))) {
            const metaBox = document.createElement('div');
            metaBox.style.cssText = 'margin:10px 12px; padding:10px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:6px;';
            if (meta.subQuestion) {
                const h = document.createElement('div');
                h.style.cssText = 'font-weight:600; color:#343a40; margin-bottom:6px;';
                h.textContent = `Sub-question: ${meta.subQuestion}`;
                metaBox.appendChild(h);
            }
            if (Array.isArray(meta.keywords) && meta.keywords.length) {
                const kwWrap = document.createElement('div');
                kwWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px;';
                meta.keywords.forEach(k => {
                    const badge = document.createElement('span');
                    badge.style.cssText = 'background:#e9f5ff; color:#0b6aa2; border:1px solid #b6e0fe; padding:2px 8px; border-radius:12px; font-size:0.85em;';
                    badge.textContent = k;
                    kwWrap.appendChild(badge);
                });
                metaBox.appendChild(kwWrap);
            }
            details.appendChild(metaBox);
        }
        
        // If we have a per-search digest summary, render it prominently at the top of this section
        if (digest && (digest.summary || (Array.isArray(digest.links) && digest.links.length))) {
            const digestBox = document.createElement('div');
            digestBox.style.cssText = 'margin:10px 12px; padding:10px; background:#fff; border-left:4px solid #007bff; border:1px solid #e9ecef; border-radius:6px;';
            if (digest.summary) {
                const p = document.createElement('div');
                p.style.cssText = 'color:#212529; line-height:1.5;';
                p.textContent = digest.summary;
                digestBox.appendChild(p);
            }
            if (Array.isArray(digest.links) && digest.links.length) {
                const ul = document.createElement('ul');
                ul.style.cssText = 'margin-top:6px;';
                digest.links.forEach(l => {
                    const li = document.createElement('li');
                    li.innerHTML = `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.title || l.url}</a>${l.snippet ? ` — <small>${l.snippet}</small>` : ''}`;
                    ul.appendChild(li);
                });
                digestBox.appendChild(ul);
            }
            details.appendChild(digestBox);
        }
        
        const wrap = document.createElement('div');
        wrap.className = 'search-results';
        results.slice(0, 20).forEach(r => {
            const item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = `
                <h4><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title || r.url}</a></h4>
                <p class="result-description">${r.description || 'No description available'}</p>
                <p class="result-url"><small>${r.url}</small></p>
            `;
            wrap.appendChild(item);
        });
        if (results.length > 20) {
            const more = document.createElement('p');
            more.innerHTML = `<em>... and ${results.length - 20} more results</em>`;
            wrap.appendChild(more);
        }
        details.appendChild(wrap);
        return details;
    }
    
    function updateLiveSummary(searches, total) {
        metadataElement.style.display = 'block';
        const iters = [...new Set((searches || []).map(s => s.iteration))];
        metadataContent.innerHTML = `
            <div><strong>Total results so far:</strong> ${total || 0}</div>
            <div><strong>Searches performed:</strong> ${(searches || []).length} across ${iters.length} iteration(s)</div>
        `;
        
        // Update list of searches with counts; include placeholder for per-search LLM summaries when available
        searchSummaryList.innerHTML = '';
        (searches || []).forEach(s => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>Iteration ${s.iteration}</strong>: "${s.query}" — ${s.resultsCount} result(s)`;
            
            // Sub-question heading inline
            if (s.subQuestion) {
                const sub = document.createElement('div');
                sub.style.cssText = 'margin-top:2px; color:#495057; font-size:0.9em;';
                sub.textContent = `Sub-question: ${s.subQuestion}`;
                li.appendChild(sub);
            }
            
            if (Array.isArray(s.keywords) && s.keywords.length) {
                const kw = document.createElement('div');
                kw.style.cssText = 'margin-top:4px; display:flex; flex-wrap:wrap; gap:6px;';
                s.keywords.forEach(k => {
                    const badge = document.createElement('span');
                    badge.style.cssText = 'background:#eef7ee; color:#226633; border:1px solid #cde7ce; padding:2px 8px; border-radius:12px; font-size:0.85em;';
                    badge.textContent = k;
                    kw.appendChild(badge);
                });
                li.appendChild(kw);
            }
            
            // Show per-search digest if available (from digestMap or inline summary)
            const key = `${s.iteration}|${s.query}`;
            const digest = digestMap.get(key) || (s.summary ? { summary: s.summary, links: s.links || [] } : null);
            if (digest && digest.summary) {
                const p = document.createElement('div');
                p.style.cssText = 'margin-top:4px;color:#495057;';
                p.textContent = digest.summary;
                li.appendChild(p);
                if (Array.isArray(digest.links) && digest.links.length) {
                    const ul = document.createElement('ul');
                    ul.style.marginTop = '4px';
                    digest.links.forEach(l => {
                        const li2 = document.createElement('li');
                        li2.innerHTML = `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.title || l.url}</a>${l.snippet ? ` — <small>${l.snippet}</small>` : ''}`;
                        ul.appendChild(li2);
                    });
                    li.appendChild(ul);
                }
            }
            searchSummaryList.appendChild(li);
        });
    }

    function updateFullResultsTree() {
        // Build a closed-by-default tree grouped by iteration -> query -> results
        fullResultsTree.innerHTML = '';
        const top = document.createElement('details');
        top.open = false;
        top.className = 'search-results-section';
        const topSummary = document.createElement('summary');
        // Count total results
        let total = 0;
        Object.values(resultsState.byIteration).forEach(iter => {
            Object.values(iter).forEach(arr => total += arr.length);
        });
        topSummary.innerHTML = `<strong>Full search results</strong> (${total} total)`;
        top.appendChild(topSummary);

        const container = document.createElement('div');
        container.style.marginTop = '8px';

        Object.keys(resultsState.byIteration).sort((a,b)=>Number(a)-Number(b)).forEach(iter => {
            const iterDetails = document.createElement('details');
            iterDetails.open = false;
            const iterSummary = document.createElement('summary');
            // Count iteration total
            let iterTotal = 0;
            Object.values(resultsState.byIteration[iter]).forEach(arr => iterTotal += arr.length);
            iterSummary.innerHTML = `<strong>Iteration ${iter}</strong> (${iterTotal} results)`;
            iterDetails.appendChild(iterSummary);

            Object.keys(resultsState.byIteration[iter]).forEach(term => {
                const termResults = resultsState.byIteration[iter][term];
                // Pull digest and metadata for this iteration/term if available
                const key = `${iter}|${term}`;
                const digest = digestMap.get(key) || null;
                const meta = metaMap.get(key) || null;
                const termDetails = renderResultsSection(`"${term}"`, termResults, digest, meta);
                iterDetails.appendChild(termDetails);
            });

            container.appendChild(iterDetails);
        });

        top.appendChild(container);
        fullResultsTree.appendChild(top);
    }
    
    try {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                statusElement.textContent = 'Stream completed';
                break;
            }
            
            // Decode and process chunk
            const chunk = decoder.decode(value, { stream: true });
            console.log('📦 Received chunk:', chunk.substring(0, 100) + (chunk.length > 100 ? '...' : ''));
            buffer += chunk;
            
            // Process complete events (separated by double newlines)
            const events = buffer.split('\n\n');
            buffer = events.pop(); // Keep incomplete event in buffer
            
            console.log('🔍 Processing', events.length, 'complete events');
            
            for (const event of events) {
                if (!event.trim()) continue;
                
                try {
                    // Parse Server-Sent Events format
                    const lines = event.trim().split('\n');
                    let eventType = 'message';
                    let data = '';
                    
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.substring(7);
                        } else if (line.startsWith('data: ')) {
                            data = line.substring(6);
                        }
                    }
                    
                    if (!data) continue;
                    
                    let eventData;
                    try {
                        eventData = JSON.parse(data);
                    } catch (parseError) {
                        console.error('❌ Failed to parse event data:', data, parseError);
                        continue;
                    }
                    
                    // Log ALL events for debugging
                    // Log only tool-related and continuation events
                    if (eventType === 'tools' || eventType === 'tool_result' || eventType === 'tool_error' || 
                        eventType === 'quota_exceeded' || eventType === 'init' && eventData.continuation) {
                        console.log(`🔄 ${eventType}:`, eventData);
                    }
                    
                    // Log important LLM response events with more detail
                    if (['final_response', 'final_answer', 'complete', 'error'].includes(eventType)) {
                        console.log('🎯 LLM Event:', eventType, eventData);
                    }
                    
                    // Handle different event types
                    switch (eventType) {
                        case 'search_digest':
                            {
                                const { term, iteration, summary, links, subQuestion, keywords } = eventData;
                                console.log('📝 Processing search_digest:', {
                                    term,
                                    iteration,
                                    hasSummary: !!summary,
                                    summaryLength: summary ? summary.length : 0,
                                    hasLinks: Array.isArray(links),
                                    linksCount: Array.isArray(links) ? links.length : 0,
                                    subQuestion,
                                    keywords
                                });
                                
                                if (!summary || summary.includes('disabled')) {
                                    console.warn('⚠️ Summary appears to be disabled or missing:', summary);
                                }
                                
                                const key = `${iteration}|${term}`;
                                digestMap.set(key, { summary, links: Array.isArray(links) ? links : [] });
                                if (subQuestion || (Array.isArray(keywords) && keywords.length)) {
                                    metaMap.set(key, { subQuestion: subQuestion || null, keywords: Array.isArray(keywords) ? keywords : [] });
                                }
                                // Trigger a refresh of the Search Summary list (uses last known searches from metadata or previous event)
                                if (typeof window.__lastSearches !== 'undefined') {
                                    updateLiveSummary(window.__lastSearches, undefined);
                                }
                                // Also refresh the full results tree so digest appears in the expandable section
                                updateFullResultsTree();
                            }
                            break;
                            
                        case 'tools':
                            try {
                                console.log('🔧 Processing tools event:', eventData);
                                toolsPanel.style.display = 'block';
                                const { iteration, pending, calls } = eventData;
                                
                                // Log search tool calls specifically
                                if (Array.isArray(calls)) {
                                    const searchCalls = calls.filter(call => call.name === 'search_web');
                                    if (searchCalls.length > 0) {
                                        console.log('🔍 Search tool calls detected:', searchCalls.map(call => ({
                                            query: call.arguments?.query,
                                            generate_summary: call.arguments?.generate_summary,
                                            load_content: call.arguments?.load_content
                                        })));
                                    }
                                }
                                const box = document.createElement('div');
                                box.style.cssText = 'padding:8px; border-left:3px solid #6c757d; background:#fff; margin:6px 0; border-radius:4px;';
                                const header = document.createElement('div');
                                header.innerHTML = `<strong>Iteration ${iteration}</strong> • ${pending} pending call(s)`;
                                box.appendChild(header);
                                if (Array.isArray(calls)) {
                                    // Add each tool call to the expandable tools section
                                    calls.forEach(call => {
                                        if (typeof addToolExecution === 'function') {
                                            addToolExecution(call);
                                        }
                                    });
                                    
                                    const list = document.createElement('ul');
                                    list.style.margin = '6px 0 0 16px';
                                    calls.forEach(c => {
                                        const li = document.createElement('li');
                                        li.textContent = `${c.name} ${c.call_id ? '(' + c.call_id + ')' : ''}`;
                                        list.appendChild(li);
                                    });
                                    box.appendChild(list);
                                }
                                toolsLog.appendChild(box);
                            } catch {}
                            break;
                            
                        case 'tool_result':
                            try {
                                toolsPanel.style.display = 'block';
                                const { iteration, call_id, name, args, output } = eventData;
                                
                                // Capture tool result for continuation
                                continuationState.workState.completedToolCalls.push({
                                    iteration,
                                    call_id,
                                    name,
                                    args,
                                    output,
                                    timestamp: new Date().toISOString()
                                });
                                
                                // Update current iteration tracker
                                continuationState.workState.currentIteration = Math.max(
                                    continuationState.workState.currentIteration, 
                                    iteration || 0
                                );
                                
                                // Add result to the expandable tools section
                                if (call_id && typeof addToolResult === 'function') {
                                    addToolResult(call_id, output);
                                }
                                
                                const item = document.createElement('div');
                                item.style.cssText = 'padding:8px; border-left:3px solid #28a745; background:#fff; margin:6px 0; border-radius:4px;';
                                const title = document.createElement('div');
                                title.innerHTML = `<strong>${name}</strong> ${call_id ? '(' + call_id + ')' : ''} • iteration ${iteration}`;
                                const argsPre = document.createElement('pre');
                                argsPre.textContent = `args: ${JSON.stringify(args)}`;
                                const outPre = document.createElement('pre');
                                outPre.textContent = `output: ${output}`;
                                item.appendChild(title);
                                item.appendChild(argsPre);
                                item.appendChild(outPre);
                                toolsLog.appendChild(item);
                            } catch {}
                            break;
                            
                        case 'log':
                            statusElement.textContent = eventData.message || 'Processing...';
                            break;
                            
                        case 'init':
                            statusElement.textContent = `🔍 Starting search for: "${eventData.query}"`;
                            if (eventData.allowEnvFallback) {
                                const note = document.createElement('div');
                                note.style.cssText = 'margin-top:6px;color:#155724;font-size:0.9em;';
                                note.textContent = 'Note: Using server-managed API keys (authorized user).';
                                statusElement.parentElement.appendChild(note);
                            }
                            
                            // Capture initial setup data for tracking
                            if (eventData.continuation) {
                                console.log('📋 Continuation init received');
                                currentPersona = eventData.persona || currentPersona;
                                currentQuestions = eventData.questions || currentQuestions;
                                currentSetupData = {
                                    response_length: eventData.response_length || currentSetupData.response_length,
                                    reasoning_level: eventData.reasoning_level || currentSetupData.reasoning_level,
                                    temperature: eventData.temperature || currentSetupData.temperature
                                };
                            } else {
                                // Fresh start - reset all tracking
                                toolCallCycles = [];
                                llmCalls = [];
                                totalCost = 0;
                                totalTokens = 0;
                                currentPersona = '';
                                currentQuestions = [];
                                currentSetupData = {};
                            }
                            break;
                            
                        case 'setup_complete':
                            {
                                // Display persona information
                                const personaContainer = document.getElementById('persona-container');
                                const personaText = document.getElementById('persona-text');
                                if (personaContainer && personaText && eventData.persona) {
                                    personaText.textContent = eventData.persona;
                                    personaContainer.style.display = 'block';
                                    // Show the layout container
                                    const layoutContainer = document.querySelector('.persona-questions-layout');
                                    if (layoutContainer) {
                                        layoutContainer.classList.remove('hidden');
                                    }
                                }
                                
                                // Display research questions
                                const researchContainer = document.getElementById('research-questions-container');
                                const researchText = document.getElementById('research-questions-text');
                                if (researchContainer && researchText && eventData.questions) {
                                    let questionsHtml = `<div style="margin-bottom: 8px;"><strong>Research Questions:</strong></div>`;
                                    questionsHtml += '<ul style="margin: 0; padding-left: 20px;">';
                                    eventData.questions.forEach((q, i) => {
                                        questionsHtml += `<li style="margin-bottom: 4px;">${q}</li>`;
                                    });
                                    questionsHtml += '</ul>';
                                    questionsHtml += `<div style="margin-top: 8px; font-size: 0.85rem; opacity: 0.9;"><em>Response Length: ${eventData.response_length} | Reasoning: ${eventData.reasoning_level}</em></div>`;
                                    researchText.innerHTML = questionsHtml;
                                    researchContainer.style.display = 'block';
                                    // Show the layout container
                                    const layoutContainer = document.querySelector('.persona-questions-layout');
                                    if (layoutContainer) {
                                        layoutContainer.classList.remove('hidden');
                                    }
                                }
                                
                                // Save setup data for continuation
                                continuationState.workState.setupData = {
                                    persona: eventData.persona,
                                    questions: eventData.questions,
                                    response_length: eventData.response_length,
                                    reasoning_level: eventData.reasoning_level,
                                    temperature: eventData.temperature
                                };
                                
                                // Display cost information if available
                                if (eventData.cost && eventData.cost.totalCost) {
                                    showToast(`Setup query cost: $${eventData.cost.totalCost.toFixed(6)}`, 'info', 3000);
                                }
                                
                                statusElement.textContent = `✅ Setup complete! Starting research with ${eventData.questions.length} questions...`;
                                
                                // Update global tracking variables
                                currentPersona = eventData.persona || currentPersona;
                                currentQuestions = eventData.questions || currentQuestions;
                                currentSetupData = {
                                    response_length: eventData.response_length,
                                    reasoning_level: eventData.reasoning_level,
                                    temperature: eventData.temperature
                                };
                            }
                            break;
                            
                        case 'tools':
                            console.log('🔧 TOOLS EVENT:', {
                                iteration: eventData.iteration,
                                pending: eventData.pending,
                                calls: eventData.calls,
                                currentCycles: toolCallCycles.length,
                                totalTracked: toolCallCycles.reduce((sum, cycle) => sum + cycle.length, 0)
                            });
                            
                            // Track tool calls for current cycle - ensure we have enough cycles
                            while (toolCallCycles.length < eventData.iteration) {
                                toolCallCycles.push([]);
                            }
                            
                            // Add pending tool calls to current cycle
                            const pendingToolCalls = eventData.calls.map(call => ({
                                request: {
                                    id: call.call_id || call.id,
                                    type: 'function',
                                    function: {
                                        name: call.name,
                                        arguments: JSON.stringify(call.args || {})
                                    }
                                },
                                response: null, // Will be filled when tool_result events arrive
                                duration: 0,
                                tokenUse: 0,
                                cost: 0,
                                cycle: eventData.iteration,
                                completed: false,
                                timestamp: new Date().toISOString()
                            }));
                            
                            toolCallCycles[eventData.iteration - 1] = pendingToolCalls;
                            
                            // Update UI tracking display
                            updateToolCallsDisplay();
                            break;

                        case 'tool_result':
                            console.log('🔧 TOOL RESULT:', {
                                iteration: eventData.iteration,
                                call_id: eventData.call_id,
                                name: eventData.name,
                                hasOutput: !!eventData.output,
                                currentCycles: toolCallCycles.length
                            });
                            
                            // Update tool call with response
                            const cycleIndex = eventData.iteration - 1;
                            if (toolCallCycles[cycleIndex]) {
                                const toolCall = toolCallCycles[cycleIndex].find(tc => 
                                    tc.request.id === eventData.call_id
                                );
                                if (toolCall) {
                                    toolCall.response = eventData.output;
                                    toolCall.duration = eventData.duration || 0;
                                    toolCall.tokenUse = eventData.tokenUse || 0;
                                    toolCall.cost = eventData.cost || 0;
                                    toolCall.completed = true;
                                    
                                    // Update totals
                                    totalTokens += toolCall.tokenUse;
                                    totalCost += toolCall.cost;
                                }
                            }
                            
                            updateToolCallsDisplay();
                            updateCostDisplay();
                            break;

                        case 'tool_error':
                            console.log('❌ Tool error received:', eventData);
                            
                            // Update tool call with error
                            const errorCycleIndex = eventData.iteration - 1;
                            if (toolCallCycles[errorCycleIndex]) {
                                const errorToolCall = toolCallCycles[errorCycleIndex].find(tc => 
                                    tc.request.id === eventData.call_id
                                );
                                if (errorToolCall) {
                                    errorToolCall.response = { error: eventData.error };
                                    errorToolCall.duration = eventData.duration || 0;
                                    errorToolCall.completed = true; // Completed with error
                                }
                            }
                            
                            updateToolCallsDisplay();
                            break;

                        case 'llm_call':
                            console.log('🤖 LLM call event received:', eventData);
                            
                            // Track LLM calls
                            const llmCallData = {
                                type: eventData.type,
                                model: eventData.model,
                                iteration: eventData.iteration,
                                persona: eventData.persona,
                                questions: eventData.questions,
                                timestamp: eventData.timestamp,
                                request: {
                                    model: eventData.model,
                                    type: eventData.type
                                },
                                response: null,
                                duration: 0,
                                tokenUse: 0,
                                cost: 0
                            };
                            
                            llmCalls.push(llmCallData);
                            updateLLMCallsDisplay();
                            break;

                        case 'llm_response':
                            console.log('🤖 LLM response received:', eventData);
                            
                            // Update most recent LLM call with response data
                            if (llmCalls.length > 0) {
                                const lastCall = llmCalls[llmCalls.length - 1];
                                lastCall.response = {
                                    content: eventData.content,
                                    tool_calls: eventData.tool_calls || [],
                                    usage: eventData.usage,
                                    cost: eventData.cost
                                };
                                lastCall.duration = eventData.duration || 0;
                                lastCall.tokenUse = eventData.usage?.total_tokens || 0;
                                lastCall.cost = eventData.cost || 0;
                                
                                // Update totals
                                totalTokens += lastCall.tokenUse;
                                totalCost += lastCall.cost;
                            }
                            
                            updateLLMCallsDisplay();
                            updateCostDisplay();
                            break;
                            
                        case 'llm_call':
                            {
                                // Display LLM call information
                                const callType = eventData.type || 'unknown';
                                if (callType === 'setup_query') {
                                    statusElement.textContent = '🧠 Analyzing query to determine research approach...';
                                } else if (callType === 'query_cycle') {
                                    statusElement.textContent = `🔬 Conducting research with persona: ${eventData.persona ? eventData.persona.substring(0, 50) + '...' : 'Expert researcher'}`;
                                }
                            }
                            break;
                            
                        case 'llm_response':
                            {
                                // Handle streaming LLM response
                                const responseType = eventData.type || 'unknown';
                                if (responseType === 'setup_response') {
                                    statusElement.textContent = '📝 Processing setup response...';
                                } else if (responseType === 'research_response') {
                                    statusElement.textContent = '📖 Generating research response...';
                                } else if (responseType === 'final_response') {
                                    // Final response - update main display
                                    if (eventData.content) {
                                        if (typeof marked !== 'undefined') {
                                            responseElement.innerHTML = marked.parse(eventData.content);
                                        } else {
                                            // Fallback: simple text with line breaks
                                            responseElement.innerHTML = eventData.content.replace(/\n/g, '<br>');
                                        }
                                        statusElement.textContent = '✅ Research completed!';
                                        
                                        // Display cost summary if available
                                        if (eventData.cost && eventData.cost.totalCost) {
                                            const costContainer = document.getElementById('cost-container');
                                            const costText = document.getElementById('cost-text');
                                            if (costContainer && costText) {
                                                const cost = eventData.cost;
                                                let costHtml = `<div style="margin-bottom: 8px;"><strong>LLM Costs:</strong></div>`;
                                                costHtml += `<div>Model: ${cost.model} (${cost.provider})</div>`;
                                                costHtml += `<div>Input tokens: ${cost.inputTokens.toLocaleString()} ($${cost.inputCost.toFixed(6)})</div>`;
                                                costHtml += `<div>Output tokens: ${cost.outputTokens.toLocaleString()} ($${cost.outputCost.toFixed(6)})</div>`;
                                                costHtml += `<div style="font-weight: bold; margin-top: 8px;">Total: $${cost.totalCost.toFixed(6)}</div>`;
                                                costText.innerHTML = costHtml;
                                                costContainer.style.display = 'block';
                                            }
                                        }
                                    }
                                }
                            }
                            break;
                            
                        case 'tool_calls_planned':
                            {
                                // Display planned tool calls
                                if (eventData.tools && Array.isArray(eventData.tools)) {
                                    toolsPanel.style.display = 'block';
                                    const box = document.createElement('div');
                                    box.style.cssText = 'padding:8px; border-left:3px solid #6c757d; background:#fff; margin:6px 0; border-radius:4px;';
                                    const header = document.createElement('div');
                                    header.innerHTML = `<strong>Planned Tool Calls</strong> • ${eventData.tools.length} call(s)`;
                                    box.appendChild(header);
                                    
                                    const list = document.createElement('ul');
                                    list.style.margin = '6px 0 0 16px';
                                    eventData.tools.forEach(tool => {
                                        const li = document.createElement('li');
                                        li.textContent = `${tool.name || tool.function?.name || 'unknown'} ${tool.id ? '(' + tool.id + ')' : ''}`;
                                        list.appendChild(li);
                                    });
                                    box.appendChild(list);
                                    toolsLog.appendChild(box);
                                    
                                    statusElement.textContent = `🔧 Executing ${eventData.tools.length} tool call(s)...`;
                                }
                            }
                            break;
                            
                        case 'tool_call_result':
                            {
                                // Display tool call result
                                const { tool, result } = eventData;
                                if (tool && result) {
                                    toolsPanel.style.display = 'block';
                                    
                                    // Capture tool result for continuation
                                    continuationState.workState.completedToolCalls.push({
                                        tool: tool.name || tool.function?.name || 'unknown',
                                        args: tool.arguments || tool.function?.arguments || {},
                                        result: result,
                                        timestamp: new Date().toISOString()
                                    });
                                    
                                    const item = document.createElement('div');
                                    item.style.cssText = 'padding:8px; border-left:3px solid #28a745; background:#fff; margin:6px 0; border-radius:4px;';
                                    const title = document.createElement('div');
                                    title.innerHTML = `<strong>${tool.name || tool.function?.name || 'unknown'}</strong> completed`;
                                    const resultPre = document.createElement('pre');
                                    resultPre.style.cssText = 'white-space: pre-wrap; max-height: 200px; overflow-y: auto; background: #f8f9fa; padding: 8px; border-radius: 4px; margin-top: 4px;';
                                    resultPre.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                                    item.appendChild(title);
                                    item.appendChild(resultPre);
                                    toolsLog.appendChild(item);
                                }
                            }
                            break;
                            
                        case 'pause':
                            {
                                // Handle pause event (for rate limits)
                                if (eventData.reason === 'rate_limit') {
                                    const continuationData = eventData.continuationData;
                                    if (continuationData) {
                                        // Save continuation data for retry
                                        continuationState.savedContext = {
                                            query: continuationData.query,
                                            setupData: continuationData.setupData,
                                            model: continuationData.model,
                                            workState: continuationData.workState
                                        };
                                        continuationState.savedFormData = {
                                            query: continuationData.query,
                                            model: continuationData.model
                                        };
                                        continuationState.isActive = true;
                                        
                                        statusElement.innerHTML = `
                                            <div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0;">
                                                ⏸️ Paused due to rate limit. You can continue the request when ready.
                                                <div style="margin-top: 8px;">
                                                    <button onclick="continueRequest()" style="background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
                                                        Continue Request
                                                    </button>
                                                </div>
                                            </div>
                                        `;
                                        
                                        showToast(`Request paused due to rate limit: ${eventData.error}`, 'warning', 8000);
                                    }
                                }
                            }
                            break;
                            
                        case 'persona':
                            {
                                const personaContainer = document.getElementById('persona-container');
                                const personaText = document.getElementById('persona-text');
                                if (personaContainer && personaText && eventData.persona) {
                                    personaText.textContent = eventData.persona;
                                    personaContainer.style.display = 'block';
                                    // Show the layout container
                                    const layoutContainer = document.querySelector('.persona-questions-layout');
                                    if (layoutContainer) {
                                        layoutContainer.classList.remove('hidden');
                                    }
                                }
                            }
                            break;
                            
                        case 'research_questions':
                            {
                                const researchContainer = document.getElementById('research-questions-container');
                                const researchText = document.getElementById('research-questions-text');
                                if (researchContainer && researchText && eventData.questions) {
                                    let questionsHtml = `<div style="margin-bottom: 8px;"><strong>Questions to research (${eventData.questions_needed || eventData.questions.length}):</strong></div>`;
                                    questionsHtml += '<ul style="margin: 0; padding-left: 20px;">';
                                    eventData.questions.forEach((q, i) => {
                                        questionsHtml += `<li style="margin-bottom: 4px;">${q}</li>`;
                                    });
                                    questionsHtml += '</ul>';
                                    // Show the layout container
                                    const layoutContainer = document.querySelector('.persona-questions-layout');
                                    if (layoutContainer) {
                                        layoutContainer.classList.remove('hidden');
                                    }
                                    if (eventData.reasoning) {
                                        questionsHtml += `<div style="margin-top: 8px; font-size: 0.85rem; opacity: 0.9;"><em>${eventData.reasoning}</em></div>`;
                                    }
                                    researchText.innerHTML = questionsHtml;
                                    researchContainer.style.display = 'block';
                                }
                            }
                            break;
                            
                        case 'decision':
                            {
                                const needsSearch = (eventData.decision && (eventData.decision.needsSearch ?? eventData.decision.requiresSearch)) || false;
                                const searchStrategy = needsSearch ? 'Multi-search required' : 'Direct response';
                                stepsElement.innerHTML += `
                                    <div style="margin: 10px 0; padding: 15px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                        <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                            <span>🎯</span> Search Strategy: ${searchStrategy}
                                        </div>
                                        ${eventData.decision && eventData.decision.searchTerms ? `<div style="opacity: 0.9;"><strong>Search Terms:</strong> ${eventData.decision.searchTerms.join(', ')}</div>` : ''}
                                    </div>
                                `;
                            }
                            break;
                            
                        case 'step':
                            if (eventData.type === 'search_iteration') {
                                stepsElement.innerHTML += `
                                    <div style="margin: 10px 0; padding: 15px; background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                        <div style="font-weight: bold; display: flex; align-items: center; gap: 8px;">
                                            <span>🔄</span> Iteration ${eventData.iteration}: ${eventData.message}
                                        </div>
                                    </div>
                                `;
                            } else {
                                statusElement.textContent = eventData.message;
                            }
                            break;
                            
                        case 'search':
                            statusElement.textContent = `🔍 Searching (${eventData.searchIndex}/${eventData.totalSearches}): "${eventData.term}"`;
                            // Start a countdown bar for this active search
                            startSearchTimer(eventData.iteration, eventData.term, eventData.searchIndex, eventData.totalSearches);
                            break;
                            
                        case 'search_results':
                            {
                                const { term, iteration, resultsCount, results, cumulativeResultsCount, allResults, searches, subQuestion, keywords } = eventData;
                                console.log('🔍 Processing search_results:', {
                                    term,
                                    iteration,
                                    resultsCount,
                                    hasResults: Array.isArray(results),
                                    resultsLength: Array.isArray(results) ? results.length : 'not array',
                                    cumulativeResultsCount,
                                    hasSearches: Array.isArray(searches),
                                    searchesLength: Array.isArray(searches) ? searches.length : 'not array',
                                    subQuestion,
                                    keywords
                                });
                                
                                // Check for empty results warning
                                if (resultsCount === 0) {
                                    console.warn('⚠️ Empty search results received for term:', term);
                                }
                                
                                // Log the actual results structure
                                if (Array.isArray(results) && results.length > 0) {
                                    console.log('📊 First search result structure:', results[0]);
                                } else {
                                    console.warn('⚠️ No results array or empty results for:', term);
                                }
                                
                                // Ignore initial empty placeholder snapshot to avoid a "null" entry
                                if (term === null || (resultsCount === 0 && iteration === 0)) {
                                    console.log('🚫 Ignoring empty placeholder snapshot');
                                    updateLiveSummary(searches || [], cumulativeResultsCount || 0);
                                    break;
                                }

                                stepsElement.innerHTML += `
                                    <div style="margin: 5px 0; padding: 12px; background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); border-radius: 6px; box-shadow: 0 1px 5px rgba(0,0,0,0.1);">
                                        <div style="display: flex; align-items: center; gap: 8px; font-weight: 500;">
                                            <span style="color: #28a745;">✅</span>
                                            <span>"${term}"</span>
                                            <span style="background: rgba(255,255,255,0.8); padding: 2px 8px; border-radius: 12px; font-size: 0.9em; color: #333;">
                                                ${resultsCount} results (total ${cumulativeResultsCount || 0})
                                            </span>
                                        </div>
                                    </div>
                                `;
                                statusElement.textContent = `📥 Received ${resultsCount} result(s) for "${term}" (iteration ${iteration}) — total ${cumulativeResultsCount || 0}`;

                                // Update structured state for the full results tree
                                if (!resultsState.byIteration[iteration]) resultsState.byIteration[iteration] = {};
                                resultsState.byIteration[iteration][term] = Array.isArray(results) ? results : [];
                                // Store metadata for this term
                                const metaKey = `${iteration}|${term}`;
                                metaMap.set(metaKey, { subQuestion: subQuestion || null, keywords: Array.isArray(keywords) ? keywords : [] });
                                
                                // Capture search results for continuation
                                continuationState.workState.searchResults.push({
                                    term,
                                    iteration,
                                    resultsCount,
                                    results: Array.isArray(results) ? results : [],
                                    cumulativeResultsCount,
                                    subQuestion,
                                    keywords: Array.isArray(keywords) ? keywords : [],
                                    timestamp: new Date().toISOString()
                                });
                                
                                // Update current iteration tracker
                                continuationState.workState.currentIteration = Math.max(
                                    continuationState.workState.currentIteration, 
                                    iteration || 0
                                );

                                // Mark this search timer as done
                                stopSearchTimer(iteration, term, 'done');

                                // Update summary and full tree
                                // Keep last searches for digest refresh convenience
                                window.__lastSearches = searches || [];
                                updateLiveSummary(window.__lastSearches, cumulativeResultsCount || 0);
                                updateFullResultsTree();
                            }
                            break;
                            
                        case 'continuation':
                            const continueGradient = eventData.shouldContinue ? 
                                'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' : 
                                'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)';
                            stepsElement.innerHTML += `
                                <div style="margin: 10px 0; padding: 15px; background: ${continueGradient}; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                    <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                        <span>${eventData.shouldContinue ? '🔄' : '✋'}</span>
                                        ${eventData.shouldContinue ? 'Continuing:' : 'Stopping:'}
                                    </div>
                                    <div style="opacity: 0.8;">${eventData.reasoning}</div>
                                </div>
                            `;
                            break;
                            
                        case 'final_response':
                            statusElement.textContent = '✅ Search completed! Displaying final response...';
                            const finalResponseStopBtn = document.getElementById('stop-btn');
                            if (finalResponseStopBtn) { finalResponseStopBtn.disabled = true; finalResponseStopBtn.textContent = 'Stop'; }
                            stopAllTimers('done');
                            hideContinuationUI();
                            answerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7;">${eventData.response}</div>`;
                            enableResponseActions();
                            // Keep metadata visible and updated
                            metadataContent.innerHTML = `
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                    <div style="background: white; padding: 12px; border-radius: 6px; border-left: 4px solid #007bff;">
                                        <div style="font-weight: bold; color: #007bff; margin-bottom: 4px;">Total Results</div>
                                        <div style="font-size: 1.2em; color: #333;">${eventData.totalResults}</div>
                                    </div>
                                    <div style="background: white; padding: 12px; border-radius: 6px; border-left: 4px solid #28a745;">
                                        <div style="font-weight: bold; color: #28a745; margin-bottom: 4px;">Search Iterations</div>
                                        <div style="font-size: 1.2em; color: #333;">${eventData.searchIterations}</div>
                                    </div>
                                    <div style="background: white; padding: 12px; border-radius: 6px; border-left: 4px solid #ffc107;">
                                        <div style="font-weight: bold; color: #ffc107; margin-bottom: 4px;">Completed</div>
                                        <div style="font-size: 1.1em; color: #333;">${new Date(eventData.timestamp).toLocaleTimeString()}</div>
                                    </div>
                                </div>
                            `;
                            metadataElement.style.display = 'block';
                            break;
                            
                        case 'final_answer':
                            statusElement.textContent = '✅ Search completed! Displaying final answer...';
                            const finalAnswerStopBtn = document.getElementById('stop-btn');
                            if (finalAnswerStopBtn) { finalAnswerStopBtn.disabled = true; finalAnswerStopBtn.textContent = 'Stop'; }
                            stopAllTimers('done');
                            hideContinuationUI();
                            answerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7;">${eventData.content}</div>`;
                            enableResponseActions();
                            responseContainer.className = 'response-container response-success';
                            break;
                            
                        case 'complete':
                            statusElement.textContent = `✅ Complete! Total time: ${Math.round(eventData.executionTime)}ms`;
                            responseContainer.className = 'response-container response-success';
                            const stopBtn = document.getElementById('stop-btn');
                            if (stopBtn) { stopBtn.disabled = true; stopBtn.textContent = 'Stop'; }
                            stopAllTimers('done');
                            hideContinuationUI();
                            // Ensure the full results tree reflects the final snapshot
                            if (Array.isArray(eventData.allResults) && eventData.allResults.length) {
                                // If we never received structured iterations, fall back to a flat section
                                const hasStructure = Object.keys(resultsState.byIteration).length > 0;
                                if (!hasStructure) {
                                    resultsState.byIteration[1] = { 'All results': eventData.allResults };
                                }
                                updateFullResultsTree();
                            }
                            // Reset model to fastest/cheapest option for next request
                            resetModelToFastest();
                            break;
                        
                        case 'error':
                            console.error('LLM Error:', eventData.error);
                            
                            // Check if this is a quota/rate limit error
                            if (isQuotaLimitError(eventData.error)) {
                                // Get existing response content for continuation
                                const existingResponse = answerElement ? answerElement.innerHTML : '';
                                
                                // Handle quota error with continuation
                                handleQuotaError(eventData.error, window.lastFormData, existingResponse);
                                stopAllTimers('quota_limit');
                            } else {
                                // Handle regular errors
                                statusElement.textContent = `❌ Error: ${eventData.error}`;
                                responseContainer.className = 'response-container response-error';
                                const errorStopBtn = document.getElementById('stop-btn');
                                if (errorStopBtn) { errorStopBtn.disabled = true; errorStopBtn.textContent = 'Error'; }
                                stopAllTimers('error');
                                hideContinuationUI(); // Ensure continuation UI is hidden for regular errors
                                stepsElement.innerHTML += `
                                    <div style="margin: 10px 0; padding: 15px; background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); border-radius: 8px; color: #721c24;">
                                        <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                            <span>❌</span> Error Occurred
                                        </div>
                                        <div>${eventData.error}</div>
                                    </div>
                                `;
                            }
                            break;
                            
                        case 'quota_exceeded':
                            console.log('📊 Quota exceeded event received:', eventData);
                            
                            // Get existing response content for continuation
                            const existingResponse = answerElement ? answerElement.innerHTML : '';
                            
                            // Use the waitTime from the event data if available, otherwise fallback to parsing from message
                            let waitTime = eventData.waitTime || 60;
                            if (eventData.error && typeof eventData.error === 'string') {
                                const parsedWait = parseWaitTimeFromMessage(eventData.error);
                                if (parsedWait && !isNaN(parsedWait) && parsedWait > 0) {
                                    waitTime = parsedWait;
                                }
                            }
                            
                            console.log(`🔄 Quota exceeded - wait time: ${waitTime}s`);
                            
                            // Create a formatted error message for the handler
                            const errorMessage = eventData.error || `Rate limit exceeded. Please wait ${waitTime} seconds before continuing.`;
                            
                            // Handle quota error with continuation using the waitTime
                            continuationState.remainingSeconds = waitTime;
                            handleQuotaError(errorMessage, window.lastFormData, existingResponse);
                            stopAllTimers('quota_limit');
                            
                            // Ensure button states are correct after quota handling
                            console.log('🔄 Quota exceeded - ensuring correct button states');
                            const formSubmitBtn = document.getElementById('submit-btn');
                            const quotaStopBtn = document.getElementById('stop-btn');
                            const formContinueBtn = document.getElementById('continue-btn');
                            
                            function enforceQuotaButtonStates() {
                                const submitBtn = document.getElementById('submit-btn');
                                const stopBtn = document.getElementById('stop-btn');
                                const continueBtn = document.getElementById('continue-btn');
                                
                                if (submitBtn) {
                                    submitBtn.style.display = 'none';
                                    console.log('🔄 Enforced: Hidden submit button for quota exceeded');
                                }
                                if (stopBtn) {
                                    stopBtn.style.display = 'inline-block';
                                    stopBtn.disabled = false;
                                    stopBtn.textContent = 'Stop';
                                    console.log('🔄 Enforced: Showed stop button for quota exceeded');
                                }
                                if (continueBtn) {
                                    continueBtn.style.display = 'inline-block';
                                    console.log('🔄 Enforced: Showed continue button for quota exceeded');
                                }
                            }
                            
                            // Immediately enforce button states
                            enforceQuotaButtonStates();
                            
                            // Re-enforce button states after a short delay to override any interference
                            setTimeout(enforceQuotaButtonStates, 100);
                            setTimeout(enforceQuotaButtonStates, 500);
                            break;
                            
                        case 'interrupt_state':
                            // Check multiple possible sources for the interrupt reason
                            let interruptReason = null;
                            
                            // Check different properties where the reason might be stored
                            if (eventData.reason) {
                                interruptReason = eventData.reason;
                            } else if (eventData.message) {
                                interruptReason = eventData.message;
                            } else if (eventData.error) {
                                interruptReason = eventData.error;
                            } else if (eventData.state && eventData.state.interruptReason) {
                                // The reason might be in the state object
                                if (Array.isArray(eventData.state.interruptReason)) {
                                    // Look for content in the array
                                    const reasonContent = eventData.state.interruptReason.find(item => item.content);
                                    interruptReason = reasonContent ? reasonContent.content : JSON.stringify(eventData.state.interruptReason);
                                } else {
                                    interruptReason = eventData.state.interruptReason;
                                }
                            }
                            
                            // For rate limits, we know from the log message, so let's also check that
                            // If no specific reason found, but we received this interrupt_state, assume it's rate limiting
                            if (!interruptReason) {
                                interruptReason = "API rate limit or quota reached";
                            }
                            
                            if (isQuotaLimitError(interruptReason)) {
                                // Get existing response content for continuation
                                const existingResponse = answerElement ? answerElement.innerHTML : '';
                                
                                // Handle quota error with continuation
                                handleQuotaError(interruptReason, window.lastFormData, existingResponse);
                                stopAllTimers('quota_limit');
                            } else {
                                // Handle as regular interruption
                                statusElement.textContent = `⏸️ Processing interrupted: ${interruptReason}`;
                                stepsElement.innerHTML += `
                                    <div style="margin: 10px 0; padding: 15px; background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%); border-radius: 8px; color: white;">
                                        <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                            <span>⏸️</span> Processing Interrupted
                                        </div>
                                        <div style="opacity: 0.9;">${interruptReason}</div>
                                    </div>
                                `;
                            }
                            break;
                            
                        default:
                            break;
                    }
                    
                } catch (parseError) {
                    console.error('Error parsing event:', parseError, event);
                }
            }
        }
        
    } catch (streamError) {
        console.error('Streaming error:', streamError);
        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) { stopBtn.disabled = true; stopBtn.textContent = 'Stopped'; }
        stopAllTimers('stopped');
        hideContinuationUI(); // Reset UI on streaming errors
        if (streamError.name === 'AbortError') {
            statusElement.textContent = '⏹️ Stopped by user. Partial results are shown above.';
            // Keep existing partial results visible without switching to error theme
            responseContainer.className = 'response-container';
        } else {
            statusElement.textContent = `❌ Streaming Error: ${streamError.message}`;
            responseContainer.className = 'response-container response-error';
        }
    }
}

// Action button functionality
function initializeActionButtons() {
    // Clear query button functionality
    const promptTextarea = document.getElementById('prompt');
    const clearQueryBtn = document.getElementById('clear-query-btn');
    
    if (promptTextarea && clearQueryBtn) {
        // Show/hide clear button based on textarea content
        function toggleClearButton() {
            if (promptTextarea.value.trim()) {
                clearQueryBtn.style.display = 'block';
            } else {
                clearQueryBtn.style.display = 'none';
            }
        }
        
        // Listen for input changes
        promptTextarea.addEventListener('input', toggleClearButton);
        promptTextarea.addEventListener('paste', () => setTimeout(toggleClearButton, 10));
        
        // Clear button click handler
        clearQueryBtn.addEventListener('click', () => {
            promptTextarea.value = '';
            promptTextarea.focus();
            toggleClearButton();
        });
    }
}

// =================================================================
// COMPREHENSIVE TOOL CALL AND LLM TRACKING UI FUNCTIONS
// =================================================================

function updateToolCallsDisplay() {
    let container = document.getElementById('tool-calls-display');
    if (!container) {
        container = document.createElement('div');
        container.id = 'tool-calls-display';
        container.className = 'expandable-section';
        
        const responseContainer = document.getElementById('response');
        if (responseContainer && !responseContainer.querySelector('#tool-calls-display')) {
            responseContainer.appendChild(container);
        }
    }
    
    const totalCalls = toolCallCycles.reduce((sum, cycle) => sum + cycle.length, 0);
    const completedCalls = toolCallCycles.reduce((sum, cycle) => 
        sum + cycle.filter(tc => tc.completed).length, 0
    );
    
    if (totalCalls === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <div class="section-header" onclick="toggleSection('tool-calls-content')">
            🔧 Tool Calls (${completedCalls}/${totalCalls} completed) - ${toolCallCycles.length} cycles
        </div>
        <div id="tool-calls-content" class="section-content" style="display: none;">
            ${toolCallCycles.map((cycle, cycleIndex) => {
                if (cycle.length === 0) return '';
                return `
                    <div class="cycle-section">
                        <h4>Cycle ${cycleIndex + 1} (${cycle.length} calls)</h4>
                        ${cycle.map((call, callIndex) => `
                            <div class="tool-call-item ${call.completed ? 'completed' : 'pending'}">
                                <strong>${call.request.function.name}</strong>
                                <span class="status-badge ${call.completed ? 'completed' : 'pending'}">
                                    ${call.completed ? '✅ Completed' : '⏳ Pending'}
                                </span>
                                <div class="call-details">
                                    <div><strong>Args:</strong> <code>${call.request.function.arguments}</code></div>
                                    ${call.completed && call.response ? `
                                        <div><strong>Response:</strong> 
                                            <details>
                                                <summary>Show response</summary>
                                                <pre>${JSON.stringify(call.response, null, 2)}</pre>
                                            </details>
                                        </div>
                                    ` : ''}
                                    ${call.duration > 0 ? `<div><strong>Duration:</strong> ${call.duration}ms</div>` : ''}
                                    ${call.cost > 0 ? `<div><strong>Cost:</strong> $${call.cost.toFixed(4)}</div>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }).filter(Boolean).join('')}
        </div>
    `;
}

function updateLLMCallsDisplay() {
    let container = document.getElementById('llm-calls-display');
    if (!container) {
        container = document.createElement('div');
        container.id = 'llm-calls-display';
        container.className = 'expandable-section';
        
        const responseContainer = document.getElementById('response');
        if (responseContainer && !responseContainer.querySelector('#llm-calls-display')) {
            responseContainer.appendChild(container);
        }
    }
    
    if (llmCalls.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <div class="section-header" onclick="toggleSection('llm-calls-content')">
            🤖 LLM Calls (${llmCalls.length}) - Total Tokens: ${totalTokens.toLocaleString()}
        </div>
        <div id="llm-calls-content" class="section-content" style="display: none;">
            ${llmCalls.map((call, index) => `
                <div class="llm-call-item">
                    <h4>Call ${index + 1}: ${call.type} (${call.model})</h4>
                    <div class="call-details">
                        ${call.response ? `
                            <div><strong>Content:</strong> ${call.response.content.substring(0, 200)}${call.response.content.length > 200 ? '...' : ''}</div>
                            <div><strong>Tool Calls:</strong> ${call.response.tool_calls?.length || 0}</div>
                        ` : '<div><em>Response pending...</em></div>'}
                        <div><strong>Duration:</strong> ${call.duration}ms</div>
                        <div><strong>Tokens:</strong> ${call.tokenUse.toLocaleString()}</div>
                        <div><strong>Cost:</strong> $${(call.cost || 0).toFixed(4)}</div>
                        ${call.response ? `
                            <details>
                                <summary>Show full request/response</summary>
                                <div><strong>Request:</strong> <pre>${JSON.stringify(call.request, null, 2)}</pre></div>
                                <div><strong>Response:</strong> <pre>${JSON.stringify(call.response, null, 2)}</pre></div>
                            </details>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function updateCostDisplay() {
    let container = document.getElementById('cost-display');
    if (!container) {
        container = document.createElement('div');
        container.id = 'cost-display';
        container.className = 'cost-summary';
        
        const responseContainer = document.getElementById('response');
        if (responseContainer && !responseContainer.querySelector('#cost-display')) {
            responseContainer.appendChild(container);
        }
    }
    
    container.innerHTML = `
        <div class="cost-header">
            💰 Total Cost: $${totalCost.toFixed(4)} | Tokens: ${totalTokens.toLocaleString()}
        </div>
    `;
}

function toggleSection(contentId) {
    const content = document.getElementById(contentId);
    if (content) {
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
    }
}

// Apply enhanced styles for tracking displays
function applyTrackingStyles() {
    if (document.getElementById('enhanced-tracking-styles')) return;
    
    const styleElement = document.createElement('style');
    styleElement.id = 'enhanced-tracking-styles';
    styleElement.textContent = `
        .expandable-section {
            margin: 15px 0;
            border: 1px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .section-header {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            padding: 12px 15px;
            cursor: pointer;
            font-weight: bold;
            border-bottom: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .section-header:hover {
            background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%);
        }

        .section-content {
            padding: 15px;
            background: #fafbfc;
        }

        .tool-call-item, .llm-call-item {
            border: 1px solid #e1e8ed;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 10px;
            background: white;
            position: relative;
        }

        .tool-call-item.completed {
            border-left: 4px solid #28a745;
        }

        .tool-call-item.pending {
            border-left: 4px solid #ffc107;
        }

        .status-badge {
            float: right;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }

        .status-badge.completed {
            background: #d4edda;
            color: #155724;
        }

        .status-badge.pending {
            background: #fff3cd;
            color: #856404;
        }

        .call-details {
            margin-top: 8px;
            font-size: 13px;
            line-height: 1.4;
        }

        .call-details code {
            background: #f8f9fa;
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 11px;
        }

        .call-details pre {
            background: #f8f9fa;
            padding: 8px;
            border-radius: 4px;
            font-size: 11px;
            max-height: 300px;
            overflow-y: auto;
            margin: 5px 0;
        }

        .call-details details {
            margin-top: 8px;
        }

        .call-details summary {
            cursor: pointer;
            color: #007bff;
            font-weight: 500;
        }

        .call-details summary:hover {
            text-decoration: underline;
        }

        .cost-summary {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            padding: 12px 15px;
            border-radius: 6px;
            margin: 15px 0;
            text-align: center;
            font-weight: bold;
            box-shadow: 0 2px 10px rgba(40, 167, 69, 0.3);
        }

        .cycle-section {
            margin-bottom: 25px;
            border-left: 4px solid #007bff;
            padding-left: 15px;
            background: #f8f9fa;
            border-radius: 0 6px 6px 0;
            padding: 15px;
        }

        .cycle-section h4 {
            margin: 0 0 15px 0;
            color: #007bff;
            font-size: 16px;
        }
    `;
    document.head.appendChild(styleElement);
}

// Initialize tracking styles on page load
applyTrackingStyles();

function enableResponseActions() {
    const copyBtn = document.getElementById('copy-response-btn');
    const shareBtn = document.getElementById('share-response-btn');
    
    if (copyBtn) copyBtn.disabled = false;
    if (shareBtn) shareBtn.disabled = false;
}

function disableResponseActions() {
    const copyBtn = document.getElementById('copy-response-btn');
    const shareBtn = document.getElementById('share-response-btn');
    
    if (copyBtn) copyBtn.disabled = true;
    if (shareBtn) shareBtn.disabled = true;
}

function setupResponseActionHandlers() {
    // Use event delegation to handle dynamically created buttons
    document.addEventListener('click', (e) => {
        if (e.target.id === 'copy-response-btn' && !e.target.disabled) {
            copyResponseToClipboard();
        } else if (e.target.id === 'share-response-btn' && !e.target.disabled) {
            shareResponseByEmail();
        }
    });
}

async function copyResponseToClipboard() {
    const answerElement = document.getElementById('final-answer');
    if (!answerElement) {
        showToast('No response to copy', 'warning');
        return;
    }
    
    // Get text content, preserving line breaks
    const responseText = answerElement.innerText || answerElement.textContent || '';
    
    if (!responseText.trim() || responseText.includes('Working on it…')) {
        showToast('Response not ready yet', 'warning');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(responseText);
        showToast('Response copied to clipboard!', 'success', 3000);
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = responseText;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Response copied to clipboard!', 'success', 3000);
        } catch (fallbackErr) {
            showToast('Failed to copy to clipboard', 'error');
        }
        document.body.removeChild(textArea);
    }
}

function shareResponseByEmail() {
    const answerElement = document.getElementById('final-answer');
    const promptTextarea = document.getElementById('prompt');
    
    if (!answerElement) {
        showToast('No response to share', 'warning');
        return;
    }
    
    const responseText = answerElement.innerText || answerElement.textContent || '';
    const queryText = promptTextarea ? promptTextarea.value : '';
    
    if (!responseText.trim() || responseText.includes('Working on it…')) {
        showToast('Response not ready yet', 'warning');
        return;
    }
    
    // Create email content for Gmail
    const subject = encodeURIComponent('AI Search Response' + (queryText ? `: ${queryText.substring(0, 50)}${queryText.length > 50 ? '...' : ''}` : ''));
    const body = encodeURIComponent(
        `Query: ${queryText}\n\n` +
        `Response:\n${responseText}\n\n` +
        `Generated by AI Search at ${new Date().toLocaleString()}`
    );
    
    // Try Gmail first, with fallback to generic mailto
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`;
    const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
    
    try {
        // Open Gmail in a new tab
        const gmailWindow = window.open(gmailUrl, '_blank');
        
        // Check if popup was blocked or failed
        if (!gmailWindow || gmailWindow.closed || typeof gmailWindow.closed === 'undefined') {
            // Fallback to mailto if Gmail doesn't open
            console.log('Gmail popup blocked, falling back to mailto');
            window.location.href = mailtoUrl;
            showToast('Opening email client...', 'info', 3000);
        } else {
            showToast('Gmail opened in new tab', 'success', 3000);
        }
    } catch (err) {
        // Final fallback
        try {
            window.location.href = mailtoUrl;
            showToast('Opening email client...', 'info', 3000);
        } catch (fallbackErr) {
            showToast('Failed to open email', 'error');
        }
    }
}

// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeApp();
        initializeActionButtons();
        setupResponseActionHandlers();
    });
} else {
    initializeApp();
    initializeActionButtons();
    setupResponseActionHandlers();
}