# Local Browser-Based Embeddings Implementation

**Date**: 2025-10-31  
**Status**: Planning → Implementation

## Overview

Add browser-based local embedding generation for SWAG snippets using Transformers.js, eliminating the need for API calls and authentication while maintaining offline functionality.

## Feasibility Analysis

### ✅ Viable - Transformers.js Solution

**Library**: [@xenova/transformers](https://www.npmjs.com/package/@xenova/transformers)  
**Size**: Models range from 17MB to 33MB (acceptable for modern web)  
**Performance**: 2-5 seconds per batch on modern hardware (CPU/WebGPU)

### Available Models

| Model | Size | Dimensions | Quality | Speed | Best For |
|-------|------|------------|---------|-------|----------|
| `Xenova/all-MiniLM-L6-v2` | ~23MB | 384 | Good | Medium | **Recommended - balanced** |
| `Xenova/paraphrase-MiniLM-L3-v2` | ~17MB | 384 | Fair | Fast | Speed priority, lower quality OK |
| `Xenova/bge-small-en-v1.5` | ~33MB | 384 | Better | Slower | Quality priority |

### Trade-offs vs API Embeddings

**Advantages:**
- ✅ **No authentication required** - Works without Google OAuth
- ✅ **Zero API costs** - No charges for embedding generation
- ✅ **Offline capable** - Works without internet (after initial model download)
- ✅ **Privacy-friendly** - Data never leaves the browser
- ✅ **No rate limits** - Process as many snippets as needed

**Disadvantages:**
- ⚠️ **Slower** - 2-5s vs <1s for API calls
- ⚠️ **Lower quality** - 384 dims vs 1536 dims (OpenAI), affects search relevance
- ⚠️ **Initial download** - 17-33MB model download on first use
- ⚠️ **Browser requirements** - Needs modern browser with WebAssembly support
- ⚠️ **CPU intensive** - May slow down older devices

## Architecture

### 1. New Service: `LocalEmbeddingService`

**Location**: `ui-new/src/services/localEmbeddings.ts`

```typescript
interface LocalEmbeddingModel {
  id: string;
  name: string;
  description: string;
  size: string;
  dimensions: number;
  quality: 'fair' | 'good' | 'better';
  speed: 'fast' | 'medium' | 'slow';
}

class LocalEmbeddingService {
  private pipeline: any = null;
  private currentModel: string | null = null;
  private isLoading: boolean = false;
  
  async loadModel(modelId: string, onProgress?: (progress: number) => void): Promise<void>
  async generateEmbedding(text: string): Promise<number[]>
  async generateEmbeddings(texts: string[]): Promise<number[][]>
  isModelLoaded(): boolean
  unloadModel(): void
}
```

### 2. Settings Integration

**Add to Settings Page** (`ui-new/src/components/SettingsPage.tsx`):

New section in "RAG & Embeddings" tab:

```
📊 Embedding Source
○ API-Based (Requires provider configuration & authentication)
  ✓ High quality (1536+ dimensions)
  ✓ Fast (<1 second)
  ✗ Requires API key or authentication
  ✗ Costs money per request

● Local (Browser-based, no authentication needed)
  ✓ Free - no API costs
  ✓ Works offline
  ✓ Privacy-friendly
  ⚠️ Slower (2-5 seconds)
  ⚠️ Lower quality (384 dimensions)
  
  Model Selection:
  [ Dropdown: all-MiniLM-L6-v2 (Recommended) ]
  
  [Load Model] button
  Status: Not loaded | Loading... (45%) | Ready ✓
```

### 3. SwagContext Integration

**Update** `ui-new/src/contexts/SwagContext.tsx`:

```typescript
const generateEmbeddings = async (snippetIds: string[], force = false) => {
  // Check settings for embedding source
  if (settings.embeddingSource === 'local') {
    // Use local embedding service
    if (!localEmbeddingService.isModelLoaded()) {
      throw new Error('Local embedding model not loaded. Please load it in Settings.');
    }
    
    const embeddings = await localEmbeddingService.generateEmbeddings(
      snippetsToEmbed.map(s => s.content)
    );
    
    // Store locally (no backend call needed)
    // ... update snippets with embeddings
    
  } else {
    // Existing API-based flow
    // ... current implementation
  }
};
```

## Implementation Steps

### Phase 1: Service Layer
- [ ] Create `ui-new/src/services/localEmbeddings.ts`
- [ ] Install `@xenova/transformers` package
- [ ] Implement model loading with progress tracking
- [ ] Implement embedding generation
- [ ] Add error handling for unsupported browsers

### Phase 2: Settings UI
- [ ] Add "Embedding Source" radio group to Settings
- [ ] Add model selection dropdown
- [ ] Add "Load Model" button with progress indicator
- [ ] Add model status display
- [ ] Save preference to localStorage

### Phase 3: SwagContext Integration
- [ ] Check embedding source setting in `generateEmbeddings()`
- [ ] Route to local service when selected
- [ ] Handle local embedding storage (no backend needed)
- [ ] Update error messages for local vs API failures

### Phase 4: UX Polish
- [ ] Show helpful tooltips explaining trade-offs
- [ ] Add one-time educational modal on first local embedding use
- [ ] Display embedding speed comparison metrics
- [ ] Add "Switch to API" quick action if local is too slow

## Configuration Schema

**Add to Settings interface**:

```typescript
interface Settings {
  // ... existing fields
  
  embeddingSource: 'api' | 'local';
  localEmbeddingModel: string; // Model ID
  localEmbeddingModelLoaded: boolean;
}
```

**Default**:
```typescript
{
  embeddingSource: 'api', // Start with API to avoid initial model download
  localEmbeddingModel: 'Xenova/all-MiniLM-L6-v2',
  localEmbeddingModelLoaded: false
}
```

## Testing Plan

1. **Browser Compatibility**
   - Test on Chrome/Edge (WebGPU support)
   - Test on Firefox/Safari (WebAssembly fallback)
   - Test on mobile browsers

2. **Performance**
   - Measure embedding generation time for 1, 10, 100 snippets
   - Compare CPU vs WebGPU performance
   - Monitor memory usage during bulk operations

3. **Quality**
   - Compare search relevance between local and API embeddings
   - Test edge cases (very long/short text, special characters)

4. **UX**
   - Verify model download progress accuracy
   - Test model unload/reload cycle
   - Verify offline functionality

## Dependencies

```json
{
  "@xenova/transformers": "^2.17.0"
}
```

## Notes

- **Model caching**: Transformers.js automatically caches models in IndexedDB
- **WebGPU acceleration**: Automatically used if available (Chrome/Edge)
- **Fallback**: Uses WebAssembly CPU execution if WebGPU unavailable
- **Dimension compatibility**: 384-dim embeddings can coexist with 1536-dim embeddings (separate indices)

## Future Enhancements

- [ ] Add model auto-update mechanism
- [ ] Support for multilingual models
- [ ] Add embedding quality benchmark tool
- [ ] Implement hybrid search (combine API + local)
- [ ] Add WebGPU performance metrics display
