/**
 * Together AI Image Generation Provider
 * Supports Stable Diffusion models (SDXL, SD 2.1, Playground v2.5)
 */

const https = require('https');
const { checkProviderAvailability } = require('../utils/provider-health');
const { recordSuccess, recordFailure } = require('../utils/circuit-breaker');

/**
 * Generate image using Together AI API
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - Image description
 * @param {string} params.model - Model ID (e.g., stabilityai/stable-diffusion-xl-base-1.0)
 * @param {string} params.size - Image size (512x512, 1024x1024, etc.)
 * @param {number} params.steps - Number of inference steps (default: 20)
 * @param {string} params.apiKey - Together AI API key
 * @returns {Promise<Object>} {imageUrl, model, provider, cost, metadata}
 */
async function generateImage({ prompt, model, size = '1024x1024', steps = 20, apiKey }) {
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
  
  console.log(`🎨 [Together AI] Generating image with ${model}, size: ${size}, steps: ${steps}`);
  
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
    steps: Math.max(1, Math.min(steps, 100)), // Clamp steps to reasonable range
    n: 1
  };
  
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
    
    // Extract image URL from response
    // Together AI returns base64 encoded image or URL depending on configuration
    let imageUrl = null;
    
    if (response.data && response.data[0]) {
      if (response.data[0].url) {
        imageUrl = response.data[0].url;
      } else if (response.data[0].b64_json) {
        // Convert base64 to data URL
        imageUrl = `data:image/png;base64,${response.data[0].b64_json}`;
      }
    }
    
    if (!imageUrl) {
      throw new Error('No image data in Together AI response');
    }
    
    // Calculate cost based on model
    const cost = calculateCost(model, width, height);
    
    console.log(`✅ [Together AI] Image generated successfully in ${duration}ms, cost: $${cost.toFixed(4)}`);
    
    // Record success in circuit breaker
    recordSuccess(provider);
    
    return {
      imageUrl,
      model,
      provider,
      cost,
      metadata: {
        size,
        width,
        height,
        steps,
        prompt,
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
 * Calculate cost for Together AI image generation
 * Based on model pricing (approximate, verify with current pricing)
 * @param {string} model - Model ID
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {number} Cost in USD
 */
function calculateCost(model, width, height) {
  // Cost per image based on model (approximate)
  const costPerImage = {
    'stabilityai/stable-diffusion-xl-base-1.0': 0.002,
    'stabilityai/stable-diffusion-2-1': 0.001,
    'playgroundai/playground-v2.5-1024px-aesthetic': 0.003
  };
  
  // Find matching model
  const baseCost = costPerImage[model] || 0.002; // Default to SDXL price
  
  // Adjust for resolution (larger images may cost more)
  const pixels = width * height;
  const multiplier = pixels > (1024 * 1024) ? 1.5 : 1.0;
  
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
    'stabilityai/stable-diffusion-xl-base-1.0',
    'stabilityai/stable-diffusion-2-1',
    'playgroundai/playground-v2.5-1024px-aesthetic'
  ];
}

module.exports = {
  generateImage,
  calculateCost,
  testAvailability,
  getAvailableModels
};
