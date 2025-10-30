/**
 * Document Conversion Endpoint
 * 
 * Converts uploaded files (PDF, DOCX, etc.) or URLs to Markdown format.
 * Endpoint: POST /convert-to-markdown
 */

const { convertToMarkdown } = require('../rag/file-converters');
const { authenticateRequest } = require('../auth');

/**
 * Lambda handler for document conversion
 * @param {object} event - Lambda event
 * @param {object} responseStream - Response stream for streaming responses
 * @returns {Promise<void>}
 */
exports.handler = async (event, responseStream) => {
  const awslambda = (typeof globalThis.awslambda !== 'undefined') 
    ? globalThis.awslambda 
    : require('aws-lambda');
  
  try {
    // Authenticate request
    const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.authenticated) {
      const metadata = {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
      responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
      responseStream.write(JSON.stringify({
        error: 'Authentication required. Please provide a valid token.',
        code: 'UNAUTHORIZED'
      }));
      responseStream.end();
      return;
    }
    
    const userEmail = authResult.email || 'unknown';
    console.log(`✅ Authenticated convert request from: ${userEmail}`);
    
    const body = JSON.parse(event.body || '{}');
    let markdown;

    console.log('📄 Convert-to-markdown endpoint called');

    // Handle file buffer (from multer middleware in local server)
    if (body.fileBuffer && body.fileName) {
      console.log(`📄 Converting file: ${body.fileName} (${body.mimeType})`);
      console.log(`📊 Buffer size: ${body.fileBuffer.length} chars (base64)`);

      const buffer = Buffer.from(body.fileBuffer, 'base64');
      console.log(`📊 Decoded buffer size: ${buffer.length} bytes`);

      const mimeType = body.mimeType || '';
      
      // Extract filename without extension for alt text
      const altText = body.fileName.replace(/\.[^/.]+$/, '');

      // Convert to markdown
      console.log('🔄 Starting conversion...');
      const result = await convertToMarkdown(buffer, mimeType, { altText });
      console.log(`✅ Conversion complete. Result:`, {
        hasMarkdown: !!result.markdown,
        markdownLength: result.markdown?.length || 0,
        hasImages: !!result.images,
        imageCount: result.images?.length || 0,
        markdownPreview: result.markdown ? result.markdown.substring(0, 100) + '...' : '(empty)'
      });

      markdown = result.markdown;

      if (!markdown || markdown.trim().length === 0) {
        console.error('❌ Conversion returned empty markdown!');
        throw new Error('PDF conversion returned no content');
      }

    } else if (body.url) {
      // Handle URL fetch and conversion
      const https = require('https');
      const http = require('http');
      const url = body.url;

      console.log(`🌐 Fetching URL: ${url}`);

      // Fetch URL content
      const fetchPromise = new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;

        client.get(url, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const contentType = res.headers['content-type'] || '';
            resolve({ buffer, contentType });
          });
        }).on('error', reject);
      });

      const { buffer, contentType } = await fetchPromise;
      
      // Extract alt text from URL (filename without extension)
      const urlPath = url.split('?')[0]; // Remove query params
      const filename = urlPath.split('/').pop() || 'Image from URL';
      const altText = filename.replace(/\.[^/.]+$/, '');

      // Convert to markdown
      const result = await convertToMarkdown(buffer, contentType.split(';')[0], { altText });
      markdown = result.markdown;
    } else {
      throw new Error('Either file or URL is required');
    }

    // Validate markdown before sending
    if (!markdown || markdown.trim().length === 0) {
      console.error('❌ Final markdown is empty or null!');
      throw new Error('Conversion produced no content');
    }

    console.log(`📤 Sending response with markdown length: ${markdown.length}`);

    // Return markdown in Lambda response format
    const response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        markdown, 
        content: markdown 
      })
    };

    responseStream.write(JSON.stringify(response));
    responseStream.end();

  } catch (error) {
    console.error('❌ Conversion error:', error);

    const errorResponse = {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message || 'Failed to convert document',
        stack: process.env.ENV === 'development' ? error.stack : undefined
      })
    };

    responseStream.write(JSON.stringify(errorResponse));
    responseStream.end();
  }
};
