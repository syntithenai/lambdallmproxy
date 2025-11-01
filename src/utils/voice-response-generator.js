/**
 * Voice Response Generator
 * 
 * Utilities for parsing and generating voice-optimized responses
 * from LLM outputs in continuous voice mode.
 */

/**
 * Parse LLM response to extract voiceResponse and fullResponse
 * @param {string} content - The LLM response content
 * @returns {Object|null} - Parsed response with voiceResponse and fullResponse, or null if not valid JSON
 */
function parseVoiceResponse(content) {
    if (!content || typeof content !== 'string') {
        return null;
    }

    // Try to parse as JSON
    try {
        // Remove markdown code blocks if present
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
            cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsed = JSON.parse(cleanContent);
        
        // Validate structure
        if (parsed && typeof parsed === 'object' && 
            parsed.voiceResponse && typeof parsed.voiceResponse === 'string' &&
            parsed.fullResponse && typeof parsed.fullResponse === 'string') {
            return {
                voiceResponse: parsed.voiceResponse.trim(),
                fullResponse: parsed.fullResponse.trim()
            };
        }
    } catch (e) {
        // Not valid JSON, return null
    }

    return null;
}

/**
 * Check if content is long enough to warrant a short response
 * @param {string} content - The content to check
 * @returns {boolean} - True if short response should be generated
 */
function shouldGenerateShortResponse(content) {
    if (!content) return false;
    
    // Generate short response if content is longer than 500 characters
    // or has multiple paragraphs/sections
    return content.length > 500 || content.split('\n\n').length > 2;
}

/**
 * Generate a short response suitable for text-to-speech
 * @param {string} content - The full content
 * @param {number} maxLength - Maximum length of short response
 * @returns {string} - Short response
 */
function generateShortResponse(content, maxLength = 200) {
    if (!content) return '';
    
    // Remove markdown formatting
    let text = content
        .replace(/#{1,6}\s+/g, '') // Remove headings
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .replace(/`(.+?)`/g, '$1') // Remove code
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links, keep text
        .replace(/!\[.+?\]\(.+?\)/g, '') // Remove images
        .replace(/^[-*+]\s+/gm, '') // Remove list markers
        .replace(/^\d+\.\s+/gm, '') // Remove numbered lists
        .trim();
    
    // Split into sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) return text.substring(0, maxLength);
    
    // Build response from first sentences until we hit max length
    let shortResponse = '';
    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (shortResponse.length + trimmed.length + 2 > maxLength) {
            break;
        }
        shortResponse += (shortResponse ? '. ' : '') + trimmed;
    }
    
    // If we got at least one sentence, add period
    if (shortResponse && !shortResponse.match(/[.!?]$/)) {
        shortResponse += '.';
    }
    
    // If still empty or too short, just truncate original
    if (!shortResponse || shortResponse.length < 20) {
        shortResponse = text.substring(0, maxLength);
        if (!shortResponse.match(/[.!?]$/)) {
            shortResponse += '...';
        }
    }
    
    return shortResponse;
}

module.exports = {
    parseVoiceResponse,
    shouldGenerateShortResponse,
    generateShortResponse
};
