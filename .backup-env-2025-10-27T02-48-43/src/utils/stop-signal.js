/**
 * Stop Signal Handler
 * Manages stop signals for long-running tool executions
 */

// In-memory store for stop signals
// In production with multiple Lambda instances, use Redis or DynamoDB
const stopSignals = new Map();

/**
 * Register a stop signal for a tool execution
 * @param {string} toolCallId - Unique tool call ID
 */
function registerStopSignal(toolCallId) {
    stopSignals.set(toolCallId, {
        stopped: true,
        timestamp: Date.now()
    });
    
    console.log(`🛑 Stop signal registered for tool call: ${toolCallId}`);
}

/**
 * Check if a stop signal exists for a tool execution
 * @param {string} toolCallId - Unique tool call ID
 * @returns {boolean} True if stopped
 */
function checkStopSignal(toolCallId) {
    const signal = stopSignals.get(toolCallId);
    return signal && signal.stopped === true;
}

/**
 * Clear a stop signal
 * @param {string} toolCallId - Unique tool call ID
 */
function clearStopSignal(toolCallId) {
    const hadSignal = stopSignals.has(toolCallId);
    stopSignals.delete(toolCallId);
    
    if (hadSignal) {
        console.log(`✅ Stop signal cleared for tool call: ${toolCallId}`);
    }
}

/**
 * Cleanup old stop signals (older than 1 hour)
 */
function cleanupOldSignals() {
    const oneHourAgo = Date.now() - 3600000;
    let cleaned = 0;
    
    for (const [toolCallId, signal] of stopSignals.entries()) {
        if (signal.timestamp < oneHourAgo) {
            stopSignals.delete(toolCallId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} old stop signals`);
    }
}

// Cleanup every 15 minutes
const cleanupInterval = setInterval(cleanupOldSignals, 15 * 60 * 1000);

// Clear interval on module unload (for testing)
if (typeof process !== 'undefined' && process.on) {
    process.on('beforeExit', () => {
        clearInterval(cleanupInterval);
    });
}

module.exports = {
    registerStopSignal,
    checkStopSignal,
    clearStopSignal,
    cleanupOldSignals
};
