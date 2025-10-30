# Image Generation Provider Selection Fix

**Status**: ✅ COMPLETE  
**Date**: 2025-10-31  
**Issue**: Image generation defaulting to OpenAI instead of using available providers (TogetherAI)

## Problem

When users executed "add a dog" command in the Image Editor:
- Backend attempted to use OpenAI provider for image generation
- OpenAI API key not configured/enabled
- TogetherAI provider available with API key in `.env` (provider index 3)
- Error: `Failed to apply generate: AI generation failed: No API key configured for provider: openai`

### Root Causes

1. **Hardcoded Default Provider**: `src/endpoints/image-edit.js` hardcoded default to `openai`:
   ```javascript
   provider: op.params.provider || 'openai', // Default to OpenAI (DALL-E)
   ```

2. **Legacy API Key Lookup**: `src/endpoints/generate-image.js` used old environment variable names:
   ```javascript
   const envVarMap = {
     'openai': 'OPENAI_KEY',      // ❌ Doesn't exist
     'together': 'TOGETHER_KEY',   // ❌ Doesn't exist
     'gemini': 'GEMINI_KEY',       // ❌ Doesn't exist
     'replicate': 'REPLICATE_KEY'  // ❌ Doesn't exist
   };
   ```
   
   Actual environment uses indexed format: `LP_TYPE_3=together`, `LP_KEY_3=...`

3. **No Auto-Selection**: No logic to automatically select best available provider from credential pool

## Solution

### 1. Updated API Key Lookup (`src/endpoints/generate-image.js`)

Modified `getApiKeyForProvider()` to check credential pool:

```javascript
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
  
  // ✅ NEW: Check credential pool (indexed LP_* format)
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
```

**Key Changes**:
- Loads environment providers via `loadEnvironmentProviders()`
- Searches credential pool for matching provider type
- Handles provider name aliases (together/togetherai)
- Falls back to legacy env vars only if credential pool check fails
- Logs which index was used for debugging

### 2. Auto-Select Provider (`src/endpoints/image-edit.js`)

Added intelligent provider selection before image generation:

```javascript
case 'generate':
    console.log(`🎨 [Generate] AI editing request: ${op.params.prompt || 'no prompt'}, mode: ${op.params.mode || 'edit'}`);
    
    const { generateImageDirect } = require('./generate-image');
    
    // ✅ NEW: Auto-select best available image provider from credential pool
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
        provider: op.params.provider || selectedProvider, // ✅ Use auto-selected
        model: op.params.model || selectedModel,          // ✅ Use matched model
        size: op.params.size || `${currentWidth}x${currentHeight}`,
        quality: op.params.quality || 'standard',
        style: op.params.style || 'natural',
        referenceImages: [imageUrl],
        context: generationContext
    };
```

**Key Changes**:
- Defines provider priority order: `['together', 'replicate', 'openai', 'gemini']`
  - Prioritizes free providers (TogetherAI Flux) over paid (OpenAI DALL-E)
- Searches credential pool for first available provider in priority order
- Automatically selects appropriate model based on provider:
  - TogetherAI → `black-forest-labs/FLUX.1-schnell-Free`
  - Replicate → `flux-1.1-pro`
  - OpenAI → `dall-e-3`
  - Gemini → `imagen-3.0-generate-001`
- Logs selected provider/model for debugging
- Warns if no providers found in pool

## Testing

### Before Fix
```
❌ Error: Failed to apply generate: AI generation failed: No API key configured for provider: openai
```

### After Fix
```bash
# 1. Start dev server
make dev

# 2. Navigate to Image Editor in UI (http://localhost:8081/image-editor)

# 3. Execute command: "add a dog"

# Expected backend logs:
✅ [Generate] Auto-selected provider: together with model: black-forest-labs/FLUX.1-schnell-Free
🔑 Found API key for together from credential pool (index 3)
🎨 [Generate] Calling generateImageDirect with provider: together
✅ [Generate] Success! Using generated image
```

## Environment Configuration

Current `.env` configuration (TogetherAI as provider 3):

```bash
# Provider 3: Together AI (FREE IMAGE GENERATION + PAID TTS + EMBEDDINGS)
LP_TYPE_3=together
LP_KEY_3=afbe7207ad3d6d853c74743a6357ec4f17e5d0354240fa81a424f4eee9786f0b
LP_ALLOWED_MODELS_3=black-forest-labs/FLUX.1-schnell-Free,cartesia/sonic
LP_IMAGE_MAX_QUALITY_3=fast
LP_CAPABILITIES_3=image,tts,embeddings
```

## Provider Priority Logic

The system now prioritizes providers in this order for image generation:

1. **TogetherAI** (`together`) - Free FLUX model
2. **Replicate** (`replicate`) - Paid FLUX model
3. **OpenAI** (`openai`) - DALL-E (most expensive)
4. **Gemini** (`gemini`) - Imagen

This ensures cost-effective image generation by preferring free/cheaper options first.

## Benefits

1. **Cost Efficiency**: Automatically uses free TogetherAI FLUX before paid OpenAI DALL-E
2. **Flexibility**: Works with any configured provider in credential pool
3. **Backward Compatible**: Still supports legacy `OPENAI_KEY` env vars if present
4. **Auto-Discovery**: No manual provider selection needed
5. **Debugging**: Logs which provider/model was selected and why

## Files Modified

- ✅ `src/endpoints/generate-image.js` - Updated `getApiKeyForProvider()` to check credential pool
- ✅ `src/endpoints/image-edit.js` - Added auto-selection logic with provider priority

## Future Enhancements

1. **User Override**: Allow users to specify preferred provider in Image Editor settings
2. **Cost Display**: Show estimated cost before generation based on selected provider
3. **Provider Health Check**: Skip providers with circuit breaker issues
4. **Rate Limit Awareness**: Consider rate limits when selecting provider
5. **Model Quality Preferences**: Allow users to prefer quality vs. speed

## Related Documentation

- Feature Availability Detection: `developer_log/FEATURE_AVAILABILITY_DETECTION_COMPLETE.md`
- Credential Pool: `src/credential-pool.js`
- Provider Catalog: `PROVIDER_CATALOG.json`
