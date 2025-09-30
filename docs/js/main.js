// main.js - Modular application coordinator (streamlined)

// =================================================================
// LEGACY FORM HANDLING AND REQUEST LOGIC
// (To be further modularized in future iterations)
// =================================================================

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
    
    // Set up auto-resize textarea using UI manager
    uiManager.setupAutoResizeTextarea();

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
            uiManager.updateSubmitButton();
        });
        // Initial state
        uiManager.updateSubmitButton();
    }
    
    // Update UI state using UI manager
    uiManager.updateModelAvailability();
    uiManager.updateSubmitButton();
    
    // Setup response action handlers
    uiManager.setupResponseActionHandlers();
    
    // Apply tracking styles
    uiManager.applyTrackingStyles();
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
    uiManager.togglePersonaQuestions(false);
    
    // Hide submit button and show stop button
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) {
        submitBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
    }
    
    // Show loading message
    uiManager.updateResponseContainer('loading');
    uiManager.disableResponseActions();
    
    // Show initial status
    uiManager.updateStatus('Sending request...');
    
    // Get form data
    const formData = new FormData(document.getElementById('llm-form'));
    const data = Object.fromEntries(formData.entries());
    
    // Reset state for new request using state manager
    stateManager.resetWorkState();
    stateManager.updateFormData(data);
    
    try {
        await makeStreamingRequest(data);
    } catch (error) {
        errorHandler.handleGeneralError(error, 'Form Submission');
    }
}

// Make streaming request (can be called for initial request or continuation)
async function makeStreamingRequest(formData) {
    const responseContainer = document.getElementById('response-container');
    const submitBtn = document.getElementById('submit-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    stateManager.currentRequest = new AbortController();
    
    try {
        // Build request body
        const requestBody = {
            prompt: formData.prompt,
            model: formData.model || 'groq:llama-3.1-8b-instant',
            ...(formData.continuation && {
                continuation: true,
                continuationContext: formData.continuationContext,
                retryAttempt: formData.retryAttempt || 0
            })
        };

        console.log('🚀 Making streaming request:', {
            model: requestBody.model,
            promptLength: requestBody.prompt.length,
            isContinuation: !!requestBody.continuation
        });

        // Make the request
        const response = await fetch('/api/llm-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader()
            },
            body: JSON.stringify(requestBody),
            signal: stateManager.currentRequest.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Handle streaming response
        await handleStreamingResponse(response, responseContainer, stateManager.currentRequest);
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('🛑 Request was aborted');
            responseContainer.textContent = 'Request was cancelled.';
        } else {
            console.error('❌ Request failed:', error);
            
            // Check if it's a quota error
            const errorMessage = error.message || String(error);
            if (errorHandler.isQuotaLimitError(errorMessage)) {
                errorHandler.handleQuotaError(errorMessage, formData, responseContainer.textContent);
                return; // Don't reset UI for quota errors
            }
            
            errorHandler.handleNetworkError(error, responseContainer);
        }
    } finally {
        // Reset UI unless we're in continuation mode
        if (!stateManager.continuationState.isActive) {
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
    } catch (error) {
        console.warn('Failed to reset model:', error);
    }
}

/**
 * Handle streaming Server-Sent Events response
 */
async function handleStreamingResponse(response, responseContainer, controller, existingContent = '') {
    console.log('🌊 Starting streaming response handler');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = existingContent;
    let buffer = '';
    
    // Clear loading state
    uiManager.updateResponseContainer();
    responseContainer.textContent = '';
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                console.log('✅ Stream completed');
                break;
            }
            
            // Decode and process the chunk
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.trim() === '') continue;
                
                try {
                    // Parse JSON line
                    const data = JSON.parse(line);
                    console.log('📦 Received streaming data:', data);
                    
                    // Handle different event types
                    if (data.type === 'content') {
                        accumulatedContent += data.content;
                        // Update response display
                        if (typeof marked !== 'undefined') {
                            responseContainer.innerHTML = marked.parse(accumulatedContent);
                        } else {
                            responseContainer.textContent = accumulatedContent;
                        }
                    } else if (data.type === 'llm_start') {
                        console.log('🚀 LLM Start Event:', data);
                        uiManager.updateStatus('LLM processing...');
                    } else if (data.type === 'llm_response') {
                        console.log('💬 LLM Response Event:', data);
                        // Track LLM calls in state manager
                        stateManager.llmCalls.push(data);
                        updateLLMCallsDisplay();
                    } else if (data.type === 'error') {
                        console.error('❌ Stream error:', data);
                        if (errorHandler.isQuotaLimitError(data.message)) {
                            errorHandler.handleQuotaError(data.message, stateManager.currentFormData, accumulatedContent);
                            return;
                        }
                        throw new Error(data.message || 'Unknown streaming error');
                    }
                    
                } catch (parseError) {
                    console.warn('⚠️ Failed to parse streaming line:', line, parseError);
                }
            }
        }
        
        // Enable response actions when complete
        uiManager.enableResponseActions();
        uiManager.updateStatus('Request completed');
        
    } catch (error) {
        console.error('❌ Streaming error:', error);
        errorHandler.handleNetworkError(error, responseContainer);
    }
}

// =================================================================
// TRACKING DISPLAY FUNCTIONS (Legacy - to be modularized)
// =================================================================

function updateToolCallsDisplay() {
    // Legacy function - implementation remains the same for now
    // Will be moved to tracking-display.js in future iteration
    console.log('📊 Updating tool calls display...');
}

function updateLLMCallsDisplay() {
    // Legacy function - implementation remains the same for now  
    // Will be moved to tracking-display.js in future iteration
    console.log('📊 Updating LLM calls display...');
}

function updateCostDisplay() {
    // Legacy function - implementation remains the same for now
    // Will be moved to tracking-display.js in future iteration  
    console.log('💰 Updating cost display...');
}

// Initialize tracking styles on page load
uiManager.applyTrackingStyles();

// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🚀 DOM loaded, initializing modular app...');
        initializeApp();
    });
} else {
    console.log('🚀 DOM already loaded, initializing modular app...');
    initializeApp();
}