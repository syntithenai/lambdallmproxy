/**
 * Atlas Cloud Image Generation Provider
 * Supports FLUX models and image-to-image editing via Atlas Cloud AI
 * API Docs: https://docs.atlascloud.ai
 */

const https = require('https');
const { checkProviderAvailability } = require('../utils/provider-health');
const { recordSuccess, recordFailure } = require('../utils/circuit-breaker');

/**
 * Model configurations for Atlas Cloud FLUX models
 * Pricing from: https://docs.atlascloud.ai/pricing
 * @private
 */
const FLUX_MODEL_CONFIGS = {
  'wavespeed-ai/flux-schnell': { pricePerImage: 0.0027, supportsImg2Img: true },
  'wavespeed-ai/flux-dev': { pricePerImage: 0.009, supportsImg2Img: true },
  'wavespeed-ai/flux-dev-ultra-fast': { pricePerImage: 0.0045, supportsImg2Img: true },
  'black-forest-labs/FLUX.1.1-pro': { pricePerImage: 0.036, supportsImg2Img: true },
  'wavespeed-ai/flux-kontext-dev': { pricePerImage: 0.0225, supportsImg2Img: true },
  'wavespeed-ai/flux-kontext-pro': { pricePerImage: 0.036, supportsImg2Img: true }
};

/**
 * Generate image using Atlas Cloud API
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - Image description
 * @param {string} params.model - Model ID (e.g., wavespeed-ai/flux-dev)
 * @param {string} params.size - Image size (512x512, 1024x1024, etc.)
 * @param {Array<string>} params.referenceImages - Optional: Reference images for img2img (base64)
 * @param {string} params.apiKey - Atlas Cloud API key
 * @returns {Promise<Object>} {imageUrl, model, provider, cost, metadata}
 */
async function generateImage({ prompt, model, size = '1024x1024', referenceImages, apiKey }) {
  const provider = 'atlascloud';
  
  // Validate inputs
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required and must be a string');
  }
  if (!model || typeof model !== 'string') {
    throw new Error('model is required');
  }
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Atlas Cloud API key is required');
  }
  
  // Check provider availability before attempting generation
  const availability = await checkProviderAvailability(provider);
  if (!availability.available) {
    const error = new Error(`Atlas Cloud provider unavailable: ${availability.reason}`);
    error.providerUnavailable = true;
    error.reason = availability.reason;
    throw error;
  }
  
  // Get model-specific configuration
  const modelConfig = FLUX_MODEL_CONFIGS[model] || { pricePerImage: 0.02, supportsImg2Img: false };
  
  console.log(`🎨 [Atlas Cloud] Generating image with ${model}, size: ${size}`);
  
  // Parse size dimensions
  const [width, height] = size.split('x').map(Number);
  if (!width || !height) {
    throw new Error(`Invalid size format: ${size}. Expected format: WIDTHxHEIGHT`);
  }
  
  // Build request payload
  const payload = {
    model,
    prompt,
    width,
    height,
    n: 1,
    // Add negative prompt to preserve original image characteristics
    negative_prompt: "different person, different face, different composition, different background, distorted, blurry, low quality"
  };
  
  // Add reference image if provided (img2img mode)
  if (referenceImages && referenceImages.length > 0 && modelConfig.supportsImg2Img) {
    console.log(`📎 [Atlas Cloud] Using reference image for img2img`);
    
    // Extract base64 data if it's a data URL
    let imageData = referenceImages[0];
    if (imageData.startsWith('data:image')) {
      const base64Match = imageData.match(/base64,(.+)/);
      if (base64Match) {
        imageData = base64Match[1];
      }
    }
    
    console.log(`📎 [Atlas Cloud] Reference image length: ${imageData.length} bytes`);
    
    // Atlas Cloud uses image_url for img2img
    payload.image_url = `data:image/png;base64,${imageData}`;
    payload.strength = 0.3; // Preserve 70% of original image
    
    console.log(`📎 [Atlas Cloud] img2img mode with strength: ${payload.strength}`);
  }
  
  const requestBody = JSON.stringify(payload);
  
  try {
    const startTime = Date.now();
    
    // Make API request
    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.atlascloud.ai',
        path: '/v1/images/generations',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse Atlas Cloud response: ${e.message}`));
            }
          } else {
            let errorMessage = `Atlas Cloud API error: ${res.statusCode}`;
            try {
              const errorData = JSON.parse(data);
              errorMessage = errorData.error?.message || errorMessage;
            } catch (e) {
              errorMessage += ` - ${data}`;
            }
            reject(new Error(errorMessage));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Atlas Cloud request failed: ${error.message}`));
      });
      
      req.write(requestBody);
      req.end();
    });
    
    const duration = Date.now() - startTime;
    
    // Extract image URL from response
    if (!response.data || !response.data[0] || !response.data[0].url) {
      throw new Error('Invalid response from Atlas Cloud: missing image URL');
    }
    
    const imageUrl = response.data[0].url;
    const cost = calculateCost(model);
    
    console.log(`✅ [Atlas Cloud] Generated image successfully (${duration}ms, $${cost.toFixed(4)})`);
    
    // Record successful generation
    await recordSuccess(provider);
    
    return {
      imageUrl,
      model,
      provider,
      cost,
      metadata: {
        width,
        height,
        duration,
        referenceImageUsed: !!(referenceImages && referenceImages.length > 0)
      }
    };
    
  } catch (error) {
    console.error(`❌ [Atlas Cloud] Image generation failed:`, error.message);
    
    // Record failure
    await recordFailure(provider, error.message);
    
    // Re-throw with provider unavailable flag if appropriate
    if (error.message.includes('401') || error.message.includes('API key')) {
      error.providerUnavailable = true;
      error.reason = 'Invalid API key';
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      error.providerUnavailable = true;
      error.reason = 'Rate limit exceeded';
    }
    
    throw error;
  }
}

/**
 * Calculate cost for image generation
 * @private
 */
function calculateCost(model) {
  const modelConfig = FLUX_MODEL_CONFIGS[model];
  if (!modelConfig) {
    return 0.02; // Default fallback price
  }
  return modelConfig.pricePerImage;
}

/**
 * Test Atlas Cloud provider availability
 * @param {string} apiKey - Atlas Cloud API key
 * @returns {Promise<boolean>} True if provider is available
 */
async function testAvailability(apiKey) {
  try {
    // Simple test: Check if API key format is valid
    if (!apiKey || !apiKey.startsWith('apikey-')) {
      return false;
    }
    
    // Could add actual API test here if needed
    return true;
  } catch (error) {
    console.error('[Atlas Cloud] Availability test failed:', error.message);
    return false;
  }
}

/**
 * Get list of available models
 * @returns {Array<string>} List of model IDs
 */
function getAvailableModels() {
  return Object.keys(FLUX_MODEL_CONFIGS);
}

module.exports = {
  generateImage,
  calculateCost,
  testAvailability,
  getAvailableModels
};
