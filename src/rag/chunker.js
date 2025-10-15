/**
 * Text Chunking Module for RAG
 * 
 * Implements recursive character splitting with overlap to create
 * chunks suitable for embedding generation.
 */

/**
 * Default chunking configuration
 */
const DEFAULT_CONFIG = {
  chunkSize: 1000,        // characters (~250 tokens)
  chunkOverlap: 200,      // 20% overlap for context continuity
  separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', '']
};

/**
 * Estimate token count from character count
 * Rule of thumb: ~4 characters per token for English text
 */
function estimateTokenCount(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Split text recursively using separators
 * @param {string} text - Text to split
 * @param {Array<string>} separators - List of separators to try
 * @param {number} chunkSize - Target chunk size in characters
 * @returns {Array<string>} - Array of text chunks
 */
function recursiveSplit(text, separators, chunkSize) {
  if (!text || text.length === 0) {
    return [];
  }

  // If text is small enough, return it as-is
  if (text.length <= chunkSize) {
    return [text];
  }

  // Try each separator
  for (const separator of separators) {
    if (separator === '') {
      // Last resort: character-by-character split
      const chunks = [];
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
      }
      return chunks;
    }

    if (text.includes(separator)) {
      // Split by this separator
      const splits = text.split(separator);
      const chunks = [];
      let currentChunk = '';

      for (let i = 0; i < splits.length; i++) {
        const part = splits[i];
        const partWithSep = i < splits.length - 1 ? part + separator : part;

        // If adding this part would exceed chunk size
        if (currentChunk.length + partWithSep.length > chunkSize) {
          // Save current chunk if not empty
          if (currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }

          // If single part is still too large, recursively split it
          if (partWithSep.length > chunkSize) {
            const subChunks = recursiveSplit(
              partWithSep,
              separators.slice(separators.indexOf(separator) + 1),
              chunkSize
            );
            chunks.push(...subChunks);
          } else {
            currentChunk = partWithSep;
          }
        } else {
          currentChunk += partWithSep;
        }
      }

      // Add remaining chunk
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
      }

      return chunks.filter(chunk => chunk.length > 0);
    }
  }

  // Fallback: character split
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Add overlap between chunks
 * @param {Array<string>} chunks - Array of chunks
 * @param {number} overlap - Number of characters to overlap
 * @returns {Array<string>} - Chunks with overlap added
 */
function addOverlap(chunks, overlap) {
  if (overlap === 0 || chunks.length <= 1) {
    return chunks;
  }

  const overlappedChunks = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];
    const currentChunk = chunks[i];

    // Get overlap from end of previous chunk
    const overlapText = prevChunk.slice(-overlap);

    // Prepend overlap to current chunk
    const chunkWithOverlap = overlapText + currentChunk;
    overlappedChunks.push(chunkWithOverlap);
  }

  return overlappedChunks;
}

/**
 * Detect and preserve code blocks in markdown
 * @param {string} text - Text to process
 * @returns {Array<{type: string, content: string}>} - Segments
 */
function segmentMarkdown(text) {
  const segments = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }

    // Add code block
    segments.push({
      type: 'code',
      content: match[0]
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex)
    });
  }

  return segments.length > 0 ? segments : [{type: 'text', content: text}];
}

/**
 * Main chunking function
 * @param {string} text - Text to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.chunkSize - Target chunk size in characters
 * @param {number} options.chunkOverlap - Overlap size in characters
 * @param {Array<string>} options.separators - Separators to use
 * @param {boolean} options.markdownAware - Preserve code blocks
 * @param {Object} options.sourceMetadata - Source tracking information
 * @param {string} options.sourceMetadata.source_type - 'file' | 'url' | 'text'
 * @param {string} options.sourceMetadata.source_url - Original URL if provided
 * @param {string} options.sourceMetadata.source_file_path - File path if uploaded
 * @param {string} options.sourceMetadata.source_file_name - Original filename
 * @param {string} options.sourceMetadata.source_mime_type - MIME type
 * @returns {Array<Object>} - Array of chunk objects
 */
function chunkText(text, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }

  let segments = [{type: 'text', content: text}];

  // If markdown-aware, segment first
  if (config.markdownAware) {
    segments = segmentMarkdown(text);
  }

  // Process each segment
  let allChunks = [];
  for (const segment of segments) {
    if (segment.type === 'code' && segment.content.length <= config.chunkSize) {
      // Keep small code blocks intact
      allChunks.push(segment.content);
    } else {
      // Split normally
      const chunks = recursiveSplit(
        segment.content,
        config.separators,
        config.chunkSize
      );
      allChunks.push(...chunks);
    }
  }

  // Add overlap
  if (config.chunkOverlap > 0) {
    allChunks = addOverlap(allChunks, config.chunkOverlap);
  }

  // Create chunk objects with metadata
  return allChunks.map((chunk, index) => {
    const chunkObj = {
      chunk_index: index,
      chunk_text: chunk.trim(),
      token_count: estimateTokenCount(chunk),
      char_count: chunk.length
    };

    // Add source metadata if provided
    if (config.sourceMetadata) {
      chunkObj.source_type = config.sourceMetadata.source_type || 'text';
      if (config.sourceMetadata.source_url) {
        chunkObj.source_url = config.sourceMetadata.source_url;
      }
      if (config.sourceMetadata.source_file_path) {
        chunkObj.source_file_path = config.sourceMetadata.source_file_path;
      }
      if (config.sourceMetadata.source_file_name) {
        chunkObj.source_file_name = config.sourceMetadata.source_file_name;
      }
      if (config.sourceMetadata.source_mime_type) {
        chunkObj.source_mime_type = config.sourceMetadata.source_mime_type;
      }
    }

    return chunkObj;
  });
}

/**
 * Calculate total chunks and tokens for a text
 * @param {string} text - Text to analyze
 * @param {Object} options - Chunking options
 * @returns {Object} - Statistics
 */
function getChunkingStats(text, options = {}) {
  const chunks = chunkText(text, options);
  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.token_count, 0);
  const totalChars = text.length;

  return {
    totalChunks: chunks.length,
    totalTokens,
    totalChars,
    avgChunkSize: Math.round(totalChars / chunks.length),
    avgTokensPerChunk: Math.round(totalTokens / chunks.length)
  };
}

module.exports = {
  chunkText,
  getChunkingStats,
  DEFAULT_CONFIG,
  estimateTokenCount
};
