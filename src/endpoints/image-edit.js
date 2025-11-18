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
const { llmResponsesWithTools } = require('../llm_tools_adapter');
const { buildProviderPool } = require('../credential-pool');
const { calculateCost, calculateLambdaCost } = require('../services/google-sheets-logger');
const { calculateLambdaCost: unifiedCalculateLambdaCost } = require('../utils/pricing-service');

/**
 * Check if a model name indicates vision capability
 * @param {string} modelName - Model name to check
 * @returns {boolean} True if model supports vision
 */
function isVisionCapableModel(modelName) {
    if (!modelName) return false;
    const name = modelName.toLowerCase();
    
    // Known vision models
    const visionPatterns = [
        'gpt-4o',           // OpenAI GPT-4 with vision
        'gpt-4-vision',     // Legacy OpenAI vision
        'gemini-2.0',       // Gemini 2.0 models have vision
        'gemini-2.5',       // Gemini 2.5 models have vision
        'gemini-pro-vision', // Legacy Gemini vision
        'llama-3.2-11b-vision',  // Groq Llama 3.2 11B vision (deprecated)
        'llama-4-maverick',      // Llama 4 Maverick multimodal
        'llama-4-scout',         // Llama 4 Scout multimodal
        'llava',            // LLaVA vision models
        'claude-3',         // Anthropic Claude 3 has vision
        'pixtral'           // Mistral Pixtral vision models
    ];
    
    return visionPatterns.some(pattern => name.includes(pattern));
}

/**
 * Call vision API to detect main subject for auto-crop
 * @param {string} base64Image - Base64-encoded image data URL
 * @param {Object} context - Generation context with provider pool
 * @returns {Promise<Object>} {x, y, width, height} crop coordinates
 */
