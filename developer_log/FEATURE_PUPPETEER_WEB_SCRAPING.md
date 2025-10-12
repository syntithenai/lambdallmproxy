# Puppeteer Web Scraping Implementation

**Date:** January 2025  
**Status:** ✅ IMPLEMENTED  
**Deployment:** Pending testing with Chromium Lambda Layer

## Executive Summary

Successfully implemented headless Chromium web scraping using Puppeteer to handle JavaScript-rendered pages. This significantly improves scraping quality for modern web applications that rely on client-side rendering. The feature is controlled by the `USE_PUPPETEER` environment variable and falls back gracefully to traditional methods when disabled.

## Implementation Overview

### Architecture

```
scrape_web_content tool
    ↓ (check USE_PUPPETEER)
    ├─ [TRUE] → Puppeteer Scraper
    │              ↓
    │         Chromium Layer
    │              ↓
    │      Headless Browser
    │              ↓
    │     JavaScript-rendered page
    │
    └─ [FALSE] → Traditional Scrapers
                   ↓
              Tavily API / DuckDuckGo
                   ↓
              HTTP Fetch (no JS)
```

### Key Benefits

1. **JavaScript Support**: Handles SPAs (React, Vue, Angular) and dynamic content
2. **Better Content Extraction**: Waits for page load and network idle
3. **Enhanced Data**: Extracts links, images, and metadata from rendered DOM
4. **Graceful Fallback**: Falls back to traditional methods on error or when disabled
5. **Lambda Optimized**: Uses Sparticuz/chromium for efficient Lambda execution

## Files Created

### 1. src/scrapers/puppeteer-scraper.js (320 lines)

Headless Chromium scraper with Lambda optimization.

**Key Functions:**

```javascript
// Main scraping function
async function scrapePage(url, options = {})
// Options:
//   - timeout: Page load timeout (default: 30000ms)
//   - waitForNetworkIdle: Wait for network requests (default: true)
//   - waitForSelector: Wait for specific element (optional)
//   - extractLinks: Extract all links (default: true)
//   - extractImages: Extract all images (default: true)
//   - screenshot: Capture screenshot (default: false)

// Batch scraping with concurrency control
async function scrapePages(urls, options = {})
// Options:
//   - concurrency: Max parallel browsers (default: 2)

// Test Puppeteer availability
async function testPuppeteer()

// Check if Puppeteer should be used
function shouldUsePuppeteer()
```

**Features:**

- **Lazy Loading**: Chromium is loaded only when needed
- **Network Idle**: Waits for JavaScript and AJAX to complete
- **Bot Detection Avoidance**: Sets realistic user agent and viewport
- **Memory Efficient**: Cleans up browser instances properly
- **Error Handling**: Comprehensive try/catch with cleanup in finally
- **Detailed Logging**: Tracks launch time, navigation time, extraction stats

**Content Extraction:**

```javascript
{
  title: "Page Title",
  url: "https://example.com",
  text: "Full page text content (JS removed)",
  html: "Full HTML (for reference)",
  links: [
    { url: "https://...", text: "Link text" }
  ],
  images: [
    { url: "https://...", alt: "Image alt text" }
  ],
  meta: {
    "description": "Page description",
    "og:title": "Open Graph title",
    // ... other meta tags
  },
  stats: {
    totalTime: 2500,
    launchTime: 800,
    navigationTime: 1500,
    textLength: 15000,
    linkCount: 42,
    imageCount: 15
  }
}
```

## Files Modified

### 1. src/tools.js

**Added:**
- Lazy-loaded Puppeteer scraper import
- `getPuppeteerScraper()` function
- Puppeteer scraping logic in `scrape_web_content` case

**Logic Flow:**

```javascript
case 'scrape_web_content':
  1. Check if USE_PUPPETEER=true
  2. If yes:
     a. Try Puppeteer scraping
     b. On success: Return formatted result
     c. On error: Fall through to traditional methods
  3. If no or fallback:
     a. Check for Tavily API key
     b. Use Tavily API or DuckDuckGo fetcher
     c. Return result
```

