// main.js - Main application logic and form submission

// Global request state
let currentRequest = null;

// Resume from interrupted state
async function resumeFromInterrupt() {
    if (!window.interruptState) {
        console.error('No interrupt state available to resume from');
        return;
    }
    
    console.log('Resuming from interrupt state:', window.interruptState);
    
    // Stop auto-continue timer since we're now resuming
    if (window.stopAutoContinueTimer) {
        window.stopAutoContinueTimer();
    }
    
    // Update button states
    const continueBtn = document.getElementById('continue-btn');
    const submitBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    if (continueBtn) continueBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-block';  
    if (submitBtn) submitBtn.style.display = 'none';
    
    // Update status
    const statusElement = document.getElementById('streaming-status');
    if (statusElement) {
        statusElement.textContent = 'Resuming query processing...';
    }
    
    // Prepare retry parameters
    const selectedModel = document.getElementById('model').value;
    const isGroqModel = selectedModel.startsWith('groq:');
    const isOpenaiModel = selectedModel.startsWith('openai:');
    
    let apiKey;
    if (isGroqModel) {
        apiKey = document.getElementById('groq_api_key').value;
    } else if (isOpenaiModel) {
        apiKey = document.getElementById('openai_api_key').value;
    }
    
    const hasLocalKey = apiKey && apiKey.trim();
    const isSignedIn = (window.isGoogleTokenValid ? window.isGoogleTokenValid(window.googleAccessToken) : false);
    
    // Get Tavily API key if available
    const tavilyApiKey = document.getElementById('tavily_api_key')?.value || '';
    
    const retryFormData = {
        ...(hasLocalKey ? { apiKey: apiKey } : {}),
        model: selectedModel,
        query: document.getElementById('prompt').value,
        accessSecret: document.getElementById('access_secret').value,
        searchMode: 'web_search',
        ...(isSignedIn ? { google_token: window.googleAccessToken } : {}),
        ...(tavilyApiKey ? { tavilyApiKey: tavilyApiKey } : {}),
        // Retry parameters from interrupt state
        queryId: window.currentQueryId,
        previousSteps: window.previousSteps,
        tokensPerMinute: 6000
    };
    
    console.log('Retry form data:', retryFormData);
    
    // Clear current interrupt state
    window.interruptState = null;
    
    // Submit the retry request
    try {
        // For now, just reload the page and let user resubmit
        // TODO: Implement proper retry submission without reloading
        if (statusElement) {
            statusElement.textContent = 'Resume functionality needs refinement. Please resubmit your query.';
        }
        
        // Reset button states
        if (continueBtn) continueBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'inline-block';
        
    } catch (error) {
        console.error('Error setting up resume:', error);
        const statusElement = document.getElementById('streaming-status');
        if (statusElement) {
            statusElement.textContent = `❌ Error resuming: ${error.message}`;
        }
        
        // Reset UI state
        if (continueBtn) continueBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'inline-block';
    }
}

// Initialize main application
function initializeMainApp() {
    // Check for OAuth redirect first, then initialize Google services
    if (!handleOAuthRedirect()) {
        // Initialize Google OAuth when the page loads
        setTimeout(initializeGoogleOAuth, 1000); // Delay to ensure Google script is loaded
    }

    // Login button event listener
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    // Form submission handler
    const form = document.getElementById('llm-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmission);
    }
}

// Handle form submission
async function handleFormSubmission(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    const responseContainer = document.getElementById('response-container');
    
    // Clear real-time monitoring from previous requests
    if (window.realtimeMonitoring) {
        window.realtimeMonitoring.clearAll();
    }
    
    // Clear previous tool executions
    if (window.clearToolExecutions) {
        window.clearToolExecutions();
    }
    
    // Stop any existing auto-continue timer when starting new query
    if (window.stopAutoContinueTimer) {
        window.stopAutoContinueTimer();
    }
    
    // Hide submit button and show stop button, hide continue button
    const stopBtn = document.getElementById('stop-btn');
    const continueBtn = document.getElementById('continue-btn');
    submitBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    if (continueBtn) continueBtn.style.display = 'none';
    
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
        apiKey = document.getElementById('groq_api_key').value;
    } else if (isOpenaiModel) {
        apiKey = document.getElementById('openai_api_key').value;
    }
    
    // Validate that we have either a local API key or a Google login (server env keys may apply)
    const hasLocalKey = apiKey && apiKey.trim();
    const isSignedIn = (window.isGoogleTokenValid ? window.isGoogleTokenValid(window.googleAccessToken) : false);
    
    // Debug logging
    console.log('Form submission validation:', {
        apiKey: apiKey ? 'present' : 'null',
        hasLocalKey: hasLocalKey,
        googleAccessToken: window.googleAccessToken ? 'present' : 'null',
        isSignedIn: isSignedIn,
        googleUser: window.googleUser ? window.googleUser.email : 'null'
    });
    
    if (!hasLocalKey && !isSignedIn) {
        responseContainer.className = 'response-container response-error';
        responseContainer.textContent = 'Error: Please sign in with Google or provide an API key in Settings to proceed.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Request';
        return;
    }

    // Reset retry state for new request
    window.currentQueryId = 'query_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    window.previousSteps = [];
    window.interruptState = null;

    // Get Tavily API key if available
    const tavilyApiKey = document.getElementById('tavily_api_key')?.value || '';
    
    // Collect form data
    const formData = {
        // Only include apiKey if user provided one; otherwise server may use env keys for authorized accounts
        ...(hasLocalKey ? { apiKey: apiKey } : {}),
        model: selectedModel,
        query: document.getElementById('prompt').value,
        accessSecret: document.getElementById('access_secret').value,
        searchMode: 'web_search',
        ...(isSignedIn ? { google_token: window.googleAccessToken } : {}),
        ...(tavilyApiKey ? { tavilyApiKey: tavilyApiKey } : {}),
        // Add query ID for new request
        queryId: window.currentQueryId,
        tokensPerMinute: 6000  // Default rate limit
    };

    // Set a reasonable default timeout (90 seconds)
    const timeoutMs = 90000;

    // Create an AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);
    
    try {
        // Make the request
        const response = await fetch('{{LAMBDA_URL}}', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Check if this is a streaming response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/event-stream')) {
            // Handle streaming response
            if (window.handleStreamingResponse) {
                await window.handleStreamingResponse(response, responseContainer, controller);
            } else {
                throw new Error('Streaming handler not available');
            }
        } else {
            // Handle regular JSON response with structured display
            const result = await response.json();
            if (window.displayStructuredResponse) {
                window.displayStructuredResponse(result, responseContainer);
            } else {
                // Fallback to JSON dump if function not available
                responseContainer.className = 'response-container response-success';
                responseContainer.innerHTML = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
            }
        }

    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Request error:', error);
        
        responseContainer.className = 'response-container response-error';
        
        if (error.name === 'AbortError') {
            responseContainer.textContent = `Request timed out after ${timeoutMs/1000} seconds. Please try again.`;
        } else {
            responseContainer.textContent = `Error: ${error.message}`;
        }
    } finally {
        // Reset UI state
        submitBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Request';
        
        // Ensure button state is accurate
        if (updateSubmitButton) {
            updateSubmitButton();
        }
    }
}

// Expose functions globally
window.resumeFromInterrupt = resumeFromInterrupt;
window.handleFormSubmission = handleFormSubmission;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing application...');
    
    // Initialize all modules
    initializeSettings();
    initializeMainApp();
    initializeSampleQueries();
    
    console.log('Application initialized successfully');
});