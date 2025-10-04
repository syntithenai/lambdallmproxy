/**
 * Static File Server Endpoint
 * Serves HTML, JavaScript, CSS, and images from the docs directory
 */

const fs = require('fs');
const path = require('path');

// MIME type mapping
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

/**
 * Determine content type from file extension
 * @param {string} filePath - File path
 * @returns {string} Content type
 */
function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Read file from docs directory
 * @param {string} filePath - Relative path within docs directory
 * @returns {Promise<Object>} File content and metadata
 */
async function readStaticFile(filePath) {
    return new Promise((resolve, reject) => {
        // Construct absolute path to docs directory
        const docsDir = path.join(__dirname, '..', '..', 'docs');
        
        // Normalize and resolve the requested path
        let requestedPath = path.normalize(filePath);
        
        // Remove leading slash
        if (requestedPath.startsWith('/')) {
            requestedPath = requestedPath.substring(1);
        }
        
        // Default to index.html for root path
        if (requestedPath === '' || requestedPath === '/') {
            requestedPath = 'index.html';
        }
        
        // Construct full file path
        const fullPath = path.join(docsDir, requestedPath);
        
        // Security check: ensure the path is within docs directory
        if (!fullPath.startsWith(docsDir)) {
            reject(new Error('Access denied: path outside docs directory'));
            return;
        }
        
        // Check if file exists
        fs.stat(fullPath, (err, stats) => {
            if (err || !stats.isFile()) {
                reject(new Error('File not found'));
                return;
            }
            
            // Read file
            fs.readFile(fullPath, (readErr, data) => {
                if (readErr) {
                    reject(new Error(`Failed to read file: ${readErr.message}`));
                    return;
                }
                
                resolve({
                    content: data,
                    contentType: getContentType(fullPath),
                    size: stats.size,
                    lastModified: stats.mtime
                });
            });
        });
    });
}

/**
 * Handler for the static file server endpoint
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} Lambda response
 */
async function handler(event) {
    try {
        // Get requested path
        const requestPath = event.path || event.rawPath || '/';
        
        // Read static file
        const file = await readStaticFile(requestPath);
        
        // Determine if content should be base64 encoded (for binary files)
        const isBinary = !file.contentType.startsWith('text/') && 
                         !file.contentType.includes('json') &&
                         !file.contentType.includes('javascript');
        
        // Return success response
        return {
            statusCode: 200,
            headers: {
                'Content-Type': file.contentType,
                'Cache-Control': 'public, max-age=3600',
                'Last-Modified': file.lastModified.toUTCString(),
                'Access-Control-Allow-Origin': '*'
            },
            body: isBinary ? file.content.toString('base64') : file.content.toString('utf-8'),
            isBase64Encoded: isBinary
        };
        
    } catch (error) {
        console.error('Static file server error:', error);
        
        // Return 404 for file not found
        if (error.message.includes('not found') || error.message.includes('Access denied')) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'text/html',
                    'Access-Control-Allow-Origin': '*'
                },
                body: '<html><body><h1>404 Not Found</h1><p>The requested file was not found.</p></body></html>'
            };
        }
        
        // Return 500 for other errors
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: error.message || 'Internal server error'
            })
        };
    }
}

module.exports = {
    handler,
    readStaticFile,
    getContentType
};