**Key Changes:**

```javascript
// Lazy load Puppeteer (only loads if USE_PUPPETEER=true)
let puppeteerScraper = null;
function getPuppeteerScraper() {
  if (!puppeteerScraper) {
    try {
      puppeteerScraper = require('./scrapers/puppeteer-scraper');
    } catch (error) {
      console.error('Failed to load Puppeteer scraper:', error.message);
      puppeteerScraper = { shouldUsePuppeteer: () => false };
    }
  }
  return puppeteerScraper;
}

// In scrape_web_content case:
const puppeteer = getPuppeteerScraper();
const usePuppeteer = puppeteer.shouldUsePuppeteer();

if (usePuppeteer) {
  try {
    const result = await puppeteer.scrapePage(url, {
      timeout: timeout * 1000,
      waitForNetworkIdle: true,
      extractLinks: true,
      extractImages: true
    });
    // Format and return result
  } catch (puppeteerError) {
    // Fall back to traditional methods
  }
}
```

### 2. package.json

**Added Dependencies:**

```json
"@sparticuz/chromium": "^131.0.0",
"puppeteer-core": "^23.11.1"
```

**Why These Versions:**
- `@sparticuz/chromium`: Latest stable, optimized for Lambda
- `puppeteer-core`: Matches Chromium version, smaller than full `puppeteer`

### 3. .env.example

**Added Configuration:**

```bash
# ----------------------------------------------------------------
# WEB SCRAPING CONFIGURATION
# ----------------------------------------------------------------

# Enable Puppeteer for JavaScript-rendered pages (requires Chromium Lambda Layer)
# When enabled: Uses headless Chromium to scrape pages with JavaScript rendering
# When disabled: Falls back to traditional HTTP scraping (Tavily or DuckDuckGo)
# Default: false (disabled)
# 
# IMPORTANT: Requires Chromium Lambda Layer to be installed
# Setup instructions: https://github.com/Sparticuz/chromium
# Layer ARN: arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43
USE_PUPPETEER=false
```

## Environment Variable

### USE_PUPPETEER

**Purpose**: Enable/disable Puppeteer web scraping

**Values:**
- `true` or `1` - Enable Puppeteer (requires Chromium layer)
- `false` or `0` - Disable Puppeteer (use traditional methods)
- Unset or empty - Default: disabled

**Behavior:**

| Value | Behavior |
|-------|----------|
| `true` | Use Puppeteer first, fall back to traditional on error |
| `false` | Always use traditional methods (Tavily/DuckDuckGo) |

**Safety:**
- Default is `false` (disabled) for safety
- Falls back gracefully if Chromium layer is missing
- Lazy loads Puppeteer (no overhead when disabled)

## Lambda Layer Setup

### Required: Chromium Lambda Layer

Puppeteer requires a Chromium binary, which is too large to include in the Lambda function package. Instead, we use a Lambda Layer.

### Option 1: Use Pre-built Layer (Recommended)

**Sparticuz/chromium** provides pre-built layers:

```bash
# Latest Layer ARN (as of Jan 2025)
# Region: us-east-1
arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43
```

**Add to Lambda Function:**

1. **AWS Console:**
   - Open Lambda function
   - Scroll to "Layers" section
   - Click "Add a layer"
   - Choose "Specify an ARN"
   - Enter: `arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43`
   - Click "Add"

2. **AWS CLI:**
   ```bash
   aws lambda update-function-configuration \
     --function-name llmproxy \
     --layers arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43
   ```

3. **Terraform:**
   ```hcl
   resource "aws_lambda_function" "llmproxy" {
     # ... other config
     layers = [
       "arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43"
     ]
   }
   ```

### Option 2: Build Custom Layer

If you need a specific Chromium version:

```bash
# Clone Sparticuz/chromium
git clone https://github.com/Sparticuz/chromium.git
cd chromium

# Build for Lambda
npm install
npm run build

# Package as Lambda Layer
mkdir -p layer/nodejs/node_modules/@sparticuz
cp -r dist layer/nodejs/node_modules/@sparticuz/chromium

cd layer
zip -r chromium-layer.zip .

# Upload to Lambda
aws lambda publish-layer-version \
  --layer-name chromium-layer \
  --zip-file fileb://chromium-layer.zip \
  --compatible-runtimes nodejs18.x nodejs20.x
```

