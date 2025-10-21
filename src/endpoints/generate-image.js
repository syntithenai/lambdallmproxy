/**
 * Image Generation Endpoint
 * Handles actual image generation requests from UI
 * Includes provider fallback logic and circuit breaker integration
 */

const { verifyGoogleOAuthToken } = require('../auth');
const { checkProviderAvailability, checkMultipleProviders } = require('../utils/provider-health');
// const { recordLLMApiCall } = require('../llm-call-tracking'); // TODO: Implement LLM call tracking

// Import provider handlers
const openaiProvider = require('../image-providers/openai');
const togetherProvider = require('../image-providers/together');
const replicateProvider = require('../image-providers/replicate');
const geminiProvider = require('../image-providers/gemini');

// Provider map
const PROVIDERS = {
  'openai': openaiProvider,
  'together': togetherProvider,
  'replicate': replicateProvider,
  'gemini': geminiProvider
};

/**
 * POST /generate-image
 * Generate image using specified provider and model
 */
async function handleGenerateImage(event) {
  console.log('🎨 POST /generate-image');
  
  try {
    // Parse request body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { 
      prompt, 
      provider, 
      model, 
      modelKey,
      size = '1024x1024', 
      quality = 'standard',
      style = 'natural',
      accessToken 
    } = body;
    
    // Validate required fields
    if (!prompt || typeof prompt !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
        body: JSON.stringify({ error: 'prompt is required' })
      };
    }
    
    if (!provider || typeof provider !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
        body: JSON.stringify({ error: 'provider is required' })
      };
    }
    
    if (!model || typeof model !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
        body: JSON.stringify({ error: 'model is required' })
      };
    }
    
    // Authenticate user
    let userEmail = null;
    if (accessToken) {
      try {
        const tokenData = await verifyGoogleOAuthToken(accessToken);
        userEmail = tokenData.email;
        console.log(`✅ Authenticated user: ${userEmail}`);
      } catch (authError) {
        console.warn('⚠️ Authentication failed:', authError.message);
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
          body: JSON.stringify({ error: 'Invalid or expired access token' })
        };
      }
    } else {
      console.log('⚠️ No access token provided, proceeding without authentication');
    }
    
    // Get API key for provider
    const apiKey = getApiKeyForProvider(provider);
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
        body: JSON.stringify({ 
          error: `No API key configured for provider: ${provider}`,
          provider
        })
      };
    }
    
    console.log(`🔍 Generating image: provider=${provider}, model=${model}, size=${size}, quality=${quality}`);
    
    // Check provider availability
    const availability = await checkProviderAvailability(provider);
    let selectedProvider = provider;
    let selectedModel = model;
    let fallbackUsed = false;
    
    if (!availability.available) {
      console.log(`⚠️ Primary provider ${provider} unavailable: ${availability.reason}`);
      
      // Attempt fallback to alternative provider
      const fallbackResult = await findFallbackProvider(quality, provider);
      
      if (!fallbackResult.available) {
        return {
          statusCode: 503,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
          body: JSON.stringify({
            error: 'No available providers for image generation',
            primaryProvider: provider,
            primaryReason: availability.reason,
            attemptedFallback: true,
            fallbackResult
          })
        };
      }
      
      // Use fallback provider
      selectedProvider = fallbackResult.provider;
      selectedModel = fallbackResult.model;
      fallbackUsed = true;
      console.log(`✅ Using fallback: ${selectedProvider} ${selectedModel}`);
    }
    
    // Get provider handler
    const providerHandler = PROVIDERS[selectedProvider];
    if (!providerHandler) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
        body: JSON.stringify({ error: `Unsupported provider: ${selectedProvider}` })
      };
    }
    
    // Generate image
    const startTime = Date.now();
    let result;
    
    try {
      result = await providerHandler.generateImage({
        prompt,
        model: selectedModel,
        size,
        style,
        apiKey: getApiKeyForProvider(selectedProvider)
      });
    } catch (genError) {
      console.error(`❌ Image generation failed:`, genError.message);
      
      // If provider became unavailable during generation, try fallback
      if (genError.providerUnavailable && !fallbackUsed) {
        console.log(`🔄 Attempting fallback due to generation failure`);
        const fallbackResult = await findFallbackProvider(quality, selectedProvider);
        
        if (fallbackResult.available) {
          selectedProvider = fallbackResult.provider;
          selectedModel = fallbackResult.model;
          fallbackUsed = true;
          
          const fallbackHandler = PROVIDERS[selectedProvider];
          result = await fallbackHandler.generateImage({
            prompt,
            model: selectedModel,
            size,
            style,
            apiKey: getApiKeyForProvider(selectedProvider)
          });
        } else {
          throw genError; // No fallback available
        }
      } else {
        throw genError; // Re-throw if already tried fallback or not unavailable error
      }
    }
    
    const totalDuration = Date.now() - startTime;
    
    // Record LLM API call for tracking
    const llmApiCall = {
      id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'image_generation',
      provider: selectedProvider,
      model: selectedModel,
      modelKey: modelKey || selectedModel,
      cost: result.cost || 0,
      duration: totalDuration,
      success: true,
      fallbackUsed,
      originalProvider: fallbackUsed ? provider : selectedProvider,
      metadata: {
        size,
        quality,
        style,
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
        ...result.metadata
      }
    };
    
    // Log to Google Sheets (async, don't block response)
    try {
      const { logToGoogleSheets } = require('../services/google-sheets-logger');
      
      // Log image generation request
      logToGoogleSheets({
        userEmail: userEmail || 'anonymous',
        provider: selectedProvider,
        model: selectedModel,
        promptTokens: 0, // Image generation doesn't use tokens
        completionTokens: 0,
        totalTokens: 0,
        cost: result.cost || 0,
        durationMs: totalDuration,
        timestamp: new Date().toISOString(),
        requestType: 'image_generation', // Custom field to distinguish from text generation
        metadata: {
          size,
          quality,
          prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          fallbackUsed
        }
      }).catch(err => {
        console.error('Failed to log image generation to Google Sheets:', err.message);
      });
    } catch (err) {
      console.error('Google Sheets logging error (image generation):', err.message);
    }
    
    // Return successful response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
      body: JSON.stringify({
        success: true,
        imageUrl: result.imageUrl,
        provider: selectedProvider,
        model: selectedModel,
        cost: result.cost,
        fallbackUsed,
        originalProvider: fallbackUsed ? provider : selectedProvider,
        llmApiCall,
        metadata: result.metadata
      })
    };
    
  } catch (error) {
    console.error('❌ Generate image error:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
      body: JSON.stringify({
        error: error.message || 'Image generation failed',
        provider: error.provider,
        model: error.model,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
}

/**
 * Find fallback provider for a given quality tier
 * @private
 */
async function findFallbackProvider(qualityTier, excludeProvider) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Load PROVIDER_CATALOG
    const catalogPath = path.join(__dirname, '..', '..', 'PROVIDER_CATALOG.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    
    if (!catalog.image || !catalog.image.providers) {
      return { available: false, reason: 'No image providers configured' };
    }
    
    const { providers } = catalog.image;
    
    // Find all models matching quality tier, excluding failed provider
    const candidates = [];
    for (const [providerName, providerData] of Object.entries(providers)) {
      if (providerName === excludeProvider) continue;
      
      for (const [modelKey, modelData] of Object.entries(providerData.models || {})) {
        if (modelData.qualityTier === qualityTier) {
          candidates.push({
            provider: providerName,
            model: modelData.id || modelKey,
            fallbackPriority: modelData.fallbackPriority || 99
          });
        }
      }
    }
    
    if (candidates.length === 0) {
      return { available: false, reason: `No fallback providers for quality tier: ${qualityTier}` };
    }
    
    // Check availability of candidates
    const providerNames = [...new Set(candidates.map(c => c.provider))];
    const availabilityResults = await checkMultipleProviders(providerNames);
    
    // Filter to available providers
    const availableCandidates = candidates.filter(c => {
      const avail = availabilityResults[c.provider];
      return avail && avail.available;
    });
    
    if (availableCandidates.length === 0) {
      return { 
        available: false, 
        reason: 'No available fallback providers',
        checkedProviders: availabilityResults
      };
    }
    
    // Sort by priority and return best
    availableCandidates.sort((a, b) => a.fallbackPriority - b.fallbackPriority);
    const best = availableCandidates[0];
    
    return {
      available: true,
      provider: best.provider,
      model: best.model
    };
    
  } catch (error) {
    console.error('❌ Fallback provider search failed:', error.message);
    return { available: false, reason: error.message };
  }
}

/**
 * Get API key for provider from environment
 * @private
 */
function getApiKeyForProvider(provider) {
  const envVarMap = {
    'openai': 'OPENAI_API_KEY',
    'together': 'TOGETHER_API_KEY',
    'gemini': 'GEMINI_API_KEY',
    'replicate': 'REPLICATE_API_TOKEN'
  };
  
  const envVar = envVarMap[provider.toLowerCase()];
  return envVar ? process.env[envVar] : null;
}

/**
 * Get CORS headers
 * @private
 */
function getCorsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true'
  };
}

