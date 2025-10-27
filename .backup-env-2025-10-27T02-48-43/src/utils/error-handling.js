/**
 * Error handling utilities
 * Centralized error detection and parsing
 */

/**
 * Quota/rate limit error detection function (matches UI logic)
 * @param {string} errorMessage - Error message to check
 * @returns {boolean} True if this appears to be a quota/rate limit error
 */
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
    
    console.log(`🔍 Quota error check: "${errorMessage}" -> ${isQuotaError}`);
    return isQuotaError;
}

/**
 * Parse wait time from error message (matches UI logic)
 * @param {string} errorMessage - Error message containing wait time
 * @returns {number} Wait time in seconds (minimum 1, default 60)
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
                seconds = value / 1000;
            } else if (isMinutes) {
                seconds = value * 60;
            } else {
                seconds = value;
            }
            
            // Round up to ensure we don't retry too early
            seconds = Math.ceil(seconds);
            
            // Ensure minimum wait time of 1 second
            const waitTime = Math.max(1, seconds);
            console.log(`🔍 Parsed wait time from "${errorMessage}": ${waitTime}s (original: ${value}${isMilliseconds ? 'ms' : isMinutes ? 'min' : 's'})`);
            return waitTime;
        }
    }
    
    // Default fallback
    console.log(`🔍 No wait time found in "${errorMessage}", using default 60s`);
    return 60;
}

module.exports = {
    isQuotaLimitError,
    parseWaitTimeFromMessage
};