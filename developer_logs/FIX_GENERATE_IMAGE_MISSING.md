# Fix: Added Missing generate_image Tool to UI

**Date**: 2025-01-12  
**Issue**: Query "generate a low res image of a cat" generates no tool calls  
**Root Cause**: `generate_image` tool exists in backend but was completely missing from UI configuration  

## Problem

The `generate_image` tool has full backend implementation in:
- `src/tools.js` (line 444) - Tool definition
- `src/tools.js` (line 1639) - Tool handler
- `src/endpoints/generate-image.js` - Dedicated endpoint
- `src/image-providers/openai.js` - DALL-E provider
- `src/image-providers/replicate.js` - Replicate/Stable Diffusion provider

However, it was **not exposed in the UI**, preventing users from generating images.

## Backend Capabilities (Already Implemented)

The backend supports:
- **Providers**: OpenAI DALL-E 2/3, Together AI Stable Diffusion, Replicate models
- **Quality Tiers**:
  - `ultra`: Photorealistic ($0.08-0.12 per image)
  - `high`: Detailed/artistic ($0.02-0.04 per image)
  - `standard`: Illustrations ($0.001-0.002 per image)
  - `fast`: Quick drafts (<$0.001 per image)
- **Parameters**: 
  - `prompt` (required) - Image description
  - `quality` - Quality tier selection
  - `size` - Image dimensions (256x256, 512x512, 1024x1024, etc.)
  - `style` - DALL-E 3 only (natural/vivid)
- **Features**: Provider health checks, circuit breaker pattern, intelligent fallback

## Solution

Added `generate_image` tool to all required UI files:

### 1. App.tsx (Lines 38-52)
Added to `EnabledTools` state:
```typescript
const [enabledTools, setEnabledTools] = useLocalStorage<{
  web_search: boolean;
  execute_js: boolean;
  scrape_url: boolean;
  youtube: boolean;
  transcribe: boolean;
  generate_chart: boolean;
  generate_image: boolean;  // ADDED
}>('chat_enabled_tools', {
  web_search: true,
  execute_js: true,
  scrape_url: true,
  youtube: true,
  transcribe: true,
  generate_chart: true,
  generate_image: true  // ADDED - enabled by default
});
```

### 2. ChatTab.tsx (Lines 36-43)
Updated `EnabledTools` interface:
```typescript
interface EnabledTools {
  web_search: boolean;
  execute_js: boolean;
  scrape_url: boolean;
  youtube: boolean;
  transcribe: boolean;
  generate_chart: boolean;
  generate_image: boolean;  // ADDED
}
```

### 3. ChatTab.tsx (Lines 848-872)
Added tool definition to `buildToolsArray()` function:
```typescript
if (enabledTools.generate_image) {
  tools.push({
    type: 'function',
    function: {
      name: 'generate_image',
      description: '🎨 Generate images using AI (DALL-E, Stable Diffusion). Use when user requests: "generate image", "create picture", "draw", "make photo". Supports quality tiers: ultra (photorealistic, $0.08-0.12), high (detailed/artistic, $0.02-0.04), standard (illustrations, $0.001-0.002), fast (quick drafts, <$0.001). Returns button for user confirmation before generation.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed description of the image to generate (e.g., "a low resolution image of a cat sitting on a windowsill")'
          },
          quality: {
            type: 'string',
            enum: ['ultra', 'high', 'standard', 'fast'],
            default: 'standard',
            description: 'Quality tier: ultra (photorealistic), high (detailed), standard (illustrations), fast (drafts). Infer from prompt keywords like "low res"=fast, "photorealistic"=ultra, "simple"=standard'
          },
          size: {
            type: 'string',
            enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
            default: '1024x1024',
            description: 'Image dimensions. Use smaller sizes (256x256, 512x512) for "low res" requests'
          },
          style: {
            type: 'string',
            enum: ['natural', 'vivid'],
            default: 'natural',
            description: 'Style: natural (realistic) or vivid (dramatic). DALL-E 3 only'
          }
        },
        required: ['prompt']
      }
    }
  });
}
```

### 4. SettingsModal.tsx (Lines 8-15)
Updated `EnabledTools` interface:
```typescript
interface EnabledTools {
  web_search: boolean;
  execute_js: boolean;
  scrape_url: boolean;
  youtube: boolean;
  transcribe: boolean;
  generate_chart: boolean;
  generate_image: boolean;  // ADDED
}
```

### 5. SettingsModal.tsx (Lines 283-295)
Added toggle checkbox:
```typescript
<label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
  <input
    type="checkbox"
    checked={enabledTools.generate_image}
    onChange={(e) => setEnabledTools({ ...enabledTools, generate_image: e.target.checked })}
    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
  />
  <div className="flex-1">
    <div className="font-medium text-gray-900 dark:text-gray-100">
      🎨 Generate Images (AI)
    </div>
    <div className="text-sm text-gray-500 dark:text-gray-400">
      Create images using DALL-E, Stable Diffusion, and other AI models with quality tier selection
    </div>
  </div>
</label>
```

## Deployment

```bash
make deploy-ui
```

✅ Successfully deployed to https://lambdallmproxy.pages.dev

## Testing

Test queries that should now work:
- "generate a low res image of a cat"
- "create a photorealistic image of a sunset"
- "draw a simple illustration of a house"
- "make a picture of a dog"

Expected behavior:
1. LLM calls `generate_image` tool with appropriate parameters
2. Backend analyzes quality requirements and selects best provider
3. UI displays button for user to confirm and generate image
4. Cost estimation shown before generation

## Files Modified

- `ui-new/src/App.tsx` - Added to EnabledTools state
- `ui-new/src/components/ChatTab.tsx` - Added interface and tool definition
- `ui-new/src/components/SettingsModal.tsx` - Added interface and toggle
- `docs/` - Rebuilt and deployed

## Notes

- Tool is **enabled by default** for all users
- Backend implementation was already complete and functional
- No backend changes required - purely UI configuration
- TypeScript compilation successful with no errors
- Follows same pattern as other tools (web_search, generate_chart, etc.)
