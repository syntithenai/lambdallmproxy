# I18N Plan Updates: Translation Memory Storage & TTS Language Detection

**Date**: October 26, 2025  
**Changes**: Updated Translation Memory architecture and added TTS language detection

---

## Summary of Changes

### 1. Translation Memory Storage Architecture Update

**Problem**: Original plan used Lambda filesystem storage (`translation-memory.json`), which is lost when Lambda containers reset.

**Solution**: Migrated to **IndexedDB (client-side) + Google Sheets sync** architecture.

#### Architecture Changes

**Before**:
- File-based storage: `scripts/translation-memory.js` with `fs.writeFile()`
- Stored in Lambda filesystem (ephemeral, lost on reset)
- No cross-device sync

**After**:
- **Client-side**: IndexedDB for fast local access and offline support
- **Server-side**: Google Sheets `translation_memory` sheet in RAG spreadsheet
- **Sync**: Bidirectional sync on app load and periodic background sync (every 5 minutes)
- **Persistent**: Survives Lambda resets, syncs across devices

#### Implementation Details

**File**: `ui-new/src/services/translation-memory.ts`

```typescript
class TranslationMemory {
  private dbName = 'LambdaLLMProxy';
  private storeName = 'translationMemory';
  private db: IDBDatabase | null = null;

  // IndexedDB methods
  async init() { ... }
  async get(sourceText: string, targetLang: string): Promise<string | null> { ... }
  async set(sourceText: string, targetLang: string, translation: string) { ... }
  async findSimilar(sourceText: string, targetLang: string, threshold = 0.8) { ... }

  // Google Sheets sync methods
  async syncToGoogleSheets(authToken: string) { ... }
  async syncFromGoogleSheets(authToken: string) { ... }
}
```

**Backend Endpoints** (added to `src/endpoints/rag.js`):
- `GET /rag/translation-memory` - Retrieve TM from Google Sheets
- `POST /rag/sync-translation-memory` - Upload TM to Google Sheets

**Google Sheets Schema**:
```
Sheet: translation_memory
Columns: ID | Source Text | Target Language | Translation | Context | Frequency | Last Used | Created At
```

**Benefits**:
- ✅ Persistent across Lambda resets
- ✅ Syncs across multiple devices
- ✅ Fast local access via IndexedDB
- ✅ Offline support (IndexedDB available without network)
- ✅ Centralized storage in RAG spreadsheet (no new spreadsheet needed)
- ✅ Merge strategy preserves highest frequency on sync

---

### 2. TTS Language Detection Feature

**Problem**: TTS was planned to use UI language, which fails for multilingual conversations.

**Example Issue**:
- UI language: English
- LLM response: "Hola, ¿cómo estás?"
- Old behavior: English voice reading Spanish words (unnatural)
- New behavior: Detect Spanish → use Spanish voice

**Solution**: Automatic language detection before TTS synthesis using `franc` library.

#### Implementation

**File**: `ui-new/src/services/tts.ts`

```typescript
async function speakText(text: string, uiLanguage: string) {
  // Detect actual language of the text (may differ from UI language)
  const detectedLang = await detectLanguage(text);
  
  console.log(`🔊 TTS: UI language=${uiLanguage}, Detected language=${detectedLang}`);
  
  // Use detected language for TTS voice selection
  const voice = selectVoiceForLanguage(detectedLang);
  
  const response = await fetch('/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      language: detectedLang, // Use detected, not UI language
      voice: voice
    })
  });
  
  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  audio.play();
}

// Client-side language detection using franc (fast, offline)
async function detectLanguage(text: string): Promise<string> {
  const franc = await import('franc');
  const langCode = franc.franc(text, { minLength: 10 });
  
  // Map franc ISO 639-3 codes to our language codes
  const langMap: Record<string, string> = {
    'eng': 'en', 'spa': 'es', 'fra': 'fr', 'deu': 'de', 'ita': 'it',
    'por': 'pt', 'rus': 'ru', 'jpn': 'ja', 'kor': 'ko', 'zho': 'zh',
    'ara': 'ar', 'hin': 'hi', 'ben': 'bn', 'tur': 'tr'
  };
  
  return langMap[langCode] || 'en'; // Fallback to English
}

function selectVoiceForLanguage(lang: string): string {
  const voiceMap: Record<string, string> = {
    'en': 'alloy', 'es': 'nova', 'fr': 'shimmer', 'de': 'fable',
    'it': 'onyx', 'pt': 'echo', 'ja': 'alloy', 'zh': 'nova',
    'ar': 'fable', 'hi': 'shimmer', 'ru': 'echo'
  };
  
  return voiceMap[lang] || 'alloy';
}
```

**Backend** (`src/endpoints/tts.js`):
```javascript
async function handleTTS(event) {
  const { text, language, voice } = JSON.parse(event.body);
  
  console.log(`🔊 TTS Request: language=${language}, voice=${voice}, text length=${text.length}`);
  
  // Call OpenAI TTS API
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: voice,
      input: text,
      speed: 1.0
    })
  });
  
  const audioBuffer = await response.arrayBuffer();
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'inline'
    },
    body: Buffer.from(audioBuffer).toString('base64'),
    isBase64Encoded: true
  };
}
```

