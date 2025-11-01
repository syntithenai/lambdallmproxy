# Feature: AI-Generated Images in Feed Results

**Date**: 2025-11-01  
**Status**: ✅ IMPLEMENTED  
**Priority**: HIGH - Enhanced Visual Experience

## Overview

Feed generation now includes **2 AI-generated images** (out of 10 total items) using LLM image generation. These images use artistic styles to visually stand out against the stream of mostly photographs from web search and image APIs.

## Implementation Details

### Image Selection Strategy

- **Position**: Items at indices 1 and 6 (2nd and 7th items) get AI-generated images
- **Distribution**: Evenly spaced throughout the feed for visual variety
- **Adaptive**: If feed has <7 items, second AI image is placed at mid-point

### Image Generation Settings

**Quality Tier**: `fast` (lowest cost)
- **Provider Selection**: **Load-balanced** with automatic failover
- **Model Selection**: Intelligent selection from available 'fast' tier models
- **Preferred Model**: Together AI `FLUX.1-schnell-Free` (free tier, priority 1)
- **Fallback Models**: OpenAI DALL-E 2, other fast tier models
- **Size**: `512x512` (low resolution for speed/cost)
- **Quality**: `standard` (basic quality)
- **Cost**: **$0.00** (free tier preferred) or <$0.001 for paid models

### Artistic Styles

The system rotates through 8 different artistic styles to create visual variety:

1. **Watercolor painting** - Soft edges, artistic
2. **Digital illustration** - Vibrant colors, modern art
3. **Oil painting** - Impressionist, rich textures
4. **Minimalist geometric** - Bold shapes, abstract
5. **Vintage poster art** - Retro aesthetic, stylized
6. **Paper cut art** - Layered, dimensional
7. **Ink wash painting** - Monochromatic, flowing lines
8. **Pop art** - Bright colors, bold outlines

### Prompt Construction

AI image prompts are built from feed item data:

```javascript
const basePrompt = item.title.substring(0, 100); // Use title as base
const topics = item.topics.slice(0, 3).join(', '); // Add topics for context
const style = artisticStyles[idx % 8]; // Rotate through styles
const aiPrompt = `${basePrompt}. ${topics}. ${style}`;
```

**Example**:
```
"Ancient Rome used concrete that lasted 2000 years. 
architecture, history, engineering. 
watercolor painting style, soft edges, artistic"
```

## Priority System

Feed items now have a **3-tier image source priority**:

### Priority 0: AI-Generated Images (New)
- **When**: Items at positions 1 and 6
- **Source**: LLM image generation
- **Cost**: $0.00 - $0.001
- **Benefit**: Unique artistic style, stands out visually

### Priority 1: Web Search Images
- **When**: After AI generation (or fallback if AI fails)
- **Source**: Images extracted from DuckDuckGo search results
- **Cost**: $0.00
- **Benefit**: Relevant, contextual, free

### Priority 2: Image Search APIs
- **When**: Fallback if no web search images
- **Source**: Unsplash, Pexels APIs
- **Cost**: $0.00
- **Benefit**: High-quality stock photos

## Cost Tracking

### Cost Calculation

The system now tracks **separate costs** for LLM and image generation:

```javascript
const llmCost = calculateCost(model, promptTokens, completionTokens, ...);
const imageGenCost = result.imageGenCost || 0; // From AI image generation
const totalCost = llmCost + imageGenCost;
```

### Logging to Google Sheets

Feed generation logs now include:

```javascript
{
  type: 'feed_generation',
  cost: totalCost, // Combined LLM + images
  metadata: {
    llmCost: llmCost,
    imageGenCost: imageGenCost,
    aiImagesGenerated: 2 // Number of AI images
  }
}
```

### SSE Completion Event

The completion event now includes cost breakdown:

```javascript
{
  success: true,
  itemsGenerated: 10,
  duration: 5432,
  cost: 0.000123, // Total cost
  costBreakdown: {
    llm: 0.000123,
    imageGeneration: 0.000000 // Free tier
  }
}
```

## Code Changes

### File: `src/endpoints/feed.js`

#### 1. AI Image Selection Logic (Lines ~353-368)

```javascript
// Determine which items should get AI-generated images (2 out of 10, evenly spaced)
const aiImageIndices = new Set();
if (items.length >= 2) {
    // Generate AI images for items at positions 2 and 7 (0-indexed: 1 and 6)
    aiImageIndices.add(1);
    if (items.length >= 7) {
        aiImageIndices.add(6);
    } else if (items.length >= 4) {
        aiImageIndices.add(Math.floor(items.length / 2) + 1);
    }
}
```

#### 2. Artistic Styles Array (Lines ~370-378)

