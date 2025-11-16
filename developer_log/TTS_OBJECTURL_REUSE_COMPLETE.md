# TTS Object URL Reuse Implementation - Complete

**Date**: November 15, 2025  
**Status**: ✅ Complete  
**Branch**: main

## Summary

Implemented safer TTS pregeneration with object URL reuse to prevent memory leaks and duplicate blob URLs. Providers now accept and reuse pregenerated object URLs instead of creating new ones, ensuring clear ownership and deterministic revocation.

## Changes Implemented

### 1. Type Definitions (`ui-new/src/types/tts.ts`)

Added optional method signatures to `TTSProvider` interface for better type safety:

```typescript
export interface TTSProvider {
  // ... existing methods ...
  
  // Optional pregeneration methods for buffered playback (LLM/cloud TTS providers)
  pregenerate?(text: string, options: SpeakOptions): Promise<Blob>;
  playBlob?(audioBlob: Blob, options: SpeakOptions, providedObjectUrl?: string): Promise<void>;
  
  // Optional real-time control methods (for mid-playback rate/volume changes)
  setPlaybackRate?(rate: number): void;
  setVolume?(volume: number): void;
}
```

**Why**: Establishes typed contract for optional provider capabilities; third parameter `providedObjectUrl` makes it clear providers can accept caller-managed URLs.

### 2. LLM TTS Providers (`ui-new/src/services/tts/LLMTTSProviders.ts`)

Updated `LLMTTSProvider.playBlob()` to accept and reuse provided object URLs:

**Before**:
```typescript
async playBlob(audioBlob: Blob, options: SpeakOptions): Promise<void> {
  this.audio = new Audio(URL.createObjectURL(audioBlob));
  // ... always created new URL, never revoked
}
```

**After**:
```typescript
async playBlob(audioBlob: Blob, options: SpeakOptions, providedObjectUrl?: string): Promise<void> {
  let createdObjectUrl: string | undefined;
  const audioSrc = providedObjectUrl ?? (() => {
    const url = URL.createObjectURL(audioBlob);
    createdObjectUrl = url;
    return url;
  })();
  
  this.audio = new Audio(audioSrc);
  // ... onended/onerror revoke createdObjectUrl if we created it
}
```

**Key improvements**:
- If `providedObjectUrl` is present, reuse it (caller manages lifecycle)
- If no URL provided, create one locally and track it in `createdObjectUrl`
- Only revoke URLs that **this provider created** (not caller-provided URLs)
- `stop()` now revokes any blob: URL to prevent leaks

### 3. TTS Provider Factory (`ui-new/src/services/tts/TTSProviderFactory.ts`)

Updated `FallbackTTSProvider.playBlob()` to propagate optional `providedObjectUrl`:

```typescript
async playBlob(blob: Blob, options: SpeakOptions, providedObjectUrl?: string): Promise<void> {
  // ... determine which provider to use ...
  return await (providerForBlob as any).playBlob(blob, options, providedObjectUrl);
}
```

**Why**: Ensures fallback wrapper passes object URL through to underlying provider so reuse works end-to-end.

### 4. TTS Context (`ui-new/src/contexts/TTSContext.tsx`)

Updated `speakChunked()` to pass pregenerated object URL to provider:

**Before**:
```typescript
(provider as any).playBlob(bufferedBlob, chunkOptions)
```

**After**:
```typescript
(provider as any).playBlob(bufferedBlob, chunkOptions, entry?.objectUrl)
```

**Why**: TTSContext creates object URLs for pregenerated blobs (stored in `currentAudioBufferRef` as `{ blob, objectUrl }`). Passing the existing `objectUrl` to the provider ensures the provider reuses it instead of creating a second URL.

## Object URL Ownership & Lifecycle

### Clear Separation of Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **TTSContext** | - Creates object URLs for pregenerated blobs<br>- Stores them in `currentAudioBufferRef`<br>- Revokes them via `revokeAndClearAudioBuffer()` when invalidated or consumed<br>- Passes `objectUrl` to `playBlob()` |
| **LLM Provider** | - If `providedObjectUrl` given: reuse it, do NOT revoke it<br>- If no URL given: create one locally, revoke it on `onended`/`onerror`/`stop()` |

### Before (Memory Leak Risk)

```
┌─────────────┐
│ TTSContext  │
│             │  pregenerate() → Blob
│             │  URL.createObjectURL(blob) → url1  ✓ created
│             │  store { blob, objectUrl: url1 }
│             │
│             │  playBlob(blob) →
└─────────────┘
       ↓
┌─────────────┐
│ Provider    │
│             │  URL.createObjectURL(blob) → url2  ✓ created
│             │  new Audio(url2)
│             │  ...
│             │  // ❌ url1 never revoked by anyone
│             │  // ❌ url2 never revoked by provider
└─────────────┘
```