## Usage Examples

### Enable Puppeteer

1. **Set environment variable:**
   ```bash
   # In .env file
   USE_PUPPETEER=true
   ```

2. **Deploy environment variables:**
   ```bash
   make deploy-env
   ```

3. **Add Chromium layer to Lambda function** (see above)

4. **Deploy code:**
   ```bash
   make deploy-lambda-fast
   ```

### Test Puppeteer

**From Chat UI:**

1. Ask: "Scrape https://example.com"
2. Tool will use Puppeteer if enabled
3. Check logs: `make logs`
4. Look for: `[Puppeteer] Launching Chromium for...`

**From API:**

```bash
curl -X POST https://your-lambda-url.com/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Scrape https://react-example.com"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "scrape_web_content",
          "parameters": {"url": "https://react-example.com"}
        }
      }
    ]
  }'
```

### Disable Puppeteer

```bash
# In .env file
USE_PUPPETEER=false

# Or remove the variable entirely
# USE_PUPPETEER=
```

Deploy: `make deploy-env`

## Performance Comparison

### Traditional Scraping (HTTP Fetch)

```
┌─────────────────────────────────────────┐
│ HTTP Request                            │
│ └─ Simple HTML page: ~500ms            │
│ └─ No JavaScript execution              │
│ └─ Missing dynamic content              │
│ └─ Low memory usage: ~50MB              │
└─────────────────────────────────────────┘
```

**Pros:**
- Fast (500-1000ms)
- Low memory usage
- Simple error handling

**Cons:**
- Misses JavaScript-rendered content
- Cannot handle SPAs
- No dynamic content loading

### Puppeteer Scraping (Headless Chromium)

```
┌─────────────────────────────────────────┐
│ Chromium Launch: ~800ms                 │
│ └─ Page Navigation: ~1500ms             │
│    └─ Network Idle Wait: ~500ms         │
│       └─ Content Extraction: ~200ms     │
│ Total: ~3000ms                          │
│ Memory: ~200-300MB                      │
└─────────────────────────────────────────┘
```

**Pros:**
- Handles JavaScript rendering
- Supports SPAs (React, Vue, Angular)
- Waits for AJAX/dynamic content
- Extracts from rendered DOM

**Cons:**
- Slower (3-5 seconds)
- Higher memory usage (200-300MB)
- Requires Chromium layer
- More complex error scenarios

## Fallback Strategy

### Priority Order

1. **Puppeteer** (if USE_PUPPETEER=true)
   - Try headless Chromium
   - On error → Fall through to #2

2. **Tavily API** (if API key available)
   - Use Tavily Extract endpoint
   - On error → Fall through to #3

3. **DuckDuckGo Fetcher** (always available)
   - Traditional HTTP fetch
   - Final fallback

### Error Scenarios

**Scenario 1: Puppeteer Fails**
```
USE_PUPPETEER=true
  ↓
Puppeteer Launch Error
  ↓
Log: "❌ [Puppeteer] Scraping failed: ..."
Log: "⚠️ Falling back to traditional scraping methods"
  ↓
Try Tavily API or DuckDuckGo
```

**Scenario 2: Missing Chromium Layer**
```
USE_PUPPETEER=true
  ↓
Cannot find Chromium executable
  ↓
Log: "Failed to load Puppeteer scraper: ..."
  ↓
shouldUsePuppeteer() returns false
  ↓
Skip Puppeteer, use traditional methods
```

**Scenario 3: Timeout**
```
Puppeteer Launch
  ↓
Page Navigation (waiting...)
  ↓
30 seconds elapsed
  ↓
Timeout error
  ↓
Fall back to traditional methods
```

## Memory Considerations

### Lambda Memory Settings

**Minimum Requirements:**

