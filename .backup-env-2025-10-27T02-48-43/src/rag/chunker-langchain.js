/**
 * Text Chunking Module for RAG using LangChain
 * 
 * Implements text splitting using LangChain's RecursiveCharacterTextSplitter
 * for industry-standard tokenization and chunking strategies.
 * 
 * Benefits over custom chunker:
 * - Battle-tested tokenization algorithms
 * - Better handling of code, markdown, and special characters
 * - Consistent with other LLM tools in the ecosystem
 * - Support for multiple languages and character sets
 */

const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { Document } = require('langchain/document');

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
 * Main chunking function using LangChain
 * @param {string} text - Text to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.chunkSize - Target chunk size in characters
 * @param {number} options.chunkOverlap - Overlap size in characters
 * @param {Array<string>} options.separators - Separators to use
 * @param {boolean} options.keepSeparator - Whether to keep separators in chunks (default: true)
 * @param {Object} options.sourceMetadata - Source tracking information
 * @param {string} options.sourceMetadata.source_type - 'file' | 'url' | 'text'
 * @param {string} options.sourceMetadata.source_url - Original URL if provided
 * @param {string} options.sourceMetadata.source_file_path - File path if uploaded
 * @param {string} options.sourceMetadata.source_file_name - Original filename
 * @param {string} options.sourceMetadata.source_mime_type - MIME type
 * @returns {Promise<Array<Object>>} - Array of chunk objects
 */
async function chunkText(text, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }

  try {
    // Create LangChain text splitter
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      separators: config.separators,
      keepSeparator: config.keepSeparator !== false, // default true
    });

    // Split the text
    const documents = await splitter.splitText(text);

    // Create chunk objects with metadata
    return documents.map((chunk, index) => {
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
  } catch (error) {
    console.error('Error chunking text with LangChain:', error);
    // Fallback to simple chunking if LangChain fails
    return fallbackChunk(text, config);
  }
}

/**
 * Fallback chunking if LangChain fails
 * Simple character-based splitting
 */
function fallbackChunk(text, config) {
  const chunks = [];
  const chunkSize = config.chunkSize;
  const overlap = config.chunkOverlap;

  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    const chunk = text.slice(i, i + chunkSize);
    if (chunk.trim().length > 0) {
      chunks.push({
        chunk_index: chunks.length,
        chunk_text: chunk.trim(),
        token_count: estimateTokenCount(chunk),
        char_count: chunk.length
      });
    }
  }

  return chunks;
}

/**
 * Chunk text from LangChain Documents
 * Useful when working with loaded documents that already have metadata
 * @param {Array<Document>} documents - LangChain Document objects
 * @param {Object} options - Chunking options
 * @returns {Promise<Array<Object>>} - Array of chunk objects
 */
async function chunkDocuments(documents, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  if (!documents || documents.length === 0) {
    return [];
  }

  try {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      separators: config.separators,
      keepSeparator: config.keepSeparator !== false,
    });

    // Split documents
    const splitDocs = await splitter.splitDocuments(documents);

    // Convert to chunk objects
    return splitDocs.map((doc, index) => {
      const chunkObj = {
        chunk_index: index,
        chunk_text: doc.pageContent.trim(),
        token_count: estimateTokenCount(doc.pageContent),
        char_count: doc.pageContent.length
      };

      // Merge document metadata with source metadata
      if (doc.metadata) {
        Object.assign(chunkObj, doc.metadata);
      }

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
  } catch (error) {
    console.error('Error chunking documents with LangChain:', error);
    throw error;
  }
}

/**
 * Calculate total chunks and tokens for a text
 * @param {string} text - Text to analyze
 * @param {Object} options - Chunking options
 * @returns {Promise<Object>} - Statistics
 */
async function getChunkingStats(text, options = {}) {
  const chunks = await chunkText(text, options);
  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.token_count, 0);
  const totalChars = text.length;

  return {
    totalChunks: chunks.length,
    totalTokens,
    totalChars,
    avgChunkSize: chunks.length > 0 ? Math.round(totalChars / chunks.length) : 0,
    avgTokensPerChunk: chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0
  };
}

/**
 * Create a markdown-aware text splitter
 * Uses markdown-specific separators for better chunking
 * @param {Object} options - Chunking options
 * @returns {RecursiveCharacterTextSplitter}
 */
function createMarkdownSplitter(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  return new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    separators: [
      '\n## ',      // H2 headers
      '\n### ',     // H3 headers
      '\n#### ',    // H4 headers
      '\n\n',       // Paragraphs
      '\n',         // Lines
      '. ',         // Sentences
      ' ',          // Words
      ''            // Characters
    ],
    keepSeparator: true,
  });
}

/**
 * Create a code-aware text splitter
 * Uses code-specific separators for better chunking
 * @param {Object} options - Chunking options
 * @returns {RecursiveCharacterTextSplitter}
 */
function createCodeSplitter(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  return new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    separators: [
      '\n\nclass ',    // Class definitions
      '\n\nfunction ', // Function definitions
      '\n\nasync ',    // Async functions
      '\n\n',          // Blank lines
      '\n',            // Lines
      ' ',             // Spaces
      ''               // Characters
    ],
    keepSeparator: true,
  });
}

module.exports = {
  chunkText,
  chunkDocuments,
  getChunkingStats,
  createMarkdownSplitter,
  createCodeSplitter,
  DEFAULT_CONFIG,
  estimateTokenCount,
  RecursiveCharacterTextSplitter, // Export for advanced usage
};
