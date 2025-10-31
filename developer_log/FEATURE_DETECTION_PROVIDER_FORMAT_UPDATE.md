# Feature Detection - New Provider Format Migration

**Date**: October 31, 2025  
**Status**: ✅ Complete  
**Impact**: Backend feature detection, provider capabilities

## Problem

The backend feature detection in `src/endpoints/billing.js` was using legacy environment variables (GROQ_KEY, OPENAI_KEY, GEMINI_KEY, TOGETHER_KEY, ELEVENLABS_KEY, WHISPER_ENDPOINT) to detect available features. This was incompatible with the new multi-provider format that supports multiple instances of the same provider type.

## Solution

Updated `src/endpoints/billing.js` to:
1. **Remove all legacy environment variable checks**
2. **Use only the new provider format** (LP_TYPE_N/LP_KEY_N)
3. **Detect capabilities based on provider types** from `loadEnvironmentProviders()`

## Changes Made

### 1. TTS Capabilities Detection (Lines 178-201)

**Before**:
```javascript
const ttsCapabilities = {
    groq: !!process.env.GROQ_KEY,
    gemini: !!process.env.GEMINI_KEY,
    together: !!process.env.TOGETHER_KEY,
    elevenlabs: !!process.env.ELEVENLABS_KEY,
    browser: true,
    speakjs: true
};
```

**After**:
```javascript
const ttsCapabilities = {
    browser: true,
    speakjs: true
};

const envProviders = loadEnvironmentProviders();
for (const provider of envProviders) {
    if (provider.type === 'groq' || provider.type === 'groq-free') {
        ttsCapabilities.groq = true;
    } else if (provider.type === 'gemini' || provider.type === 'gemini-free') {
        ttsCapabilities.gemini = true;
    } else if (provider.type === 'together') {
        ttsCapabilities.together = true;
    } else if (provider.type === 'elevenlabs') {
        ttsCapabilities.elevenlabs = true;
    }
}
```

### 2. Transcription Feature Detection (Lines 286-293)

**Before**:
```javascript
if (process.env.WHISPER_ENDPOINT || process.env.OPENAI_KEY || process.env.GROQ_KEY) {
    features.transcription = true;
}
if (!features.transcription) {
    for (const provider of envProviders) {
        if (provider.type === 'groq' || provider.type === 'openai') {
            features.transcription = true;
            break;
        }
    }
}
```

**After**:
```javascript
for (const provider of envProviders) {
    if (provider.type === 'groq' || provider.type === 'groq-free' || 
        provider.type === 'openai' || provider.type === 'openai-free') {
        features.transcription = true;
        break;
    }
}
```

### 3. TTS Feature Detection (Lines 295-303)

**Before**:
```javascript
if (process.env.GROQ_KEY || process.env.GEMINI_KEY || 
    process.env.TOGETHER_KEY || process.env.ELEVENLABS_KEY) {
    features.textToSpeech = true;
}
```

**After**:
```javascript
for (const provider of envProviders) {
    if (provider.type === 'groq' || provider.type === 'groq-free' ||
        provider.type === 'gemini' || provider.type === 'gemini-free' ||
        provider.type === 'together' || provider.type === 'elevenlabs') {
        features.textToSpeech = true;
        break;
    }
}
```

### 4. Embeddings Feature Detection (Lines 305-313)

**Before**:
```javascript
if (process.env.OPENAI_KEY || process.env.GROQ_KEY) {
    features.embeddings = true;
}
if (!features.embeddings) {
    for (const provider of envProviders) {
        if (provider.type === 'groq' || provider.type === 'openai') {
            features.embeddings = true;
            break;
        }
    }
}
```

**After**:
```javascript
for (const provider of envProviders) {
    if (provider.type === 'groq' || provider.type === 'groq-free' ||
        provider.type === 'openai' || provider.type === 'openai-free' ||
        provider.type === 'cohere') {
        features.embeddings = true;
        break;
    }
}
```

### 5. Removed Duplicate envProviders Declaration

Removed duplicate `loadEnvironmentProviders()` call on line 204 since it was already loaded on line 188.

## Provider Type Capabilities

| Provider Type | Chat | Image Gen | Image Edit | Transcription | TTS | Embeddings |
|--------------|------|-----------|------------|---------------|-----|------------|
| groq / groq-free | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| openai / openai-free | ✅ | ✅ | ✅ | ✅ | ❌* | ✅ |
| gemini / gemini-free | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| together | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| elevenlabs | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| cohere | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |

*Note: OpenAI has TTS support via TTS endpoint but it's disabled in ttsCapabilities detection (see OPENAI_KEY RAG embeddings note)

## Benefits

1. **Multi-Provider Support**: Can now configure multiple instances of the same provider type:
   ```bash
   LP_TYPE_0=groq
   LP_KEY_0=[REDACTED]  # Free tier key
   LP_TYPE_5=groq
   LP_KEY_5=[REDACTED]  # Paid tier key
   ```

2. **Consistent Detection**: All feature detection uses the same provider loading mechanism

3. **No Legacy Dependencies**: Eliminates dependency on old environment variable naming

4. **Extensible**: Easy to add new provider types and capabilities

5. **Free/Paid Tier Support**: Distinguishes between provider tiers (groq vs groq-free)

## Environment Variable Format

### New Format (✅ Supported)
```bash
LP_TYPE_0=groq
LP_KEY_0=[REDACTED]
LP_TYPE_1=gemini
LP_KEY_1=[REDACTED]
LP_TYPE_2=together
LP_KEY_2=[REDACTED]
```

### Legacy Format (❌ No Longer Used)
```bash
GROQ_KEY=[REDACTED]
GEMINI_KEY=[REDACTED]
TOGETHER_KEY=afbe7207xxxxx
WHISPER_ENDPOINT=https://api.openai.com/v1/audio/transcriptions
```

## Testing

After restart with `make dev`, verified:
- ✅ Backend starts without errors
- ✅ Feature detection loads from envProviders
- ✅ TTS capabilities detected from provider types
- ✅ Transcription, embeddings features detected correctly
- ✅ No references to legacy environment variables remain

## Related Files

- `src/endpoints/billing.js` - Feature detection endpoint (updated)
- `src/credential-pool.js` - Provider loading function (unchanged)
- `.env` - Environment configuration (using new format)

## Next Steps

- [ ] Update deployment documentation to emphasize new provider format
- [ ] Consider deprecation notice if legacy format is still documented elsewhere
- [ ] Verify all endpoints use loadEnvironmentProviders() consistently
- [ ] Add provider capability detection to provider catalog validation

## References

- Project Instructions: `.github/copilot-instructions.md` section 1.2 (Local Development Workflow)
- Provider Format: `.env` lines 68-146 (Server-Side Providers section)