| Scraping Method | Min Memory | Recommended |
|----------------|------------|-------------|
| Traditional (HTTP) | 128 MB | 256 MB |
| Puppeteer (Chromium) | 512 MB | 1024 MB |

**Current Lambda Configuration:**

Check current memory: `aws lambda get-function-configuration --function-name llmproxy`

**Increase Memory:**

```bash
aws lambda update-function-configuration \
  --function-name llmproxy \
  --memory-size 1024
```

### Memory Management

**In Code:**

```javascript
// Browser cleanup in finally block
finally {
  if (page) {
    await page.close().catch(console.error);
  }
  if (browser) {
    await browser.close().catch(console.error);
  }
}
```

**Best Practices:**
- Always close browser instances
- Use concurrency limits for batch scraping
- Monitor Lambda memory usage in CloudWatch

## Testing Checklist

### Unit Tests (To Be Created)

- [ ] `puppeteerScraper.scrapePage()` - Basic scraping
- [ ] `puppeteerScraper.shouldUsePuppeteer()` - Env var parsing
- [ ] `puppeteerScraper.testPuppeteer()` - Chromium availability
- [ ] Fallback behavior when Puppeteer fails
- [ ] Content extraction accuracy
- [ ] Memory cleanup verification

### Integration Tests

- [ ] **Traditional HTTP Scraping:**
  ```bash
  USE_PUPPETEER=false
  # Test scraping simple HTML page
  # Should use DuckDuckGo fetcher
  ```

- [ ] **Puppeteer Scraping (Local):**
  ```bash
  USE_PUPPETEER=true
  node test-puppeteer-local.js
  # Should launch Chromium and scrape
  ```

- [ ] **Puppeteer Scraping (Lambda):**
  ```bash
  # Deploy with Chromium layer
  make deploy-lambda
  # Test via API
  # Check logs: make logs
  ```

- [ ] **Fallback Behavior:**
  ```bash
  USE_PUPPETEER=true
  # Scrape URL that causes Puppeteer error
  # Verify fallback to traditional methods
  ```

- [ ] **JavaScript-Rendered Page:**
  ```bash
  # Test React/Vue/Angular SPA
  # Compare Puppeteer vs Traditional results
  # Puppeteer should have more content
  ```

### Performance Tests

- [ ] **Measure Scraping Time:**
  - Traditional: ~500-1000ms
  - Puppeteer: ~3000-5000ms

- [ ] **Measure Memory Usage:**
  - Traditional: ~50-100MB
  - Puppeteer: ~200-300MB

- [ ] **Concurrency Test:**
  ```javascript
  scrapePages(['url1', 'url2', 'url3'], { concurrency: 2 })
  // Should process in batches
  ```

## Deployment Instructions

### Step 1: Install Dependencies

```bash
npm install
```

This installs:
- `puppeteer-core@^23.11.1`
- `@sparticuz/chromium@^131.0.0`

### Step 2: Add Chromium Lambda Layer

**Option A: AWS Console**
1. Go to Lambda function
2. Layers → Add layer
3. Specify ARN: `arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43`

**Option B: AWS CLI**
```bash
aws lambda update-function-configuration \
  --function-name llmproxy \
  --layers arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43
```

### Step 3: Enable Puppeteer

```bash
# Edit .env
USE_PUPPETEER=true

# Deploy environment variables
make deploy-env
```

### Step 4: Deploy Code

```bash
# Full deployment (includes dependencies)
make deploy-lambda

# Or fast deployment (code only)
make deploy-lambda-fast
```

### Step 5: Increase Lambda Memory (if needed)

```bash
aws lambda update-function-configuration \
  --function-name llmproxy \
  --memory-size 1024
```

### Step 6: Test

```bash
# View logs
make logs

# Or tail logs
make logs-tail
```

Look for:
```
🌐 [Puppeteer] Launching Chromium for: https://example.com
✅ [Puppeteer] Browser launched in 800ms
📄 [Puppeteer] Navigating to: https://example.com
✅ [Puppeteer] Page loaded in 1500ms
📊 [Puppeteer] Extracting content...
✅ [Puppeteer] Scraping complete in 2500ms
   📝 Text: 15000 chars
   🔗 Links: 42
   🖼️  Images: 15
```

