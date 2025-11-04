/**
 * Server-Sent Events (SSE) writer for streaming responses
 * Handles formatting and writing of SSE events
 */

/**
 * Create a streaming response accumulator
 */
class StreamingResponse {
    constructor() {
        this.chunks = [];
    }
    
    write(data) {
        this.chunks.push(`data: ${JSON.stringify(data)}\n\n`);
    }
    
    writeEvent(type, data) {
        this.chunks.push(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    
    getResponse() {
        return this.chunks.join('');
    }
}

/**
 * Create an SSE stream adapter for responseStream with disconnect detection
 * @param {Object} responseStream - AWS Lambda response stream
 * @returns {Object} Stream adapter with writeEvent method and connection status
 */
function createSSEStreamAdapter(responseStream) {
    let isConnected = true;
    let lastWriteTime = Date.now();
    let checkInterval;
    
    // Check for stale connection every 10 seconds
    checkInterval = setInterval(() => {
        const timeSinceWrite = Date.now() - lastWriteTime;
        if (timeSinceWrite > 120000) { // 120 second timeout (increased for YouTube Selenium transcription)
            console.warn('⚠️ No writes for 120s, client likely disconnected');
            isConnected = false;
            clearInterval(checkInterval);
        }
    }, 10000);
    // Prevent keeping the event loop alive in tests/environments
    if (typeof checkInterval.unref === 'function') {
        checkInterval.unref();
    }
    
    // Cleanup interval when stream ends
    const originalEnd = responseStream.end ? responseStream.end.bind(responseStream) : null;
    if (originalEnd) {
        responseStream.end = function(...args) {
            clearInterval(checkInterval);
            return originalEnd(...args);
        };
    }
    
    return {
        writeEvent: (type, data) => {
            if (!isConnected) {
                console.log('❌ Client disconnected, not writing event:', type);
                throw new Error('CLIENT_DISCONNECTED');
            }
            
            try {
                const eventText = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
                responseStream.write(eventText);
                
                // Add padding to force Lambda to flush the buffer
                // Lambda buffers writes until ~8KB, so we add padding to trigger immediate flush
                // This ensures progress events are sent immediately, not buffered
                const padding = ': ' + ' '.repeat(8000) + '\n\n';
                responseStream.write(padding);
                
                lastWriteTime = Date.now();
            } catch (error) {
                console.error('❌ Error writing SSE event:', error);
                isConnected = false;
                clearInterval(checkInterval);
                throw new Error('CLIENT_DISCONNECTED');
            }
        },
        write: (data) => {
            if (!isConnected) {
                console.log('❌ Client disconnected, not writing data');
                throw new Error('CLIENT_DISCONNECTED');
            }
            
            try {
                responseStream.write(`data: ${JSON.stringify(data)}\n\n`);
                
                // Add padding to force Lambda to flush the buffer
                const padding = ': ' + ' '.repeat(8000) + '\n\n';
                responseStream.write(padding);
                
                lastWriteTime = Date.now();
            } catch (error) {
                console.error('❌ Error writing SSE data:', error);
                isConnected = false;
                clearInterval(checkInterval);
                throw new Error('CLIENT_DISCONNECTED');
            }
        },
        isConnected: () => isConnected,
        getLastWriteTime: () => lastWriteTime,
        // Allow manual cleanup in tests
        dispose: () => {
            clearInterval(checkInterval);
            isConnected = false;
        }
    };
}

module.exports = {
    StreamingResponse,
    createSSEStreamAdapter
};