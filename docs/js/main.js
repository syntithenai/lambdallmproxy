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
        // Build request body matching Lambda function expectations
        const requestBody = {
            query: formData.prompt,
            model: formData.model || 'groq:llama-3.1-8b-instant',
            accessSecret: document.getElementById('access_secret').value,
            searchMode: 'web_search',
            queryId: Date.now().toString(), // Generate unique query ID
            tokensPerMinute: 6000,
            ...(window.googleAccessToken && { google_token: window.googleAccessToken }),
            ...(formData.continuation && {
                continuation: true,
                continuationContext: formData.continuationContext,
                retryAttempt: formData.retryAttempt || 0
            })
        };

        console.log('🚀 Making streaming request:', {
            model: requestBody.model,
            queryLength: requestBody.query.length,
            isContinuation: !!requestBody.continuation
        });

        // Make the request
        const response = await fetch(window.LAMBDA_URL, {
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

        // Handle response - check if it's JSON or streaming
        await handleResponse(response, responseContainer, stateManager.currentRequest);
        
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
 * Handle response - detects if it's JSON or streaming format
 */
async function handleResponse(response, responseContainer, controller) {
    const contentType = response.headers.get('content-type');
    
    // Debug logging
    console.log('🔍 Response Debug:', {
        status: response.status,
        statusText: response.statusText,
        contentType: contentType,
        headers: Array.from(response.headers.entries()),
        ok: response.ok
    });
    
    // Check if it's a JSON response
    if (contentType && contentType.includes('application/json')) {
        console.log('📄 Handling JSON response');
        try {
            const data = await response.json();
            console.log('📦 JSON data received:', data);
            await handleJsonResponse(data, responseContainer);
        } catch (error) {
            console.error('❌ Failed to parse JSON response:', error);
            responseContainer.innerHTML = `<div style="color: red; padding: 16px;">Error parsing response: ${error.message}</div>`;
        }
    } else {
        console.log('🌊 Handling streaming response, content-type:', contentType);
        await handleStreamingResponse(response, responseContainer, controller);
    }
}

/**
 * Handle complete JSON response from Lambda
 */
async function handleJsonResponse(data, responseContainer) {
    console.log('📦 Received JSON response:', data);
    
    try {
    // Clear loading state
    uiManager.updateResponseContainer();
    responseContainer.innerHTML = '';
    console.log('🧹 Cleared response container');
    console.log('🎯 Response container element:', responseContainer);
    console.log('📏 Response container dimensions:', {
        width: responseContainer.offsetWidth,
        height: responseContainer.offsetHeight,
        display: getComputedStyle(responseContainer).display,
        visibility: getComputedStyle(responseContainer).visibility
    });    // Create main container with proper styling like streaming interface
    const mainContainer = document.createElement('div');
    mainContainer.innerHTML = `
        <div id="streaming-response" style="margin-bottom: 16px;">
            <div style="padding: 15px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.2em;">✨</span> Final Response
                </h3>
            </div>
            <div id="final-answer" style="padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #28a745; line-height: 1.6; color:#212529;">
                <!-- Response content will be inserted here -->
            </div>
        </div>
    `;
    
    // Add the main response content
    const finalAnswerDiv = mainContainer.querySelector('#final-answer');
    if (data.response) {
        if (typeof marked !== 'undefined') {
            finalAnswerDiv.innerHTML = marked.parse(data.response);
        } else {
            finalAnswerDiv.textContent = data.response;
        }
    } else {
        finalAnswerDiv.innerHTML = '<em>No response content available</em>';
    }
    
    responseContainer.appendChild(mainContainer);
    console.log('➕ Added main container to response container');
    console.log('📊 Main container element:', mainContainer);
    
    // Add processing summary
    const summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'margin-top: 8px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;';
    summaryDiv.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #495057; display: flex; align-items: center; gap: 8px;">
            <span>📊</span> Processing Summary
        </h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px;">
            <div><strong>Model:</strong> ${data.metadata?.finalModel || 'Unknown'}</div>
            <div><strong>Mode:</strong> ${data.metadata?.mode || 'Unknown'}</div>
            <div><strong>Processing Time:</strong> ${data.processingTime ? `${(data.processingTime / 1000).toFixed(2)}s` : 'Unknown'}</div>
            <div><strong>Status:</strong> ${data.metadata?.error ? '❌ Error' : '✅ Success'}</div>
        </div>
    `;
    responseContainer.appendChild(summaryDiv);
    console.log('➕ Added summary div to response container');
    
    // Create expandable sections for detailed information
    createExpandableSection(responseContainer, 'Tool Executions', '🔧', () => {
        if (data.toolCallCycles && data.toolCallCycles.length > 0) {
            let content = '';
            data.toolCallCycles.forEach((cycle, cycleIndex) => {
                if (Array.isArray(cycle) && cycle.length > 0) {
                    content += `<div style="margin-bottom: 16px;">
                        <h5 style="margin: 8px 0; color: #495057;">Cycle ${cycleIndex + 1}</h5>`;
                    cycle.forEach((call, callIndex) => {
                        const functionName = call.request?.function?.name || 'Unknown';
                        const args = call.request?.function?.arguments ? JSON.parse(call.request.function.arguments) : {};
                        const result = call.response?.result || 'No result';
                        const timestamp = call.request?.timestamp || '';
                        
                        content += `
                            <div style="padding: 8px; background: white; border-radius: 4px; margin: 4px 0; border-left: 3px solid #007bff;">
                                <strong>Tool ${callIndex + 1}: ${functionName}</strong>
                                ${timestamp ? `<span style="float: right; font-size: 0.8em; color: #666;">${new Date(timestamp).toLocaleTimeString()}</span>` : ''}
                                <br>
                                <small><strong>Input:</strong> ${JSON.stringify(args, null, 2)}</small><br>
                                <small><strong>Output:</strong> ${result}</small>
                            </div>
                        `;
                    });
                    content += `</div>`;
                }
            });
            return content || '<div style="padding: 12px;"><em>No tool execution details available</em></div>';
        }
        return `
            <div style="padding: 12px; background: white; border-radius: 4px; margin: 8px 0;">
                <strong>Tools Mode: ${data.metadata?.mode === 'tools' ? 'Enabled' : 'Disabled'}</strong><br>
                <small>${data.metadata?.mode === 'tools' ? 'Tools were used but detailed logs are not available.' : 'No tools were executed for this query.'}</small>
            </div>
        `;
    });
    
    createExpandableSection(responseContainer, 'LLM Queries', '🤖', () => {
        if (data.llmCalls && data.llmCalls.length > 0) {
            let content = '';
            data.llmCalls.forEach((call, index) => {
                content += `
                    <div style="padding: 8px; background: white; border-radius: 4px; margin: 4px 0; border-left: 3px solid #28a745;">
                        <strong>LLM Call ${index + 1}</strong>
                        ${call.timestamp ? `<span style="float: right; font-size: 0.8em; color: #666;">${new Date(call.timestamp).toLocaleTimeString()}</span>` : ''}
                        <br>
                        <small><strong>Description:</strong> ${call.description || 'LLM processing step'}</small><br>
                        <small><strong>Tokens:</strong> ${call.inputTokens || 0} in, ${call.outputTokens || 0} out</small><br>
                        <small><strong>Cost:</strong> $${(call.cost || 0).toFixed(6)}</small>
                    </div>
                `;
            });
            return content;
        }
        return `
            <div style="padding: 12px; background: white; border-radius: 4px; margin: 8px 0;">
                <strong>LLM Processing</strong><br>
                <div>Model: ${data.metadata?.finalModel || 'Unknown'}</div>
                <div>Total LLM Calls: ${data.metadata?.totalLLMCalls || 0}</div>
                <div>Query: "${data.query}"</div>
                <div>Response Length: ${data.response?.length || 0} characters</div>
                <small>Detailed LLM call logs are not available in this response.</small>
            </div>
        `;
    });
    
    createExpandableSection(responseContainer, 'Cost Analysis', '💰', () => {
        if (data.costSummary) {
            let content = `
                <div style="padding: 12px; background: white; border-radius: 4px; margin: 8px 0;">
                    <strong>Cost Summary</strong><br>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 8px 0;">
                        <div><strong>Total Cost:</strong> $${(data.costSummary.totalCost || 0).toFixed(6)}</div>
                        <div><strong>Total Tokens:</strong> ${data.costSummary.totalTokens || 0}</div>
                        <div><strong>Model:</strong> ${data.costSummary.modelName || 'Unknown'}</div>
                        <div><strong>Provider:</strong> ${data.costSummary.provider || 'Unknown'}</div>
                    </div>
                </div>
            `;
            
            if (data.costSummary.steps && data.costSummary.steps.length > 0) {
                content += '<div style="margin-top: 8px;"><strong>Cost Breakdown:</strong></div>';
                data.costSummary.steps.forEach((step, index) => {
                    content += `
                        <div style="padding: 6px; background: #f8f9fa; border-radius: 4px; margin: 2px 0; font-size: 0.9em;">
                            <strong>Step ${index + 1}:</strong> ${step.description || 'Processing step'} - 
                            $${(step.cost || 0).toFixed(6)} (${step.inputTokens || 0}→${step.outputTokens || 0} tokens)
                        </div>
                    `;
                });
            }
            
            return content;
        }
        return `
            <div style="padding: 12px; background: white; border-radius: 4px; margin: 8px 0;">
                <strong>Cost Information</strong><br>
                <div>Processing Time: ${data.processingTime ? `${(data.processingTime / 1000).toFixed(2)}s` : 'Unknown'}</div>
                <div>Model: ${data.metadata?.finalModel || 'Unknown'}</div>
                <div>Total Tool Calls: ${data.metadata?.totalToolCalls || 0}</div>
                <div>Total LLM Calls: ${data.metadata?.totalLLMCalls || 0}</div>
                <small>Detailed cost breakdown is not available for this response.</small>
            </div>
        `;
    });
    
    // Display search information if available
    if (data.searches && data.searches.length > 0) {
        createExpandableSection(responseContainer, 'Search Queries', '🔍', () => {
            return `
                <ul style="margin: 8px 0; padding-left: 20px;">
                    ${data.searches.map(search => `<li>${search}</li>`).join('')}
                </ul>
            `;
        });
    }
    
    if (data.searchResults && data.searchResults.length > 0) {
        createExpandableSection(responseContainer, 'Search Results', '📄', () => {
            return data.searchResults.map(result => `
                <div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e9ecef;">
                    <strong>${result.title || 'Result'}</strong><br>
                    ${result.url ? `<small><a href="${result.url}" target="_blank">${result.url}</a></small><br>` : ''}
                    ${result.snippet || result.content || ''}
                </div>
            `).join('');
        });
    }
    
        // Enable response actions when complete
        uiManager.enableResponseActions();
        uiManager.updateStatus('Request completed');
        console.log('✅ JSON response handling completed successfully');
        
    } catch (error) {
        console.error('❌ Error in handleJsonResponse:', error);
        responseContainer.innerHTML = `
            <div style="color: red; padding: 16px; background: #fff5f5; border: 1px solid #fed7d7; border-radius: 8px;">
                <strong>Error displaying response:</strong><br>
                ${error.message}<br>
                <small>Check the browser console for more details.</small>
            </div>
        `;
        uiManager.updateStatus('Error processing response');
    }
}

/**
 * Create an expandable/collapsible section
 */
function createExpandableSection(container, title, icon, contentGenerator) {
    const sectionDiv = document.createElement('div');
    sectionDiv.style.cssText = 'margin-top: 20px;';
    
    const isExpanded = false; // Start collapsed
    const toggleId = `toggle-${title.replace(/\s+/g, '-').toLowerCase()}`;
    const contentId = `content-${title.replace(/\s+/g, '-').toLowerCase()}`;
    
    sectionDiv.innerHTML = `
        <div onclick="toggleSection('${contentId}', '${toggleId}')" 
             style="background: linear-gradient(135deg, #6c757d 0%, #495057 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px;">
            <span id="${toggleId}">▶</span> ${icon} ${title}
        </div>
        <div id="${contentId}" style="background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px; max-height: 400px; overflow-y: auto; display: none;">
            <div style="padding: 12px;">
                ${contentGenerator()}
            </div>
        </div>
    `;
    
    container.appendChild(sectionDiv);
}

// Global function for toggling sections
window.toggleSection = function(contentId, toggleId) {
    const content = document.getElementById(contentId);
    const toggle = document.getElementById(toggleId);
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        content.style.display = 'none';
        toggle.textContent = '▶';
    }
};

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