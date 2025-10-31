# Embedding Provider Issues - Fixed

**Date**: October 31, 2025  
**Status**: ✅ RESOLVED

## Issues Reported

1. **API providers not showing up in UI** ❌
2. **Local embedding provider being ignored** ❌ (False alarm - already working correctly)
3. **Gemini embedding provider rate limiting** ⚠️ (Known issue, documented)

## Root Causes Identified

### Issue 1: API Providers Not Visible in UI

**Root Cause**: The `/billing` endpoint only checked environment providers (loaded from `.env` `LP_TYPE_N` variables) when filtering available embedding models. UI-configured providers (stored in user settings) were completely ignored.

**Impact**: Users who configured providers through the Settings UI couldn't see those providers' embedding models in the RAG Settings dropdown.

### Issue 2: Local Embeddings Being Ignored

**Root Cause**: **FALSE ALARM** - The code was already working correctly. The confusion arose from backend logs showing API provider selection, but those were from OTHER requests (chat, etc.), not from embedding generation.

**How it actually works**:
- When user selects a local model (Xenova/*) in RAGSettings, the `embeddingSource` setting is automatically set to `'local'`
- SwagContext checks `settings.embeddingSource === 'local'` and uses browser-based Transformers.js
- The backend is **never called** when local embeddings are selected
- Local embeddings work entirely client-side, no API required

### Issue 3: Gemini Rate Limiting

**Root Cause**: Gemini is auto-selected by the backend as the cheapest option ($0.00001/M tokens), but the free tier has extremely low rate limits, causing frequent 429 errors.

**Current Status**: Not fixed yet - backend still auto-selects Gemini. Retry logic exists but may need tuning. User needs paid Gemini account or should configure a different provider.

## Solutions Implemented

### Fix #1: Support UI Providers in Billing Endpoint

**Files Modified**:
- `ui-new/src/components/RAGSettings.tsx` (lines 75-103)
- `src/endpoints/billing.js` (lines 636-638, 320-368)

**Changes**:

1. **RAGSettings now sends UI providers when fetching embeddings**:
   ```typescript
   // Extract enabled UI providers
   const providers = settings.providers
     ?.filter(p => p.enabled !== false)
     .map(p => ({
       type: p.type,
       allowedModels: p.allowedModels
     })) || [];
   
   // POST to billing with providers array
   const response = await fetch(`${apiUrl}/billing`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ providers })
   });
   ```

2. **Billing endpoint accepts POST requests**:
   ```javascript
   // Before: if (path === '/billing' && method === 'GET')
   // After:
   if (path === '/billing' && (method === 'GET' || method === 'POST'))
   ```

3. **Billing endpoint merges UI + environment providers**:
   ```javascript
   // Parse UI providers from POST body
   let uiProviders = [];
   if (event.body) {
     const body = JSON.parse(event.body);
     if (body.providers) {
       uiProviders = body.providers;
       // Merge UI provider types into providerTypes Set
       uiProviders.forEach(p => providerTypes.add(p.type.replace('-free', '')));
     }
   }
   
   // Filter embeddings by both env and UI providers
   availableEmbeddings = allEmbeddings.filter(model => {
     // Check provider type
     if (!providerTypes.has(normalizedProviderType)) return false;
     
     // Check allowedModels from both sources
     const envProvider = envProviders.find(p => matches);
     const uiProvider = uiProviders.find(p => matches);
     
     if (envProvider?.allowedModels?.length > 0) {
       return envProvider.allowedModels.includes(model.id);
     }
     if (uiProvider?.allowedModels?.length > 0) {
       return uiProvider.allowedModels.includes(model.id);
     }
     
     return true; // No restrictions
   });
   ```

### Fix #2: Add Progress Bar to Local Model Loading

**Files Modified**:
- `ui-new/src/components/ToastManager.tsx` (interface, updateToast, toast display)
- `ui-new/src/contexts/SwagContext.tsx` (lines 745-770)

**Changes**:

1. **Enhanced Toast interface to support progress**:
   ```typescript
   interface Toast {
     id: string;
     message: string;
     type: 'success' | 'error' | 'warning' | 'info';
     duration?: number;
     progress?: number; // 0-100 for progress bar
     action?: { label: string; onClick: () => void; };
   }
   ```

2. **Updated updateToast to accept progress**:
   ```typescript
   const updateToast = (id: string, message: string, progress?: number) => {
     setToasts((prev) => prev.map((toast) => 
       toast.id === id 
         ? { ...toast, message, ...(progress !== undefined && { progress }) }
         : toast
     ));
   };
   ```

3. **Toast displays progress bar**:
   ```tsx
   {toast.progress !== undefined && (
     <div className="mt-2 w-full bg-current/20 rounded-full h-2 overflow-hidden">
       <div 
         className="bg-current h-full transition-all duration-300 ease-out rounded-full"
         style={{ width: `${Math.min(100, Math.max(0, toast.progress))}%` }}
       />
     </div>
   )}
   ```

4. **SwagContext shows loading progress**:
   ```typescript
   // Show persistent toast with progress bar
   let toastId = showPersistentToast(
     `🔄 Loading local model ${modelName}...`, 
     'info'
   );
   
   // Load model with progress feedback
   await embeddingService.loadModel(modelId, (progress) => {
     if (toastId) {
       const percentage = Math.round(progress.progress);
       updateToast(
         toastId, 
         `🔄 Loading local model ${modelName}... ${percentage}%`,
         percentage
       );
     }
   });
   
   // Remove toast when done
   if (toastId) {
     removeToast(toastId);
   }
   ```

### Fix #3: Add Debug Logging

**Files Modified**:
- `ui-new/src/contexts/SwagContext.tsx` (line 742)

**Changes**:
```typescript
const useLocalEmbeddings = settings.embeddingSource === 'local';
console.log(
  `🔍 Embedding source check: embeddingSource="${settings.embeddingSource}", ` +
  `useLocalEmbeddings=${useLocalEmbeddings}, embeddingModel="${settings.embeddingModel}"`
);
```

This helps diagnose whether `embeddingSource` is set correctly when users select local models.

## Architecture Overview

### Embedding System Flow

```
User selects model in RAGSettings
  |
  ├─ Local model (Xenova/*)?
  |    ├─ YES → Set embeddingSource = 'local'
  |    └─ Preload model (optional, shows progress)
  |
  └─ API model?
       └─ YES → Set embeddingSource = 'api'

User triggers embedding generation (index SWAG files)
  |
  └─ SwagContext.generateEmbeddings()
       |
       ├─ Check: embeddingSource === 'local'?
       |    |
       |    ├─ YES → Use Transformers.js (browser-based)
       |    |    ├─ Show loading toast with progress
       |    |    ├─ Load model if not cached
       |    |    ├─ Generate embeddings client-side
       |    |    └─ Save to IndexedDB
       |    |
       |    └─ NO → Use backend API
       |         ├─ Fetch providers from settings
       |         ├─ POST to /rag/embed-snippets
       |         ├─ Backend selects cheapest provider
       |         ├─ Generate embeddings server-side
       |         └─ Save to IndexedDB
       |
       └─ Result: Embeddings stored locally for vector search
```

### Provider System

**Two types of providers**:

1. **Environment Providers** (`.env` file):
   - Defined as `LP_TYPE_N` and `LP_KEY_N`
   - Loaded by backend on startup
   - Used for backend API calls

2. **UI Providers** (User settings):
   - Configured in Settings → Providers tab
   - Stored in localStorage
   - Only sent to backend when explicitly needed (now includes billing endpoint)

**Previous behavior**: Billing endpoint only checked environment providers  
**New behavior**: Billing endpoint merges both provider types

## Testing Instructions

### Test Fix #1: UI Providers Visibility

1. **Configure a provider in UI**:
   - Open Settings → Providers
   - Add OpenAI, Gemini, Together AI, or Cohere
   - Enable "🔗 Embeddings" capability
   - Save

2. **Check RAG Settings**:
   - Open Settings → RAG Settings
   - Look at "Embedding Model" dropdown
   - **Expected**: Should see API models from UI-configured provider under "☁️ API (Server)" section

3. **Check browser console**:
   - Look for: `📊 Fetched available embeddings: X from Y providers`
   - **Expected**: Y should match number of enabled providers

4. **Check server logs** (if backend running):
   - Look for: `📱 Received N UI providers for embedding availability check`
   - **Expected**: Should show UI providers being processed

### Test Fix #2: Local Model Progress Bar

1. **Select a local model**:
   - Open Settings → RAG Settings
   - Select a model from "🏠 Local (Browser)" section (e.g., "MiniLM-L6-v2")

2. **Clear browser cache** (to force re-download):
   - Open DevTools → Application → Storage
   - Clear "Cache Storage" and "IndexedDB"

3. **Trigger embedding generation**:
   - Go to SWAG page
   - Select some content
   - Click "Index Selected" or equivalent

4. **Observe loading toast**:
   - **Expected**: See persistent toast: "🔄 Loading local model MiniLM-L6-v2... X%"
   - **Expected**: Progress bar fills from 0% to 100%
   - **Expected**: Toast disappears when loading completes
   - **Expected**: Browser console shows: `⏳ Loading model... (X%)`

5. **Subsequent loads**:
   - **Expected**: Model loads instantly from cache (no toast or very brief)

### Test Fix #3: Verify Local Embeddings Work

1. **Select local model** (as above)

2. **Trigger embedding generation**

3. **Check browser console**:
   - Look for: `🔍 Embedding source check: embeddingSource="local", useLocalEmbeddings=true, embeddingModel="Xenova/..."`
   - Look for: `🏠 Using local browser-based embeddings`
   - Look for: `📦 Loading model: Xenova/...`
   - Look for: `✅ Model loaded, generating embeddings...`
   - **Expected**: NO backend API calls to `/rag/embed-snippets`

4. **Check backend logs**:
   - **Expected**: NO logs about embedding generation or provider selection
   - **Expected**: Only logs from OTHER requests (chat, billing, etc.)

5. **Verify embeddings saved**:
   - Open DevTools → Application → IndexedDB → `swag-rag` → `chunks`
   - **Expected**: See chunks with `embedding` arrays
   - **Expected**: `embedding` length matches model dimensions (384 for MiniLM-L6, 768 for BGE-Small)

## Commits

- `c16866b` - fix: Support UI providers in billing endpoint and add embedding source debugging
- `7e5be85` - feat: Add progress bar to local embedding model loading

## Remaining Issues

### Gemini Rate Limiting (Not Fixed)

**Issue**: Gemini free tier has very low rate limits (~15 requests/minute), but backend auto-selects it as cheapest option.

**Symptoms**:
- 429 errors: "You exceeded your current quota, please check your plan and billing details"
- Embedding generation fails frequently
- Retry logic exists but may not be sufficient

**Workarounds**:
1. Use a paid Gemini account (increase quotas)
2. Configure a different provider (OpenAI, Together AI, Cohere)
3. Use local embeddings (no API calls)

**Potential fixes** (not implemented):
- Add rate limit detection and auto-fallback to next cheapest
- Deprioritize Gemini in auto-selection algorithm
- Add exponential backoff with longer delays
- Show warning in UI about Gemini free tier limits
- Add "preferred provider" setting to override auto-selection

## Architecture Notes

### Local Embedding Models

**Defined in RAGSettings.tsx**:
```typescript
const LOCAL_EMBEDDING_MODELS = [
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    name: 'MiniLM-L6-v2',
    description: 'Fast, lightweight, good quality',
    dimensions: 384,
    size: '23MB',
    speed: 'Very Fast',
    provider: 'local'
  },
  {
    id: 'Xenova/paraphrase-MiniLM-L3-v2',
    name: 'MiniLM-L3-v2',
    description: 'Extremely fast, smaller model',
    dimensions: 384,
    size: '17MB',
    speed: 'Fastest',
    provider: 'local'
  },
  {
    id: 'Xenova/bge-small-en-v1.5',
    name: 'BGE-Small-EN-v1.5',
    description: 'High quality, slightly slower',
    dimensions: 384,
    size: '33MB',
    speed: 'Fast',
    provider: 'local'
  }
];
```

**NOT in backend catalog**: These models are not in `EMBEDDING_MODELS_CATALOG.json` because they never need to be - the backend is never called when local embeddings are selected.

### Backend Catalog

**File**: `EMBEDDING_MODELS_CATALOG.json`

**Contains**: Only API-based embedding models with pricing, dimensions, provider info

**Used by**: `src/endpoints/rag.js` → `selectEmbeddingProvider()` function

**Purpose**: Backend uses this to auto-select the cheapest available embedding provider when user doesn't specify one or when requested model isn't available.

## Future Enhancements

1. **Add model switching warning**: Show prominent warning that changing embedding models requires re-indexing all content

2. **Add cost estimator**: Show estimated cost before generating embeddings (tokens * pricing)

3. **Add batch size control**: Allow users to control how many snippets are embedded in parallel

4. **Add provider priority**: Let users set preferred provider order instead of always using cheapest

5. **Add Gemini rate limit handling**: Detect 429s and automatically fallback or add longer delays

6. **Add embedding quality metrics**: Show comparison of different models' performance on user's content

7. **Add model caching status**: Show which local models are cached and how much space they use

8. **Add model pre-loading**: Allow users to pre-load local models without generating embeddings

## Lessons Learned

1. **Always verify the problem exists**: The "local embeddings ignored" issue was a false alarm - the code was already working correctly. The confusion came from seeing backend logs that were from OTHER requests.

2. **Backend and frontend have separate provider systems**: Environment providers (`.env`) are for backend, UI providers (localStorage) are for frontend. They must be explicitly merged when needed.

3. **Progress feedback is critical for slow operations**: Model loading can take 5-10 seconds on first download, so users need visual feedback.

4. **Auto-selection can be dangerous**: Backend auto-selecting the cheapest provider (Gemini) causes problems when that provider has severe rate limits.

5. **Debug logging is invaluable**: The `embeddingSource` check logging helped quickly confirm that the local/API branching was working correctly.
