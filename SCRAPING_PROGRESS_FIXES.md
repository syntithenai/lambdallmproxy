# Scraping Progress & Error Display Fixes

## Issues Fixed

### 1. **Scraping Progress Events Not Visible in UI** ✅ FIXED

**Problem**: Progress events were being emitted from backend but not displayed in the chat UI.

**Root Cause**:
- Backend was correctly emitting `tool_progress` events with `tool_name: 'scrape_web_content'`
- UI's `tool_progress` handler only saved events to `transcriptionProgress` state
- Only `transcribe_url` tool had a dedicated progress component

**Solution**:
- Created `ScrapingProgress.tsx` component (similar to `TranscriptionProgress`)
- Added `scrapingProgress` state to track scraping events
- Updated `tool_progress` event handler to route events by `tool_name`:
  - `scrape_web_content` → `scrapingProgress`
  - `transcribe_url` → `transcriptionProgress`
- Render `ScrapingProgress` component when `scrape_web_content` tool is active

**Progress Events Displayed**:
1. 🚀 `scrape_launching` - Launching browser
2. ✅ `scrape_launched` - Browser ready
3. 🌐 `scrape_navigating` - Loading page
4. 📄 `scrape_page_loaded` - Page loaded
5. 📖 `scrape_extracting` - Extracting content
6. ✅ `scrape_extracted` - Content extracted (with stats)
7. 🎉 `scrape_complete` - Complete (with timing)

**Features**:
- Visual progress bar showing current stage
- Real-time stats: character count, links, images
- Error handling with prominent error display
- Collapsible event timeline
- Auto-hides when complete

---

### 2. **No Error Details in Tool Result Blocks** ✅ FIXED

**Problem**: Scraping errors were only visible in LLM response text, not in the tool result UI.

**Root Cause**:
- Tool results displayed `warning` field but not `error` field
- Errors were buried in JSON response without visual prominence

**Solution**:
- Added error display section in `scrape_web_content` tool result block
- Error appears as red alert box above warnings:
  ```tsx
  {scrapeResult.error && (
    <div className="bg-red-50 dark:bg-red-900/30 border border-red-300">
      <span className="font-semibold">❌ Scraping Error:</span>
      <p className="font-mono whitespace-pre-wrap">{scrapeResult.error}</p>
    </div>
  )}
  ```
- Error messages now clearly visible even before LLM response

---

### 3. **403 Forbidden Errors with Puppeteer** ⚠️ PARTIALLY MITIGATED

**Problem**: Sites like Quora return 403 Forbidden when accessed via Puppeteer.

**Root Cause - Bot Detection**:
1. **WebDriver Property**: `navigator.webdriver === true` (dead giveaway)
2. **Basic User Agent**: Generic Chrome UA is easily detected
3. **Missing Browser Headers**: Automated browsers lack realistic headers
4. **Chromium Quirks**: Missing Chrome-specific objects (`window.chrome`, plugins)
5. **Bot Detection Services**: Cloudflare, reCAPTCHA, DataDome, etc.

**Mitigations Applied**:

#### Enhanced Anti-Detection (src/scrapers/puppeteer-local.js):

1. **Randomized User Agents**:
   ```javascript
   const userAgents = [
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...',
     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...',
     'Mozilla/5.0 (X11; Linux x86_64) ...',
     // Firefox variants too
   ];
   ```

2. **Realistic HTTP Headers**:
   ```javascript
   await page.setExtraHTTPHeaders({
     'Accept': 'text/html,application/xhtml+xml,...',
     'Accept-Language': 'en-US,en;q=0.9',
     'Accept-Encoding': 'gzip, deflate, br',
     'Sec-Fetch-Dest': 'document',
     'Sec-Fetch-Mode': 'navigate',
     'Sec-Fetch-Site': 'none',
     'Sec-Fetch-User': '?1',
   });
   ```

3. **JavaScript Fingerprint Masking**:
   ```javascript
   await page.evaluateOnNewDocument(() => {
     // Remove webdriver property
     Object.defineProperty(navigator, 'webdriver', {
       get: () => false,
     });
     
     // Mock Chrome object
     window.chrome = { runtime: {} };
     
     // Mock plugins
     Object.defineProperty(navigator, 'plugins', {
       get: () => [1, 2, 3, 4, 5],
     });
   });
   ```

4. **Better Error Messages**:
   ```javascript
   if (status === 403) {
     throw new Error(`403 Forbidden - The site is blocking automated browsers. 
       The page may have bot detection (Cloudflare, reCAPTCHA, etc.). 
       Try using a different scraping method or tool.`);
   }
   ```

