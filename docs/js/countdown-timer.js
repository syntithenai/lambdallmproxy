// countdown-timer.js - Countdown timer functionality for rate limit handling

// Countdown timer state (part of continuation state)
// Note: continuationState is defined in main.js, we just reference the timer-related parts

/**
 * Start countdown timer for continuation after rate limits
 * Uses continuationState.remainingSeconds which should be set by handleQuotaError
 */
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

/**
 * Parse wait time from error message
 * Supports various formats: milliseconds, seconds, minutes
 * @param {string} errorMessage - The error message to parse
 * @returns {number} - Wait time in seconds
 */
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
                seconds = Math.ceil(value / 1000); // Convert ms to seconds, round up
            } else if (isMinutes) {
                seconds = Math.ceil(value * 60); // Convert minutes to seconds
            } else {
                seconds = Math.ceil(value); // Already in seconds, round up
            }
            
            // Ensure reasonable bounds (1 second to 10 minutes)
            seconds = Math.max(1, Math.min(seconds, 600));
            console.log(`⏰ Parsed wait time: ${seconds}s from "${match[0]}" (original: ${value}${isMinutes ? 'm' : isMilliseconds ? 'ms' : 's'})`);
            return seconds;
        }
    }
    
    // Default fallback
    return 60;
}

/**
 * Stop countdown timer
 * Clears the timer and resets the active state
 */
function stopContinuationCountdown() {
    continuationState.isActive = false;
    if (continuationState.countdownTimer) {
        clearTimeout(continuationState.countdownTimer);
        continuationState.countdownTimer = null;
    }
}

/**
 * Stop countdown and reset to normal UI state
 * Called when user manually stops the countdown
 */
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

/**
 * Show continuation UI (hide submit, show continue and stop)
 * Sets up the UI for countdown mode
 */
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

/**
 * Hide continuation UI (show submit, hide continue)
 * Returns UI to normal state after successful completion
 */
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

// Global function for continuation button clicks (referenced in HTML)
function continueRequest() {
    triggerContinuation();
}