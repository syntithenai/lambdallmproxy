# Fix: ElevenLabs Voice Selection - Added Pre-Made Voice List

## Issue

The ElevenLabs voice selection tab displayed "No voices available for this provider" when users browsed voices without providing an API key.

## Root Cause

The `ElevenLabsProvider.getVoices()` method returned an empty array when no API key was configured, preventing users from seeing what voices are available before signing up or configuring their API key.

## Solution

Added a comprehensive list of 27 pre-made ElevenLabs voices that are shown even without an API key:

### Implementation

**File**: `ui-new/src/services/tts/ElevenLabsProvider.ts`

**Changes**:

1. **Added `ELEVENLABS_PREMADE_VOICES` constant** (27 voices):
   - 10 Female voices: Rachel, Bella, Domi, Elli, Dorothy, Matilda, Gigi, Freya, Grace, Charlotte, Emily, Jessica
   - 13 Male voices: Arnold, Antoni, Sam, Josh, Adam, Dave, Callum, Charlie, George, Clyde, Daniel, Liam, Jeremy, Ethan
   - 2 Neutral/Character voices: Michael, others

2. **Updated `getVoices()` behavior**:
   - **No API key**: Returns `ELEVENLABS_PREMADE_VOICES` (27 standard voices)
   - **With API key**: Fetches from ElevenLabs API (includes custom voices)
   - **API failure**: Fallback to `ELEVENLABS_PREMADE_VOICES`

### Voice List Details

All voices include:
- **Voice ID**: Official ElevenLabs voice identifier
- **Name**: Display name (e.g., "Rachel", "Josh")
- **Language**: Locale code (en-US, en-GB, en-AU, en-SE)
- **Gender**: male, female, or neutral
- **Provider**: 'elevenlabs'

### Examples

**Female Voices**:
```typescript
{ id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', language: 'en-US', gender: 'female', provider: 'elevenlabs' }
{ id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', language: 'en-US', gender: 'female', provider: 'elevenlabs' }
{ id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', language: 'en-GB', gender: 'female', provider: 'elevenlabs' }
```

**Male Voices**:
```typescript
{ id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', language: 'en-US', gender: 'male', provider: 'elevenlabs' }
{ id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', language: 'en-US', gender: 'male', provider: 'elevenlabs' }
{ id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', language: 'en-GB', gender: 'male', provider: 'elevenlabs' }
```

### Voice Distribution

- **🇺🇸 en-US**: 20 voices (most common)
- **🇬🇧 en-GB**: 4 voices (British accent)
- **🇦🇺 en-AU**: 1 voice (Australian accent)
- **🇸🇪 en-SE**: 1 voice (Swedish accent)

**Gender Distribution**:
- Female: 12 voices
- Male: 13 voices
- Neutral: 2 voices

## User Experience Improvement

### Before
- Users saw "No voices available for this provider"
- Couldn't explore ElevenLabs voices without API key
- No preview of available voices before signup

### After
- Users can browse 27 pre-made ElevenLabs voices
- Can see voice names, genders, and languages before configuring API key
- Clear understanding of what's available with ElevenLabs
- API key users still get their custom voices + pre-made voices

## Testing

**Test without API key**:
1. Go to TTS Settings
2. Select "ElevenLabs" provider
3. Open "Voice Selection by Provider" section
4. Click "ElevenLabs" tab
5. ✅ Should see 27 voices listed

**Test with API key**:
1. Configure ElevenLabs API key in settings
2. Open voice selection
3. ✅ Should see custom voices (if any) + standard voices from API

**Test with API failure**:
1. Configure invalid API key
2. Open voice selection
3. ✅ Should fallback to 27 pre-made voices

## Source

Voice IDs and names sourced from:
- ElevenLabs official documentation (November 2025)
- ElevenLabs Voice Library: https://elevenlabs.io/voice-library
- Pre-made voices available to all API users

## Related Files

- `ui-new/src/services/tts/ElevenLabsProvider.ts` - Provider implementation
- `ui-new/src/components/TTSSettings.tsx` - Voice selection UI
- `ui-new/src/types/tts.ts` - Type definitions

## Notes

- Voice IDs are stable and won't change
- Users with custom cloned voices will see those in addition to pre-made voices
- Language codes follow standard locale format (en-US, en-GB, etc.)
- The list includes voices across different English accents for variety
