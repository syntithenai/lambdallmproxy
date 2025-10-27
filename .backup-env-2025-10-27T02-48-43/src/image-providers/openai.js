/**
 * OpenAI DALL-E Image Generation Provider
 * Supports DALL-E 2 and DALL-E 3
 */

const https = require('https');
const { checkProviderAvailability } = require('../utils/provider-health');
const { recordSuccess, recordFailure } = require('../utils/circuit-breaker');

/**
 * Generate image using OpenAI DALL-E API
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - Image description
 * @param {string} params.model - Model name (dall-e-2 or dall-e-3)
 * @param {string} params.size - Image size (256x256, 512x512, 1024x1024, 1792x1024, 1024x1792)
 * @param {string} params.style - Style preference (natural or vivid, DALL-E 3 only)
 * @param {Array<string>} params.referenceImages - Optional: Reference images for variations/edits (DALL-E 2 only)
 * @param {string} params.apiKey - OpenAI API key
 * @returns {Promise<Object>} {imageUrl, model, provider, cost, metadata}
 */
async function generateImage({ prompt, model, size = '1024x1024', style = 'natural', referenceImages, apiKey }) {
  const provider = 'openai';
  
  // Validate inputs
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required and must be a string');
  }
  if (!model || !['dall-e-2', 'dall-e-3'].includes(model)) {
    throw new Error('model must be dall-e-2 or dall-e-3');
  }
  if (!apiKey || !apiKey.trim()) {
    throw new Error('OpenAI API key is required');
  }
  
  // Check provider availability before attempting generation
  const availability = await checkProviderAvailability(provider);
  if (!availability.available) {
    const error = new Error(`OpenAI provider unavailable: ${availability.reason}`);
    error.providerUnavailable = true;
    error.reason = availability.reason;
    throw error;
  }
  
  console.log(`🎨 [OpenAI] Generating image with ${model}, size: ${size}`);
  
  // Check if using reference images (variations mode for DALL-E 2 only)
  const useVariations = referenceImages && referenceImages.length > 0;
  if (useVariations) {
    if (model !== 'dall-e-2') {
      console.warn(`⚠️ [OpenAI] Reference images are only supported with DALL-E 2, ignoring for ${model}`);
    } else {
      console.log(`📎 [OpenAI] Using reference image for variations (DALL-E 2)`);
      return await generateImageVariation({ referenceImages, size, apiKey, model });
    }
  }
  
  // Validate size for model
  const validSizes = {
    'dall-e-2': ['256x256', '512x512', '1024x1024'],
    'dall-e-3': ['1024x1024', '1792x1024', '1024x1792']
  };
  
  if (!validSizes[model].includes(size)) {
    throw new Error(`Invalid size ${size} for ${model}. Valid sizes: ${validSizes[model].join(', ')}`);
  }
  
  // Build request payload
  const payload = {
    model,
    prompt,
    n: 1,
    size,
    response_format: 'url'
  };
  
  // Add style parameter only for DALL-E 3
  if (model === 'dall-e-3') {
    payload.style = style || 'natural';
    payload.quality = 'standard'; // Can be 'standard' or 'hd'
  }
  
  const requestBody = JSON.stringify(payload);
  
  try {
    const startTime = Date.now();
    
    // Make API request
    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
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
              reject(new Error(`Failed to parse OpenAI response: ${e.message}`));
            }
          } else {
            let errorMessage = `OpenAI API error: ${res.statusCode}`;
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
    if (!response.data || !response.data[0] || !response.data[0].url) {
      throw new Error('No image URL in OpenAI response');
    }
    
    const imageUrl = response.data[0].url;
    const revisedPrompt = response.data[0].revised_prompt; // DALL-E 3 may revise prompt
    
    // Calculate cost based on model and size
    const cost = calculateCost(model, size, payload.quality);
    
    console.log(`✅ [OpenAI] Image generated successfully in ${duration}ms, cost: $${cost.toFixed(4)}`);
    
    // Record success in circuit breaker
    recordSuccess(provider);
    
    return {
      imageUrl,
      model,
      provider,
      cost,
      metadata: {
        size,
        style: payload.style,
        quality: payload.quality || 'standard',
        originalPrompt: prompt,
        revisedPrompt: revisedPrompt || prompt,
        duration,
        timestamp: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error(`❌ [OpenAI] Image generation failed:`, error.message);
    
    // Record failure in circuit breaker
    recordFailure(provider, error);
    
    // Re-throw with additional context
    error.provider = provider;
    error.model = model;
    throw error;
  }
}

/**
 * Generate image variation using DALL-E 2 (reference image)
 * @param {Object} params - Variation parameters
 * @param {Array<string>} params.referenceImages - Base64 or data URL images
 * @param {string} params.size - Image size
 * @param {string} params.apiKey - OpenAI API key
 * @param {string} params.model - Model name
 * @returns {Promise<Object>} Generation result
 * @private
 */
async function generateImageVariation({ referenceImages, size, apiKey, model }) {
  const provider = 'openai';
  
  try {
    // Convert first reference image to proper format
    let imageData = referenceImages[0];
    
    // Extract base64 data if it's a data URL
    if (imageData.startsWith('data:image')) {
      const base64Match = imageData.match(/base64,(.+)/);
      if (base64Match) {
        imageData = base64Match[1];
      }
    }
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');
    
    // Create multipart/form-data boundary
    const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
    
    // Build multipart body
    const parts = [];
    
    // Add image file
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="image.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    );
    parts.push(imageBuffer);
    parts.push('\r\n');
    
    // Add size parameter
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="size"\r\n\r\n` +
      `${size}\r\n`
    );
    
    // Add n parameter
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="n"\r\n\r\n` +
      `1\r\n`
    );
    
    // End boundary
    parts.push(`--${boundary}--\r\n`);
    
    // Combine all parts
    const bodyParts = [];
    for (const part of parts) {
      if (typeof part === 'string') {
        bodyParts.push(Buffer.from(part, 'utf8'));
      } else {
        bodyParts.push(part);
      }
    }
    const requestBody = Buffer.concat(bodyParts);
    
    const startTime = Date.now();
    
    // Make API request to variations endpoint
    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/images/variations',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': requestBody.length
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
              reject(new Error(`Failed to parse OpenAI response: ${e.message}`));
            }
          } else {
            let errorMessage = `OpenAI API error: ${res.statusCode}`;
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
    
    if (!response.data || !response.data[0] || !response.data[0].url) {
      throw new Error('No image URL in OpenAI variation response');
    }
    
    const imageUrl = response.data[0].url;
    const cost = calculateCost(model, size, 'standard');
    
    console.log(`✅ [OpenAI] Image variation generated successfully in ${duration}ms, cost: $${cost.toFixed(4)}`);
    
    recordSuccess(provider);
    
    return {
      imageUrl,
      model,
      provider,
      cost,
      metadata: {
        size,
        mode: 'variation',
        referenceImageUsed: true,
        duration,
        timestamp: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error(`❌ [OpenAI] Image variation failed:`, error.message);
    recordFailure(provider, error);
    error.provider = provider;
    error.model = model;
    throw error;
  }
}

/**
 * Calculate cost for OpenAI image generation
 * @param {string} model - Model name
 * @param {string} size - Image size
 * @param {string} quality - Quality setting (standard or hd)
 * @returns {number} Cost in USD
 */
function calculateCost(model, size, quality = 'standard') {
  // Pricing as of 2024 (verify with current OpenAI pricing)
  if (model === 'dall-e-3') {
    if (quality === 'hd') {
      if (size === '1024x1024') return 0.080;
      if (size === '1024x1792' || size === '1792x1024') return 0.120;
    } else {
      if (size === '1024x1024') return 0.040;
      if (size === '1024x1792' || size === '1792x1024') return 0.080;
    }
  } else if (model === 'dall-e-2') {
    if (size === '1024x1024') return 0.020;
    if (size === '512x512') return 0.018;
    if (size === '256x256') return 0.016;
  }
  
  return 0; // Unknown configuration
}

/**
 * Test OpenAI provider availability
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<boolean>} True if provider is available
 */
async function testAvailability(apiKey) {
  try {
    const availability = await checkProviderAvailability('openai');
    return availability.available;
  } catch (error) {
    console.error('[OpenAI] Availability check failed:', error.message);
    return false;
  }
}

module.exports = {
  generateImage,
  calculateCost,
  testAvailability
};