#### Why 403 Still Happens:

**Advanced Bot Detection** (Quora, LinkedIn, etc.):
- **Canvas Fingerprinting**: Browser canvas API generates unique fingerprint
- **WebGL Fingerprinting**: 3D rendering creates device signature  
- **Audio Fingerprinting**: AudioContext API reveals unique audio stack
- **CDP Detection**: Sites detect Chrome DevTools Protocol (how Puppeteer works)
- **Behavioral Analysis**: Mouse movements, timing, scroll patterns
- **Machine Learning**: Sites use ML to detect automation patterns

**Solutions Beyond Basic Stealth**:

1. **puppeteer-extra-plugin-stealth** (Advanced):
   ```bash
   npm install puppeteer-extra puppeteer-extra-plugin-stealth
   ```
   ```javascript
   const puppeteer = require('puppeteer-extra');
   const StealthPlugin = require('puppeteer-extra-plugin-stealth');
   puppeteer.use(StealthPlugin());
   ```

2. **Residential Proxies** (Expensive):
   - Rotate IPs through real residential connections
   - $5-20 per GB of traffic

3. **Browser Automation Detection Test**:
   - Visit: https://bot.sannysoft.com/
   - Shows exactly what sites detect

4. **Alternative Approaches**:
   - **API Access**: Use official APIs when available
   - **RSS Feeds**: Many sites have RSS for content
   - **Archive Services**: Use archive.org, archive.is snapshots
   - **Browser Extensions**: Record requests from real browser
   - **Playwright**: Sometimes better detection evasion than Puppeteer

---

## Files Modified

### Backend:
1. **src/scrapers/puppeteer-local.js**
   - Added user agent rotation (5 variants)
   - Added realistic HTTP headers (10 headers)
   - Added JavaScript fingerprint masking
   - Enhanced error messages with guidance
   - Better navigation error handling

### Frontend:
1. **ui-new/src/components/ScrapingProgress.tsx** (NEW)
   - Full scraping progress component
   - Progress bar with 7 stages
   - Stats display (chars, links, images)
   - Error handling
   - Timeline view

2. **ui-new/src/components/ChatTab.tsx**
   - Import ScrapingProgress component
   - Add `scrapingProgress` state
   - Update `tool_progress` handler to route by tool_name
   - Render ScrapingProgress for scrape_web_content
   - Clear scrapingProgress on new chat
   - Add error display in tool result blocks

---

## Testing

### Test Progress Events:
```bash
# Should now see real-time progress UI
node test-scraping-progress.js https://example.com
```

### Test in Chat UI:
1. Start dev server: `make dev`
2. Ask: "Scrape https://example.com"
3. Watch for progress bar and live updates
4. Check tool result block shows service used

### Test Error Display:
1. Try problematic site: "Scrape https://www.quora.com/..."
2. Should see prominent red error box
3. Error message explains 403 Forbidden issue
4. Guidance provided for alternatives

---

## Known Limitations

### Sites That Will Still Block:
- **Quora** - Advanced fingerprinting + ML detection
- **LinkedIn** - Very aggressive bot detection
- **Instagram/Facebook** - Requires login + strong protection
- **Amazon** - Rate limiting + CAPTCHA challenges
- **Twitter/X** - API-only access enforced

### Recommendations:
1. For news/blogs: Usually works fine
2. For social media: Use official APIs
3. For e-commerce: Respect robots.txt and rate limits
4. For academic: Many have RSS or APIs

### Future Improvements:
1. Add puppeteer-extra-plugin-stealth
2. Implement proxy rotation
3. Add CAPTCHA solver integration
4. Better cache strategy for blocked sites
5. Fallback to archive services

---

## Environment Variables

```bash
# Development mode (enables local Puppeteer)
NODE_ENV=development

# Browser settings
HEADLESS=false     # Show browser window (debugging)
DEVTOOLS=true      # Open DevTools automatically
SLOW_MO=100        # Slow down actions (ms)

# Puppeteer settings
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium  # Optional
```

---

## Usage Notes

**When Progress Shows**:
- Progress bar appears during scraping
- Updates in real-time via SSE
- Auto-hides when complete

**When Errors Show**:
- Red error box in tool result block
- Detailed error message (not generic)
- Guidance for alternatives

**403 Forbidden Guidance**:
- Explained in error message
- Suggests trying different URL
- Recommends checking robots.txt
- Points to alternative approaches