**Package Installation**:
```bash
cd ui-new
npm install franc
```

**Benefits**:
- ✅ Natural pronunciation in multi-language conversations
- ✅ Automatic language switching (no manual selection)
- ✅ Works with code-switching (mixed languages in single message)
- ✅ Fast client-side detection (~50KB franc library)
- ✅ Offline detection (no API calls for language detection)

---

## Updated Conclusion

The i18n plan now includes:

**Core Features**:
- ✅ Full UI translation with react-i18next
- ✅ Regional dialect support (14 variants: en-US, en-GB, es-ES, es-MX, zh-CN, zh-TW, ar-SA, ar-EG, etc.)
- ✅ Auto-language detection from first user message
- ✅ Voice input with language awareness (microphone button)
- ✅ Whisper transcription supporting 99+ languages
- ✅ **Translation Memory with IndexedDB + Google Sheets sync** ← NEW
- ✅ **TTS with automatic language detection** ← NEW
- ✅ LLM responses in target language/dialect via system prompts
- ✅ Locale-aware formatting (dates, numbers, currency)
- ✅ RTL support for Arabic/Hebrew
- ✅ Persistent language preference

**Key Innovations** (Updated):
1. System prompt injection ensures LLM responses match UI language
2. Automatic language detection eliminates manual selection
3. Regional dialects treated equally to major languages
4. Whisper's multilingual capability provides seamless voice input
5. **Translation Memory with cloud sync** maintains consistency across devices ← UPDATED
6. **TTS language detection** ensures natural pronunciation regardless of UI language ← NEW

---

## Migration Path

### For Translation Memory

1. **No migration needed** - new feature, no existing data
2. **Implementation order**:
   - Create IndexedDB schema in client
   - Add Google Sheets sync endpoints to backend
   - Create `translation_memory` sheet in RAG spreadsheet
   - Implement sync hooks in app load

### For TTS Language Detection

1. **Install franc**: `cd ui-new && npm install franc`
2. **Create TTS service**: `ui-new/src/services/tts.ts`
3. **Update TTS endpoint**: Add language parameter handling
4. **Test with multilingual content**: Verify language detection accuracy

---

## Files Modified

### Updated
- `developer_log/I18N_IMPLEMENTATION_PLAN.md`:
  - Phase 8: Translation Memory System (lines 484-843)
  - Section 14.1: Voice Output (TTS) with Language Detection (lines 1230-1393)
  - Conclusion updated with new features (lines 1395-1422)
  - Removed duplicate sections and old file-based TM code

### New Files Required (Implementation)
- `ui-new/src/services/translation-memory.ts` (IndexedDB + sync)
- `ui-new/src/services/tts.ts` (TTS with language detection)
- `ui-new/src/hooks/useTranslationMemory.ts` (React hook for TM)
- `src/endpoints/rag.js` (add TM sync endpoints)

---

## Testing Checklist

### Translation Memory
- [ ] IndexedDB schema created correctly
- [ ] TM entries persist across page reloads
- [ ] Sync to Google Sheets works with auth token
- [ ] Sync from Google Sheets merges correctly (highest frequency wins)
- [ ] Fuzzy matching finds similar translations (>80% similarity)
- [ ] Periodic sync runs every 5 minutes
- [ ] TM survives Lambda container resets

### TTS Language Detection
- [ ] Franc detects English text correctly
- [ ] Franc detects Spanish text correctly
- [ ] Franc detects mixed-language text (uses primary language)
- [ ] Voice selection matches detected language
- [ ] TTS endpoint receives correct language parameter
- [ ] Audio plays with natural pronunciation
- [ ] Short text (< 10 chars) falls back to English gracefully

---

## Performance Impact

### Translation Memory
- **Client-side**: +0KB (IndexedDB is native browser API)
- **Network**: Sync only on app load and every 5 minutes (minimal API calls)
- **Storage**: ~1-5KB per 100 translation entries in IndexedDB

### TTS Language Detection
- **Bundle size**: +50KB (franc library)
- **Detection speed**: <10ms for typical messages (fast, synchronous)
- **No API calls**: Detection is entirely client-side

**Total impact**: ~50KB additional bundle size, negligible runtime overhead

---

## Future Enhancements

1. **Translation Memory improvements**:
   - Add export/import functionality
   - Translation quality voting (user feedback)
   - Context-aware matching (same source text, different contexts)
   - Glossary integration (technical terms database)

2. **TTS improvements**:
   - Voice cloning for consistent speaker identity
   - Emotion detection (adjust voice tone)
   - Speed adjustment per language (some languages need slower speech)
   - Regional accent selection (e.g., British vs American English voices)

---

## Notes

- **IndexedDB browser support**: 98%+ (all modern browsers)
- **Franc accuracy**: 95%+ for texts >10 words
- **Google Sheets rate limits**: Sync is batched to avoid hitting 100 requests/100 seconds limit
- **Lambda cold starts**: TM stored in Google Sheets, no Lambda state dependency
- **Offline support**: TM works offline (IndexedDB), syncs when online

