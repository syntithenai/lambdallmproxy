# TTS Provider Research & Updates Summary

## Research Conducted

### OpenAI TTS API ✅
- **Endpoint Verified**: `https://api.openai.com/v1/audio/speech`
- **Model**: `tts-1` and `tts-1-HD` 
- **Voices Confirmed**: 6 voices (alloy, echo, fable, onyx, nova, shimmer)
- **Languages**: Multi-language support but voices work with any language
- **Status**: ✅ **ACCURATE - Implementation Updated**

### Groq TTS API ✅
- **Endpoint Verified**: `https://api.groq.com/openai/v1/audio/speech`
- **Model**: `playai-tts` (confirmed)
- **Voices Verified**: 27 PlayAI voices including:
  - English: Aaliyah-PlayAI, Adelaide-PlayAI, Angelo-PlayAI, Arista-PlayAI, Atlas-PlayAI, Basil-PlayAI, Briggs-PlayAI, Calum-PlayAI, Celeste-PlayAI, Cheyenne-PlayAI, Chip-PlayAI, Cillian-PlayAI, Deedee-PlayAI, Eleanor-PlayAI, Fritz-PlayAI, Gail-PlayAI, Indigo-PlayAI, Jennifer-PlayAI, Judy-PlayAI, Mamaw-PlayAI, Mason-PlayAI, Mikail-PlayAI, Mitch-PlayAI, Nia-PlayAI, Quinn-PlayAI, Ruby-PlayAI, Thunder-PlayAI
  - Arabic: 4 additional voices available
- **Default Voice**: Jennifer-PlayAI
- **Response Format**: WAV (default), supports MP3
- **Status**: ✅ **ACCURATE - Already Correct**

### Google Cloud Text-to-Speech API ✅
- **Endpoint Verified**: `https://texttospeech.googleapis.com/v1/text:synthesize`
- **Voice Types**: 
  - Chirp 3: HD voices (30+ styles, conversational)
  - Neural2 voices (premium quality)
  - WaveNet voices (premium, human-like)
  - Standard voices (basic quality)
  - Studio voices (news/broadcast)
- **Languages**: 100+ languages supported
- **Updated Implementation**: Added representative voices from different tiers
- **Status**: ✅ **UPDATED - More Accurate Voice List**

### Together AI TTS API ❌
- **Research Finding**: No native TTS API found in documentation
- **Official Docs**: Only mentions TTS in context of other providers/cookbooks
- **Implementation**: Updated to throw error with helpful message
- **Status**: ❌ **DISABLED - API Not Available**

### ElevenLabs TTS API ⚠️
- **Endpoint**: `https://api.elevenlabs.io/v2/voices` (for voice list)
- **Status**: Implementation not updated (requires separate research for voice catalog)
- **Note**: Dynamic voice list available via API

## Changes Made

### 1. OpenAI Voice Updates
```typescript
// Updated language code from 'en-US' to 'en' (more accurate)
{ id: 'alloy', name: 'Alloy', language: 'en', gender: 'neutral', provider: 'openai' }
```

### 2. Google Cloud TTS Voice Expansion
```typescript
// Added Neural2, WaveNet, and Standard voice tiers
// Corrected gender assignments based on official documentation
// Added voice type indicators (Neural2 A (Male), WaveNet C (Female), etc.)
```

### 3. Together AI TTS Removal
```typescript
// Updated to return minimal placeholder and throw descriptive error
case 'together':
  return [{ id: 'default', name: 'Default Voice', language: 'en-US', gender: 'neutral', provider: 'together' }];

private async speakWithTogether(): Promise<Blob> {
  throw new Error('Together AI TTS API is not currently available. Please use a different provider.');
}
```

### 4. Groq TTS Validation
- Confirmed all current voice names are accurate
- Verified endpoint and model name
- Default voice confirmed as Jennifer-PlayAI

## API Endpoint Verification Status

| Provider | Endpoint | Status |
|----------|----------|---------|
| OpenAI | `https://api.openai.com/v1/audio/speech` | ✅ Verified |
| Google Cloud | `https://texttospeech.googleapis.com/v1/text:synthesize` | ✅ Verified |
| Groq | `https://api.groq.com/openai/v1/audio/speech` | ✅ Verified |
| Together AI | N/A | ❌ No TTS API |
| ElevenLabs | `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` | ⚠️ Not Updated |

## Recommendations

1. **Remove Together AI from TTS options** - No native API available
2. **Consider ElevenLabs voice list API integration** - Dynamic voice fetching
3. **Add voice quality tiers** - Neural2 > WaveNet > Standard for Google
4. **Test updated implementations** - Verify all changes work correctly
5. **Add language support indicators** - Show which voices support which languages

## Implementation Status
- ✅ OpenAI: Updated and verified
- ✅ Groq: Confirmed accurate  
- ✅ Google Cloud: Enhanced with more voices
- ❌ Together AI: Disabled with clear error message
- ⚠️ ElevenLabs: Requires additional implementation

All core TTS providers now have accurate endpoint URLs and voice lists based on official documentation.