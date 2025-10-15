/**
 * File Converters for RAG
 * 
 * Convert various file formats to markdown with base64-encoded images.
 * This provides a lossy but readable format suitable for embedding.
 * 
 * Supported conversions:
 * - PDF → Markdown + base64 images
 * - DOCX → Markdown + base64 images
 * - HTML → Markdown
 * - Images (PNG/JPG/WEBP) → Markdown with base64
 */

const mammoth = require('mammoth');
const TurndownService = require('turndown');
const fs = require('fs').promises;
const path = require('path');

// Lazy-load PDF parser
let pdfParse = null;

/**
 * Create a configured Turndown service for HTML → Markdown conversion
 * @returns {TurndownService}
 */
function createTurndownService() {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  // Preserve code blocks
  turndown.keep(['pre', 'code']);

  // Handle tables
  turndown.addRule('tableRow', {
    filter: 'tr',
    replacement: function (content) {
      return '| ' + content.trim().replace(/\n/g, ' ') + ' |\n';
    },
  });

  return turndown;
}

/**
 * Convert image buffer to base64 data URI
 * @param {Buffer} buffer - Image buffer
 * @param {string} mimeType - MIME type (e.g., 'image/png')
 * @returns {string} - Data URI
 */
function imageToBase64DataURI(buffer, mimeType = 'image/png') {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Convert DOCX to markdown with embedded images
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { markdown, images, metadata }
 */
async function convertDOCXToMarkdown(input) {
  try {
    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    
    const imageMap = new Map();
    let imageIndex = 0;

    // Convert DOCX to HTML with image extraction
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const imageBuffer = await image.read();
          const contentType = image.contentType || 'image/png';
          const id = `image_${imageIndex++}`;
          
          imageMap.set(id, {
            buffer: imageBuffer,
            mimeType: contentType,
            dataURI: imageToBase64DataURI(imageBuffer, contentType),
          });

          // Return image with temporary ID
          return { src: `{{${id}}}` };
        }),
      }
    );

    // Convert HTML to Markdown
    const turndown = createTurndownService();
    let markdown = turndown.turndown(result.value);

    // Replace image placeholders with base64 data URIs
    for (const [id, image] of imageMap.entries()) {
      markdown = markdown.replace(
        new RegExp(`\\{\\{${id}\\}\\}`, 'g'),
        image.dataURI
      );
    }

    return {
      markdown,
      images: Array.from(imageMap.values()).map((img, idx) => ({
        index: idx,
        mimeType: img.mimeType,
        size: img.buffer.length,
      })),
      metadata: {
        imageCount: imageMap.size,
        warnings: result.messages,
        source_type: 'file',
        source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    };
  } catch (error) {
    console.error('Error converting DOCX to markdown:', error);
    throw new Error(`Failed to convert DOCX: ${error.message}`);
  }
}

/**
 * Convert HTML to markdown
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { markdown, metadata }
 */
async function convertHTMLToMarkdown(input) {
  try {
    const html = Buffer.isBuffer(input)
      ? input.toString('utf-8')
      : await fs.readFile(input, 'utf-8');

    const turndown = createTurndownService();
    const markdown = turndown.turndown(html);

    return {
      markdown,
      metadata: {
        source_type: 'file',
        source_mime_type: 'text/html',
      },
    };
  } catch (error) {
    console.error('Error converting HTML to markdown:', error);
    throw new Error(`Failed to convert HTML: ${error.message}`);
  }
}

/**
 * Convert PDF to markdown with text extraction
 * Note: PDF image extraction is complex and not fully implemented here.
 * For production use, consider using a dedicated PDF to Markdown service.
 * @param {string|Buffer} input - File path or buffer
 * @returns {Promise<Object>} - { markdown, metadata }
 */
