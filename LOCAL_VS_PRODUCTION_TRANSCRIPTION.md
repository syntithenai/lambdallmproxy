# Local vs Production Transcription - Important Distinction

## The Confusion

There are **two different contexts** where transcription can be used:

### 1. Local Development (`make dev`)
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:8081`
- **Can access local files** via filesystem

### 2. Production/Deployed (Lambda)
- Backend: AWS Lambda function
- Frontend: GitHub Pages (`https://lambdallmproxy.pages.dev`)
- **Cannot access localhost** (localhost is not accessible from Lambda/external services)

## How Transcription Works

### The Transcription Process

```
1. User provides URL → "Transcribe this: <URL>"
2. Backend downloads audio file to memory (Buffer)
3. Backend sends audio Buffer to OpenAI Whisper API
4. Whisper API returns transcription text
5. Backend returns transcription to user
```

**Key Point**: The backend downloads the file and sends the **audio data** to Whisper, not the URL. Whisper never sees the URL.

### Why localhost URLs Fail in Production

**Local Development** (`make dev`):
```
User → localhost:3000 (Backend) 
  → Detects localhost URL
  → Reads file from: /path/to/ui-new/public/samples/file.mp3
  → Sends audio buffer to Whisper API
  → ✅ Works!
```

**Production** (deployed Lambda):
```
User → Lambda function
  → Tries to read: localhost:3000/samples/file.mp3
  → ❌ FAILS: localhost is not accessible from Lambda
  → Error: "cannot access local URL"
```

## Solutions

### For Local Development

**Use localhost URL** - backend reads from filesystem:
```
Transcribe this: http://localhost:3000/samples/long-form-ai-speech.mp3
```

The code detects localhost and reads directly:
```javascript
// src/tools/transcribe.js
if (url.includes('localhost:3000/samples/')) {
    console.log(`🏠 Detected local file - reading from filesystem`);
    const filename = url.split('/samples/').pop();
    const filePath = path.join(__dirname, '../../ui-new/public/samples', filename);
    const buffer = await fs.readFile(filePath);
    // Send buffer to Whisper
}
```

### For Production/Deployed

**Use publicly accessible URL** - backend downloads via HTTP:
```
Transcribe this: https://llmproxy-media-samples.s3.amazonaws.com/audio/long-form-ai-speech.mp3
```

The code downloads via HTTP:
```javascript
// src/tools/transcribe.js
const response = await fetch(url);
const buffer = Buffer.from(await response.arrayBuffer());
// Send buffer to Whisper
```

## Example Button Labels

Updated to clarify context:

| Button Text | URL | Works In |
|-------------|-----|----------|
| **🏠 Local Dev**: AI & ML discussion | `localhost:3000/samples/...` | Local only |
| **Transcribe**: AI & ML discussion | `https://...s3.amazonaws.com/...` | Both |
| **YouTube video** | `https://youtube.com/...` | Both |

## Common Mistakes

### ❌ Wrong: Using localhost in production

```
# User is on https://lambdallmproxy.pages.dev
# Tries: "Transcribe this: http://localhost:3000/samples/file.mp3"
# Result: Error - Lambda can't access localhost
```

### ✅ Right: Use appropriate URL for context

**Local Development:**
```bash
# Start servers
make dev

# In browser at localhost:8081
Transcribe this: http://localhost:3000/samples/long-form-ai-speech.mp3
```

**Production:**
```bash
# In browser at https://lambdallmproxy.pages.dev
Transcribe this: https://llmproxy-media-samples.s3.amazonaws.com/audio/long-form-ai-speech.mp3
```

## Why This Architecture?

### OpenAI Whisper API Requires Audio Buffer

OpenAI's Whisper API endpoint:
```
POST https://api.openai.com/v1/audio/transcriptions
```

**Requires**: Form data with audio file buffer
**Does NOT accept**: URL to audio file

