/**
 * Text Preprocessing Utilities for TTS
 * 
 * Functions to clean and prepare text content for speech synthesis
 */

/**
 * Clean and prepare text for speech synthesis
 */
export function prepareTextForSpeech(text: string): string {
  let cleaned = text;
  
  // Remove markdown formatting
  cleaned = cleaned.replace(/#{1,6}\s/g, ''); // Headers
  cleaned = cleaned.replace(/\*\*\*(.*?)\*\*\*/g, '$1'); // Bold+Italic
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1'); // Italic
  cleaned = cleaned.replace(/`{1,3}[^`]*`{1,3}/g, 'code'); // Code blocks
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Links
  
  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  
  // Replace common symbols with words
  cleaned = cleaned.replace(/&/g, ' and ');
  cleaned = cleaned.replace(/@/g, ' at ');
  cleaned = cleaned.replace(/#/g, ' hashtag ');
  cleaned = cleaned.replace(/\$/g, ' dollar ');
  cleaned = cleaned.replace(/%/g, ' percent ');
  
  // Remove special characters but keep punctuation
  cleaned = cleaned.replace(/[^\w\s.,!?;:'"()[\]{}\-]/g, ' ');
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Add pauses for better speech flow
  cleaned = cleaned.replace(/\. /g, '. ... '); // Longer pause after sentences
  cleaned = cleaned.replace(/, /g, ', .. '); // Shorter pause after commas
  cleaned = cleaned.replace(/: /g, ': .. '); // Pause after colons
  cleaned = cleaned.replace(/; /g, '; .. '); // Pause after semicolons
  
  return cleaned;
}

/**
 * Extract speakable text from message content
 */
export function extractSpeakableText(content: string | any[]): string {
  if (typeof content === 'string') {
    return prepareTextForSpeech(content);
  }
  
  // Handle array content (multimodal messages)
  if (Array.isArray(content)) {
    const textParts = content
      .filter(part => part.type === 'text')
      .map(part => part.text || part.content || '');
    return prepareTextForSpeech(textParts.join(' '));
  }
  
  // Handle object content
  if (content && typeof content === 'object') {
    const text = (content as any).text || (content as any).content || '';
    return prepareTextForSpeech(String(text));
  }
  
  return '';
}

/**
 * Truncate long text with summary indicator
 */
export function truncateForSpeech(text: string, maxLength: number = 500): string {
  if (text.length <= maxLength) return text;
  
  // Find a good breaking point (sentence end)
  const truncated = text.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  
  if (lastSentenceEnd > maxLength * 0.7) {
    return truncated.substring(0, lastSentenceEnd + 1) + ' ... Content truncated for speech.';
  }
  
  return truncated + '... Content truncated for speech.';
}

/**
 * Determine if content should be summarized based on length and settings
 */
export function shouldSummarizeForSpeech(text: string, autoSummarize: boolean, threshold: number = 500): boolean {
  if (!autoSummarize) return false;
  return text.length > threshold;
}

/**
 * Convert base64 data to Blob (utility for audio handling)
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Detect gender from voice name (heuristic)
 */
export function detectGenderFromVoiceName(name: string): 'male' | 'female' | 'neutral' {
  const nameLower = name.toLowerCase();
  
  // Common female voice indicators
  if (nameLower.includes('female') || 
      nameLower.includes('woman') || 
      nameLower.includes('alice') || 
      nameLower.includes('emma') || 
      nameLower.includes('nova') || 
      nameLower.includes('shimmer') ||
      nameLower.includes('samantha') ||
      nameLower.includes('victoria') ||
      nameLower.includes('alloy')) {
    return 'female';
  }
  
  // Common male voice indicators
  if (nameLower.includes('male') || 
      nameLower.includes('man') || 
      nameLower.includes('alex') || 
      nameLower.includes('daniel') || 
      nameLower.includes('onyx') || 
      nameLower.includes('echo') ||
      nameLower.includes('thomas') ||
      nameLower.includes('david')) {
    return 'male';
  }
  
  // Default to neutral if can't determine
  return 'neutral';
}