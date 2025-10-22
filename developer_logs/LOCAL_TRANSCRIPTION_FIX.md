# Local Transcription Sample Files - Fix Summary

## Problem

Local transcription examples were failing with fetch errors because:
1. The example URL pointed to `http://localhost:8081/samples/...` (Vite dev server)
2. The backend Lambda server runs on `http://localhost:3000`
3. When the backend tried to fetch the audio file from port 8081, it failed (server-to-server request between different processes)

## Root Cause

The transcription tool downloads audio files on the backend (Lambda server). When using localhost URLs, the backend server needs to be able to access the file itself - not rely on the Vite frontend server.

**Original flow (broken):**
```
Browser (localhost:8081) → Backend (localhost:3000) → tries to fetch from localhost:8081 → FAILS
```

## Solution

Added static file serving to the local Lambda server (`scripts/run-local-lambda.js`) so sample files are accessible from the same server that handles Lambda requests.

**Fixed flow:**
```
Browser (localhost:8081) → Backend (localhost:3000) → fetches from localhost:3000/samples/ → SUCCESS
```

## Changes Made

### 1. Local Lambda Server - Added Static File Serving

**File**: `scripts/run-local-lambda.js`

**Change**: Added Express static middleware to serve files from `ui-new/public/samples/`

```javascript
// Serve static sample files from ui-new/public/samples
// This allows local transcription testing with localhost URLs
const samplesPath = path.join(__dirname, '../ui-new/public/samples');
if (fs.existsSync(samplesPath)) {
  app.use('/samples', express.static(samplesPath));
  console.log(`📁 Serving static samples from: ${samplesPath}`);
} else {
  console.log(`⚠️  Samples directory not found at: ${samplesPath}`);
}
```

**Result**: Sample files now accessible at `http://localhost:3000/samples/long-form-ai-speech.mp3`

### 2. Example Button - Updated URL

**File**: `ui-new/src/components/ExamplesModal.tsx`

**Before**: `http://localhost:8081/samples/long-form-ai-speech.mp3`  
**After**: `http://localhost:3000/samples/long-form-ai-speech.mp3`

### 3. README - Updated Documentation

**File**: `README.md`

**Changes**:
- Updated sample access URL from port 8081 to port 3000
- Added note explaining why backend port (3000) must be used
- Clarified that backend needs direct access to files

## How It Works Now

### Local Development Setup

When you run `make dev`:
1. **Backend Lambda server** starts on `http://localhost:3000`
   - Handles all Lambda function requests
   - **Now also serves static files from `ui-new/public/samples/`**
2. **Frontend Vite server** starts on `http://localhost:8081`
   - Serves the React UI
   - Proxies API requests to port 3000

### Transcription Flow

1. User clicks "🏠 Local: AI & ML discussion" example button
2. Query filled: `Transcribe this: http://localhost:3000/samples/long-form-ai-speech.mp3`
3. Frontend sends request to backend at `localhost:3000`
4. Backend's transcription tool fetches audio from **its own server** at `localhost:3000/samples/...`
5. File download succeeds (same server, no CORS issues)
6. Transcription proceeds normally

## Benefits

✅ **Local transcription works** - No more fetch errors  
✅ **No CORS issues** - Backend fetches from itself  
✅ **Simple architecture** - One server serves both API and sample files  
✅ **Fast iteration** - Test transcription locally without S3  
✅ **Offline capable** - No external dependencies for testing

## Testing

To verify the fix works:

```bash
# 1. Start local development servers
make dev

# 2. In your browser, visit:
http://localhost:8081

# 3. Click Examples → "🏠 Local: AI & ML discussion (~4min)"

# 4. Submit the query - transcription should now work!
```

You can also test the static file serving directly:
```bash
# Visit in browser while `make dev` is running:
http://localhost:3000/samples/long-form-ai-speech.mp3

# Should download/play the audio file
```

## File Locations

**Sample Files**: `ui-new/public/samples/`
- `long-form-ai-speech.mp3` (2.8MB)

**Backend Serves At**: `http://localhost:3000/samples/`
**Frontend Accesses**: Same URL from browser

## Key Insight

When working with localhost servers:
- **Frontend (Vite, port 8081)**: For serving UI to browser
- **Backend (Lambda, port 3000)**: For API requests **and** file serving

Always use the **backend URL** for resources that the backend itself needs to fetch, even if the file could also be served by the frontend server.

## Related Files

- `scripts/run-local-lambda.js` - Local Lambda server with static file serving
- `ui-new/src/components/ExamplesModal.tsx` - Example buttons
- `README.md` - Local development documentation
- `LOCAL_DEV_DOCUMENTATION_UPDATE.md` - Previous documentation update
