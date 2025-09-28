// main.js - Main application initialization and coordination

// Global request state
let currentRequest = null;

// Quota/limits error handling state
let continuationState = {
    isActive: false,
    savedFormData: null,
    savedContext: null,
    countdownTimer: null,
    remainingSeconds: 0,
    retryCount: 0,
    maxAutoRetries: 3,
    autoRetryEnabled: true
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
            setTimeout(() => {
                triggerContinuation();
            }, 500);
        }
    }
    
    updateCountdown();
}

// Parse wait time from error message
function parseWaitTimeFromMessage(errorMessage) {
    // Enhanced patterns for wait times including decimal seconds
    const patterns = [
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
            let seconds = isMinutes ? value * 60 : value;
            
            // Round up decimal seconds to ensure we don't retry too early
            seconds = Math.ceil(seconds);
            
            // Ensure minimum wait time of 1 second
            return Math.max(1, seconds);
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
    
    // Save state for continuation
    continuationState.savedFormData = { ...formData };
    continuationState.savedContext = {
        existingResponse: existingResponse,
        timestamp: new Date().toISOString()
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
                <div style="opacity: 0.8; font-size: 0.9em;">Continuing automatically in ${waitSeconds} seconds. You can also click Continue to proceed immediately.</div>
            </div>
        `;
    }
}

// Show continuation UI (hide submit/stop, show continue)
function showContinuationUI() {
    const submitBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    const continueBtn = document.getElementById('continue-btn');
    
    if (submitBtn) {
        submitBtn.style.display = 'none';
    }
    
    if (stopBtn) {
        stopBtn.style.display = 'none';
    }
    
    if (continueBtn) {
        continueBtn.style.display = 'inline-block';
        continueBtn.disabled = false;
        continueBtn.onclick = triggerContinuation;
    }
}

// Hide continuation UI (show submit, hide continue)
function hideContinuationUI() {
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
    
    // Add continuation context to form data
    const formData = {
        ...continuationState.savedFormData,
        continuation: true,
        continuationContext: continuationState.savedContext,
        retryAttempt: continuationState.retryCount
    };
    
    // Reset form state but keep retry tracking
    const currentRetryCount = continuationState.retryCount;
    const autoRetryEnabled = continuationState.autoRetryEnabled;
    
    continuationState.savedFormData = null;
    continuationState.savedContext = null;
    
    // Hide continuation UI and show stop button
    const submitBtn = document.getElementById('submit-btn');
    const continueBtn = document.getElementById('continue-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    if (submitBtn) submitBtn.style.display = 'none';
    if (continueBtn) continueBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-block';
    
    // Show status
    const statusElement = document.getElementById('status');
    if (statusElement) {
        const retryText = currentRetryCount > 0 ? ` (Retry ${currentRetryCount})` : '';
        statusElement.textContent = `Continuing request...${retryText}`;
    }
    
    // Make the request
    makeStreamingRequest(formData);
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
    
    // Hide submit button and show stop button
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) {
        submitBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
    }
    
    // Show loading message
    responseContainer.className = 'response-container loading';
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
    const selectedModel = document.getElementById('model').value;
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

    // Save form data for potential continuation
    window.lastFormData = { ...formData };

    // Make the streaming request
    return makeStreamingRequest(formData);
}

// Make streaming request (can be called for initial request or continuation)
async function makeStreamingRequest(formData) {
    const responseContainer = document.getElementById('response-container');
    const submitBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    
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
        

        
        // Update loading message
        responseContainer.textContent = 'Sending request...';
        
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
        
        // Clear the timeout since we got a response
        clearTimeout(timeoutId);
        
        // Check if response is streaming
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('text/event-stream')) {
            if (typeof handleStreamingResponse === 'function') {
                await handleStreamingResponse(response, responseContainer, controller);
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
async function handleStreamingResponse(response, responseContainer, controller) {
    
    // Initialize state variables for streaming
    const digestMap = new Map();
    const metaMap = new Map();
    const resultsState = { byIteration: {} };
    
    // Clear and prepare response container for streaming
    responseContainer.className = 'response-container';
    responseContainer.innerHTML = `
        <div id="streaming-response" style="margin-bottom: 16px;">
            <div style="padding: 15px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.2em;">🎯</span> Final Response
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
            buffer += chunk;
            
            // Process complete events (separated by double newlines)
            const events = buffer.split('\n\n');
            buffer = events.pop(); // Keep incomplete event in buffer
            
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
                    
                    const eventData = JSON.parse(data);
                    
                    // Log important LLM response events
                    if (['final_response', 'final_answer', 'complete', 'error'].includes(eventType)) {
                        console.log('LLM Event:', eventType, eventData);
                    }
                    
                    // Handle different event types
                    switch (eventType) {
                        case 'search_digest':
                            {
                                const { term, iteration, summary, links, subQuestion, keywords } = eventData;
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
                                toolsPanel.style.display = 'block';
                                const { iteration, pending, calls } = eventData;
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
                            break;
                            
                        case 'persona':
                            {
                                const personaContainer = document.getElementById('persona-container');
                                const personaText = document.getElementById('persona-text');
                                if (personaContainer && personaText && eventData.persona) {
                                    personaText.textContent = eventData.persona;
                                    personaContainer.style.display = 'block';
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
                                // Ignore initial empty placeholder snapshot to avoid a "null" entry
                                if (term === null || (resultsCount === 0 && iteration === 0)) {
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
                            if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Stop'; }
                            stopAllTimers('done');
                            hideContinuationUI();
                            answerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7;">${eventData.response}</div>`;
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
                            if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Stop'; }
                            stopAllTimers('done');
                            hideContinuationUI();
                            answerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7;">${eventData.content}</div>`;
                            responseContainer.className = 'response-container response-success';
                            break;
                            
                        case 'complete':
                            statusElement.textContent = `✅ Complete! Total time: ${Math.round(eventData.executionTime)}ms`;
                            responseContainer.className = 'response-container response-success';
                            if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Stop'; }
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
                                if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Error'; }
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
        if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Stopped'; }
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

// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}