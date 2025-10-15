/**
 * File Content Endpoint
 * 
 * Serves original uploaded files from Google Sheets storage.
 * Endpoint: GET /file/{fileId}
 */

const { loadFileFromSheets, initSheetsClient } = require('../rag/sheets-storage');

/**
 * Lambda handler for file retrieval
 * @param {object} event - Lambda event
 * @returns {Promise<object>} HTTP response
 */
exports.handler = async (event) => {
  try {
    // Get file ID from path parameters
    const fileId = event.pathParameters?.fileId;
    
    if (!fileId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'File ID is required' }),
      };
    }
    
    // Validate file ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fileId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Invalid file ID format' }),
      };
    }
    
    // Initialize Google Sheets client
    const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS || '{}');
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!credentials.client_email || !spreadsheetId) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Google Sheets not configured',
          message: 'Missing GOOGLE_SHEETS_CREDENTIALS or GOOGLE_SHEETS_SPREADSHEET_ID'
        }),
      };
    }
    
    const sheets = initSheetsClient(credentials);
    
    // Load file from Google Sheets
    const file = await loadFileFromSheets(sheets, spreadsheetId, fileId);
    
    if (!file) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'File not found' }),
      };
    }
    
    // Validate MIME type (security: whitelist safe types)
    const safeMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/markdown',
      'text/html',
      'text/csv',
      'application/json',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
    ];
    
    if (!safeMimeTypes.includes(file.mimeType)) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'File type not allowed',
          mimeType: file.mimeType
        }),
      };
    }
    
    // Sanitize filename for Content-Disposition header
    const sanitizedFilename = file.originalName.replace(/[^\w\s.-]/g, '');
    
    // Return file content
    return {
      statusCode: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="${sanitizedFilename}"`,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Content-Length': file.size.toString(),
      },
      body: file.content, // Base64 encoded
      isBase64Encoded: true,
    };
    
  } catch (error) {
    console.error('Error serving file:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      }),
    };
  }
};

/**
 * Helper function to check file ownership
 * (For future implementation with user authentication)
 * @param {string} fileId - File ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
async function checkFileOwnership(fileId, userId) {
  // TODO: Implement user authentication check
  // For now, all files are accessible
  return true;
}

module.exports = {
  handler: exports.handler,
  checkFileOwnership,
};
