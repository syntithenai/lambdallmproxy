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
 * Create an SSE stream adapter for responseStream
 * @param {Object} responseStream - AWS Lambda response stream
 * @returns {Object} Stream adapter with writeEvent method
 */
function createSSEStreamAdapter(responseStream) {
    return {
        writeEvent: (type, data) => {
            try {
                const eventText = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
                responseStream.write(eventText);
            } catch (error) {
                console.error('Error writing SSE event:', error);
            }
        },
        write: (data) => {
            try {
                responseStream.write(`data: ${JSON.stringify(data)}\n\n`);
            } catch (error) {
                console.error('Error writing SSE data:', error);
            }
        }
    };
}

module.exports = {
    StreamingResponse,
    createSSEStreamAdapter
};