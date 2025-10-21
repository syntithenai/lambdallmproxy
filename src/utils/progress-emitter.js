/**
 * Progress Event Emitter for SSE Streaming
 * Sends progress updates to frontend during transcription
 */

/**
 * Progress event types
 */
const EventTypes = {
    // Transcription events
    YOUTUBE_DOWNLOAD_START: 'youtube_download_start',
    YOUTUBE_DOWNLOAD_PROGRESS: 'youtube_download_progress',
    YOUTUBE_DOWNLOAD_COMPLETE: 'youtube_download_complete',
    DOWNLOAD_START: 'download_start',
    DOWNLOAD_PROGRESS: 'download_progress',
    DOWNLOAD_COMPLETE: 'download_complete',
    METADATA: 'metadata',
    CHUNKING_START: 'chunking_start',
    CHUNK_READY: 'chunk_ready',
    TRANSCRIBE_START: 'transcribe_start',
    TRANSCRIBE_CHUNK_COMPLETE: 'transcribe_chunk_complete',
    TRANSCRIBE_COMPLETE: 'transcribe_complete',
    TRANSCRIPTION_STOPPED: 'transcription_stopped',
    
    // Scraping events
    SCRAPE_LAUNCHING: 'scrape_launching',
    SCRAPE_LAUNCHED: 'scrape_launched',
    SCRAPE_NAVIGATING: 'scrape_navigating',
    SCRAPE_PAGE_LOADED: 'scrape_page_loaded',
    SCRAPE_WAITING_SELECTOR: 'scrape_waiting_selector',
    SCRAPE_EXTRACTING: 'scrape_extracting',
    SCRAPE_EXTRACTED: 'scrape_extracted',
    SCRAPE_SCREENSHOT: 'scrape_screenshot',
    SCRAPE_COMPLETE: 'scrape_complete',
    SCRAPE_ERROR: 'scrape_error',
    
    // Generic
    ERROR: 'error'
};

/**
 * Create progress emitter for a tool execution
 * @param {Function} writeEvent - SSE write function from streaming handler
 * @param {string} toolCallId - Unique ID for this tool execution
 * @param {string} toolName - Name of the tool being executed
 * @returns {Function} Progress callback function
 */
function createProgressEmitter(writeEvent, toolCallId, toolName = 'transcribe_url') {
    if (!writeEvent || typeof writeEvent !== 'function') {
        // Return no-op function if writeEvent is not available
        return () => {};
    }

    return (event) => {
        try {
            const progressEvent = {
                tool_call_id: toolCallId,
                tool_name: toolName,
                progress_type: event.type,
                data: event,
                timestamp: new Date().toISOString()
            };

            // writeEvent expects (type, data) as two separate parameters
            writeEvent('tool_progress', progressEvent);
        } catch (error) {
            console.error('Error emitting progress event:', error);
        }
    };
}

/**
 * Format progress event for SSE
 * @param {Object} event - Progress event
 * @returns {string} SSE-formatted event
 */
function formatProgressEvent(event) {
    return `event: tool_progress\ndata: ${JSON.stringify(event)}\n\n`;
}

module.exports = {
    EventTypes,
    createProgressEmitter,
    formatProgressEvent
};