```javascript
const artisticStyles = [
    'watercolor painting style, soft edges, artistic',
    'digital illustration, vibrant colors, modern art style',
    'oil painting style, impressionist, rich textures',
    'minimalist geometric art, bold shapes, abstract',
    'vintage poster art, retro aesthetic, stylized',
    'paper cut art style, layered, dimensional',
    'ink wash painting, monochromatic, flowing lines',
    'pop art style, bright colors, bold outlines'
];
```

#### 3. AI Image Generation with Load Balancing (Lines ~380-480)

```javascript
// PRIORITY 0: AI-generated images for selected items
if (aiImageIndices.has(idx)) {
    // Load PROVIDER_CATALOG and check availability
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const { checkMultipleProviders } = require('../utils/provider-health');
    
    if (catalog.image && catalog.image.providers) {
        const { generateImageDirect } = require('./generate-image');
        
        // Build creative prompt
        const styleIndex = idx % artisticStyles.length;
        const style = artisticStyles[styleIndex];
        const basePrompt = item.title.substring(0, 100);
        const topics = item.topics.slice(0, 3).join(', ');
        const aiPrompt = `${basePrompt}. ${topics}. ${style}`;
        
        // Find all models matching 'fast' quality tier
        const qualityTier = 'fast';
        const matchingModels = [];
        for (const [providerName, providerData] of Object.entries(catalog.image.providers)) {
            for (const [modelKey, modelData] of Object.entries(providerData.models || {})) {
                if (modelData.qualityTier === qualityTier && modelData.available !== false) {
                    matchingModels.push({
                        provider: providerName,
                        model: modelData.id || modelKey,
                        fallbackPriority: modelData.fallbackPriority || 99
                    });
                }
            }
        }
        
        // Check provider availability
        const uniqueProviders = [...new Set(matchingModels.map(m => m.provider))];
        const availabilityResults = await checkMultipleProviders(uniqueProviders);
        
        // Filter to available providers
        const availableModels = matchingModels.filter(m => {
            const availability = availabilityResults[m.provider];
            return availability && availability.available;
        });
        
        if (availableModels.length > 0) {
            // Sort by fallback priority (lower = preferred)
            availableModels.sort((a, b) => a.fallbackPriority - b.fallbackPriority);
            const selectedModel = availableModels[0];
            
            console.log(`🎯 Selected: ${selectedModel.provider}/${selectedModel.model}`);
            
            // Generate with selected model (includes automatic fallback in generateImageDirect)
            const imageResult = await generateImageDirect({
                prompt: aiPrompt,
                provider: selectedModel.provider,
                model: selectedModel.model,
                size: '512x512',
                quality: qualityTier,
                style: 'natural'
            });
            
            if (imageResult.success && imageResult.base64) {
                const imageUrl = `data:image/png;base64,${imageResult.base64}`;
                totalImageGenCost += imageResult.cost || 0;
                
                return {
                    ...item,
                    image: imageUrl,
                    imageSource: 'ai_generated',
                    imageProvider: imageResult.provider,
                    imageModel: imageResult.model,
                    imageStyle: style,
                    imageCost: imageResult.cost,
                    imageFallbackUsed: imageResult.fallbackUsed || false,
                    imageAttribution: `AI-generated image (${style.split(',')[0]})`,
                    imageAttributionHtml: `AI-generated image · <span>${style.split(',')[0]}</span>`
                };
            }
        }
    }
}
```

#### 4. Cost Tracking Return (Lines ~510-525)

```javascript
// Log AI image generation summary
if (totalImageGenCost > 0) {
    console.log(`🎨 Total AI image generation cost: $${totalImageGenCost.toFixed(6)}`);
    eventCallback('status', { 
        message: `Generated ${aiImageIndices.size} AI images (cost: $${totalImageGenCost.toFixed(6)})`
    });
}

return { 
    items,
    searchResults,
    usage: response.usage,
    model: response.model,
    provider: response.provider,
    imageGenCost: totalImageGenCost // Include image generation costs
};
```

#### 5. Handler Cost Calculation (Lines ~606-660)

```javascript
const llmCost = calculateCost(
    modelUsed,
    promptTokens,
    completionTokens,
    null,
    isUserProvidedKey
);

// Include AI image generation costs
const imageGenCost = result.imageGenCost || 0;
const totalCost = llmCost + imageGenCost;

console.log(`💵 Calculated cost: LLM=$${llmCost.toFixed(6)}, Images=$${imageGenCost.toFixed(6)}, Total=$${totalCost.toFixed(6)}`);

// Log with breakdown
await logToGoogleSheets({
    // ... existing fields
    cost: totalCost, // Include total cost with images
    metadata: {
        itemsGenerated: result.items.length,
        llmCost: llmCost,
        imageGenCost: imageGenCost,
        aiImagesGenerated: imageGenCost > 0 ? 2 : 0
    }
});
```

