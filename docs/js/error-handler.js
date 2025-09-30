// error-handler.js - Error handling and quota management

/**
 * Error handler for managing quota errors and continuation logic
 */
class ErrorHandler {
    constructor(stateManager, toastManager) {
        this.stateManager = stateManager;
        this.toastManager = toastManager;
    }

    /**
     * Detect if an error message indicates a quota/rate limit issue
     * @param {string} errorMessage - The error message to check
     * @returns {boolean} - True if it's a quota error
     */
    isQuotaLimitError(errorMessage) {
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

    /**
     * Handle quota/limits error by setting up continuation state
     * @param {string} errorMessage - The error message
     * @param {Object} formData - The form data from the request
     * @param {string} existingResponse - Any existing response content
     */
    handleQuotaError(errorMessage, formData, existingResponse) {
        const continuationState = this.stateManager.continuationState;
        
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
                toolCallCycles: [...this.stateManager.toolCallCycles],
                llmCalls: [...this.stateManager.llmCalls],
                searchResults: [...continuationState.workState.searchResults],
                currentIteration: continuationState.workState.currentIteration,
                totalCost: this.stateManager.totalCost,
                totalTokens: this.stateManager.totalTokens,
                persona: this.stateManager.currentPersona,
                questions: [...this.stateManager.currentQuestions],
                setupData: { ...this.stateManager.currentSetupData }
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

    /**
     * Trigger continuation of a paused request
     */
    triggerContinuation() {
        const continuationState = this.stateManager.continuationState;
        
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
                    toolCallCycles: this.stateManager.toolCallCycles,
                    llmCalls: this.stateManager.llmCalls,
                    searchResults: continuationState.savedContext?.workState?.searchResults || [],
                    currentIteration: this.stateManager.toolCallCycles.length,
                    totalCost: this.stateManager.totalCost,
                    totalTokens: this.stateManager.totalTokens,
                    persona: this.stateManager.currentPersona,
                    questions: this.stateManager.currentQuestions,
                    setupData: this.stateManager.currentSetupData
                }
            },
            retryAttempt: continuationState.retryCount
        };
        
        // Debug logging
        console.log('📦 CONTINUATION PAYLOAD STRUCTURE:', {
            continuation: formData.continuation,
            hasContext: !!formData.continuationContext,
            hasWorkState: !!formData.continuationContext?.workState,
            workStateKeys: formData.continuationContext?.workState ? Object.keys(formData.continuationContext.workState) : [],
            toolCallCyclesInPayload: {
                length: formData.continuationContext?.workState?.toolCallCycles?.length || 'undefined',
                isArray: Array.isArray(formData.continuationContext?.workState?.toolCallCycles)
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

    /**
     * Handle general errors (non-quota)
     * @param {Error|string} error - The error to handle
     * @param {string} context - Context where the error occurred
     */
    handleGeneralError(error, context = 'Unknown') {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error in ${context}:`, error);
        
        this.toastManager.showError(`Error in ${context}: ${message}`);
    }

    /**
     * Handle network errors
     * @param {Error} error - The network error
     * @param {HTMLElement} responseContainer - Container to show error message
     */
    handleNetworkError(error, responseContainer) {
        console.error('❌ Network error:', error);
        
        if (responseContainer) {
            if (error.name === 'AbortError') {
                responseContainer.textContent = 'Request was cancelled.';
            } else if (error.message && error.message.includes('timeout')) {
                responseContainer.textContent = `Request Timeout Error:\\n\\nThe request timed out after 90 seconds.`;
            } else {
                responseContainer.textContent = `Network Error:\\n\\n${error.message}`;
            }
        }
        
        this.toastManager.showError(error.message || 'Network error occurred');
    }
}

// Create singleton instance
const errorHandler = new ErrorHandler(
    window.stateManager || stateManager,
    window.toastManager || toastManager
);

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ErrorHandler, errorHandler };
}

// Global access for existing code
window.errorHandler = errorHandler;

// Export legacy functions for backward compatibility
window.isQuotaLimitError = (errorMessage) => errorHandler.isQuotaLimitError(errorMessage);
window.handleQuotaError = (errorMessage, formData, existingResponse) => 
    errorHandler.handleQuotaError(errorMessage, formData, existingResponse);
window.triggerContinuation = () => errorHandler.triggerContinuation();