async function detectMainSubject(base64Image, context) {
    console.log('🔍 [Vision] Detecting main subject for auto-crop...');
    
    // Get provider pool and filter for vision-capable models
    const providerPool = context.providerPool || await buildProviderPool();
    
    // Filter providers with vision support
    // Provider pool structure: { type, apiKey, model, modelName, supportsVision, ... }
    const visionProviders = providerPool.filter(p => 
        p.apiKey && 
        (p.supportsVision === true || isVisionCapableModel(p.model || p.modelName))
    );
    
    if (visionProviders.length === 0) {
        throw new Error('No vision-capable model available in provider pool');
    }
    
    // Priority order: OpenAI GPT-4o > Gemini 2.0/2.5 Flash > Llama 4 Maverick/Scout > Others
    // Note: llama-3.2-vision models deprecated Nov 2025, excluded from priority
    const priorityOrder = ['gpt-4o', 'gemini-2.0-flash', 'gemini-2.5', 'llama-4-maverick', 'llama-4-scout', 'claude-3'];
    visionProviders.sort((a, b) => {
        const aModel = (a.model || a.modelName || '').toLowerCase();
        const bModel = (b.model || b.modelName || '').toLowerCase();
        const aIndex = priorityOrder.findIndex(m => aModel.includes(m));
        const bIndex = priorityOrder.findIndex(m => bModel.includes(m));
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
    
    const selectedProvider = visionProviders[0];
    const selectedModel = `${selectedProvider.type}:${selectedProvider.model || selectedProvider.modelName}`;
    console.log(`✅ [Vision] Selected ${selectedModel} for subject detection (from pool of ${visionProviders.length} vision models)`);

    
    // Call vision API with structured output request
    const prompt = `Analyze this image and identify the main subject or focal point. Return the bounding box coordinates as JSON.

The coordinates should define a rectangle that tightly frames the most important subject in the image.

Return ONLY valid JSON in this exact format:
{
  "x": <left edge pixel position>,
  "y": <top edge pixel position>,
  "width": <width in pixels>,
  "height": <height in pixels>,
  "subject": "<brief description of detected subject>"
}`;

    try {
        const response = await llmResponsesWithTools({
            model: selectedModel,
            input: [
                { role: 'user', content: [
                    { type: 'image_url', image_url: { url: base64Image } },
                    { type: 'text', text: prompt }
                ]}
            ],
            options: {
                temperature: 0.3,
                max_tokens: 200
            }
        });
        
        // Parse JSON response
        const content = response.content || response.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        
        const coords = JSON.parse(jsonMatch[0]);
        console.log(`✅ [Vision] Detected subject: ${coords.subject} at (${coords.x}, ${coords.y}) ${coords.width}×${coords.height}`);
        
        return coords;
    } catch (error) {
        console.error('❌ [Vision] Subject detection failed:', error.message);
        throw error;
    }
}

/**
 * Call vision API to detect faces for face-crop
 * @param {string} base64Image - Base64-encoded image data URL
 * @param {Object} context - Generation context with provider pool
 * @returns {Promise<Object>} {x, y, width, height} crop coordinates for face
 */
async function detectFaces(base64Image, context) {
    console.log('🔍 [Vision] Detecting faces for face-crop...');
    
    // Get provider pool and filter for vision-capable models
    const providerPool = context.providerPool || await buildProviderPool();
    
    // Filter providers with vision support
    const visionProviders = providerPool.filter(p => 
        p.apiKey && 
        (p.supportsVision === true || isVisionCapableModel(p.model || p.modelName))
    );
    
    if (visionProviders.length === 0) {
        throw new Error('No vision-capable model available in provider pool');
    }
    
    // Priority order: OpenAI GPT-4o > Gemini 2.0/2.5 Flash > Llama 4 Maverick/Scout > Others
    // Note: llama-3.2-vision models deprecated Nov 2025, excluded from priority
    const priorityOrder = ['gpt-4o', 'gemini-2.0-flash', 'gemini-2.5', 'llama-4-maverick', 'llama-4-scout', 'claude-3'];
    visionProviders.sort((a, b) => {
        const aModel = (a.model || a.modelName || '').toLowerCase();
        const bModel = (b.model || b.modelName || '').toLowerCase();
        const aIndex = priorityOrder.findIndex(m => aModel.includes(m));
        const bIndex = priorityOrder.findIndex(m => bModel.includes(m));
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
    
    const selectedProvider = visionProviders[0];
    const selectedModel = `${selectedProvider.type}:${selectedProvider.model || selectedProvider.modelName}`;
    console.log(`✅ [Vision] Selected ${selectedModel} for face detection (from pool of ${visionProviders.length} vision models)`);

    
    // Call vision API with structured output request
    const prompt = `Analyze this image and detect the primary face. Return the bounding box coordinates as JSON.

If multiple faces are present, focus on the largest or most prominent face. The coordinates should include some padding around the face for a natural crop.

Return ONLY valid JSON in this exact format:
{
  "x": <left edge pixel position>,
  "y": <top edge pixel position>,
  "width": <width in pixels>,
  "height": <height in pixels>,
  "faceCount": <number of faces detected>
}`;

    try {
        const response = await llmResponsesWithTools({
            model: selectedModel,
            input: [
                { role: 'user', content: [
                    { type: 'image_url', image_url: { url: base64Image } },
                    { type: 'text', text: prompt }
                ]}
            ],
            options: {
                temperature: 0.3,
                max_tokens: 200
            }
        });
        
        // Parse JSON response
        const content = response.content || response.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        
        const coords = JSON.parse(jsonMatch[0]);
        console.log(`✅ [Vision] Detected ${coords.faceCount} face(s) at (${coords.x}, ${coords.y}) ${coords.width}×${coords.height}`);
        
        return coords;
    } catch (error) {
        console.error('❌ [Vision] Face detection failed:', error.message);
        throw error;
    }
}

/**
 * Process image with sharp library
 * Applies operations in sequence and returns processed image buffer
 * @param {string|Buffer} imageUrlOrBuffer - URL or Buffer of image to process
 * @param {Array} operations - Array of operations to apply
 * @param {Function} onProgress - Progress callback
 * @param {Object} generationContext - Context for AI image generation (provider pool, API keys)
 */
async function processImage(imageUrlOrBuffer, operations, onProgress, generationContext) {
    // Convert URL to buffer if needed
    let imageBuffer;
    if (typeof imageUrlOrBuffer === 'string') {
        const imageUrl = imageUrlOrBuffer;
        if (imageUrl.startsWith('data:')) {
            // Data URL - extract base64
            const base64Data = imageUrl.split(',')[1];
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            // Remote URL - fetch it
            const https = require('https');
            const http = require('http');
            const protocol = imageUrl.startsWith('https:') ? https : http;
            
            imageBuffer = await new Promise((resolve, reject) => {
                protocol.get(imageUrl, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Failed to fetch image: ${res.statusCode}`));
                        return;
                    }
                    const chunks = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                    res.on('error', reject);
                });
            });
        }
    } else {
        imageBuffer = imageUrlOrBuffer;
    }
    
    let sharpInstance;
    try {
        sharpInstance = sharp(imageBuffer);
    } catch (error) {
        if (error.message.includes('unsupported image format') || error.message.includes('Input file')) {
            throw new Error('Unsupported image format. Please use JPG, PNG, WebP, GIF, or AVIF images.');
        }
        throw error;
    }
    
    let currentWidth, currentHeight;
    const appliedOperations = [];
    let generationCost = 0; // Track AI generation costs
    
    // Get initial dimensions
    const metadata = await sharpInstance.metadata();
    currentWidth = metadata.width;
    currentHeight = metadata.height;
    
    try {
        // Process each operation in sequence
        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            onProgress({ 
                status: 'processing', 
                progress: Math.floor((i / operations.length) * 80) + 10,
                currentOperation: `${op.type}`
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
                        // Format conversion is now always webp - ignore user format requests
                        // outputFormat is already set to 'webp' at initialization
                        appliedOperations.push('format WebP (auto)');
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
                    
                    case 'autocrop': {
                        // AI-powered intelligent auto-crop (focus on center subject)
                        console.log(`🤖 [AutoCrop] AI auto-crop request, focus: ${op.params.focus || 'center'}`);
                        
                        try {
                            // Convert image to base64 for vision API
                            const currentBuffer = await sharpInstance.toBuffer();
                            const base64Image = `data:image/jpeg;base64,${currentBuffer.toString('base64')}`;
                            
                            // Call vision API to detect main subject
                            const cropCoords = await detectMainSubject(base64Image, generationContext);
                            
                            if (cropCoords && cropCoords.x !== undefined && cropCoords.y !== undefined && 
                                cropCoords.width > 0 && cropCoords.height > 0) {
                                // Apply AI-suggested crop
                                const left = Math.max(0, Math.round(cropCoords.x));
                                const top = Math.max(0, Math.round(cropCoords.y));
                                const width = Math.min(currentWidth - left, Math.round(cropCoords.width));
                                const height = Math.min(currentHeight - top, Math.round(cropCoords.height));
                                
                                sharpInstance = sharpInstance.extract({ left, top, width, height });
                                currentWidth = width;
                                currentHeight = height;
                                appliedOperations.push(`AI auto-crop ${width}×${height} (AI-detected subject)`);
                            } else {
                                throw new Error('No subject detected');
                            }
                        } catch (aiError) {
                            console.warn(`⚠️ [AutoCrop] AI detection failed: ${aiError.message}, using fallback`);
                            // Fallback: Center crop to 80% of image size
                            const cropPercentage = 0.8;
                            const newWidth = Math.round(currentWidth * cropPercentage);
                            const newHeight = Math.round(currentHeight * cropPercentage);
                            const left = Math.round((currentWidth - newWidth) / 2);
                            const top = Math.round((currentHeight - newHeight) / 2);
                            
                            sharpInstance = sharpInstance.extract({ left, top, width: newWidth, height: newHeight });
                            currentWidth = newWidth;
                            currentHeight = newHeight;
                            appliedOperations.push(`AI auto-crop ${newWidth}×${newHeight} (fallback: center)`);
                        }
                        break;
                    }
                    
                    case 'facedetect': {
                        // AI-powered face detection and crop
                        console.log(`👤 [FaceDetect] AI face-crop request`);
                        
                        try {
                            // Convert image to base64 for vision API
                            const currentBuffer = await sharpInstance.toBuffer();
                            const base64Image = `data:image/jpeg;base64,${currentBuffer.toString('base64')}`;
                            
                            // Call vision API to detect faces
                            const faceCoords = await detectFaces(base64Image, generationContext);
                            
                            if (faceCoords && faceCoords.x !== undefined && faceCoords.y !== undefined && 
                                faceCoords.width > 0 && faceCoords.height > 0) {
                                // Apply AI-suggested face crop
                                const left = Math.max(0, Math.round(faceCoords.x));
                                const top = Math.max(0, Math.round(faceCoords.y));
                                const width = Math.min(currentWidth - left, Math.round(faceCoords.width));
                                const height = Math.min(currentHeight - top, Math.round(faceCoords.height));
                                
                                sharpInstance = sharpInstance.extract({ left, top, width, height });
                                currentWidth = width;
                                currentHeight = height;
                                appliedOperations.push(`AI face-crop ${width}×${height} (AI-detected face)`);
                            } else {
                                throw new Error('No face detected');
                            }
                        } catch (aiError) {
                            console.warn(`⚠️ [FaceDetect] AI detection failed: ${aiError.message}, using fallback`);
                            // Fallback: Center crop to square aspect
                            const cropSize = Math.min(currentWidth, currentHeight);
                            const left = Math.round((currentWidth - cropSize) / 2);
                            const top = Math.round((currentHeight - cropSize) / 2);
                            
                            sharpInstance = sharpInstance.extract({ left, top, width: cropSize, height: cropSize });
                            currentWidth = cropSize;
                            currentHeight = cropSize;
                            appliedOperations.push(`AI face-crop ${cropSize}×${cropSize} (fallback: center square)`);
                        }
                        break;
                    }
                    
                    case 'generate': {
                        // AI-powered generative editing (adding objects, changing backgrounds, etc.)
                        console.log(`🎨 [Generate] AI editing request: ${op.params.prompt || 'no prompt'}, mode: ${op.params.mode || 'edit'}`);
                        
                        // Import generateImageDirect function
                        const { generateImageDirect } = require('./generate-image');
                        
                        // Auto-select best available image provider from credential pool
                        let selectedProvider = null;
                        let selectedModel = null;
                        
                        // Check if this is an image editing operation (has reference image)
                        const hasReferenceImage = imageBuffer && imageBuffer.length > 0;
                        
                        if (generationContext.providerPool && Array.isArray(generationContext.providerPool)) {
                            // If we have a reference image, prioritize providers with image-edit capability
                            if (hasReferenceImage) {
                                console.log(`🖼️ [Generate] Reference image detected - looking for image-edit capable providers`);
                                
                                // Check for providers with explicit image-edit capability
                                const imageEditProviders = generationContext.providerPool.filter(p => 
                                    p.apiKey && p.capabilities && p.capabilities.includes('image-edit')
                                );
                                
                                if (imageEditProviders.length > 0) {
                                    const editProvider = imageEditProviders[0];
                                    selectedProvider = editProvider.type.toLowerCase();
                                    
                                    // Set model based on provider (using cost-effective image editing models)
                                    if (selectedProvider === 'replicate') {
                                        // FLUX.1 Kontext Dev: Open-weight version with great preservation
                                        // $0.025/image (40 images for $1) - 37.5% cheaper than Pro
                                        // Excellent for image editing with good preservation and commercial use allowed
                                        selectedModel = 'black-forest-labs/flux-kontext-dev';
                                        
                                        // Alternative options if quality needs are higher:
                                        // - 'black-forest-labs/flux-kontext-pro' ($0.04/image - best cost/quality balance)
                                        // - 'google/nano-banana' (Gemini 2.5 - fastest, multi-image support)
                                        // - 'black-forest-labs/flux-kontext-max' (premium - highest quality)
                                        // - 'bytedance/seedream-4' (up to 4K resolution)
                                    }
                                    
                                    console.log(`✅ [Generate] Found image-edit provider: ${selectedProvider} with model: ${selectedModel}`);
                                } else {
                                    console.log(`⚠️ [Generate] No image-edit providers found, falling back to image generation providers`);
                                }
                            }
                            
                            // If no image-edit provider found, or no reference image, use standard image generation
                            if (!selectedProvider) {
                                // Priority order for image generation providers (free first, then paid)
                                // Note: Atlas Cloud does not support /v1/images/generations endpoint (404)
                                const providerPriority = ['together', 'replicate', 'openai', 'gemini'];
                                
                                for (const preferredProvider of providerPriority) {
                                    const found = generationContext.providerPool.find(p => 
                                        p.type.toLowerCase() === preferredProvider && p.apiKey
                                    );
                                    
                                    if (found) {
                                        selectedProvider = found.type.toLowerCase();
                                        // Select appropriate model based on provider
                                        if (selectedProvider === 'together') {
                                            // Use FLUX.1-dev for proper img2img support (paid model)
                                            selectedModel = 'black-forest-labs/FLUX.1-dev';
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
                            }
                            
                            // If no priority provider found, use ANY available provider with image generation capability
                            if (!selectedProvider) {
                                const imageCapableProviders = generationContext.providerPool.filter(p => 
                                    p.apiKey && (p.type.toLowerCase() === 'together' || 
                                                 p.type.toLowerCase() === 'replicate' || 
                                                 p.type.toLowerCase() === 'openai' || 
                                                 p.type.toLowerCase() === 'gemini')
                                );
                                
                                if (imageCapableProviders.length > 0) {
                                    const fallbackProvider = imageCapableProviders[0];
                                    selectedProvider = fallbackProvider.type.toLowerCase();
                                    
                                    // Set model based on provider
                                    if (selectedProvider === 'together') {
                                        // Use FLUX.1-dev for proper img2img support (paid model)
                                        selectedModel = 'black-forest-labs/FLUX.1-dev';
                                    } else if (selectedProvider === 'replicate') {
                                        selectedModel = 'flux-1.1-pro';
                                    } else if (selectedProvider === 'openai') {
                                        selectedModel = 'dall-e-3';
                                    } else if (selectedProvider === 'gemini') {
                                        selectedModel = 'imagen-3.0-generate-001';
                                    }
                                    
                                    console.log(`⚠️ [Generate] No preferred provider available, falling back to: ${selectedProvider}`);
                                } else {
                                    throw new Error('No image generation providers available. Please configure an API key for Together, Replicate, OpenAI, or Gemini.');
                                }
                            }
                        } else {
                            throw new Error('No provider pool available. Please configure image generation providers.');
                        }
                        
                        // Prepare generation parameters
                        // Round dimensions to multiples of 16 (required by FLUX models)
                        const roundToMultiple = (value, multiple) => Math.round(value / multiple) * multiple;
                        const adjustedWidth = roundToMultiple(currentWidth, 16);
                        const adjustedHeight = roundToMultiple(currentHeight, 16);
                        
                        // Resize image to adjusted dimensions if needed (FLUX requires multiples of 16)
                        let referenceImageBuffer = imageBuffer;
                        if (adjustedWidth !== currentWidth || adjustedHeight !== currentHeight) {
                            console.log(`📐 [Generate] Resizing reference image from ${currentWidth}x${currentHeight} to ${adjustedWidth}x${adjustedHeight}`);
                            referenceImageBuffer = await sharp(imageBuffer)
                                .resize(adjustedWidth, adjustedHeight, { fit: 'fill' })
                                .toBuffer();
                        }
                        
                        // Convert current image buffer to base64 for reference
                        // This ensures img2img works properly - the AI modifies the existing image
                        const currentImageBase64 = referenceImageBuffer.toString('base64');
                        
                        // Use clean, simple prompt for img2img
                        // Don't add preservation instructions - let the strength parameter handle that
                        const enhancedPrompt = op.params.prompt || 'add creative element';
                        
                        // Strength parameter: 0.0-1.0 (lower = more preservation)
                        // 0.15-0.25 = subtle changes, good balance for img2img
                        // 0.3-0.4 = moderate changes
                        // 0.5+ = significant transformation
                        // NOTE: Use clean prompts - let strength handle preservation
                        const imgStrength = op.params.strength || 0.2; // Balanced for img2img edits
                        
                        const genParams = {
                            prompt: enhancedPrompt,
                            provider: op.params.provider || selectedProvider, // Use auto-selected or fallback
                            model: op.params.model || selectedModel,
                            size: op.params.size || `${adjustedWidth}x${adjustedHeight}`, // Dimensions must be multiples of 16
                            quality: op.params.quality || 'standard',
                            style: op.params.style || 'natural',
                            strength: imgStrength, // img2img transformation strength
                            referenceImages: [currentImageBase64], // Pass current image as base64 for img2img
                            context: generationContext // Pass provider pool and API keys from handler
                        };
                        
                        // Generate/modify image using AI
                        console.log(`🔄 [Generate] Calling generateImageDirect with provider: ${genParams.provider}`);
                        const genResult = await generateImageDirect(genParams);
                        
                        if (!genResult.success) {
                            console.error(`❌ [Generate] Failed: ${genResult.error}`);
                            throw new Error(`AI generation failed: ${genResult.error}`);
                        }
                        
                        // Track generation cost
                        if (genResult.cost) {
                            generationCost += genResult.cost;
                            console.log(`💰 [Generate] Cost: $${genResult.cost.toFixed(6)}`);
                        }
                        
                        // Replace current image buffer with generated image
                        console.log(`✅ [Generate] Success! Using generated image`);
                        
                        // Normalize property names (different providers use different keys)
                        const imageUrl = genResult.imageUrl || genResult.url;
                        const base64Data = genResult.base64;
                        
                        console.log(`🔍 [Generate] Image URL: ${imageUrl ? imageUrl.substring(0, 100) : 'none'}`);
                        console.log(`🔍 [Generate] Base64: ${base64Data ? 'present' : 'none'}`);
                        
                        // Convert data URL to buffer if needed
                        if (imageUrl && imageUrl.startsWith('data:')) {
                            const base64 = imageUrl.split(',')[1];
                            imageBuffer = Buffer.from(base64, 'base64');
                            sharpInstance = sharp(imageBuffer);
                            
                            // Update dimensions from generated image
                            const newMetadata = await sharpInstance.metadata();
                            currentWidth = newMetadata.width;
                            currentHeight = newMetadata.height;
                        } else if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
                            // Fetch remote image URL (e.g., from Replicate)
                            console.log(`📥 [Generate] Fetching image from URL: ${imageUrl.substring(0, 60)}...`);
                            const https = require('https');
                            const http = require('http');
                            const client = imageUrl.startsWith('https') ? https : http;
                            
                            imageBuffer = await new Promise((resolve, reject) => {
                                client.get(imageUrl, (res) => {
                                    if (res.statusCode !== 200) {
                                        reject(new Error(`Failed to fetch image: ${res.statusCode}`));
                                        return;
                                    }
                                    
                                    const chunks = [];
                                    res.on('data', chunk => chunks.push(chunk));
                                    res.on('end', () => resolve(Buffer.concat(chunks)));
                                    res.on('error', reject);
                                }).on('error', reject);
                            });
                            
                            sharpInstance = sharp(imageBuffer);
                            
                            // Update dimensions from generated image
                            const newMetadata = await sharpInstance.metadata();
                            currentWidth = newMetadata.width;
                            currentHeight = newMetadata.height;
                        } else if (base64Data) {
                            imageBuffer = Buffer.from(base64Data, 'base64');
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
        
        // Convert to webp format with quality optimization
        // WebP provides superior compression while maintaining quality
        const processedBuffer = await sharpInstance.webp({ quality: 85, effort: 4 }).toBuffer();
        
        // Convert to base64 data URL
        const base64 = processedBuffer.toString('base64');
        const mimeType = 'image/webp';
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
            format: 'WEBP',
            didAutoResize,
            originalDimensions: didAutoResize ? originalDimensions : undefined,
            generationCost // Include generation cost in result
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
    const startTime = Date.now(); // Track request start time for duration calculation
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
        // Use environment-based provider pool for image generation
        const environmentPool = await buildProviderPool(false, [], true); // allowEnvironment = true
        const isUserProvidedKey = providers && providers.length > 0; // User provided their own API keys
        const generationContext = {
            providerPool: isUserProvidedKey ? providers : environmentPool,
        };
        
        console.log(`📦 [ImageEdit] Generation context: ${generationContext.providerPool.length} providers (${isUserProvidedKey ? 'from request' : 'from environment'})`);
        
        // Verify authentication and attach user email to generation context when possible
        const googleToken = event.headers?.['x-google-oauth-token'] || event.headers?.['X-Google-OAuth-Token'];
        if (googleToken) {
            try {
                const decoded = await verifyGoogleToken(googleToken);
                console.log('✅ Google OAuth token verified');
                if (decoded && decoded.email) {
                    generationContext.userEmail = decoded.email;
                    generationContext.accessToken = googleToken;
                    console.log(`📧 [ImageEdit] Attributing generation to user: ${decoded.email}`);
                }
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
                
                // Calculate costs for this image generation (if AI was used)
                let costBreakdown = null;
                if (result.generationCost && result.generationCost > 0) {
                    // Calculate Lambda cost for this request
                    const durationMs = Date.now() - startTime;
                    const memoryMB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '256');
                    const lambdaCost = unifiedCalculateLambdaCost(memoryMB, durationMs);
                    
                    // Apply LLM markup only if using server-side keys
                    // User-provided keys have $0 cost (they pay provider directly)
                    const llmCost = isUserProvidedKey ? 0 : result.generationCost;
                    const totalCost = llmCost + lambdaCost;
                    
                    costBreakdown = {
                        llm: llmCost,
                        lambda: lambdaCost,
                        total: totalCost,
                        isUserProvidedKey
                    };
                    
                    console.log(`💰 [Cost] Image generation: LLM=$${llmCost.toFixed(6)}, Lambda=$${lambdaCost.toFixed(6)}, Total=$${totalCost.toFixed(6)} (user key: ${isUserProvidedKey})`);
                }
                
                // Send image complete event with cost information
                responseStream.write(`data: ${JSON.stringify({
                    type: 'image_complete',
                    imageId: image.id,
                    imageIndex: i,
                    result: result,
                    cost: costBreakdown
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
