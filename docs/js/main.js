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

    console.log('🚨 QUOTA ERROR: State saved for continuation', {
        waitSeconds,
        retryCount: continuationState.retryCount,
        savedWorkState: continuationState.savedContext.workState,
        toolCallCyclesSummary: continuationState.savedContext.workState.toolCallCycles.map((cycle, i) => ({
            cycle: i + 1,
            numCalls: cycle.length,
            completed: cycle.filter(c => c.completed).length,
            firstTool: cycle.length > 0 ? cycle[0].request?.function?.name : 'N/A'
        }))
    });
    
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
    console.log(' GLOBAL STATE BEFORE CONTINUATION CREATION:', {
        toolCallCyclesLength: toolCallCycles.length,
        toolCallCyclesType: typeof toolCallCycles,
        toolCallCyclesIsArray: Array.isArray(toolCallCycles),
        totalToolCallsCalculated: toolCallCycles.reduce((sum, cycle) => sum + cycle.length, 0),
        cycleDetails: toolCallCycles.map((cycle, i) => ({
            cycleIndex: i,
            isArray: Array.isArray(cycle),
            length: cycle.length,
            firstCallName: cycle[0]?.request?.function?.name
        })),
        llmCallsLength: llmCalls.length,
        currentPersona: currentPersona,
        currentQuestions: currentQuestions.length,
        totalCost,
        totalTokens
    });
    
    console.log('📦 CONTINUATION PAYLOAD STRUCTURE:', {
        continuation: formData.continuation,
        hasContext: !!formData.continuationContext,
        hasWorkState: !!formData.continuationContext?.workState,
        workStateKeys: formData.continuationContext?.workState ? Object.keys(formData.continuationContext.workState) : [],
        toolCallCyclesInPayload: {
            length: formData.continuationContext?.workState?.toolCallCycles?.length || 'undefined',
            isArray: Array.isArray(formData.continuationContext?.workState?.toolCallCycles),
            structure: formData.continuationContext?.workState?.toolCallCycles?.map((cycle, i) => ({
                cycle: i + 1,
                calls: cycle?.length || 'undefined',
                completed: cycle?.filter ? cycle.filter(tc => tc.completed).length : 'not filterable',
                sample: cycle?.[0] ? {
                    hasRequest: !!cycle[0].request,
                    hasResponse: !!cycle[0].response,
                    requestKeys: cycle[0].request ? Object.keys(cycle[0].request) : [],
                    functionName: cycle[0].request?.function?.name
                } : null
            })) || 'undefined'
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
    
    // Add another comprehensive log of the final payload
    console.log('FINAL CONTINUATION PAYLOAD TO BE SENT:', JSON.stringify(formData, (key, value) => {
        // Avoid circular references if any
        if (key === 'savedFormData' || key === 'savedContext') {
            return '[omitted]';
        }
        return value;
    }, 2));

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
    
    // Reset tracking state for new request if not continuing
    if (!isContinuation) {
        console.log('🛫 RESETTING TRACKING STATE (fresh request)');
        toolCallCycles = [];
        llmCalls = [];
        totalCost = 0;
        totalTokens = 0;
        currentPersona = '';
        currentQuestions = [];
        currentSetupData = {};
        
        // Reset work state for new requests
        resetWorkState();
    } else {
        console.log('🛫 PRESERVING TRACKING STATE (continuation):', {
            toolCallCycles: toolCallCycles.length,
            totalToolCalls: toolCallCycles.reduce((sum, cycle) => sum + cycle.length, 0),
            llmCalls: llmCalls.length
        });
    }
    
    if (isContinuation && continuationState.savedContext?.existingResponse) {
        // Save existing content to preserve it
        existingContent = continuationState.savedContext.existingResponse;
        console.log('🔄 Continuation request - preserving existing content');
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
        <div style="margin-top: 16px; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <h3 style="margin: 0 0 8px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.2em;">�</span> Real-time Search Progress
            </h3>
            <div id="streaming-status" style="opacity: 0.95;">Connected! Waiting for data...</div>
        </div>
        <div id="continuation-tracking-section" style="margin-top: 16px;">
            <div class="section-header" onclick="toggleSection('continuation-tracking-content')" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <span id="continuation-toggle-icon">▼</span> 📊 Continuation Tracking
                <span id="continuation-summary" style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 16px; font-size: 0.9em; margin-left: auto;">Initializing...</span>
            </div>
            <div id="continuation-tracking-content" class="section-content" style="background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px; padding: 16px; display: none; max-height: 600px; overflow-y: auto;">
                <div id="tracking-overview" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px;">
                    <div class="tracking-card" style="background: white; padding: 12px; border-radius: 8px; border-left: 4px solid #007bff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h5 style="margin: 0 0 8px 0; color: #007bff;">🔧 Tool Calls</h5>
                        <div id="tool-calls-summary" style="font-size: 1.1em; font-weight: bold;">0 total</div>
                        <div style="font-size: 0.9em; color: #6c757d;">0 completed, 0 pending</div>
                    </div>
                    <div class="tracking-card" style="background: white; padding: 12px; border-radius: 8px; border-left: 4px solid #6f42c1; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h5 style="margin: 0 0 8px 0; color: #6f42c1;">🤖 LLM Calls</h5>
                        <div id="llm-calls-summary" style="font-size: 1.1em; font-weight: bold;">0 total</div>
                        <div style="font-size: 0.9em; color: #6c757d;">0 tokens used</div>
                    </div>
                    <div class="tracking-card" style="background: white; padding: 12px; border-radius: 8px; border-left: 4px solid #28a745; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h5 style="margin: 0 0 8px 0; color: #28a745;">💰 Cost Tracking</h5>
                        <div id="cost-summary" style="font-size: 1.1em; font-weight: bold;">$0.0000</div>
                        <div style="font-size: 0.9em; color: #6c757d;">Across all calls</div>
                    </div>
                    <div class="tracking-card" style="background: white; padding: 12px; border-radius: 8px; border-left: 4px solid #fd7e14; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h5 style="margin: 0 0 8px 0; color: #fd7e14;">👤 Current State</h5>
                        <div id="persona-summary" style="font-size: 1.1em; font-weight: bold;">Setting up...</div>
                        <div id="questions-summary" style="font-size: 0.9em; color: #6c757d;">0 research questions</div>
                    </div>
                </div>
                <div id="detailed-tracking" style="display: flex; flex-direction: column; gap: 16px;">
                    <div id="tool-calls-detail" style="display: none;"></div>
                    <div id="llm-calls-detail" style="display: none;"></div>
                    <div id="search-results-detail" style="display: none;"></div>
                </div>
            </div>
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
        <div style="margin-top: 16px; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <h3 style="margin: 0 0 8px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.2em;">�</span> Real-time Search Progress
            </h3>
            <div id="streaming-status" style="opacity: 0.95;">Connected! Waiting for data...</div>
        </div>
        <div id="continuation-tracking-section" style="margin-top: 16px;">
            <div class="section-header" onclick="toggleSection('continuation-tracking-content')" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <span id="continuation-toggle-icon">▼</span> 📊 Continuation Tracking
                <span id="continuation-summary" style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 16px; font-size: 0.9em; margin-left: auto;">Initializing...</span>
            </div>
            <div id="continuation-tracking-content" class="section-content" style="background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px; padding: 16px; display: none; max-height: 600px; overflow-y: auto;">
                <div id="tracking-overview" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px;">
                    <div class="tracking-card" style="background: white; padding: 12px; border-radius: 8px; border-left: 4px solid #007bff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h5 style="margin: 0 0 8px 0; color: #007bff;">🔧 Tool Calls</h5>
                        <div id="tool-calls-summary" style="font-size: 1.1em; font-weight: bold;">0 total</div>
                        <div style="font-size: 0.9em; color: #6c757d;">0 completed, 0 pending</div>
                    </div>
                    <div class="tracking-card" style="background: white; padding: 12px; border-radius: 8px; border-left: 4px solid #6f42c1; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h5 style="margin: 0 0 8px 0; color: #6f42c1;">🤖 LLM Calls</h5>
                        <div id="llm-calls-summary" style="font-size: 1.1em; font-weight: bold;">0 total</div>
                        <div style="font-size: 0.9em; color: #6c757d;">0 tokens used</div>
                    </div>
                    <div class="tracking-card" style="background: white; padding: 12px; border-radius: 8px; border-left: 4px solid #28a745; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h5 style="margin: 0 0 8px 0; color: #28a745;">💰 Cost Tracking</h5>
                        <div id="cost-summary" style="font-size: 1.1em; font-weight: bold;">$0.0000</div>
                        <div style="font-size: 0.9em; color: #6c757d;">Across all calls</div>
                    </div>
                    <div class="tracking-card" style="background: white; padding: 12px; border-radius: 8px; border-left: 4px solid #fd7e14; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h5 style="margin: 0 0 8px 0; color: #fd7e14;">👤 Current State</h5>
                        <div id="persona-summary" style="font-size: 1.1em; font-weight: bold;">Setting up...</div>
                        <div id="questions-summary" style="font-size: 0.9em; color: #6c757d;">0 research questions</div>
                    </div>
                </div>
                <div id="detailed-tracking" style="display: flex; flex-direction: column; gap: 16px;">
                    <div id="tool-calls-detail" style="display: none;"></div>
                    <div id="llm-calls-detail" style="display: none;"></div>
                    <div id="search-results-detail" style="display: none;"></div>
                </div>
            </div>
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

    // Process the actual streaming response
    try {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const finalAnswerElement = document.getElementById('final-answer');
        let accumulatedContent = '';
        let partialLine = ''; // Buffer for incomplete lines

        // Initially disable the action buttons
        disableResponseActions();

        async function processStream() {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    console.log('Stream complete');
                    // Process any remaining partial line
                    if (partialLine.trim()) {
                        processLine(partialLine);
                    }
                    // Enable the copy/share buttons when response is complete
                    enableResponseActions();
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                // Combine with any partial line from previous chunk
                const fullChunk = partialLine + chunk;
                const lines = fullChunk.split('\n');
                
                // Keep the last line as it might be incomplete
                partialLine = lines.pop() || '';
                
                // Process complete lines
                for (const line of lines) {
                    processLine(line);
                }
            }
        }

        function processLine(line) {
            if (line.trim().startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                
                // Skip empty data lines
                if (!jsonStr) return;
                
                try {
                    const data = JSON.parse(jsonStr);
                    
                    // Handle different types of streaming events
                    if (data.type === 'final_response') {
                        // Final response received - check both content and response fields
                        const responseContent = data.content || data.response;
                        if (responseContent) {
                            console.log('Final response received:', responseContent.substring(0, 100) + '...');
                            finalAnswerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7;">${responseContent}</div>`;
                            enableResponseActions();
                        } else {
                            console.warn('Final response event but no content found:', data);
                        }
                    } else if (data.type === 'response_complete') {
                        // Alternative format for final response
                        const responseContent = data.content || data.response;
                        if (responseContent) {
                            console.log('Response complete received:', responseContent.substring(0, 100) + '...');
                            finalAnswerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7;">${responseContent}</div>`;
                            enableResponseActions();
                        }
                    } else if (data.delta && data.delta.content) {
                        // Incremental content update
                        accumulatedContent += data.delta.content;
                        finalAnswerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7;">${accumulatedContent}</div>`;
                    } else if (data.type === 'error' || (data.type === 'final_response' && data.content && data.content.includes('Error from LLM provider'))) {
                        // Handle error responses
                        const errorContent = data.content || data.message || 'An error occurred';
                        console.error('Error in streaming response:', errorContent);
                        
                        // Check if it's a rate limit error
                        if (errorContent.includes('rate_limit_exceeded') || errorContent.includes('HTTP 429')) {
                            finalAnswerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7; color: #856404; background: #fff3cd; padding: 12px; border-radius: 6px; border-left: 4px solid #ffc107;">
                                <strong>⏳ Rate Limit Reached</strong><br>
                                The LLM provider has rate limited the request. This usually means too many requests in a short time period.<br><br>
                                <strong>What to do:</strong><br>
                                • Wait a few seconds and try again<br>
                                • Use the Continue button if it appears<br>
                                • Try a simpler query to reduce processing time<br><br>
                                <details style="margin-top: 8px;">
                                    <summary style="cursor: pointer; color: #6c757d;">Technical Details</summary>
                                    <code style="font-size: 0.9em; color: #6c757d;">${errorContent}</code>
                                </details>
                            </div>`;
                        } else {
                            finalAnswerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7; color: #dc3545; background: #f8d7da; padding: 12px; border-radius: 6px; border-left: 4px solid #dc3545;">
                                <strong>⚠️ Error:</strong><br>${errorContent}
                            </div>`;
                        }
                        enableResponseActions(); // Enable buttons even for errors so user can copy error message
                    } else if (data.message && data.message.includes('Rate limit reached') && data.waitTime) {
                        // Handle rate limit warning with continuation info
                        console.log('Rate limit warning detected, wait time:', data.waitTime);
                        finalAnswerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7; color: #856404; background: #fff3cd; padding: 12px; border-radius: 6px; border-left: 4px solid #ffc107;">
                            <strong>⏳ Rate Limit Warning</strong><br>
                            ${data.message}<br><br>
                            <em>The system will attempt to continue automatically, or you can use the Continue button when it appears.</em>
                        </div>`;
                    } else {
                        // Log important event types for debugging (but reduce noise)
                        const importantTypes = ['setup_query', 'query_cycle', 'error', 'complete'];
                        const llmPhases = ['initial_setup', 'planning', 'tool_iteration', 'final_synthesis'];
                        const noisyMessages = ['Connected!', 'Starting', 'Analyzing', 'Determining', 'Tools iteration', 'Executing'];
                        
                        // Show LLM request/response phases
                        if (data.phase && llmPhases.includes(data.phase)) {
                            if (data.request) {
                                console.log(`🤖 LLM Request [${data.phase}]:`, {
                                    model: data.model,
                                    phase: data.phase,
                                    iteration: data.iteration,
                                    timestamp: data.timestamp,
                                    prompt_length: data.request.input ? data.request.input.length : 'N/A'
                                });
                            } else if (data.response) {
                                console.log(`✅ LLM Response [${data.phase}]:`, {
                                    model: data.model,
                                    phase: data.phase,
                                    iteration: data.iteration,
                                    timestamp: data.timestamp,
                                    response_length: typeof data.response === 'string' ? data.response.length : JSON.stringify(data.response).length,
                                    usage: data.response.usage || 'N/A'
                                });
                            }
                        }
                        // Show tool execution events
                        else if (data.iteration && data.call_id && data.name) {
                            console.log(`🔧 Tool [${data.name}]:`, {
                                iteration: data.iteration,
                                call_id: data.call_id,
                                name: data.name,
                                args: data.args,
                                output_length: data.output ? data.output.length : 0
                            });
                        }
                        // Show tool summary events  
                        else if (data.iteration && data.pending && data.calls) {
                            console.log(`🛠️ Tools Summary [Iteration ${data.iteration}]:`, {
                                pending: data.pending,
                                total_calls: data.calls.length,
                                tool_names: data.calls.map(call => call.name || 'unknown')
                            });
                        }
                        // Show research planning events
                        else if (data.persona && data.questions) {
                            console.log('🎯 Research Plan:', {
                                persona: data.persona,
                                questions: data.questions,
                                response_length: data.response_length,
                                reasoning_level: data.reasoning_level,
                                temperature: data.temperature
                            });
                        }
                        // Show important event types
                        else if (data.type && importantTypes.includes(data.type)) {
                            console.log('📡 Streaming event:', data.type, data);
                        } 
                        // Show rate limit info
                        else if (data.message && data.message.includes('Rate limit')) {
                            console.log('⏳ Rate limit info:', data.message);
                        } 
                        // Show other important messages (but filter noise)
                        else if (data.message && !noisyMessages.some(noise => data.message.includes(noise))) {
                            console.log('💬 Stream message:', data.message);
                        }
                        // Silently ignore noisy progress messages
                    }
                } catch (e) {
                    // More detailed error logging
                    if (e instanceof SyntaxError) {
                        console.warn('JSON Syntax Error:', e.message);
                        console.warn('JSON string length:', jsonStr.length);
                        console.warn('First 100 chars:', jsonStr.substring(0, 100));
                        console.warn('Last 100 chars:', jsonStr.substring(Math.max(0, jsonStr.length - 100)));
                        
                        // Try to identify the position of the error
                        const match = e.message.match(/position (\d+)/);
                        if (match) {
                            const pos = parseInt(match[1]);
                            console.warn('Error around position:', jsonStr.substring(Math.max(0, pos - 20), pos + 20));
                        }
                    } else {
                        console.warn('Failed to parse streaming data:', e.message);
                        console.warn('Problematic line:', jsonStr.substring(0, 200) + (jsonStr.length > 200 ? '...' : ''));
                    }
                }
            }
        }

        await processStream();
        
    } catch (error) {
        console.error('Error in streaming response:', error);
        // Enable buttons even on error so user can copy any partial content
        enableResponseActions();
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

// Toggle tools details section
function toggleToolsDetails() {
    const content = document.getElementById('expandable-tools-content');
    const icon = document.getElementById('tools-toggle-icon');
    
    if (content) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            if (icon) icon.textContent = '▲';
        } else {
            content.style.display = 'none';
            if (icon) icon.textContent = '▼';
        }
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
    console.log('enableResponseActions called');
    const copyBtn = document.getElementById('copy-response-btn');
    const shareBtn = document.getElementById('share-response-btn');
    
    if (copyBtn) {
        copyBtn.disabled = false;
        console.log('Copy button enabled');
    } else {
        console.error('Copy button not found');
    }
    
    if (shareBtn) {
        shareBtn.disabled = false;
        console.log('Share button enabled');
    } else {
        console.error('Share button not found');
    }
}

function disableResponseActions() {
    const copyBtn = document.getElementById('copy-response-btn');
    const shareBtn = document.getElementById('share-response-btn');
    
    if (copyBtn) copyBtn.disabled = true;
    if (shareBtn) shareBtn.disabled = true;
}

// Flag to prevent duplicate event listeners
let responseActionHandlersSetup = false;

function setupResponseActionHandlers() {
    // Prevent duplicate event listeners
    if (responseActionHandlersSetup) {
        console.log('Response action handlers already set up');
        return;
    }
    
    // Use event delegation to handle dynamically created buttons
    document.addEventListener('click', (e) => {
        if (e.target.id === 'copy-response-btn' && !e.target.disabled) {
            console.log('Copy button clicked');
            copyResponseToClipboard();
        } else if (e.target.id === 'share-response-btn' && !e.target.disabled) {
            console.log('Share button clicked');
            shareResponseByEmail();
        }
    });
    
    responseActionHandlersSetup = true;
    console.log('Response action handlers set up');
}

async function copyResponseToClipboard() {
    console.log('copyResponseToClipboard called');
    const answerElement = document.getElementById('final-answer');
    if (!answerElement) {
        console.error('final-answer element not found');
        showToast('No response to copy', 'warning');
        return;
    }
    
    // Get text content, preserving line breaks
    const responseText = answerElement.innerText || answerElement.textContent || '';
    console.log('Response text length:', responseText.length);
    
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
    console.log('shareResponseByEmail called');
    const answerElement = document.getElementById('final-answer');
    const promptTextarea = document.getElementById('prompt');
    
    if (!answerElement) {
        console.error('final-answer element not found');
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
        
        // Add test content and enable buttons for testing (temporary)
        setTimeout(() => {
            const finalAnswer = document.getElementById('final-answer');
            if (finalAnswer && finalAnswer.textContent.includes('Working on it')) {
                finalAnswer.innerHTML = '<div style="white-space: pre-wrap; line-height: 1.7;">This is test content for the copy and share buttons. You can copy this text or share it via email.</div>';
                enableResponseActions();
                console.log('Test content added and buttons enabled');
            }
        }, 1000);
    });
} else {
    initializeApp();
    initializeActionButtons();
    setupResponseActionHandlers();
    
    // Add test content and enable buttons for testing (temporary)
    setTimeout(() => {
        const finalAnswer = document.getElementById('final-answer');
        if (finalAnswer && finalAnswer.textContent.includes('Working on it')) {
            finalAnswer.innerHTML = '<div style="white-space: pre-wrap; line-height: 1.7;">This is test content for the copy and share buttons. You can copy this text or share it via email.</div>';
            enableResponseActions();
            console.log('Test content added and buttons enabled');
        }
    }, 1000);
}