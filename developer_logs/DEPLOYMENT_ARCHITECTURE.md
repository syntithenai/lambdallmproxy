# Deployment Architecture - UI Serving & Lambda Functions

**Date**: October 11, 2025  
**Status**: Detailed Architecture Analysis

---

## TL;DR - Your Questions Answered

### Q1: Is there a web endpoint serving the UI static HTML?
**A: YES** - Two options exist:

1. **Primary Production**: **Cloudflare Pages** at `https://lambdallmproxy.pages.dev`
   - Serves the UI as a standalone static site
   - The UI is completely independent from Lambda
   - UI points to Lambda API via hardcoded endpoint

2. **Alternative (Lambda-served)**: Lambda Function URL at `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/`
   - Lambda can ALSO serve the UI files from its bundled `docs/` folder
   - Same Lambda handles both API endpoints AND static files
   - Uses GET requests to serve HTML/CSS/JS

### Q2: Can a streamed Lambda function serve static HTML?
**A: YES, BUT WITH LIMITATIONS**

The Lambda uses `awslambda.streamifyResponse()` for ALL requests, including static files:
- **Streaming endpoints** (POST /chat, /search, /planning): Use true SSE streaming
- **Static files** (GET /*, /index.html): Use streaming wrapper but serve buffered content
- Static file handler wraps buffered response in streaming format
- Works but is not optimal for static content

### Q3: Is there another Lambda function for buffered responses?
**A: NO - Single Lambda with Dual Response Modes**

One Lambda function (`llmproxy`) handles both:
1. **Streaming responses**: SSE for chat, search, planning
2. **Buffered responses**: Static files, OAuth callbacks, proxy endpoint
3. All responses use `streamifyResponse` wrapper (requirement of AWS streaming Lambda)

### Q4: Does UI deploy ensure Lambda has the correct endpoint?
**A: PARTIAL - Manual Configuration**

- **UI endpoint is HARDCODED** in `ui-new/src/utils/api.ts`:
  ```typescript
  const REMOTE_LAMBDA_URL = 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';
  ```
- **No automatic sync** between Lambda URL changes and UI build
- **UI deployment** (`make deploy-ui`) does NOT update Lambda
- **Lambda deployment** (`make deploy-lambda-fast`) does NOT update UI endpoint
- **Risk**: If Lambda URL changes, UI must be manually updated and redeployed

---

## Detailed Architecture

### 1. Primary Production Setup (Current)

```
┌─────────────────────────────────────────────────────────────┐
│                         USERS                               │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ HTTPS
                  │
         ┌────────▼────────────────────┐
         │  Cloudflare Pages           │
         │  lambdallmproxy.pages.dev   │
         │  (Static HTML/CSS/JS)       │
         └────────┬────────────────────┘
                  │
                  │ API Calls (fetch)
                  │
         ┌────────▼────────────────────────────────────────────┐
         │  AWS Lambda Function URL                            │
         │  nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url...    │
         │                                                      │
         │  Routes:                                             │
         │  ┌──────────────────────────────────────────────┐   │
         │  │ POST /chat        → Streaming SSE            │   │
         │  │ POST /search      → Streaming SSE            │   │
         │  │ POST /planning    → Streaming SSE            │   │
         │  │ POST /proxy       → Buffered JSON            │   │
         │  │ POST /transcribe  → Buffered JSON            │   │
         │  │ GET  /oauth/*     → Buffered redirect        │   │
         │  │ POST /oauth/*     → Buffered JSON            │   │
         │  │ GET  /*           → Static files (backup)    │   │
         │  └──────────────────────────────────────────────┘   │
         └─────────────────────────────────────────────────────┘
```

**Key Points**:
- UI and Lambda are **separate deployments**
- UI is pure static files on Cloudflare Pages
- Lambda handles all API requests
- Lambda CAN serve static files but doesn't need to (backup capability)

---

### 2. Lambda Function Architecture

#### File: `src/index.js` (Main Router)

```javascript
exports.handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    // ALL requests use streamifyResponse wrapper
    
    if (method === 'POST' && path === '/chat') {
        // TRUE STREAMING: SSE events sent progressively
        await chatEndpoint.handler(event, responseStream);
    }
    
    if (method === 'POST' && path === '/search') {
        // TRUE STREAMING: SSE events sent progressively
        await searchEndpoint.handler(event, responseStream);
    }
    
    if (method === 'POST' && path === '/planning') {
        // TRUE STREAMING: SSE events sent progressively
        await planningEndpoint.handler(event, responseStream);
    }
    
    if (method === 'POST' && path === '/proxy') {
        // BUFFERED: Response built in memory, then streamed
        const proxyResponse = await proxyEndpoint.handler(event);
        responseStream.write(JSON.stringify(proxyResponse));
        responseStream.end();
    }
    
    if (method === 'GET' && path === '/*') {
        // STATIC FILES: Read from docs/, buffer, then stream
        const staticResponse = await staticEndpoint.handler(event);
        responseStream.write(JSON.stringify(staticResponse));
        responseStream.end();
    }
});
```

**Response Types**:

| Endpoint | Type | Response Mode | Use Case |
|----------|------|---------------|----------|
| POST /chat | Streaming | True SSE | Real-time LLM responses |
| POST /search | Streaming | True SSE | Progressive search results |
| POST /planning | Streaming | True SSE | Research plan generation |
| POST /proxy | Buffered | Wrapped stream | OpenAI proxy compatibility |
| POST /transcribe | Buffered | Wrapped stream | Audio transcription |
| GET /oauth/* | Buffered | Wrapped stream | OAuth redirects |
| POST /oauth/* | Buffered | Wrapped stream | Token operations |
| GET /* | Buffered | Wrapped stream | Static files (HTML/CSS/JS) |

---

### 3. Static File Serving

#### File: `src/endpoints/static.js`

```javascript
async function handler(event) {
    // 1. Extract requested path
    const requestPath = event.path || event.rawPath || '/';
    
    // 2. Read file from bundled docs/ directory
    const docsDir = path.join(__dirname, '..', '..', 'docs');
    const fullPath = path.join(docsDir, requestPath);
    
    // 3. Security check: prevent directory traversal
    if (!fullPath.startsWith(docsDir)) {
        return { statusCode: 404, body: 'Not Found' };
    }
    
    // 4. Read file contents
    const file = await readStaticFile(requestPath);
    
    // 5. Return buffered response
    return {
        statusCode: 200,
        headers: {
            'Content-Type': file.contentType,
            'Cache-Control': 'public, max-age=3600'
        },
        body: file.content.toString('utf-8'),
        isBase64Encoded: false
    };
}
```

**How Static Serving Works**:
1. Lambda function deployment includes entire `docs/` folder
2. When Lambda receives `GET /index.html`, it reads from bundled files
3. Response is buffered (file read into memory)
4. Response is wrapped in streaming format and sent
5. Works but NOT optimal (cold starts, memory limits, no CDN)

**Deployment Package**:
```
function.zip
├── src/
│   ├── index.js (router)
│   ├── endpoints/
│   │   ├── static.js (serves docs/)
│   │   ├── chat.js
│   │   └── ...
│   └── ...
└── docs/ (UI build output)
    ├── index.html
    ├── assets/
    │   ├── index-*.js (815KB bundle)
    │   └── index-*.css
    └── ...
```

---

### 4. UI Deployment Flow

#### Command: `make deploy-ui`

```bash
make deploy-ui
  ↓
./scripts/build-docs.sh
  ↓
cd ui-new && npm run build
  ↓
vite build → outputs to docs/
  ↓
./scripts/deploy-docs.sh
  ↓
git add docs/
git commit -m "docs: update built site"
git push origin agent
  ↓
Cloudflare Pages Auto-Deploy
  ↓
✅ Live at lambdallmproxy.pages.dev
```

**Key Points**:
- **Build**: React app built with Vite → `docs/` folder
- **Commit**: `docs/` folder committed to git (agent branch)
- **Push**: Changes pushed to GitHub
- **Auto-deploy**: Cloudflare Pages watches repository and auto-deploys
- **Lambda**: NOT updated during UI deployment
- **Endpoint**: Hardcoded in UI source code

---

### 5. Lambda Deployment Flow

#### Command: `make deploy-lambda-fast`

```bash
make deploy-lambda-fast
  ↓
./scripts/deploy-fast.sh
  ↓
Package src/ code (WITHOUT dependencies)
  ↓
Upload to S3
  ↓
Update Lambda function code
  ↓
Attach Lambda Layer (dependencies)
  ↓
✅ Lambda updated (~10 seconds)
  ↓
UI NOT updated (endpoint remains same)
```

**What Gets Deployed**:
- **Code**: All `src/` files including `src/endpoints/static.js`
- **docs/**: YES, included in function package (backup static serving)
- **Dependencies**: NO, they're in Lambda Layer
- **Size**: ~190KB (code only)

**What Does NOT Get Updated**:
- ❌ UI deployment (Cloudflare Pages)
- ❌ UI endpoint configuration
- ❌ Lambda Function URL (stays the same)

---

### 6. Endpoint Configuration

#### File: `ui-new/src/utils/api.ts`

```typescript
// HARDCODED LAMBDA ENDPOINT
const LOCAL_LAMBDA_URL = 'http://localhost:3000';
const REMOTE_LAMBDA_URL = 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

async function getApiBase(): Promise<string> {
  // If environment variable is set, use it
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  
  // If not on localhost, always use remote
  if (!isLocalhost()) {
    return REMOTE_LAMBDA_URL; // ← HARDCODED FOR PRODUCTION
  }
  
  // On localhost: try local first, fallback to remote
  const localAvailable = await isLocalLambdaAvailable();
  return localAvailable ? LOCAL_LAMBDA_URL : REMOTE_LAMBDA_URL;
}
```

**Configuration Methods**:

1. **Hardcoded** (Current):
   - `REMOTE_LAMBDA_URL` constant in code
   - Requires code change + rebuild + redeploy to update

2. **Environment Variable** (Optional):
   - Set `VITE_API_BASE` during build
   - Not currently used in deployment scripts

3. **Localhost Detection** (Automatic):
   - If UI served from localhost → try local Lambda first
   - Fallback to remote if local unavailable
   - Choice saved to localStorage

---

### 7. Potential Issues & Risks

#### Issue 1: Endpoint Desync Risk ⚠️

**Scenario**: Lambda Function URL changes
```
1. Lambda URL changes → https://NEW-URL.lambda-url.us-east-1.on.aws
2. UI still points to → https://OLD-URL.lambda-url.us-east-1.on.aws
3. UI breaks → 404 or connection errors
```

**Fix Required**:
```bash
# 1. Update ui-new/src/utils/api.ts
const REMOTE_LAMBDA_URL = 'https://NEW-URL.lambda-url.us-east-1.on.aws';

# 2. Rebuild and redeploy UI
make deploy-ui
```

**Risk Level**: MEDIUM (Lambda URLs are stable, rarely change)

#### Issue 2: Static File Duplication

**Current State**:
- UI files exist in TWO places:
  1. **Cloudflare Pages**: Primary serving location
  2. **Lambda package**: Backup, rarely used

**Implications**:
- Lambda package size increased by ~815KB (UI bundle)
- Lambda can serve UI if Cloudflare Pages fails
- Redundancy is good but wastes space

**Optimization Opportunity**:
- Remove `docs/` from Lambda package
- Only keep `src/` code in Lambda
- Reduce package size, faster cold starts

#### Issue 3: No Build-Time Validation

**Missing**:
- No check if Lambda endpoint is reachable during UI build
- No validation that API_BASE URL is correct
- No automated endpoint sync

**Improvement Ideas**:
1. Add endpoint health check to build script
2. Read Lambda URL from config file
3. Sync endpoint URL during deployment

---

### 8. Deployment Best Practices

#### Current Workflow

**For Backend Changes**:
```bash
make deploy-lambda-fast  # Updates Lambda code only
# UI automatically uses new Lambda (same URL)
```

**For Frontend Changes**:
```bash
make deploy-ui           # Builds UI → pushes to git → Cloudflare auto-deploys
# Lambda not affected
```

**For Full Stack Changes**:
```bash
make deploy-lambda-fast  # Backend first
make deploy-ui           # Frontend second
# OR
make all                 # Both together
```

#### Recommended Improvements

1. **Add Endpoint Config File**:
```bash
# config/endpoints.json
{
  "lambda": "https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws",
  "local": "http://localhost:3000"
}
```

2. **Update Build Script**:
```bash
# Read from config instead of hardcoding
VITE_API_BASE=$(jq -r .lambda config/endpoints.json) npm run build
```

3. **Add Deployment Verification**:
```bash
# Test Lambda endpoint before UI deploy
curl -f $LAMBDA_URL/health || exit 1
make deploy-ui
```

---

## Summary: Architecture Decisions

### ✅ What Works Well

1. **Separation of Concerns**: UI and Lambda are independent
2. **CDN Performance**: Cloudflare Pages provides fast global delivery
3. **Streaming Capability**: Lambda supports both streaming and buffered responses
4. **Backup Static Serving**: Lambda can serve UI if CDN fails
5. **Local Development**: Smart localhost detection with fallback

### ⚠️ What Could Be Better

1. **Manual Endpoint Sync**: No automatic update if Lambda URL changes
2. **Hardcoded URLs**: Should use config file or env vars
3. **Build-Time Validation**: No checks that endpoints are valid
4. **Package Duplication**: UI files bundled in Lambda unnecessarily
5. **No GitHub Pages**: Using Cloudflare Pages but docs mention "GitHub Pages"

### 🎯 Recommendations

1. **Short Term**:
   - Document that Lambda URL is hardcoded
   - Add comment in code showing where to update
   - Create deployment checklist

2. **Medium Term**:
   - Move endpoint to config file
   - Add build-time endpoint validation
   - Remove `docs/` from Lambda package

3. **Long Term**:
   - Consider AWS API Gateway for more stable URLs
   - Use CloudFront for UI + Lambda together
   - Implement blue-green deployment for zero-downtime updates

---

## Verification Commands

```bash
# Check Lambda can serve static files
curl https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/ -v

# Check Cloudflare Pages
curl https://lambdallmproxy.pages.dev -v

# Check UI knows correct endpoint
cat ui-new/src/utils/api.ts | grep REMOTE_LAMBDA_URL

# Check Lambda package includes docs/
unzip -l .aws-sam/build/llmproxy/function.zip | grep docs/

# Verify endpoint in built UI
cat docs/assets/index-*.js | grep -o 'lambda-url[^"]*'
```

---

## Quick Reference

| Component | URL | Purpose | Deployment |
|-----------|-----|---------|------------|
| **UI (Production)** | https://lambdallmproxy.pages.dev | Static site | `make deploy-ui` → Cloudflare Pages |
| **Lambda API** | https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws | API + Backup UI | `make deploy-lambda-fast` |
| **Local Lambda** | http://localhost:3000 | Development | `make run-lambda-local` |
| **Local UI** | http://localhost:8081 | Development | `make serve-ui` |

**Endpoint Configuration**: `ui-new/src/utils/api.ts` line 5  
**Static File Handler**: `src/endpoints/static.js`  
**Lambda Router**: `src/index.js`

---

**Status**: ✅ Architecture Documented & Analyzed
