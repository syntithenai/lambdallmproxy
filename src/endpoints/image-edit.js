/**
 * Image Editing Endpoint
 * Processes images with operations like resize, rotate, flip, format conversion, and filters
 * Uses Server-Sent Events (SSE) for progress updates
 * 
 * Endpoint: POST /image-edit
 * 
 * Request Body:
 * {
 *   images: Array<{ id: string, url: string }>,
 *   operations: Array<{
 *     type: 'resize' | 'rotate' | 'flip' | 'format' | 'filter',
 *     params: { ... }
 *   }>
 * }
 * 
 * Response: SSE stream with progress updates and results
 */

const sharp = require('sharp');
const { verifyGoogleToken } = require('../auth');

/**
 * Process image with sharp library
 * Applies operations in sequence and returns processed image buffer
 */
async function processImage(imageUrl, operations, onProgress) {
    try {
        // Simulate progress updates
        onProgress({ status: 'downloading', progress: 10 });
        
        // Download image
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
        }
        
        onProgress({ status: 'processing', progress: 30 });
        
        // Get image buffer
        const buffer = await response.arrayBuffer();
        let imageBuffer = Buffer.from(buffer);
        
        // Initialize sharp instance
        let sharpInstance = sharp(imageBuffer);
        const appliedOperations = [];
        
        // Get original metadata for reference
        const metadata = await sharpInstance.metadata();
        let currentWidth = metadata.width;
        let currentHeight = metadata.height;
        let outputFormat = metadata.format || 'png';
        
        // Apply operations sequentially
        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            const progress = 30 + ((i / operations.length) * 60);
            
            onProgress({ 
                status: 'processing', 
                progress,
                currentOperation: op.type 
            });
            
            try {
                switch (op.type) {
                    case 'resize':
                        if (op.params.percentage) {
                            const newWidth = Math.round(currentWidth * op.params.percentage / 100);
                            const newHeight = Math.round(currentHeight * op.params.percentage / 100);
                            sharpInstance = sharpInstance.resize(newWidth, newHeight, { fit: 'fill' });
                            currentWidth = newWidth;
                            currentHeight = newHeight;
                        } else if (op.params.width || op.params.height) {
                            sharpInstance = sharpInstance.resize(op.params.width, op.params.height, { fit: 'inside' });
                            if (op.params.width) currentWidth = op.params.width;
                            if (op.params.height) currentHeight = op.params.height;
                        }
                        appliedOperations.push(`resize ${op.params.percentage || op.params.width + 'x' + op.params.height}`);
                        break;
                    
                    case 'rotate':
                        const angle = op.params.degrees || 90;
                        sharpInstance = sharpInstance.rotate(angle);
                        // Swap dimensions for 90/270 degree rotations
                        if (angle === 90 || angle === 270) {
                            [currentWidth, currentHeight] = [currentHeight, currentWidth];
                        }
                        appliedOperations.push(`rotate ${angle}°`);
                        break;
                    
                    case 'flip':
                        if (op.params.direction === 'horizontal') {
                            sharpInstance = sharpInstance.flop();
                            appliedOperations.push('flip horizontal');
                        } else if (op.params.direction === 'vertical') {
                            sharpInstance = sharpInstance.flip();
                            appliedOperations.push('flip vertical');
                        }
                        break;
                    
                    case 'format':
                        const format = op.params.format?.toLowerCase() || 'png';
                        outputFormat = format === 'jpg' ? 'jpeg' : format;
                        // Format will be applied at the end
                        appliedOperations.push(`format ${format.toUpperCase()}`);
                        break;
                    
                    case 'filter':
                        const filterType = op.params.filter;
                        switch (filterType) {
                            case 'grayscale':
                                sharpInstance = sharpInstance.grayscale();
                                appliedOperations.push('grayscale');
                                break;
                            case 'blur':
                                sharpInstance = sharpInstance.blur(op.params.strength || 5);
                                appliedOperations.push('blur');
                                break;
                            case 'sharpen':
                                sharpInstance = sharpInstance.sharpen(op.params.strength || 1);
                                appliedOperations.push('sharpen');
                                break;
                            case 'sepia':
                                // Sepia tone using tint (warm brown)
                                sharpInstance = sharpInstance.tint({ r: 112, g: 66, b: 20 });
                                appliedOperations.push('sepia');
                                break;
                            default:
                                console.warn(`Unknown filter: ${filterType}`);
                        }
                        break;
                    
                    default:
                        console.warn(`Unknown operation type: ${op.type}`);
                }
            } catch (opError) {
                console.error(`Error applying operation ${op.type}:`, opError);
                throw new Error(`Failed to apply ${op.type}: ${opError.message}`);
            }
        }
        
        onProgress({ status: 'encoding', progress: 95 });
        
        // Convert to specified format and get buffer
        const processedBuffer = await sharpInstance.toFormat(outputFormat).toBuffer();
        
        // Convert to base64 data URL
        const base64 = processedBuffer.toString('base64');
        const mimeType = `image/${outputFormat === 'jpeg' ? 'jpeg' : outputFormat}`;
        const dataUrl = `data:${mimeType};base64,${base64}`;
        
        onProgress({ status: 'complete', progress: 100 });
        
        return {
            success: true,
            url: dataUrl,
            appliedOperations,
            size: processedBuffer.length,
            dimensions: {
                width: currentWidth,
                height: currentHeight
            },
            format: outputFormat.toUpperCase()
        };
        
    } catch (error) {
        console.error('Image processing error:', error);
        throw error;
    }
}

