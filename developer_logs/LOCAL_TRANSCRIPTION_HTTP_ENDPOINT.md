# Local Transcription - HTTP Endpoint Approach

## Problem with Previous Approach

The initial implementation used **filesystem detection** which had issues:

1. ❌ **Different code paths**: Local used `fs.readFile()`, production used `fetch()`
2. ❌ **Not realistic**: Bypassed HTTP layer, network stack, headers, CORS
3. ❌ **Hidden bugs**: Issues that would appear in production weren't caught locally
4. ❌ **LLM confusion**: LLM refused to call tool thinking localhost wouldn't work

## Better Approach: HTTP Endpoint

**Use the same HTTP flow for both local and production testing.**

### What We Have

✅ Express static middleware already configured in `scripts/run-local-lambda.js`:
```javascript
app.use('/samples', express.static(samplesPath));
```

✅ Sample file exists at: `ui-new/public/samples/long-form-ai-speech.mp3`

✅ HTTP endpoint available: `http://localhost:3000/samples/long-form-ai-speech.mp3`

### What We Removed

❌ Removed local file detection from `src/tools/transcribe.js`
❌ No more special localhost handling
❌ `downloadFromLocalFile()` function no longer used

### How It Works Now

**Both local and production use the same code path:**

```
User Request
    ↓
LLM calls transcribe_url tool
    ↓
Backend: downloadMedia(url)
    ↓
fetch(url)  ← Same for local AND production
    ↓
HTTP GET request
    ↓
Response with audio data
    ↓
Send to Whisper API
```

**Local**: `fetch('http://localhost:3000/samples/file.mp3')` → Express static middleware  
**Production**: `fetch('https://s3.amazonaws.com/bucket/file.mp3')` → S3

### Benefits

1. ✅ **Same code path** - No special cases, same behavior everywhere
2. ✅ **Realistic testing** - Tests actual HTTP requests/responses  
3. ✅ **Catches issues** - Network problems, headers, timeouts visible locally
4. ✅ **Simpler code** - No localhost detection needed
5. ✅ **LLM works** - Standard HTTP URLs, no confusion

### Testing

**Test 1: Verify HTTP endpoint serves file**
```bash
curl -I http://localhost:3000/samples/long-form-ai-speech.mp3
```

Expected output:
```
HTTP/1.1 200 OK
Content-Type: audio/mpeg
Content-Length: 2822960
```

**Test 2: Download complete file**
```bash
curl http://localhost:3000/samples/long-form-ai-speech.mp3 --output /tmp/test.mp3
ls -lh /tmp/test.mp3
```

Expected: ~2.7MB file

**Test 3: Use test script**
```bash
node test-http-endpoint.js
```

Expected: Download confirmation with file size

**Test 4: UI transcription**
1. Start servers: `make dev`
2. Open UI: http://localhost:8081
3. Click: `🏠 Local Dev: AI & ML discussion (~4min)`
4. Watch terminal for logs

Expected terminal logs:
```
[2025-10-18T...] GET /samples/long-form-ai-speech.mp3
🌐 Fetching media from: http://localhost:3000/samples/long-form-ai-speech.mp3
🎤 Using openai Whisper API with model: whisper-1
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Local Development                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  UI (localhost:8081)                                     │
│       ↓                                                  │
│  "Transcribe this: http://localhost:3000/samples/..."   │
│       ↓                                                  │
│  POST /chat → Lambda Handler                            │
│       ↓                                                  │
│  transcribe.js: fetch(localhost:3000/samples/...)       │
│       ↓                                                  │
│  GET /samples/file.mp3 → Express static middleware      │
│       ↓                                                  │
│  Serves from: ui-new/public/samples/                    │
│       ↓                                                  │
│  Audio buffer → Whisper API → Transcript                │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                Production (AWS Lambda)                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  UI (llmproxy.com)                                       │
│       ↓                                                  │
│  "Transcribe this: https://s3.amazonaws.com/..."        │
│       ↓                                                  │
│  POST /chat → Lambda Handler                            │
│       ↓                                                  │
│  transcribe.js: fetch(https://s3.amazonaws.com/...)     │
│       ↓                                                  │
│  S3 GET request                                          │
│       ↓                                                  │
│  Audio buffer → Whisper API → Transcript                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Point

**The transcription code doesn't know or care whether it's fetching from localhost or S3**. 
It just does `fetch(url)` and processes the response. This is the correct design.

### Files Modified

1. **`src/tools/transcribe.js`** - Removed localhost detection
2. **`scripts/run-local-lambda.js`** - Express static middleware (already there)
3. **`ui-new/src/components/ChatTab.tsx`** - Updated tool description

### Next Steps

1. ✅ Servers running with `make dev`
2. ✅ HTTP endpoint configured and serving files
3. ✅ Transcription code uses standard fetch()
4. ⏺️ Test in UI with localhost URL
5. ⏺️ Verify terminal shows HTTP GET request

The implementation is now complete and uses the **realistic HTTP approach** you suggested!
