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
const atlascloudProvider = require('../image-providers/atlascloud');

// Provider map
const PROVIDERS = {
  'openai': openaiProvider,
  'together': togetherProvider,
  'replicate': replicateProvider,
  'gemini': geminiProvider,
  'atlascloud': atlascloudProvider
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
      accessToken,
      // Provider API keys from UI settings
      openaiApiKey,
      togetherApiKey,
      geminiApiKey,
      replicateApiKey
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
    
    // Authenticate user - REQUIRED
    if (!accessToken) {
      console.log('❌ No access token provided');
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
        body: JSON.stringify({ 
          error: 'Authentication required. Please provide a valid access token.',
          code: 'UNAUTHORIZED'
        })
      };
    }
    
    let userEmail = null;
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
    
    // ✅ CREDIT SYSTEM: Check credit balance before processing request
    if (userEmail) {
      const { checkCreditBalance, estimateImageCost } = require('../utils/credit-check');
      const estimatedCost = estimateImageCost(model, quality, size);
      const creditCheck = await checkCreditBalance(userEmail, estimatedCost, 'image_generation');
      
      if (!creditCheck.allowed) {
        console.log(`💳 Insufficient credit for ${userEmail}: balance=$${creditCheck.balance.toFixed(4)}, estimated=$${estimatedCost.toFixed(4)}`);
        return {
          statusCode: creditCheck.error.statusCode,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
          body: JSON.stringify(creditCheck.error)
        };
      }
      
      console.log(`💳 Credit check passed for ${userEmail}: balance=$${creditCheck.balance.toFixed(4)}, estimated=$${estimatedCost.toFixed(4)}`);
    }
    
    // Get API key for provider (from context/UI settings first, then environment)
    const contextKeys = {
      openaiApiKey,
      togetherApiKey,
      geminiApiKey,
      replicateApiKey
    };
    const apiKey = getApiKeyForProvider(provider, contextKeys);
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
        body: JSON.stringify({ 
          error: `No API key configured for provider: ${provider}`,
          provider,
          hint: 'Please configure the API key in Settings > Providers'
        })
      };
    }
    
    console.log(`🔍 Generating image: provider=${provider}, model=${model}, size=${size}, quality=${quality}`);
    
    // Check provider availability - pass context keys so health check can find them
    const availability = await checkProviderAvailability(provider, contextKeys);
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
        apiKey: getApiKeyForProvider(selectedProvider, contextKeys)
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
            apiKey: getApiKeyForProvider(selectedProvider, contextKeys)
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
      const os = require('os');
      
      // Extract request ID and Lambda metrics from context
      const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 0;
      const memoryUsedMB = memoryLimitMB > 0 ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
      
      // Log image generation request
      logToGoogleSheets({
        userEmail: userEmail || 'anonymous',
        provider: selectedProvider,
        model: selectedModel,
        type: 'image_generation', // Type field for filtering in billing
        promptTokens: 0, // Image generation doesn't use tokens
        completionTokens: 0,
        totalTokens: 0,
        cost: result.cost || 0,
        durationMs: totalDuration,
        timestamp: new Date().toISOString(),
        requestId,
        memoryLimitMB,
        memoryUsedMB,
        hostname: os.hostname(),
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
    
    // ✅ CREDIT SYSTEM: Optimistically deduct actual cost from cache
    if (userEmail && result.cost) {
      const { deductCreditFromCache } = require('../utils/credit-check');
      await deductCreditFromCache(userEmail, result.cost, 'image_generation');
    }
    
    // Return successful response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event) },
      body: JSON.stringify({
        success: true,
        imageUrl: result.imageUrl,
        base64: result.base64Data, // Include base64 for storage
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
        stack: process.env.ENV === 'development' ? error.stack : undefined
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
 * Get API key for provider from context or environment
 * @private
 */
function getApiKeyForProvider(provider, contextKeys = {}) {
  // First check context (user settings from UI)
  const contextKeyMap = {
    'openai': contextKeys.openaiApiKey,
    'together': contextKeys.togetherApiKey,
    'gemini': contextKeys.geminiApiKey,
    'replicate': contextKeys.replicateApiKey
  };
  
  const contextKey = contextKeyMap[provider.toLowerCase()];
  if (contextKey) {
    return contextKey;
  }
  
  // Check credential pool (new indexed LP_* format)
  const { loadEnvironmentProviders } = require('../credential-pool');
  const envProviders = loadEnvironmentProviders();
  const normalizedProvider = provider.toLowerCase();
  
  // Find first matching provider with image capability
  const matchingProvider = envProviders.find(p => {
    const providerType = p.type.toLowerCase();
    
    // Direct match
    if (providerType === normalizedProvider) {
      return true;
    }
    
    // Handle aliases (e.g., togetherai -> together)
    if (normalizedProvider === 'together' && providerType === 'togetherai') {
      return true;
    }
    if (normalizedProvider === 'togetherai' && providerType === 'together') {
      return true;
    }
    
    return false;
  });
  
  if (matchingProvider?.apiKey) {
    console.log(`🔑 Found API key for ${provider} from credential pool (index ${matchingProvider.index})`);
    return matchingProvider.apiKey;
  }
  
  // Fallback to legacy environment variables (deprecated)
  const envVarMap = {
    'openai': 'OPENAI_KEY',
    'together': 'TOGETHER_KEY',
    'gemini': 'GEMINI_KEY',
    'replicate': 'REPLICATE_KEY'
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
    referenceImages,
    context 
  } = params;
  
  try {
    // Helper to extract API key from provider pool
    const getApiKeyFromPool = (providerType, providerPool) => {
      if (!providerPool || !Array.isArray(providerPool)) return null;
      
      // Normalize provider type (groq-free → groq)
      const normalizedType = providerType === 'groq-free' ? 'groq' : providerType;
      
      // Find first matching provider with API key
      const provider = providerPool.find(p => {
        const pType = p.type === 'groq-free' ? 'groq' : p.type;
        return pType === normalizedType && p.apiKey;
      });
      
      return provider?.apiKey || null;
    };
    
    // Extract API key from provider pool (new method) or legacy context
    let apiKey = null;
    
    // Build context keys object for compatibility
    const contextKeys = context ? {
      openai: context.openaiApiKey,
      together: context.togetherApiKey,
      gemini: context.geminiApiKey,
      replicate: context.replicateApiKey
    } : {};
    
    if (context?.providerPool) {
      apiKey = getApiKeyFromPool(provider, context.providerPool);
      if (apiKey) {
        console.log(`🔑 [Direct] Using API key from provider pool for ${provider}`);
      }
    }
    
    // Fallback to legacy context keys if provider pool not available
    if (!apiKey && context) {
      apiKey = contextKeys[provider];
      if (apiKey) {
        console.log(`🔑 [Direct] Using API key from legacy context for ${provider}`);
      }
    }
    
    // Final fallback to environment
    if (!apiKey) {
      apiKey = getApiKeyForProvider(provider, {});
      if (apiKey) {
        console.log(`🔑 [Direct] Using API key from environment for ${provider}`);
      }
    }
    
    if (!apiKey) {
      return {
        success: false,
        error: `No API key configured for provider: ${provider}`,
        hint: 'Check provider configuration in Settings or environment variables'
      };
    }
    
    console.log(`🔍 [Direct] Generating image: provider=${provider}, model=${model}, size=${size}`);
    if (referenceImages && referenceImages.length > 0) {
      console.log(`📎 [Direct] Using ${referenceImages.length} reference image(s)`);
    }
    
    // Check provider availability - pass context keys so health check can find them
    const availability = await checkProviderAvailability(provider, contextKeys);
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
    
    // Get API key for selected provider (may be different from original if fallback was used)
    let selectedApiKey = apiKey; // Start with the original API key
    if (fallbackUsed) {
      // Need to get API key for the fallback provider
      if (context?.providerPool) {
        selectedApiKey = getApiKeyFromPool(selectedProvider, context.providerPool);
      }
      if (!selectedApiKey) {
        // Fallback to environment
        selectedApiKey = getApiKeyForProvider(selectedProvider, {});
      }
    }
    
    const result = await providerHandler.generateImage({
      prompt,
      model: selectedModel,
      size,
      style,
      referenceImages,
      apiKey: selectedApiKey
    });
    
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
        generatedVia: 'tool',
        ...result.metadata
      }
    };
    
    // Log to Google Sheets (async, don't block response)
    try {
      const { logToGoogleSheets } = require('../services/google-sheets-logger');
      const os = require('os');
      const userEmail = context?.userEmail || context?.email || context?.user || 'tool-generated';
      
      // Extract request ID and Lambda metrics from context
      const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 0;
      const memoryUsedMB = memoryLimitMB > 0 ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
      
      logToGoogleSheets({
        userEmail,
        provider: selectedProvider,
        model: selectedModel,
        type: 'image_generation', // Type field for filtering in billing
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: result.cost || 0,
        durationMs: totalDuration,
        timestamp: new Date().toISOString(),
        requestId,
        memoryLimitMB,
        memoryUsedMB,
        hostname: os.hostname(),
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
      fallbackUsed,
      llmApiCall // Include for LLM transparency tracking
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
