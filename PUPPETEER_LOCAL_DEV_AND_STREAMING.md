# Puppeteer: Local Development, Browser Visibility, and Streaming

## Question 1: Does Puppeteer work with local dev Lambda function?

### Current Status: **NO - Remote Lambda Only**

Your Puppeteer setup currently **only works in AWS Lambda**, not locally. Here's why:

**Architecture:**
```
Main Lambda (llmproxy)
  │
  └─> invokes via AWS SDK ───> Puppeteer Lambda (llmproxy-puppeteer)
                                 └─> @sparticuz/chromium (Lambda-optimized)
```

**Code Evidence:**
```javascript
// src/tools.js line 75
async function invokePuppeteerLambda(url, options = {}) {
  const puppeteerLambdaArn = process.env.PUPPETEER_LAMBDA_ARN;
  
  if (!puppeteerLambdaArn) {
    throw new Error('PUPPETEER_LAMBDA_ARN environment variable not set');
  }
  
  // Invokes remote Lambda function via AWS SDK
  const command = new InvokeCommand({
    FunctionName: puppeteerLambdaArn,  // Points to AWS Lambda ARN
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify(payload)
  });
}
```

Your `.env` shows:
```bash
PUPPETEER_LAMBDA_ARN=arn:aws:lambda:us-east-1:979126075445:function:llmproxy-puppeteer
USE_PUPPETEER=true
```

### Why Local Dev Doesn't Work Currently:

1. **AWS SDK Dependency**: The code uses `@aws-sdk/client-lambda` to invoke a remote Lambda
2. **No Local Fallback**: There's no check for local development mode
3. **Lambda-Only Binary**: Uses `@sparticuz/chromium` which is Lambda-optimized
4. **Separate Function**: Puppeteer runs in a dedicated Lambda with 1024MB memory

### When You Run `make dev`:

- ✅ Main Lambda runs locally on `http://localhost:3000`
- ❌ Puppeteer calls **still invoke remote AWS Lambda**
- 💰 You're charged for each remote invocation

---

## Question 2: How to see the browser window when scraping?

### Current Status: **IMPOSSIBLE in Lambda**

**Puppeteer runs in AWS Lambda with:**
```javascript
// src/puppeteer-handler.js
browser = await puppeteer.launch({
  headless: chromium.headless,  // Always true in Lambda
  executablePath: await chromium.executablePath(),  // Lambda binary
  args: chromium.args,  // Minimal args for Lambda
});
```