/**
 * Generate image directly (for tool use - no HTTP wrapper)
 * @param {Object} params - Generation parameters
 * @returns {Promise<Object>} Generation result
 */
async function generateImageDirect(params) {
  const { 
    prompt, 
    provider, 
    model, 
    modelKey,
    size = '1024x1024', 
    quality = 'standard',
    style = 'natural',
    context 
  } = params;
  
  try {
    // Get API key for provider
    const apiKey = getApiKeyForProvider(provider);
    if (!apiKey) {
      return {
        success: false,
        error: `No API key configured for provider: ${provider}`
      };
    }
    
    console.log(`🔍 [Direct] Generating image: provider=${provider}, model=${model}, size=${size}`);
    
    // Check provider availability
    const availability = await checkProviderAvailability(provider);
    let selectedProvider = provider;
    let selectedModel = model;
    let fallbackUsed = false;
    
    if (!availability.available) {
      console.log(`⚠️ Primary provider ${provider} unavailable: ${availability.reason}`);
      
      // Attempt fallback
      const fallbackResult = await findFallbackProvider(quality, provider);
      
      if (!fallbackResult.available) {
        return {
          success: false,
          error: 'No available providers for image generation',
          primaryProvider: provider,
          primaryReason: availability.reason
        };
      }
      
      selectedProvider = fallbackResult.provider;
      selectedModel = fallbackResult.model;
      fallbackUsed = true;
      console.log(`✅ Using fallback: ${selectedProvider} ${selectedModel}`);
    }
    
    // Get provider handler
    const providerHandler = PROVIDERS[selectedProvider];
    if (!providerHandler) {
      return {
        success: false,
        error: `Unsupported provider: ${selectedProvider}`
      };
    }
    
    // Generate image
    const startTime = Date.now();
    const result = await providerHandler.generateImage({
      prompt,
      model: selectedModel,
      size,
      style,
      apiKey: getApiKeyForProvider(selectedProvider)
    });
    
    const totalDuration = Date.now() - startTime;
    
    // Log to Google Sheets (async, don't block response)
    try {
      const { logToGoogleSheets } = require('../services/google-sheets-logger');
      const userEmail = context?.email || 'tool-generated';
      
      logToGoogleSheets({
        userEmail,
        provider: selectedProvider,
        model: selectedModel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: result.cost || 0,
        durationMs: totalDuration,
        timestamp: new Date().toISOString(),
        requestType: 'image_generation',
        metadata: {
          size,
          quality,
          prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          fallbackUsed,
          generatedVia: 'tool'
        }
      }).catch(err => {
        console.error('Failed to log image generation to Google Sheets:', err.message);
      });
    } catch (err) {
      console.error('Google Sheets logging error (image generation):', err.message);
    }
    
    return {
      success: true,
      url: result.imageUrl,
      base64: result.base64Data,
      provider: selectedProvider,
      model: selectedModel,
      cost: result.cost || 0,
      revisedPrompt: result.revisedPrompt,
      fallbackUsed
    };
    
  } catch (error) {
    console.error(`❌ [Direct] Image generation failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  handleGenerateImage,
  generateImageDirect
};