async function convertPDFToMarkdown(input) {
  try {
    // Lazy load pdf-parse
    if (!pdfParse) {
      const module = await import('pdf-parse/lib/pdf-parse.js');
      pdfParse = module.default || module;
    }

    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    const data = await pdfParse(buffer);

    // Convert text to basic markdown
    // Add page separators
    const pages = data.text.split('\f'); // Form feed character separates pages
    let markdown = '';

    for (let i = 0; i < pages.length; i++) {
      const pageText = pages[i].trim();
      if (pageText) {
        markdown += `## Page ${i + 1}\n\n${pageText}\n\n`;
      }
    }

    return {
      markdown,
      metadata: {
        pages: data.numpages,
        source_type: 'file',
        source_mime_type: 'application/pdf',
        warning: 'PDF image extraction not implemented. Text only.',
      },
    };
  } catch (error) {
    console.error('Error converting PDF to markdown:', error);
    throw new Error(`Failed to convert PDF: ${error.message}`);
  }
}

/**
 * Convert image file to markdown with base64 embedding
 * @param {string|Buffer} input - File path or buffer
 * @param {string} mimeType - MIME type (e.g., 'image/png')
 * @param {string} altText - Alt text for image (optional)
 * @returns {Promise<Object>} - { markdown, metadata }
 */
async function convertImageToMarkdown(input, mimeType = 'image/png', altText = 'Image') {
  try {
    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    const dataURI = imageToBase64DataURI(buffer, mimeType);

    const markdown = `![${altText}](${dataURI})`;

    return {
      markdown,
      metadata: {
        size: buffer.length,
        mimeType,
        source_type: 'file',
        source_mime_type: mimeType,
      },
    };
  } catch (error) {
    console.error('Error converting image to markdown:', error);
    throw new Error(`Failed to convert image: ${error.message}`);
  }
}

/**
 * Auto-detect file type and convert to markdown
 * @param {string|Buffer} input - File path or buffer
 * @param {string} mimeType - MIME type (optional, will detect from extension if path)
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} - { markdown, images, metadata }
 */
async function convertToMarkdown(input, mimeType = null, options = {}) {
  // Detect MIME type from file extension if path provided
  if (!mimeType && typeof input === 'string') {
    const ext = path.extname(input).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    mimeType = mimeTypes[ext];
  }

  // Route to appropriate converter
  switch (mimeType) {
    case 'application/pdf':
      return convertPDFToMarkdown(input);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return convertDOCXToMarkdown(input);

    case 'text/html':
      return convertHTMLToMarkdown(input);

    case 'image/png':
    case 'image/jpeg':
    case 'image/gif':
    case 'image/webp':
      return convertImageToMarkdown(input, mimeType, options.altText);

    default:
      throw new Error(`Unsupported MIME type for conversion: ${mimeType}`);
  }
}

/**
 * Load file and convert to markdown for RAG ingestion
 * Combines file loading, conversion, and chunking
 * @param {string|Buffer} input - File path or buffer
 * @param {Object} options - Options
 * @param {string} options.mimeType - MIME type
 * @param {Function} options.chunker - Chunking function
 * @param {Object} options.chunkOptions - Options for chunker
 * @returns {Promise<Object>} - { markdown, chunks, images, metadata }
 */
async function loadAndConvertFile(input, options = {}) {
  const { mimeType, chunker, chunkOptions = {} } = options;

  // Convert to markdown
  const { markdown, images = [], metadata } = await convertToMarkdown(input, mimeType, options);

  // Use provided chunker or default to langchain chunker
  const chunkFn = chunker || require('./chunker-langchain').chunkText;

  // Add file metadata to chunk options
  const sourceMetadata = {
    source_type: 'file',
    source_mime_type: metadata.source_mime_type,
    ...(typeof input === 'string' ? { source_file_path: input } : {}),
  };

  // Chunk markdown
  const chunks = await chunkFn(markdown, {
    ...chunkOptions,
    sourceMetadata: { ...sourceMetadata, ...chunkOptions.sourceMetadata },
  });

  return {
    markdown,
    chunks,
    images,
    metadata: { ...metadata, totalChunks: chunks.length },
  };
}

module.exports = {
  convertToMarkdown,
  convertDOCXToMarkdown,
  convertHTMLToMarkdown,
  convertPDFToMarkdown,
  convertImageToMarkdown,
  loadAndConvertFile,
  imageToBase64DataURI,
};
