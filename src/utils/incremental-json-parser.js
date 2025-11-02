/**
 * Incremental JSON Parser for Streaming LLM Responses
 * 
 * Parses potentially incomplete JSON streams and extracts complete objects/arrays
 * as they become available. Handles markdown code fences and nested structures.
 */

class IncrementalJSONParser {
    constructor() {
        this.buffer = '';
        this.extractedItems = [];
        this.inCodeFence = false;
        this.jsonStarted = false;
        this.braceDepth = 0;
        this.bracketDepth = 0;
        this.inString = false;
        this.escapeNext = false;
    }

    /**
     * Add new chunk of text to parse
     * @param {string} chunk - New text chunk from stream
     * @returns {Array} Array of complete items extracted from this chunk
     */
    addChunk(chunk) {
        this.buffer += chunk;
        return this.extractCompleteItems();
    }

    /**
     * Extract complete items (questions/feed items) from buffer
     * @returns {Array} Array of complete items
     */
    extractCompleteItems() {
        const newItems = [];
        
        // Remove markdown code fences if present
        this.buffer = this.buffer.replace(/^```(?:json)?\s*/g, '');
        this.buffer = this.buffer.replace(/```\s*$/g, '');
        
        // Try to find the items array
        const itemsMatch = this.buffer.match(/"(?:items|questions)":\s*\[/);
        if (!itemsMatch) {
            return newItems; // No items array started yet
        }

        const arrayStart = itemsMatch.index + itemsMatch[0].length;
        let currentPos = arrayStart;
        let itemStart = -1;
        let depth = 0;
        let inString = false;
        let escapeNext = false;

        // Parse character by character to find complete objects
        for (let i = currentPos; i < this.buffer.length; i++) {
            const char = this.buffer[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
            }

            if (inString) {
                continue; // Skip everything inside strings
            }

            if (char === '{') {
                if (depth === 0) {
                    itemStart = i; // Start of new item
                }
                depth++;
            } else if (char === '}') {
                depth--;
                if (depth === 0 && itemStart >= 0) {
                    // Complete item found!
                    const itemJson = this.buffer.substring(itemStart, i + 1);
                    try {
                        const item = JSON.parse(itemJson);
                        
                        // Validate item has required fields
                        if (this.isValidItem(item)) {
                            newItems.push(item);
                            this.extractedItems.push(item);
                        }
                    } catch (e) {
                        // Item not yet complete or malformed, keep buffering
                        console.log('📋 Incremental parse: Item not yet complete');
                    }
                    itemStart = -1;
                }
            }
        }

        return newItems;
    }

    /**
     * Validate if item has all required fields
     * @param {Object} item - Parsed item object
     * @returns {boolean} True if valid
     */
    isValidItem(item) {
        // For quiz questions
        if (item.id && item.prompt && item.choices && item.correctChoiceId) {
            return Array.isArray(item.choices) && 
                   item.choices.length >= 2 &&
                   item.choices.every(c => c.id && c.text);
        }
        
        // For feed items
        if (item.type && item.title && item.content) {
            return true;
        }

        return false;
    }

    /**
     * Finalize parsing - try to extract any remaining valid items
     * @returns {Array} Any remaining complete items
     */
    finalize() {
        // Try one more extraction with current buffer
        const remaining = this.extractCompleteItems();
        
        // Clear state
        this.buffer = '';
        this.extractedItems = [];
        
        return remaining;
    }

    /**
     * Get all items extracted so far
     * @returns {Array} All extracted items
     */
    getAllItems() {
        return [...this.extractedItems];
    }

    /**
     * Get count of items extracted
     * @returns {number} Count of extracted items
     */
    getCount() {
        return this.extractedItems.length;
    }

    /**
     * Reset parser state
     */
    reset() {
        this.buffer = '';
        this.extractedItems = [];
        this.inCodeFence = false;
        this.jsonStarted = false;
        this.braceDepth = 0;
        this.bracketDepth = 0;
        this.inString = false;
        this.escapeNext = false;
    }
}

module.exports = { IncrementalJSONParser };