/**
 * Main handler for image editing endpoint
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Lambda response stream for SSE
 * @param {Object} context - Lambda context
 */
async function handler(event, responseStream, context) {
    const origin = event.headers?.origin || event.headers?.Origin || '*';
    
    // Set up SSE response headers
    const metadata = {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Google-OAuth-Token'
        }
    };
    
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
    
    try {
        // Parse request body
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const { images, operations } = body;
        
        if (!images || !Array.isArray(images) || images.length === 0) {
            throw new Error('Invalid request: images array required');
        }
        
        if (!operations || !Array.isArray(operations) || operations.length === 0) {
            throw new Error('Invalid request: operations array required');
        }
        
        // Verify authentication
        const googleToken = event.headers?.['x-google-oauth-token'] || event.headers?.['X-Google-OAuth-Token'];
        if (googleToken) {
            try {
                await verifyGoogleToken(googleToken);
                console.log('✅ Google OAuth token verified');
            } catch (error) {
                console.error('❌ Google OAuth verification failed:', error.message);
                responseStream.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: 'Authentication failed',
                    message: error.message
                })}\n\n`);
                responseStream.end();
                return;
            }
        } else {
            console.warn('⚠️ No Google OAuth token provided - request may be rejected');
        }
        
        // Send initial message
        responseStream.write(`data: ${JSON.stringify({
            type: 'started',
            totalImages: images.length,
            operations: operations.map(op => op.type)
        })}\n\n`);
        
        // Process each image
        const results = [];
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            
            try {
                // Send image start event
                responseStream.write(`data: ${JSON.stringify({
                    type: 'image_start',
                    imageId: image.id,
                    imageIndex: i,
                    totalImages: images.length
                })}\n\n`);
                
                // Process image with progress updates
                const result = await processImage(
                    image.url,
                    operations,
                    (progressData) => {
                        responseStream.write(`data: ${JSON.stringify({
                            type: 'progress',
                            imageId: image.id,
                            imageIndex: i,
                            ...progressData
                        })}\n\n`);
                    }
                );
                
                results.push({
                    id: image.id,
                    ...result
                });
                
                // Send image complete event
                responseStream.write(`data: ${JSON.stringify({
                    type: 'image_complete',
                    imageId: image.id,
                    imageIndex: i,
                    result: result
                })}\n\n`);
                
            } catch (error) {
                console.error(`Error processing image ${image.id}:`, error);
                
                results.push({
                    id: image.id,
                    success: false,
                    error: error.message
                });
                
                // Send error event
                responseStream.write(`data: ${JSON.stringify({
                    type: 'image_error',
                    imageId: image.id,
                    imageIndex: i,
                    error: error.message
                })}\n\n`);
            }
        }
        
        // Send completion event
        responseStream.write(`data: ${JSON.stringify({
            type: 'complete',
            results: results,
            successCount: results.filter(r => r.success).length,
            errorCount: results.filter(r => !r.success).length
        })}\n\n`);
        
    } catch (error) {
        console.error('Image edit endpoint error:', error);
        
        responseStream.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        })}\n\n`);
    }
    
    responseStream.end();
}

module.exports = { handler };