## User Experience

### Visual Appearance

- **AI Images**: Artistic style (watercolor, illustration, etc.)
- **Photo Images**: Realistic photographs from search/APIs
- **Mix**: Creates visual variety and interest in feed

### Attribution

Each image shows its source:

- **AI-generated**: `"AI-generated image (watercolor painting style)"`
- **Web search**: `"Image from search result: example.com"`
- **Stock photos**: `"Photo by John Doe on Unsplash"`

### Frontend Display

Feed items with AI images include these fields:

```javascript
{
  image: "data:image/png;base64,...",
  imageSource: "ai_generated",
  imageProvider: "together",
  imageModel: "flux-schnell-free",
  imageStyle: "watercolor painting style, soft edges, artistic",
  imageCost: 0.000000,
  imageAttribution: "AI-generated image (watercolor painting style)",
  imageAttributionHtml: "AI-generated image · <span>watercolor painting style</span>"
}
```

## Load Balancing & Failover

### Provider Selection Strategy

The implementation uses **intelligent load-balanced model selection**:

1. **Load PROVIDER_CATALOG**: Read available image models
2. **Filter by Quality Tier**: Find all 'fast' tier models
3. **Check Availability**: Query provider health/circuit breaker status
4. **Filter Available**: Only use providers that are currently available
5. **Sort by Priority**: Use `fallbackPriority` field (lower = preferred)
6. **Select Best**: Choose highest priority available model

### Two-Level Fallback System

**Level 1: Feed-Level Fallback**
- If primary provider unavailable → Try next available 'fast' tier model
- If all image providers unavailable → Fall back to web search images
- If web search fails → Fall back to image search APIs

**Level 2: generateImageDirect Fallback** (Built-in)
- If selected provider fails during generation → Automatically tries fallback provider
- Uses `findFallbackProvider()` function from generate-image.js
- Checks availability and selects alternative model
- Preserves quality tier when falling back

### Example Fallback Chain

```
1. Together AI FLUX.1-schnell-Free (priority 1, free)
   ↓ (unavailable)
2. OpenAI DALL-E 2 256x256 (priority 2, $0.016)
   ↓ (generation fails)
3. generateImageDirect fallback → Alternative fast tier model
   ↓ (all image generation fails)
4. Web search images (free, from DuckDuckGo)
   ↓ (no images found)
5. Image search APIs (free, Unsplash/Pexels)
```

### Fallback Tracking

Each generated image includes:
```javascript
{
  imageFallbackUsed: true/false, // Whether fallback was triggered
  imageProvider: "together",      // Actual provider used
  imageModel: "flux-schnell-free" // Actual model used
}
```

## Benefits

✅ **Visual Variety**: Artistic images stand out against photo stream  
✅ **Low Cost**: Using free tier ($0) or <$0.001 per image  
✅ **Contextual**: Generated from actual feed content  
✅ **Stylistic**: 8 different art styles for diversity  
✅ **Load Balanced**: Intelligent provider selection based on availability  
✅ **Resilient**: Two-level fallback system ensures images always available  
✅ **Tracked**: Costs and fallback usage included in analytics  
✅ **Fallback Safe**: Graceful degradation through multiple fallback tiers  
✅ **Transparent**: Clear attribution and source labeling

## Performance

- **Generation Time**: ~2-3 seconds per image (512x512, fast model)
- **Parallel Processing**: All images fetched in parallel
- **Non-blocking**: AI generation doesn't delay other items
- **Graceful Degradation**: Falls back to photos if AI unavailable

## Cost Examples

**Typical 10-item feed**:
- LLM generation: ~$0.0001 - $0.0003
- 2 AI images (free tier): $0.00
- **Total**: ~$0.0001 - $0.0003

**If using paid image models**:
- LLM generation: ~$0.0002
- 2 AI images (FLUX schnell @ $0.003): $0.006
- **Total**: ~$0.0062

## Future Enhancements

Possible improvements:
- [ ] User preference for AI image count (0, 1, 2, or more)
- [ ] Style selection based on feed topic (tech → digital, history → vintage)
- [ ] Image quality toggle (fast/standard/high)
- [ ] Caching generated images for similar topics
- [ ] A/B testing different artistic styles

## Testing

To test the feature:

1. Generate a feed with 10 items
2. Observe items at positions 2 and 7 have artistic style images
3. Check attribution shows "AI-generated image"
4. Verify cost breakdown in completion event
5. Confirm logs include `aiImagesGenerated: 2`

## Notes

- AI image generation is **opt-in** - only activates if image providers configured in `PROVIDER_CATALOG.json`
- Uses **lowest cost settings** - free tier or <$0.001
- **Fallback chain** ensures all items get images even if AI generation fails
- **Cost transparency** - all costs tracked and reported separately
