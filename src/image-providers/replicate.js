/**
 * Replicate Image Generation Provider
 * Supports various Stable Diffusion models via Replicate API
 */

const https = require('https');
const { checkProviderAvailability } = require('../utils/provider-health');
const { recordSuccess, recordFailure } = require('../utils/circuit-breaker');

/**
 * Generate image using Replicate API
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - Image description
 * @param {string} params.model - Model version (e.g., stability-ai/sdxl:latest)
 * @param {string} params.size - Image size (512x512, 1024x1024, etc.)
 * @param {Array<string>} params.referenceImages - Optional: Reference images for img2img
 * @param {number} params.strength - Optional: img2img transformation strength (0.0-1.0, default 0.25)
 * @param {string} params.apiKey - Replicate API token
 * @returns {Promise<Object>} {imageUrl, model, provider, cost, metadata}
 */
async function generateImage({ prompt, model, size = '1024x1024', referenceImages, strength, apiKey }) {
  const provider = 'replicate';
  
  // Validate inputs
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required and must be a string');
  }
  if (!model || typeof model !== 'string') {
    throw new Error('model is required');
  }
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Replicate API token is required');
  }
  
  // Check provider availability before attempting generation
  const availability = await checkProviderAvailability(provider);
  if (!availability.available) {
    const error = new Error(`Replicate provider unavailable: ${availability.reason}`);
    error.providerUnavailable = true;
    error.reason = availability.reason;
    throw error;
  }
  
  console.log(`🎨 [Replicate] Generating image with ${model}, size: ${size}`);
  
  // Parse size dimensions
  const [width, height] = size.split('x').map(Number);
  if (!width || !height) {
    throw new Error(`Invalid size format: ${size}. Expected format: WIDTHxHEIGHT`);
  }
  
  try {
    const startTime = Date.now();
    
    // Step 1: Create prediction
    const prediction = await createPrediction({
      model,
      prompt,
      width,
      height,
      referenceImages,
      strength,
      apiKey
    });
    
    if (!prediction || !prediction.id) {
      throw new Error('Failed to create Replicate prediction');
    }
    
    console.log(`⏳ [Replicate] Prediction created: ${prediction.id}`);
    
    // Step 2: Poll for completion
    const result = await pollPrediction(prediction.id, apiKey, 60000); // 60s timeout
    
    const duration = Date.now() - startTime;
    
    // Extract image URL from result
    let imageUrl = null;
    if (Array.isArray(result.output) && result.output.length > 0) {
      imageUrl = result.output[0];
    } else if (typeof result.output === 'string') {
      imageUrl = result.output;
    }
    
    if (!imageUrl) {
      throw new Error('No image URL in Replicate response');
    }
    
    // Calculate cost based on model and execution time
    const cost = calculateCost(model, duration);
    
    console.log(`✅ [Replicate] Image generated successfully in ${duration}ms, cost: $${cost.toFixed(4)}`);
    
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
        prompt,
        referenceImageUsed: !!(referenceImages && referenceImages.length > 0),
        duration,
        predictionId: prediction.id,
        timestamp: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error(`❌ [Replicate] Image generation failed:`, error.message);
    
    // Record failure in circuit breaker
    recordFailure(provider, error);
    
    // Re-throw with additional context
    error.provider = provider;
    error.model = model;
    throw error;
  }
}

/**
 * Create a prediction on Replicate
 * @private
 */