**Lambda Limitations:**
- ❌ No display server (no X11, no Xvfb)
- ❌ No GUI environment
- ❌ Headless mode required
- ❌ Remote execution (you can't see it even if it had a display)

### Solution: Use Local Puppeteer for Development

To see the browser during development, you need to:

1. **Install full Chromium locally**
2. **Run Puppeteer directly** (not via Lambda)
3. **Disable headless mode**

**Example implementation:**

```javascript
// New file: src/scrapers/puppeteer-local.js
const puppeteer = require('puppeteer');  // Full puppeteer, not puppeteer-core

async function scrapePageLocal(url, options = {}) {
  const browser = await puppeteer.launch({
    headless: false,  // 👈 VISIBLE BROWSER
    devtools: true,   // 👈 OPEN DEVTOOLS
    slowMo: 250,      // 👈 SLOW DOWN FOR VISIBILITY
    args: [
      '--window-size=1920,1080',
      '--start-maximized'
    ]
  });
  
  const page = await browser.newPage();
  await page.goto(url);
  
  // Rest of scraping logic...
}
```

**Package.json change needed:**
```json
{
  "dependencies": {
    "puppeteer": "^23.11.1",      // Full Chromium (400MB+)
    "puppeteer-core": "^23.11.1"  // Keep for Lambda
  }
}
```

---

## Question 3: Can Puppeteer stream screenshots every second?

### Answer: **YES, but with significant complexity**

Puppeteer supports screenshots, but streaming them to the UI in real-time requires significant architecture changes.

### Current Screenshot Support:

```javascript
// src/puppeteer-handler.js already has screenshot support
if (screenshot) {
  screenshotData = await page.screenshot({
    type: 'png',
    fullPage: false,
    encoding: 'base64'  // 👈 Returns base64 string
  });
}
```

### Challenge: Real-Time Streaming

**Current Flow:**
```
Puppeteer Lambda → Takes 1 screenshot → Returns → Done
```

**Desired Flow:**
```
Puppeteer → Screenshot #1 → Stream to UI → Screenshot #2 → Stream → Screenshot #3...
```

**Problems:**

1. **Lambda Invocation Model**: Lambda is request-response, not long-running
2. **No Streaming Support**: Lambda.invoke() waits for completion
3. **Response Size Limits**: Lambda payload max 6MB (3-5 screenshots max)
4. **Timeout**: Lambda max 15 minutes, but you'd want shorter scrapes
5. **Cost**: Each second of screenshots costs money

### Architecture Options for Screenshot Streaming:

#### Option A: Lambda + S3 + Polling (Simple but Laggy)

```
┌─────────────┐
│ Puppeteer   │
│ Lambda      │
│             │
│ Take shot   │──┬──> Upload to S3 (screenshot-1.png)
│ Wait 1sec   │  │
│ Take shot   │──┼──> Upload to S3 (screenshot-2.png)
│ Wait 1sec   │  │
│ Take shot   │──┴──> Upload to S3 (screenshot-3.png)
└─────────────┘
       │
       └──> Return S3 URLs
       
UI polls S3 every second to fetch new images
```

**Pros:**
- ✅ Works with current architecture
- ✅ No WebSocket needed

**Cons:**
- ❌ High latency (1-3 seconds)
- ❌ S3 costs (storage + API calls)
- ❌ Polling overhead

**Implementation:**
```javascript
async function scrapePage(url, options = {}) {
  const screenshots = [];
  const page = await browser.newPage();
  await page.goto(url);
  
  // Take screenshots every second for 10 seconds
  for (let i = 0; i < 10; i++) {
    const screenshot = await page.screenshot({ encoding: 'base64' });
    
    // Upload to S3
    const s3Key = `screenshots/${Date.now()}-${i}.png`;
    await uploadToS3(screenshot, s3Key);
    screenshots.push(s3Key);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return { screenshots };
}
```

#### Option B: WebSocket + Lambda Extension (Complex but Real-Time)

```
┌─────────────┐     WebSocket     ┌──────────┐
│ Puppeteer   │ ═════════════════>│   UI     │
│ Lambda      │                   │  Client  │
│             │                   └──────────┘
│ Take shot 1 │ ═══> Stream ═══>  Display
│ Take shot 2 │ ═══> Stream ═══>  Display
│ Take shot 3 │ ═══> Stream ═══>  Display
└─────────────┘
```

**Requirements:**
- AWS API Gateway WebSocket API
- Lambda extension for persistent connection
- Client WebSocket handler

**Pros:**
- ✅ True real-time streaming
- ✅ Low latency (<100ms)
- ✅ Better UX

**Cons:**
- ❌ Complex architecture
- ❌ WebSocket infrastructure needed
- ❌ Connection management overhead
- ❌ Higher cost

#### Option C: Server-Sent Events (SSE) via API Gateway (Medium Complexity)

```
┌─────────────┐     
│ Puppeteer   │     HTTP/2 SSE    ┌──────────┐
│ Lambda      │ ═════════════════>│   UI     │
│             │                   │  Client  │
│ Take shot 1 │ ─event:data──────> Display
│ Take shot 2 │ ─event:data──────> Display  
│ Take shot 3 │ ─event:data──────> Display
└─────────────┘
```

**Pros:**
- ✅ Simpler than WebSocket
- ✅ One-way stream (perfect for this use case)
- ✅ Native browser support

**Cons:**
- ❌ Still requires Lambda streaming support
- ❌ API Gateway configuration
- ❌ Connection limits

---

## Question 4: Is there a better way to approach this feature?

### Recommended Approach: **Progressive Status Updates (Not Screenshots)**

Instead of streaming screenshots (expensive, complex), consider these alternatives:

### Option 1: Progressive Text Extraction (Recommended) ⭐

Stream **text content** as it's discovered, not images:

```javascript
async function scrapePageProgressive(url, onProgress) {
  const page = await browser.newPage();
  
  // Report navigation progress
  onProgress({ stage: 'navigating', url });
  await page.goto(url);
  
  // Report DOM ready
  onProgress({ stage: 'dom_ready', text: await getPartialText(page) });
  
  // Wait for dynamic content
  await page.waitForTimeout(2000);
  onProgress({ stage: 'dynamic_loaded', text: await getPartialText(page) });
  
  // Final extraction
  const fullContent = await page.evaluate(() => document.body.innerText);
  onProgress({ stage: 'complete', text: fullContent });
}
```

**Benefits:**
- ✅ Much smaller payloads (text vs images)
- ✅ Useful information (user sees content being found)
- ✅ Easier to implement
- ✅ Lower cost
- ✅ Fits current streaming architecture

**UI Display:**
```
🔍 Scraping example.com...
  ├─ ⏳ Navigating...
  ├─ ✓ DOM loaded (1,234 chars)
  ├─ ⏳ Waiting for dynamic content...
  ├─ ✓ Dynamic content loaded (5,678 chars)
  └─ ✅ Complete (12,345 chars)
```

### Option 2: Single Thumbnail Screenshot (Simple)

Take **one screenshot** at the end (not streaming):

```javascript
// In scrape_web tool
const result = await invokePuppeteerLambda(url, {
  screenshot: true  // 👈 Already supported!
});

// Returns base64 screenshot in result.data.screenshot
// Display in UI as thumbnail
```

**Benefits:**
- ✅ Already implemented!
- ✅ Visual confirmation of page
- ✅ Useful for debugging
- ✅ No streaming complexity

**UI Display:**
```
┌─────────────────────────┐
│ [Thumbnail Screenshot]  │  Content extracted: 12,345 chars
│                         │  Links found: 42
│  example.com            │  Images found: 18
└─────────────────────────┘
```

### Option 3: Video Recording (Post-Mortem)

Record the entire scraping session as a video:

```javascript
// Puppeteer supports video recording
const page = await browser.newPage();

// Start recording
await page.startRecording({
  path: '/tmp/scraping.mp4',
  fps: 5,  // Low FPS for efficiency
});

// Do scraping...

// Stop recording
await page.stopRecording();

// Upload to S3, return URL
```

**Benefits:**
- ✅ Full visibility of scraping process
- ✅ Useful for debugging
- ✅ Reviewable after completion

**Cons:**
- ❌ Large file sizes
- ❌ S3 storage costs
- ❌ Processing time

---

## Recommended Implementation Plan

### Phase 1: Local Development Support (Immediate)

1. **Add local Puppeteer fallback**:

```javascript
// src/tools.js - Modify invokePuppeteerLambda
async function invokePuppeteerLambda(url, options = {}) {
  const puppeteerLambdaArn = process.env.PUPPETEER_LAMBDA_ARN;
  
  // NEW: Check if running locally
  if (process.env.NODE_ENV === 'development' || !puppeteerLambdaArn) {
    console.log('🏠 Running Puppeteer locally (development mode)');
    const localScraper = require('./scrapers/puppeteer-local');
    return await localScraper.scrapePage(url, options);
  }
  
  // Existing Lambda invocation code...
}
```

2. **Create local scraper**:

```javascript
// src/scrapers/puppeteer-local.js
const puppeteer = require('puppeteer');

async function scrapePage(url, options = {}) {
  const browser = await puppeteer.launch({
    headless: options.headless !== false,  // Default true, but can override
    devtools: options.devtools || false,
    slowMo: options.slowMo || 0,
    args: ['--window-size=1920,1080']
  });
  
  // Same scraping logic as Lambda version
  // ...
}

module.exports = { scrapePage };
```

3. **Update package.json**:

```json
{
  "dependencies": {
    "puppeteer": "^23.11.1"  // Add this
  }
}
```

4. **Add dev command to .env**:

```bash
# Development mode
NODE_ENV=development
```

**Result:**
- ✅ See browser locally with `HEADLESS=false make dev`
- ✅ No AWS costs during development
- ✅ Fast iteration

### Phase 2: Progress Updates (Medium Priority)

1. **Modify Puppeteer handler to report progress**:

```javascript
// src/puppeteer-handler.js
async function scrapePage(url, options, onProgress) {
  onProgress({ stage: 'launching' });
  const browser = await puppeteer.launch(...);
  
  onProgress({ stage: 'navigating', url });
  await page.goto(url);
  
  onProgress({ stage: 'extracting' });
  const content = await extractContent(page);
  
  onProgress({ stage: 'complete', result: content });
}
```

2. **Use existing streaming in chat endpoint**:

Your chat endpoint already streams! Just emit progress events:

```javascript
// src/endpoints/chat.js
res.write(`data: ${JSON.stringify({
  type: 'tool_progress',
  tool: 'scrape_web',
  progress: { stage: 'navigating', url: 'example.com' }
})}\n\n`);
```

3. **Update UI to show progress**:

```typescript
// ui-new/src/components/ChatTab.tsx
if (msg.type === 'tool_progress') {
  showProgressIndicator(msg.progress);
}
```

### Phase 3: Screenshot Support (Low Priority)

Only if really needed:

1. **Enable screenshot option**:

```javascript
// Already supported! Just pass screenshot: true
const result = await invokePuppeteerLambda(url, {
  screenshot: true
});
```

2. **Display in UI**:

```typescript
// Show thumbnail after scraping completes
{result.screenshot && (
  <img src={`data:image/png;base64,${result.screenshot}`} />
)}
```

---

## Cost Analysis

### Current Costs (Remote Lambda):

- **Per Invocation**: ~$0.00002 (1GB memory × 3 seconds)
- **Per Month** (1000 scrapes): ~$0.02

### With Screenshot Streaming (10 screenshots/page):

- **Lambda Time**: 10 seconds vs 3 seconds
- **Data Transfer**: 2MB screenshots × 10 = 20MB
- **S3 Storage**: $0.023/GB/month
- **API Gateway**: $0.001/million requests

**Cost Increase**: **~10x higher** for questionable UX benefit

### Recommendation:

**Don't stream screenshots**. Instead:
1. ✅ Use local Puppeteer for development (see browser live)
2. ✅ Add text-based progress updates (cheap, useful)
3. ✅ Optionally add single end-screenshot (visual confirmation)

---

## Summary

| Feature | Status | Recommendation |
|---------|--------|----------------|
| **Local Puppeteer** | ❌ Not implemented | ⭐ **Implement Phase 1** - Essential for development |
| **Visible Browser** | ❌ Impossible in Lambda | ⭐ **Local dev only** with `headless: false` |
| **Screenshot Streaming** | ❌ Not implemented | ⚠️ **Don't implement** - Too complex, costly |
| **Progress Updates** | ❌ Not implemented | ⭐ **Implement Phase 2** - Text-based, useful |
| **Single Screenshot** | ✅ Already supported! | ✅ **Use existing feature** with `screenshot: true` |

## Next Steps

1. **Immediate**: Implement local Puppeteer support for development
2. **This Week**: Add text-based progress updates to scraping
3. **Maybe Later**: Consider single screenshot display in UI
4. **Don't Bother**: Screenshot streaming (not worth the complexity)

---

## Example: Complete Local Dev Setup

```bash
# 1. Install full Puppeteer
npm install puppeteer

# 2. Set development mode in .env
echo "NODE_ENV=development" >> .env

# 3. Create local scraper (see Phase 1 above)
# src/scrapers/puppeteer-local.js

# 4. Run with visible browser
HEADLESS=false make dev

# 5. Test scraping
# Browser window will appear and you'll see it navigate!
```

**Result**: You'll see Chromium open, navigate to the URL, and scrape content in real-time. Perfect for debugging!