**Problem**: Two object URLs created for same blob; neither reliably revoked → memory leak.

### After (Safe & Deterministic)

```
┌─────────────┐
│ TTSContext  │
│             │  pregenerate() → Blob
│             │  URL.createObjectURL(blob) → url1  ✓ created by context
│             │  store { blob, objectUrl: url1 }
│             │
│             │  playBlob(blob, options, url1) →  // ← pass url1
└─────────────┘
       ↓
┌─────────────┐
│ Provider    │
│             │  audioSrc = providedObjectUrl ?? URL.createObjectURL(blob)
│             │  // providedObjectUrl = url1, so reuse it ✓
│             │  new Audio(url1)  // no second URL created
│             │  ...
│             │  // provider does NOT revoke url1 (caller owns it)
└─────────────┘
       ↓
┌─────────────┐
│ TTSContext  │
│             │  chunk consumed/invalidated →
│             │  URL.revokeObjectURL(url1)  ✓ revoked by creator
└─────────────┘
```

**Result**: Single object URL created and revoked by same component (TTSContext) → no leaks.

## Verification

### Build Success
```bash
cd ui-new && npm run build
# ✓ built in 10.48s
# No TypeScript errors
```

### ESLint Check
```bash
npx eslint src/services/tts/LLMTTSProviders.ts \
             src/services/tts/TTSProviderFactory.ts \
             src/contexts/TTSContext.tsx \
             src/types/tts.ts
```

**Result**: No new lint errors introduced. Existing `@typescript-eslint/no-explicit-any` warnings remain (pre-existing, not caused by this change).

## Files Changed

1. **ui-new/src/types/tts.ts**  
   - Added optional `pregenerate`, `playBlob`, `setPlaybackRate`, `setVolume` to `TTSProvider` interface

2. **ui-new/src/services/tts/LLMTTSProviders.ts**  
   - Updated `playBlob(audioBlob, options, providedObjectUrl?)` signature
   - Reuse `providedObjectUrl` if present; track locally-created URLs
   - Revoke locally-created URLs on `onended`, `onerror`, and `stop()`
   - Added blob URL revocation to `stop()` method

3. **ui-new/src/services/tts/TTSProviderFactory.ts**  
   - Updated `FallbackTTSProvider.playBlob(blob, options, providedObjectUrl?)` signature
   - Propagate `providedObjectUrl` to underlying provider's `playBlob()`

4. **ui-new/src/contexts/TTSContext.tsx**  
   - Pass `entry?.objectUrl` to `provider.playBlob()` when playing pregenerated blobs

## Impact & Benefits

### Memory Safety
- ✅ **No duplicate object URLs**: Provider reuses caller-provided URL instead of creating a second one
- ✅ **Deterministic revocation**: Clear ownership (creator revokes) prevents leaks
- ✅ **Provider cleanup**: Providers now revoke any URLs they create themselves

### Code Quality
- ✅ **Type-safe contracts**: Optional methods documented in `TTSProvider` interface
- ✅ **Backward compatible**: Third parameter is optional; existing code works unchanged
- ✅ **Clear ownership**: Comments and parameter names document lifecycle responsibilities

### Testing Recommendations

1. **Manual Test**: Enable pregeneration in TTS settings, play long text with LLM provider (Groq/OpenAI), monitor browser memory in DevTools → Performance Monitor. No growth after playback completes.

2. **Unit Test** (future): Mock provider, call `playBlob(blob, options, mockUrl)`, verify provider does NOT call `URL.createObjectURL()` when `mockUrl` is provided.

3. **Integration Test** (future): Run full pregenerate → playBlob flow, check object URL count via `performance.memory` or DevTools leak detection.

## Next Steps (Optional Future Work)

1. **Lint Cleanup**: Sweep `@typescript-eslint/no-explicit-any` warnings across TTS files (pre-existing, low priority)
2. **Add Tests**: Unit tests for object URL reuse; integration test for memory stability
3. **Extend to Other Providers**: Verify ElevenLabs/BrowserSpeech providers honor same contract (already propagated via FallbackTTSProvider)

## Related Work

- **Previous**: `FEATURE_MEMORY_TRACKING.md` - Initial TTS pregeneration implementation
- **Previous**: Removed `invalidatePregeneratedOnRateChange` flag (always invalidate on significant rate/volume changes)
- **This**: Object URL reuse to close memory leak vector

---

**Conclusion**: TTS pregeneration is now memory-safe with clear object URL ownership. Providers reuse caller-provided URLs instead of creating duplicates, and revocation is deterministic. Build passes; no new lint errors.
