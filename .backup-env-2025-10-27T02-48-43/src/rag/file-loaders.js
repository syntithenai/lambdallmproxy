/**
 * Multi-Format File Loaders for RAG
 * 
 * Supports loading and extracting text from various file formats:
 * - PDF (pdf-parse)
 * - DOCX (mammoth)
 * - HTML (cheerio)
 * - CSV (csv-parse)
 * - JSON (native)
 * - TXT, MD (native)
 */

const fs = require('fs').promises;
const path = require('path');
// Note: pdf-parse has ESM issues, use dynamic import
let pdfParse = null;
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const { parse: csvParse } = require('csv-parse/sync');

/**
 * Get MIME type from file extension
 * @param {string} filePath - Path to file
 * @returns {string} - MIME type
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Load PDF file and extract text
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { text, metadata }
 */
async function loadPDF(input) {
  try {
    // Lazy load pdf-parse using dynamic import
    if (!pdfParse) {
      const module = await import('pdf-parse/lib/pdf-parse.js');
      pdfParse = module.default || module;
    }

    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    const data = await pdfParse(buffer);

    return {
      text: data.text,
      metadata: {
        pages: data.numpages,
        info: data.info,
        version: data.version,
        source_type: 'file',
        source_mime_type: 'application/pdf',
      }
    };
  } catch (error) {
    console.error('Error loading PDF:', error);
    throw new Error(`Failed to load PDF: ${error.message}`);
  }
}

/**
 * Load DOCX file and extract text
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { text, metadata }
 */
async function loadDOCX(input) {
  try {
    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      metadata: {
        messages: result.messages, // Warnings/errors during conversion
        source_type: 'file',
        source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }
    };
  } catch (error) {
    console.error('Error loading DOCX:', error);
    throw new Error(`Failed to load DOCX: ${error.message}`);
  }
}

/**
 * Load HTML file and extract text
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { text, metadata }
 */
async function loadHTML(input) {
  try {
    const html = Buffer.isBuffer(input) 
      ? input.toString('utf-8') 
      : await fs.readFile(input, 'utf-8');
    
    const $ = cheerio.load(html);
    
    // Remove script and style tags
    $('script').remove();
    $('style').remove();
    
    // Extract title
    const title = $('title').text().trim();
    
    // Extract meta description
    const description = $('meta[name="description"]').attr('content') || '';
    
    // Extract main text content
    const text = $('body').text()
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();

    return {
      text,
      metadata: {
        title,
        description,
        source_type: 'file',
        source_mime_type: 'text/html',
      }
    };
  } catch (error) {
    console.error('Error loading HTML:', error);
    throw new Error(`Failed to load HTML: ${error.message}`);
  }
}

/**
 * Load CSV file and convert to text
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { text, metadata }
 */
async function loadCSV(input) {
  try {
    const csvContent = Buffer.isBuffer(input) 
      ? input.toString('utf-8') 
      : await fs.readFile(input, 'utf-8');
    
    const records = csvParse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Convert CSV to markdown table
    if (records.length === 0) {
      return { text: '', metadata: { rows: 0 } };
    }

    const headers = Object.keys(records[0]);
    let markdown = '| ' + headers.join(' | ') + ' |\n';
    markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    
    for (const record of records) {
      markdown += '| ' + headers.map(h => record[h] || '').join(' | ') + ' |\n';
    }

    return {
      text: markdown,
      metadata: {
        rows: records.length,
        columns: headers.length,
        headers,
        source_type: 'file',
        source_mime_type: 'text/csv',
      }
    };
  } catch (error) {
    console.error('Error loading CSV:', error);
    throw new Error(`Failed to load CSV: ${error.message}`);
  }
}

/**
 * Load JSON file and convert to text
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { text, metadata }
 */
async function loadJSON(input) {
  try {
    const jsonContent = Buffer.isBuffer(input) 
      ? input.toString('utf-8') 
      : await fs.readFile(input, 'utf-8');
    
    const data = JSON.parse(jsonContent);
    
    // Convert JSON to formatted text
    const text = JSON.stringify(data, null, 2);

    return {
      text,
      metadata: {
        type: Array.isArray(data) ? 'array' : typeof data,
        itemCount: Array.isArray(data) ? data.length : Object.keys(data).length,
        source_type: 'file',
        source_mime_type: 'application/json',
      }
    };
  } catch (error) {
    console.error('Error loading JSON:', error);
    throw new Error(`Failed to load JSON: ${error.message}`);
  }
}

