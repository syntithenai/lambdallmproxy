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
 * @param {string} imageUrl - URL of image to process
 * @param {Array} operations - Array of operations to apply
 * @param {Function} onProgress - Progress callback
 * @param {Object} generationContext - Context for AI image generation (provider pool, API keys)
 */
async function processImage(imageUrl, operations, onProgress, generationContext = {}) {
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
                    case 'resize': {
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
                    }
                    case 'rotate': {
                        const angle = op.params.degrees || 90;
                        sharpInstance = sharpInstance.rotate(angle);
                        // Swap dimensions for 90/270 degree rotations
                        if (angle === 90 || angle === 270) {
                            [currentWidth, currentHeight] = [currentHeight, currentWidth];
                        }
                        appliedOperations.push(`rotate ${angle}°`);
                        break;
                    }
                    case 'flip': {
                        if (op.params.direction === 'horizontal') {
                            sharpInstance = sharpInstance.flop();
                            appliedOperations.push('flip horizontal');
                        } else if (op.params.direction === 'vertical') {
                            sharpInstance = sharpInstance.flip();
                            appliedOperations.push('flip vertical');
                        }
                        break;
                    }
                    case 'format': {
                        const format = op.params.format?.toLowerCase() || 'png';
                        outputFormat = format === 'jpg' ? 'jpeg' : format;
                        // Format will be applied at the end
                        appliedOperations.push(`format ${format.toUpperCase()}`);
                        break;
                    }
                    case 'filter': {
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
                            case 'negate':
                                // Invert colors
                                sharpInstance = sharpInstance.negate();
                                appliedOperations.push('negate');
                                break;
                            case 'normalize':
                                // Auto-enhance (stretch luminance to cover full dynamic range)
                                sharpInstance = sharpInstance.normalize();
                                appliedOperations.push('normalize');
                                break;
                            default:
                                console.warn(`Unknown filter: ${filterType}`);
                        }
                        break;
                    }
                    case 'modulate': {
                        // Brightness, saturation, hue adjustments
                        const modulateParams = {};
                        if (op.params.brightness !== undefined) modulateParams.brightness = op.params.brightness;
                        if (op.params.saturation !== undefined) modulateParams.saturation = op.params.saturation;
                        if (op.params.hue !== undefined) modulateParams.hue = op.params.hue;
                        sharpInstance = sharpInstance.modulate(modulateParams);
                        appliedOperations.push(`modulate ${JSON.stringify(modulateParams)}`);
                        break;
                    }
                    case 'extend': {
                        // Add borders/padding
                        sharpInstance = sharpInstance.extend({
                            top: op.params.top || 0,
                            bottom: op.params.bottom || 0,
                            left: op.params.left || 0,
                            right: op.params.right || 0,
                            background: op.params.background || { r: 255, g: 255, b: 255 }
                        });
                        const borderSize = op.params.top || 0;
                        appliedOperations.push(`border ${borderSize}px`);
                        break;
                    }
                    case 'gamma': {
                        // Gamma correction
                        const gammaValue = op.params.gamma || 2.2;
                        sharpInstance = sharpInstance.gamma(gammaValue);
                        appliedOperations.push(`gamma ${gammaValue}`);
                        break;
                    }
                    case 'tint': {
                        // Color tinting
                        sharpInstance = sharpInstance.tint(op.params);
                        appliedOperations.push(`tint ${JSON.stringify(op.params)}`);
                        break;
                    }
                    case 'crop': {
                        // Extract region (intelligent cropping)
                        const { left = 0, top = 0, width, height } = op.params;
                        if (width && height) {
                            sharpInstance = sharpInstance.extract({ left, top, width, height });
                            currentWidth = width;
                            currentHeight = height;
                            appliedOperations.push(`crop ${width}×${height}`);
                        } else {
                            console.warn('Crop requires width and height parameters');
                        }
                        break;
                    }
                    case 'generate': {
                        // AI-powered generative editing (adding objects, changing backgrounds, etc.)
                        console.log(`🎨 [Generate] AI editing request: ${op.params.prompt || 'no prompt'}, mode: ${op.params.mode || 'edit'}`);
                        
                        // Import generateImageDirect function
                        const { generateImageDirect } = require('./generate-image');
                        
                        // Auto-select best available image provider from credential pool
                        let selectedProvider = 'openai'; // Fallback default
                        let selectedModel = 'dall-e-3';
                        
                        if (generationContext.providerPool && Array.isArray(generationContext.providerPool)) {
                            // Priority order for image generation providers (free first, then paid)
                            const providerPriority = ['together', 'replicate', 'openai', 'gemini'];
                            
                            for (const preferredProvider of providerPriority) {
                                const found = generationContext.providerPool.find(p => 
                                    p.type.toLowerCase() === preferredProvider && p.apiKey
                                );
                                
                                if (found) {
                                    selectedProvider = found.type.toLowerCase();
                                    // Select appropriate model based on provider
                                    if (selectedProvider === 'together') {
                                        selectedModel = 'black-forest-labs/FLUX.1-schnell-Free';
                                    } else if (selectedProvider === 'replicate') {
                                        selectedModel = 'flux-1.1-pro';
                                    } else if (selectedProvider === 'openai') {
                                        selectedModel = 'dall-e-3';
                                    } else if (selectedProvider === 'gemini') {
                                        selectedModel = 'imagen-3.0-generate-001';
                                    }
                                    console.log(`✅ [Generate] Auto-selected provider: ${selectedProvider} with model: ${selectedModel}`);
                                    break;
                                }
                            }
                            
                            if (selectedProvider === 'openai' && !generationContext.providerPool.find(p => p.type.toLowerCase() === 'openai')) {
                                console.warn(`⚠️ [Generate] No image providers found in credential pool, using default: ${selectedProvider}`);
                            }
                        } else {
                            console.warn(`⚠️ [Generate] No provider pool available, using default: ${selectedProvider}`);
                        }
                        
                        // Prepare generation parameters
                        const genParams = {
                            prompt: op.params.prompt || 'add creative element to image',
                            provider: op.params.provider || selectedProvider, // Use auto-selected or fallback
                            model: op.params.model || selectedModel,
                            size: op.params.size || `${currentWidth}x${currentHeight}`, // Match current image dimensions
                            quality: op.params.quality || 'standard',
                            style: op.params.style || 'natural',
                            referenceImages: [imageUrl], // Include current image as reference for inpainting
                            context: generationContext // Pass provider pool and API keys from handler
                        };
                        
                        // Generate/modify image using AI
                        console.log(`🔄 [Generate] Calling generateImageDirect with provider: ${genParams.provider}`);
                        const genResult = await generateImageDirect(genParams);
                        
                        if (!genResult.success) {
                            console.error(`❌ [Generate] Failed: ${genResult.error}`);
                            throw new Error(`AI generation failed: ${genResult.error}`);
                        }
                        
                        // Replace current image buffer with generated image
                        console.log(`✅ [Generate] Success! Using generated image`);
                        
                        // Convert data URL to buffer if needed
                        if (genResult.imageUrl && genResult.imageUrl.startsWith('data:')) {
                            const base64Data = genResult.imageUrl.split(',')[1];
                            imageBuffer = Buffer.from(base64Data, 'base64');
                            sharpInstance = sharp(imageBuffer);
                            
                            // Update dimensions from generated image
                            const newMetadata = await sharpInstance.metadata();
                            currentWidth = newMetadata.width;
                            currentHeight = newMetadata.height;
                        } else if (genResult.base64) {
                            imageBuffer = Buffer.from(genResult.base64, 'base64');
                            sharpInstance = sharp(imageBuffer);
                            
                            // Update dimensions
                            const newMetadata = await sharpInstance.metadata();
                            currentWidth = newMetadata.width;
                            currentHeight = newMetadata.height;
                        } else {
                            throw new Error('Generated image has no data URL or base64');
                        }
                        
                        appliedOperations.push(`AI: ${op.params.prompt.substring(0, 50)}${op.params.prompt.length > 50 ? '...' : ''}`);
                        break;
                    }
                    default:
                        console.warn(`Unknown operation type: ${op.type}`);
                }
            } catch (opError) {
                console.error(`Error applying operation ${op.type}:`, opError);
                throw new Error(`Failed to apply ${op.type}: ${opError.message}`);
            }
        }
        
        onProgress({ status: 'encoding', progress: 90 });
        
        // AUTO-RESIZE FOR WEB: Constrain to 1024×768 max to prevent Swag UI lockups
        // CRITICAL: This prevents large base64 images from freezing the markdown editor
        const MAX_WEB_WIDTH = 1024;
        const MAX_WEB_HEIGHT = 768;
        let didAutoResize = false;
        let originalDimensions = null;
        
        const finalMetadata = await sharpInstance.metadata();
        
        if (finalMetadata.width > MAX_WEB_WIDTH || finalMetadata.height > MAX_WEB_HEIGHT) {
            console.log(`🔄 [AutoResize] Resizing ${finalMetadata.width}×${finalMetadata.height} → max ${MAX_WEB_WIDTH}×${MAX_WEB_HEIGHT}`);
            
            originalDimensions = {
                width: finalMetadata.width,
                height: finalMetadata.height
            };
            
            sharpInstance = sharpInstance.resize(MAX_WEB_WIDTH, MAX_WEB_HEIGHT, {
                fit: 'inside',  // Maintain aspect ratio
                withoutEnlargement: true
            });
            
            didAutoResize = true;
            appliedOperations.push(`auto-resized to ${MAX_WEB_WIDTH}×${MAX_WEB_HEIGHT} max`);
            
            // Update current dimensions
            const resizedMetadata = await sharpInstance.metadata();
            currentWidth = resizedMetadata.width;
            currentHeight = resizedMetadata.height;
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
            format: outputFormat.toUpperCase(),
            didAutoResize,
            originalDimensions: didAutoResize ? originalDimensions : undefined
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
 * @param {Object} _context - Lambda context
 */
async function handler(event, responseStream, _context) {
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
        const { images, operations, providers } = body;
        
        if (!images || !Array.isArray(images) || images.length === 0) {
            throw new Error('Invalid request: images array required');
        }
        
        if (!operations || !Array.isArray(operations) || operations.length === 0) {
            throw new Error('Invalid request: operations array required');
        }
        
        // Build generation context for AI operations
        const generationContext = {
            providerPool: providers || [], // Provider pool from request
            // Future: Add API keys from headers or environment
        };
        
        console.log(`📦 [ImageEdit] Generation context: ${providers ? providers.length : 0} providers from request`);
        
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
                    },
                    generationContext // Pass generation context for AI operations
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