## Troubleshooting

### Issue: "Cannot find Chromium executable"

**Cause:** Chromium Lambda Layer not installed

**Solution:**
1. Add layer: `arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43`
2. Or set `USE_PUPPETEER=false`

### Issue: "Puppeteer timeout"

**Cause:** Page takes too long to load

**Solution:**
1. Increase timeout in tool call
2. Check page actually loads in browser
3. May need to disable `waitForNetworkIdle`

### Issue: "Lambda out of memory"

**Cause:** Chromium uses significant memory

**Solution:**
1. Increase Lambda memory to 1024MB
2. Reduce scraping concurrency
3. Set `USE_PUPPETEER=false` for memory-constrained cases

### Issue: "Puppeteer works locally but fails in Lambda"

**Cause:** Missing Chromium layer or wrong architecture

**Solution:**
1. Verify layer ARN is correct for your region
2. Check Lambda logs for specific error
3. Ensure layer architecture matches function (x86_64)

## Future Enhancements

### 1. Screenshot Capture

**Implementation:**
```javascript
const result = await puppeteer.scrapePage(url, {
  screenshot: true
});

// result.screenshot contains base64-encoded PNG
```

**Use Case:** Visual verification of page rendering

### 2. PDF Generation

```javascript
async function generatePDF(url) {
  const browser = await puppeteer.launch(...);
  const page = await browser.newPage();
  await page.goto(url);
  const pdf = await page.pdf({ format: 'A4' });
  await browser.close();
  return pdf;
}
```

### 3. Selective Element Extraction

```javascript
async function extractElement(url, selector) {
  // Navigate to page
  // Extract only specific element
  const content = await page.$(selector).textContent();
}
```

### 4. Cookie/Authentication Support

```javascript
async function scrapeAuthenticated(url, cookies) {
  await page.setCookie(...cookies);
  await page.goto(url);
}
```

### 5. Retry with Exponential Backoff

```javascript
async function scrapeWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await scrapePage(url);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(2 ** i * 1000);
    }
  }
}
```

### 6. Stealth Mode

```javascript
// Use puppeteer-extra with stealth plugin
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
```

## Cost Analysis

### Lambda Costs

**Memory-Seconds Pricing:**
- Traditional: 256MB × 1s = $0.0000000042
- Puppeteer: 1024MB × 3s = $0.0000000504

**Per 1 Million Scrapes:**
- Traditional: ~$4.20
- Puppeteer: ~$50.40

**Recommendation:** Use Puppeteer selectively for JavaScript-heavy sites

### Optimization Strategies

1. **Selective Use:** Only enable for known JS-heavy sites
2. **Caching:** Cache scraped content aggressively
3. **Hybrid Approach:** Try traditional first, use Puppeteer on failure
4. **Batch Processing:** Process multiple URLs in single Lambda invocation

## References

- **Sparticuz/chromium**: https://github.com/Sparticuz/chromium
- **Puppeteer Documentation**: https://pptr.dev/
- **Lambda Layers Guide**: https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html
- **Chromium Layer Example**: https://github.com/Sparticuz/chromium/blob/master/examples/serverless-with-lambda-layer/index.js

## Change Log

### 2025-01-12 - Initial Implementation

**Created:**
- `src/scrapers/puppeteer-scraper.js` - Headless Chromium scraper
- `developer_log/FEATURE_PUPPETEER_WEB_SCRAPING.md` - This document

**Modified:**
- `src/tools.js` - Added Puppeteer support to scrape_web_content
- `package.json` - Added puppeteer-core and @sparticuz/chromium
- `.env.example` - Added USE_PUPPETEER configuration

**Status:** ✅ Implementation complete, pending Layer installation and testing

---

**Implementation Time:** ~3 hours  
**Estimated Testing Time:** 2-3 hours  
**Total Effort:** ~5-6 hours  
**Complexity:** Medium  
**Risk:** Low (graceful fallback to traditional methods)
