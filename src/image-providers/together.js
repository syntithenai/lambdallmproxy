/**
 * Together AI Image Generation Provider
 * Supports FLUX models (schnell-Free, schnell, dev, pro)
 */

const https = require('https');
const { checkProviderAvailability } = require('../utils/provider-health');
const { recordSuccess, recordFailure } = require('../utils/circuit-breaker');

/**
 * Model configurations for FLUX models
 * @private
 */
const FLUX_MODEL_CONFIGS = {
  'black-forest-labs/FLUX.1-schnell-Free': { pricePerMP: 0.00, defaultSteps: 4, maxSteps: 4 },
  'black-forest-labs/FLUX.1-schnell': { pricePerMP: 0.003, defaultSteps: 4, maxSteps: 4 },
  'black-forest-labs/FLUX.1-dev': { pricePerMP: 0.025, defaultSteps: 28, maxSteps: 50 },
  'black-forest-labs/FLUX.1.1-pro': { pricePerMP: 0.04, defaultSteps: 28, maxSteps: 50 },
  'black-forest-labs/FLUX.1-pro': { pricePerMP: 0.05, defaultSteps: 28, maxSteps: 50 }
};

/**
 * Download image from URL and convert to base64
 * @private
 */
async function downloadImageToBase64(url) {
  return new Promise((resolve, reject) => {
    const urlParts = new URL(url);
    const protocol = urlParts.protocol === 'https:' ? https : require('http');
    
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download image: HTTP ${res.statusCode}`));
      }
      
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        resolve(base64);
      });
    }).on('error', reject);
  });
}

/**
 * Generate image using Together AI API
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - Image description
 * @param {string} params.model - Model ID (e.g., black-forest-labs/FLUX.1-dev)
 * @param {string} params.size - Image size (512x512, 1024x1024, etc.)
 * @param {number} params.steps - Number of inference steps (default: model-specific)
 * @param {Array<string>} params.referenceImages - Optional: Reference images for img2img
 * @param {string} params.apiKey - Together AI API key
 * @returns {Promise<Object>} {imageUrl, model, provider, cost, metadata}
 */
async function generateImage({ prompt, model, size = '1024x1024', steps = null, referenceImages, apiKey }) {
  const provider = 'together';
  
  // Validate inputs
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required and must be a string');
  }
  if (!model || typeof model !== 'string') {
    throw new Error('model is required');
  }
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Together AI API key is required');
  }
  
  // Check provider availability before attempting generation
  const availability = await checkProviderAvailability(provider);
  if (!availability.available) {
    const error = new Error(`Together AI provider unavailable: ${availability.reason}`);
    error.providerUnavailable = true;
    error.reason = availability.reason;
    throw error;
  }
  
  // Get model-specific configuration
  const modelConfig = FLUX_MODEL_CONFIGS[model] || { defaultSteps: 20, maxSteps: 100 };
  const finalSteps = steps !== null ? steps : modelConfig.defaultSteps;
  
  console.log(`🎨 [Together AI] Generating image with ${model}, size: ${size}, steps: ${finalSteps}`);
  
  // Parse size dimensions
  const [width, height] = size.split('x').map(Number);
  if (!width || !height) {
    throw new Error(`Invalid size format: ${size}. Expected format: WIDTHxHEIGHT`);
  }
  
  // Build request payload with model-specific step clamping
  const payload = {
    model,
    prompt,
    width,
    height,
    steps: Math.max(1, Math.min(finalSteps, modelConfig.maxSteps)), // Clamp steps to model's max
    n: 1,
    // Add negative prompt to preserve original image characteristics
    negative_prompt: "different person, different face, different composition, different background, distorted, blurry, low quality"
  };
  
  // Add reference image if provided (img2img mode)
  if (referenceImages && referenceImages.length > 0) {
    console.log(`📎 [Together AI] Using reference image for img2img`);
    
    // Extract base64 data if it's a data URL
    let imageData = referenceImages[0];
    if (imageData.startsWith('data:image')) {
      const base64Match = imageData.match(/base64,(.+)/);
      if (base64Match) {
        imageData = base64Match[1];
      }
    }
    
    console.log(`📎 [Together AI] Reference image length: ${imageData.length} bytes`);
    
    // Together AI FLUX models support img2img with image_url parameter
    // FLUX.1-dev and FLUX.1-kontext-pro support this properly
    // Free model (schnell-Free) may not support img2img
    payload.image_url = `data:image/png;base64,${imageData}`;
    
    console.log(`📎 [Together AI] img2img mode enabled with reference image`);
    console.log(`📎 [Together AI] Image URL length: ${payload.image_url.length} chars`);
  }
  
  const requestBody = JSON.stringify(payload);
  
  try {
    const startTime = Date.now();
    
    // Make API request
    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.together.xyz',
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
              reject(new Error(`Failed to parse Together AI response: ${e.message}`));
            }
          } else {
            let errorMessage = `Together AI API error: ${res.statusCode}`;
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
      
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });
    
    const duration = Date.now() - startTime;
    
    // Extract image URL and base64 from response
    // Together AI returns base64 encoded image or URL depending on configuration
    let imageUrl = null;
    let base64Data = null;
    
    if (response.data && response.data[0]) {
      if (response.data[0].url) {
        imageUrl = response.data[0].url;
        
        // Download and convert to base64 for storage
        console.log(`📥 Downloading image from URL to convert to base64...`);
        try {
          base64Data = await downloadImageToBase64(response.data[0].url);
          console.log(`✅ Downloaded and converted to base64 (${Math.round(base64Data.length / 1024)}KB)`);
        } catch (err) {
          console.error(`⚠️ Failed to download image for base64 conversion:`, err.message);
          // Continue without base64 - we still have the URL
        }
      } else if (response.data[0].b64_json) {
        // Already have base64, create data URL for display
        base64Data = response.data[0].b64_json;
        imageUrl = `data:image/png;base64,${base64Data}`;
      }
    }
    
    if (!imageUrl) {
      throw new Error('No image data in Together AI response');
    }
    
    // Calculate cost based on model and steps
    const cost = calculateCost(model, width, height, steps);
    
    console.log(`✅ [Together AI] Image generated successfully in ${duration}ms, cost: $${cost.toFixed(6)}`);
    
    // Record success in circuit breaker
    recordSuccess(provider);
    
    return {
      imageUrl,
      base64Data, // Include base64 for storage
      model,
      provider,
      cost,
      metadata: {
        size,
        width,
        height,
        steps,
        prompt,
        referenceImageUsed: !!(referenceImages && referenceImages.length > 0),
        duration,
        timestamp: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error(`❌ [Together AI] Image generation failed:`, error.message);
    
    // Record failure in circuit breaker
    recordFailure(provider, error);
    
    // Re-throw with additional context
    error.provider = provider;
    error.model = model;
    throw error;
  }
}

/**
 * Calculate cost for image generation
 * FLUX pricing: Cost = MP × Price per MP × (Steps ÷ Default Steps) [only if exceeding default steps]
 * @private
 */
function calculateCost(model, width, height, steps = null) {
  const megapixels = (width * height) / 1000000;
  
  // Legacy Stable Diffusion pricing (deprecated, requires dedicated endpoint)
  const legacyPricing = {
    'stabilityai/stable-diffusion-xl-base-1.0': 0.002,
    'stabilityai/stable-diffusion-2-1': 0.001,
    'playgroundai/playground-v2.5-1024px-aesthetic': 0.003
  };
  
  // Check if FLUX model
  if (FLUX_MODEL_CONFIGS[model]) {
    const { pricePerMP, defaultSteps } = FLUX_MODEL_CONFIGS[model];
    
    // Base cost
    let cost = megapixels * pricePerMP;
    
    // If steps exceed default, adjust cost proportionally
    if (steps && steps > defaultSteps) {
      cost *= (steps / defaultSteps);
    }
    
    return cost;
  }
  
  // Legacy pricing (per image, not per megapixel)
  const baseCost = legacyPricing[model] || 0.002;
  const multiplier = (width * height) > (1024 * 1024) ? 1.5 : 1.0;
  return baseCost * multiplier;
}

/**
 * Test Together AI provider availability
 * @param {string} apiKey - Together AI API key
 * @returns {Promise<boolean>} True if provider is available
 */
async function testAvailability(apiKey) {
  try {
    const availability = await checkProviderAvailability('together');
    return availability.available;
  } catch (error) {
    console.error('[Together AI] Availability check failed:', error.message);
    return false;
  }
}

/**
 * Get list of available models
 * @returns {Array<string>} List of model IDs
 */
function getAvailableModels() {
  return [
    'black-forest-labs/FLUX.1-schnell-Free',
    'black-forest-labs/FLUX.1-schnell',
    'black-forest-labs/FLUX.1-dev',
    'black-forest-labs/FLUX.1.1-pro',
    'black-forest-labs/FLUX.1-pro'
  ];
}

module.exports = {
  generateImage,
  calculateCost,
  testAvailability,
  getAvailableModels
};
