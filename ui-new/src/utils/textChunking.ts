/**
 * Text Chunking Utility
 * 
 * Splits long text into smaller chunks for TTS processing.
 * Ensures chunks don't exceed max size while preserving sentence boundaries.
 */

/**
 * Split text into sentence-level chunks for fine-grained TTS control
 * Each sentence becomes a separate chunk for precise playback positioning
 * 
 * @param text - The text to chunk
 * @returns Array of sentence chunks
 */
export function chunkTextBySentences(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Split by sentence boundaries (., !, ?, followed by space/newline or end)
  // This regex handles:
  // - Sentences ending with .!? followed by space/newline/end
  // - Multiple punctuation marks (e.g., "!!" or "?!")
  // - Text at the end without punctuation
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
  
  // Debug logging to see what sentences are being created
  console.log('🔤 chunkTextBySentences: Split text into', sentences.length, 'sentences');
  sentences.forEach((s, i) => {
    console.log(`   Sentence ${i + 1}: "${s.trim().substring(0, 60)}..." (${s.trim().length} chars)`);
  });
  
  return sentences
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Group sentences into playback chunks for smooth TTS
 * Creates ~250 char chunks by combining sentences, while tracking sentence boundaries
 * 
 * @param sentences - Array of individual sentences
 * @returns Object with playbackChunks and sentenceMap (maps playback chunk index to sentence indices)
 */
export function groupSentencesForPlayback(sentences: string[]): {
  playbackChunks: string[];
  sentenceMap: number[][]; // Maps playback chunk index to array of sentence indices
} {
  if (!sentences || sentences.length === 0) {
    return { playbackChunks: [], sentenceMap: [] };
  }

  const playbackChunks: string[] = [];
  const sentenceMap: number[][] = [];
  const targetChunkSize = 250; // Target ~250 chars for smooth playback
  
  let currentChunk = '';
  let currentSentences: number[] = [];
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    // If adding this sentence would exceed target AND we already have content, start new chunk
    if (currentChunk.length > 0 && currentChunk.length + sentence.length > targetChunkSize) {
      playbackChunks.push(currentChunk.trim());
      sentenceMap.push([...currentSentences]);
      currentChunk = sentence;
      currentSentences = [i];
    } else {
      // Add to current chunk
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentSentences.push(i);
    }
  }
  
  // Add final chunk
  if (currentChunk) {
    playbackChunks.push(currentChunk.trim());
    sentenceMap.push([...currentSentences]);
  }
  
  return { playbackChunks, sentenceMap };
}

/**
 * Split text into chunks suitable for TTS processing
 * 
 * @param text - The text to chunk
 * @param maxChunkSize - Maximum size of each chunk in characters (default: 500)
 * @returns Array of text chunks
 */
export function chunkText(text: string, maxChunkSize: number = 500): string[] {
  // If text is already short enough, return as single chunk
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  
  // Split by sentence boundaries (., !, ?, followed by space or end)
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [text];
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    
    // If single sentence is longer than maxChunkSize, split it by clauses/phrases
    if (trimmedSentence.length > maxChunkSize) {
      // First, save any accumulated text
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // Split long sentence by common phrase boundaries
      const phrases = splitLongSentence(trimmedSentence, maxChunkSize);
      chunks.push(...phrases);
      continue;
    }
    
    // If adding this sentence would exceed max size, start new chunk
    if (currentChunk.length + trimmedSentence.length + 1 > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = trimmedSentence;
    } else {
      // Add to current chunk
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }
  
  // Add final chunk if any
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Split a very long sentence by phrase boundaries
 * 
 * @param sentence - Long sentence to split
 * @param maxSize - Maximum chunk size
 * @returns Array of phrase chunks
 */
function splitLongSentence(sentence: string, maxSize: number): string[] {
  const chunks: string[] = [];
  
  // Try splitting by common phrase boundaries (commas, semicolons, dashes, etc.)
  const phraseSeparators = /([,;:\-—])\s+/g;
  const parts = sentence.split(phraseSeparators);
  
  let currentChunk = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // Skip separator tokens (they're captured in the split)
    if (i > 0 && i % 2 === 1) {
      currentChunk += part; // Add the separator back
      continue;
    }
    
    // If single part is still too long, split by words
    if (part.length > maxSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      const wordChunks = splitByWords(part, maxSize);
      chunks.push(...wordChunks);
      continue;
    }
    
    // If adding this part would exceed max size, start new chunk
    if (currentChunk.length + part.length > maxSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = part;
    } else {
      currentChunk += part;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Split text by word boundaries (last resort for very long phrases)
 * 
 * @param text - Text to split
 * @param maxSize - Maximum chunk size
 * @returns Array of word chunks
 */
function splitByWords(text: string, maxSize: number): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  
  let currentChunk = '';
  
  for (const word of words) {
    // If single word is longer than maxSize, just add it as is
    if (word.length > maxSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      chunks.push(word);
      continue;
    }
    
    if (currentChunk.length + word.length + 1 > maxSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = word;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + word;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}