So the backend MUST:
1. Download audio to memory
2. Create FormData with buffer
3. Send to Whisper API

### Local Files Work Locally

When developing locally, the backend can read files from the filesystem:
- ✅ Faster (no network download)
- ✅ Works offline
- ✅ Good for testing

### Production Needs Public URLs

When deployed to Lambda:
- ❌ No local filesystem access
- ❌ Cannot access localhost from Lambda
- ✅ Must use HTTP/HTTPS URLs
- ✅ S3, public HTTP servers work fine

## Implementation Details

### Code Location

**File**: `src/tools/transcribe.js`

**Function**: `downloadMedia(url, onProgress)`

**Logic**:
```javascript
async function downloadMedia(url, onProgress) {
    // STEP 1: Check if localhost (local dev only)
    if (url.includes('localhost:3000/samples/')) {
        return await downloadFromLocalFile(url, onProgress);
    }
    
    // STEP 2: Check if S3 URL
    if (parseS3Url(url)) {
        return await downloadFromS3(bucket, key, onProgress);
    }
    
    // STEP 3: Regular HTTP/HTTPS URL
    const response = await fetch(url);
    return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type'),
        size: buffer.length
    };
}
```

### Local File Reading

```javascript
async function downloadFromLocalFile(urlOrPath, onProgress) {
    const fs = require('fs').promises;
    const path = require('path');
    
    // Extract filename from URL
    const filename = urlOrPath.split('/samples/').pop();
    
    // Build absolute path to file
    const filePath = path.join(__dirname, '../../ui-new/public/samples', filename);
    
    // Read file
    const buffer = await fs.readFile(filePath);
    
    return {
        buffer,
        contentType: 'audio/mpeg', // Determined from extension
        size: buffer.length
    };
}
```

## Testing

### Test Local Development

```bash
# 1. Start local servers
make dev

# 2. Open UI at localhost:8081

# 3. Click "🏠 Local Dev: AI & ML discussion"
# URL: http://localhost:3000/samples/long-form-ai-speech.mp3

# 4. Submit - should work!

# 5. Check console logs:
# 🏠 Detected local file - reading from filesystem
# 📁 Reading local file: /path/to/ui-new/public/samples/long-form-ai-speech.mp3
# ✅ Read 2.76MB from local file
```

### Test Production

```bash
# 1. Deploy to Lambda
make deploy-lambda-fast

# 2. Deploy UI
make deploy-ui

# 3. Open production UI
# https://lambdallmproxy.pages.dev

# 4. Click "Transcribe: AI & ML discussion" (S3 URL)
# URL: https://llmproxy-media-samples.s3.amazonaws.com/audio/long-form-ai-speech.mp3

# 5. Submit - should work!

# 6. If you try localhost URL:
# ❌ Error: "cannot access local URL"
```

## File Locations

### Local Sample Files
- **Location**: `ui-new/public/samples/long-form-ai-speech.mp3`
- **Access (local)**: `http://localhost:3000/samples/long-form-ai-speech.mp3`
- **Access (production)**: N/A (use S3 URL instead)

### S3 Sample Files
- **Location**: `s3://llmproxy-media-samples/audio/`
- **Access (both)**: `https://llmproxy-media-samples.s3.amazonaws.com/audio/long-form-ai-speech.mp3`

## Summary

| Context | Backend | Use URL | How It Works |
|---------|---------|---------|--------------|
| **Local Dev** | localhost:3000 | `localhost:3000/samples/file.mp3` | Filesystem read |
| **Production** | AWS Lambda | `https://...s3.amazonaws.com/...` | HTTP download |

**Key Takeaway**: The localhost URL feature is **exclusively for local development**. Production deployments must use publicly accessible URLs (S3, HTTP, HTTPS).

The error "transcription tool cannot access local URL" indicates you're trying to use a localhost URL against the deployed Lambda function. Use the S3 URL instead! 🎯