/**
 * Load plain text file
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { text, metadata }
 */
async function loadText(input) {
  try {
    const text = Buffer.isBuffer(input) 
      ? input.toString('utf-8') 
      : await fs.readFile(input, 'utf-8');

    return {
      text,
      metadata: {
        lines: text.split('\n').length,
        chars: text.length,
        source_type: 'file',
        source_mime_type: 'text/plain',
      }
    };
  } catch (error) {
    console.error('Error loading text file:', error);
    throw new Error(`Failed to load text file: ${error.message}`);
  }
}

/**
 * Load markdown file (same as text but with different MIME type)
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { text, metadata }
 */
async function loadMarkdown(input) {
  const result = await loadText(input);
  result.metadata.source_mime_type = 'text/markdown';
  return result;
}

/**
 * Auto-detect file type and load appropriately
 * @param {string|Buffer} input - File path or buffer
 * @param {string} mimeType - MIME type (optional, will detect from extension if path)
 * @returns {Promise<Object>} - { text, metadata }
 */
async function loadFile(input, mimeType = null) {
  // Detect MIME type if not provided
  if (!mimeType && typeof input === 'string') {
    mimeType = getMimeType(input);
  }

  // Route to appropriate loader
  switch (mimeType) {
    case 'application/pdf':
      return loadPDF(input);
    
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword':
      return loadDOCX(input);
    
    case 'text/html':
      return loadHTML(input);
    
    case 'text/csv':
      return loadCSV(input);
    
    case 'application/json':
      return loadJSON(input);
    
    case 'text/markdown':
      return loadMarkdown(input);
    
    case 'text/plain':
    default:
      return loadText(input);
  }
}

/**
 * Load file and chunk for RAG
 * Combines file loading with text chunking
 * @param {string|Buffer} input - File path or buffer
 * @param {Object} options - Options
 * @param {string} options.mimeType - MIME type
 * @param {Function} options.chunker - Chunking function (default: require('./chunker-langchain').chunkText)
 * @param {Object} options.chunkOptions - Options for chunker
 * @returns {Promise<Object>} - { text, chunks, metadata }
 */
async function loadAndChunkFile(input, options = {}) {
  const { mimeType, chunker, chunkOptions = {} } = options;

  // Load file
  const { text, metadata } = await loadFile(input, mimeType);

  // Use provided chunker or default to langchain chunker
  const chunkFn = chunker || require('./chunker-langchain').chunkText;

  // Add file metadata to chunk options
  const sourceMetadata = {
    source_type: 'file',
    source_mime_type: metadata.source_mime_type,
    ...(typeof input === 'string' ? { source_file_path: input } : {}),
  };

  // Chunk text
  const chunks = await chunkFn(text, {
    ...chunkOptions,
    sourceMetadata: { ...sourceMetadata, ...chunkOptions.sourceMetadata },
  });

  return {
    text,
    chunks,
    metadata: { ...metadata, totalChunks: chunks.length },
  };
}

/**
 * Batch load multiple files
 * @param {Array<string>} filePaths - Array of file paths
 * @param {Object} options - Options for loadFile
 * @returns {Promise<Array<Object>>} - Array of { filePath, text, metadata }
 */
async function loadFiles(filePaths, options = {}) {
  const results = [];

  for (const filePath of filePaths) {
    try {
      const { text, metadata } = await loadFile(filePath);
      results.push({
        filePath,
        text,
        metadata,
        success: true,
      });
    } catch (error) {
      results.push({
        filePath,
        error: error.message,
        success: false,
      });
    }
  }

  return results;
}

module.exports = {
  loadFile,
  loadAndChunkFile,
  loadFiles,
  loadPDF,
  loadDOCX,
  loadHTML,
  loadCSV,
  loadJSON,
  loadText,
  loadMarkdown,
  getMimeType,
};