async function createPrediction({ model, prompt, width, height, referenceImages, strength, apiKey }) {
  // Check if this is an img2img model
  const isImg2ImgModel = model.includes('img2img') || 
                         model.includes('stability-ai/stable-diffusion-img2img') ||
                         model.includes('lucataco/sdxl-img2img') ||
                         model.includes('stability-ai/sdxl') ||
                         model.includes('instruct-pix2pix') ||
                         model.includes('flux-kontext') ||
                         model.includes('nano-banana') ||
                         model.includes('seedream') ||
                         model.includes('seededit');
  
  const inputParams = {
    prompt,
    num_outputs: 1
  };
  
  // Add reference image if provided (img2img mode)
  if (referenceImages && referenceImages.length > 0) {
    console.log(`📎 [Replicate] Using reference image for img2img with model: ${model}`);
    
    // Extract base64 data if it's a data URL
    let imageData = referenceImages[0];
    if (imageData.startsWith('data:image')) {
      // Replicate accepts data URLs directly - no modification needed
    } else {
      // If it's just base64, wrap it in data URL
      imageData = `data:image/png;base64,${imageData}`;
    }
    
    // FLUX Kontext models use 'input_image' parameter name
    // Most other img2img models use 'image' parameter name
    const imageParamName = model.includes('flux-kontext') ? 'input_image' : 'image';
    inputParams[imageParamName] = imageData;
    console.log(`📸 [Replicate] Using parameter: ${imageParamName}`);
    
    if (isImg2ImgModel) {
      // Stable Diffusion img2img specific parameters
      // Lower strength = preserve more of original image
      // 0.0 = identical to original, 1.0 = completely new image
      const imgStrength = strength || 0.2; // Default to 0.2 (balanced for edits)
      inputParams.strength = imgStrength; // 0-1: how much to transform
      inputParams.num_inference_steps = 50; // More steps for better quality
      inputParams.guidance_scale = 7.5; // How closely to follow the prompt
      console.log(`🎯 [Replicate] Using img2img model with strength: ${inputParams.strength}`);
    } else {
      // Generic img2img parameters
      inputParams.prompt_strength = 0.8; // Higher = more faithful to prompt
      inputParams.num_inference_steps = 50;
      // Don't specify width/height for img2img - use reference image dimensions
    }
  } else {
    // Text-to-image mode - specify dimensions
    inputParams.width = width;
    inputParams.height = height;
  }
  
  // Construct payload based on model format
  // Replicate API requires either "version" (64-char hash) or uses /v1/models/{owner}/{name}/predictions for latest
  // Format: owner/name:version OR owner/name (uses latest version)
  let payload;
  let apiPath = '/v1/predictions';
  
  if (model.includes(':')) {
    const parts = model.split(':');
    const version = parts[1];
    
    if (version === 'latest' || version.length < 60) {
      // Use model-based prediction endpoint for :latest or short version strings
      apiPath = `/v1/models/${parts[0]}/predictions`;
      payload = {
        input: inputParams
      };
    } else {
      // Use version-based endpoint with full hash
      payload = {
        version: version,
        input: inputParams
      };
    }
  } else {
    // No version specified, use model endpoint (latest version)
    apiPath = `/v1/models/${model}/predictions`;
    payload = {
      input: inputParams
    };
  }
  
  const requestBody = JSON.stringify(payload);
  
  console.log(`🔗 [Replicate] API path: ${apiPath}`);
  console.log(`📦 [Replicate] Payload keys: ${Object.keys(payload).join(', ')}`);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.replicate.com',
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse Replicate response: ${e.message}`));
          }
        } else {
          let errorMessage = `Replicate API error: ${res.statusCode}`;
          try {
            const errorData = JSON.parse(data);
            errorMessage = errorData.detail || errorMessage;
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
}

/**
 * Poll prediction status until completion
 * @private
 */
async function pollPrediction(predictionId, apiKey, timeout = 60000) {
  const startTime = Date.now();
  const pollInterval = 1000; // Poll every 1 second
  
  while (Date.now() - startTime < timeout) {
    const prediction = await getPrediction(predictionId, apiKey);
    
    if (prediction.status === 'succeeded') {
      return prediction;
    } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Prediction ${prediction.status}: ${prediction.error || 'Unknown error'}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error('Prediction timed out');
}

/**
 * Get prediction status
 * @private
 */
async function getPrediction(predictionId, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.replicate.com',
      path: `/v1/predictions/${predictionId}`,
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`
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
            reject(new Error(`Failed to parse Replicate response: ${e.message}`));
          }
        } else {
          reject(new Error(`Failed to get prediction: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

/**
 * Calculate cost for Replicate image generation
 * Based on execution time and model pricing
 * @param {string} model - Model version
 * @param {number} duration - Execution time in ms
 * @returns {number} Cost in USD
 */
function calculateCost(model, duration) {
  // Cost per second based on model (approximate)
  const costPerSecond = {
    'stability-ai/sdxl': 0.0001,
    'stability-ai/realistic-vision': 0.00007
  };
  
  // Find matching model
  const modelKey = Object.keys(costPerSecond).find(key => model.includes(key));
  const baseCost = costPerSecond[modelKey] || 0.0001;
  
  // Calculate based on duration
  const seconds = duration / 1000;
  return baseCost * seconds;
}

/**
 * Test Replicate provider availability
 * @param {string} apiKey - Replicate API token
 * @returns {Promise<boolean>} True if provider is available
 */
async function testAvailability(apiKey) {
  try {
    const availability = await checkProviderAvailability('replicate');
    return availability.available;
  } catch (error) {
    console.error('[Replicate] Availability check failed:', error.message);
    return false;
  }
}

/**
 * Get list of available models
 * @returns {Array<string>} List of model versions
 */
function getAvailableModels() {
  return [
    'stability-ai/sdxl:latest',
    'stability-ai/realistic-vision:latest'
  ];
}

module.exports = {
  generateImage,
  calculateCost,
  testAvailability,
  getAvailableModels
};
