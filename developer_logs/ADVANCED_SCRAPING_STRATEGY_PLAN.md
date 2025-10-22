# Advanced Scraping Strategy Plan
**Status**: Planning Phase - NO IMPLEMENTATION YET

## Executive Summary

This plan outlines a comprehensive, tiered web scraping strategy that:
1. Minimizes costs by using lightweight methods first
2. Escalates to more powerful (expensive) tools only when needed
3. Provides interactive CAPTCHA solving capabilities
4. Categorizes sites by difficulty and adjusts strategy accordingly
5. Supports multiple automation frameworks (Puppeteer, Playwright, Selenium)

---

## 1. Browser Automation Technology Comparison

### 1.1 Puppeteer (Current)
**Pros**:
- ✅ Fast and lightweight
- ✅ Excellent CDP (Chrome DevTools Protocol) integration
- ✅ Good for simple scraping
- ✅ Low memory footprint (~50-100MB)
- ✅ Native Chrome/Chromium support
- ✅ puppeteer-extra-plugin-stealth available

**Cons**:
- ❌ CDP is detectable by advanced bot detection
- ❌ Limited cross-browser support (Chrome/Chromium only)
- ❌ Harder to hide automation signals
- ❌ `navigator.webdriver` always exists (even if set to false)

**Best For**: Simple sites, news sites, blogs, documentation

**Cost**: ~0.5-1 second per page, ~50-100MB RAM

---

### 1.2 Playwright (Recommended Alternative) ⭐
**Pros**:
- ✅ Better stealth than Puppeteer (more refined anti-detection)
- ✅ **playwright-extra + playwright-extra-plugin-stealth available** 🔒
- ✅ Multi-browser support (Chrome, Firefox, WebKit)
- ✅ Built-in network interception
- ✅ Better mobile emulation
- ✅ Active development by Microsoft
- ✅ More reliable cross-platform
- ✅ Built-in screenshot/PDF generation
- ✅ Better handling of modern web frameworks

**Cons**:
- ❌ Still uses CDP for Chrome (detectable)
- ❌ Slightly heavier than Puppeteer (~100-150MB)
- ❌ Requires multiple browser binaries for multi-browser support
- ⚠️ **Local-only** (too large for deployed Lambda)

**Best For**: Modern web apps, SPAs, sites with complex JavaScript

**Cost**: ~0.7-1.5 seconds per page, ~100-150MB RAM

**Why Better Than Puppeteer**:
- More sophisticated default stealth
- **playwright-extra-plugin-stealth** provides comprehensive evasion
- Better handling of async operations
- More reliable across different sites
- Active security updates

**🔒 MUST USE**: `playwright-extra` + `playwright-extra-plugin-stealth` for Tier 2

---

### 1.3 Selenium + Undetected-ChromeDriver (Most Powerful) ⭐⭐
**Pros**:
- ✅ Most mature (15+ years)
- ✅ Huge ecosystem and community
- ✅ **undetected-chromedriver patches Chrome to evade detection** 🔒
- ✅ Best stealth potential (uses WebDriver, not CDP)
- ✅ Multi-browser support (Chrome, Firefox, Edge, Safari)
- ✅ Can use real Firefox (no CDP detection)
- ✅ Extensive anti-detection plugins
- ✅ Better for interactive sessions
- ✅ **Bypasses Cloudflare, DataDome, PerimeterX**

**Cons**:
- ❌ Slower than Puppeteer/Playwright (~2-3x)
- ❌ More complex setup
- ❌ Higher memory usage (~200-300MB)
- ❌ Requires separate driver binaries
- ⚠️ **Local-only** (too large for deployed Lambda)
- ⚠️ **Python required** for undetected-chromedriver

**Best For**: Sites with aggressive bot detection (Quora, LinkedIn, Cloudflare, etc.)

**Cost**: ~2-4 seconds per page, ~200-300MB RAM

**Why Better for Anti-Detection**:
- **undetected-chromedriver** automatically patches Chrome to remove automation traces
- Firefox WebDriver is harder to detect than CDP
- More mature anti-fingerprinting techniques
- Better extension support (can load real user extensions)

**🔒 MUST USE**: `undetected-chromedriver` (Python) for Tier 3, NOT standard Selenium WebDriver

---

### 1.4 Required Stealth Plugins Summary

**CRITICAL**: Standard Puppeteer/Playwright/Selenium are easily detected. **MUST** use stealth plugins:

| Tier | Framework | Required Plugin/Library | Why Required |
|------|-----------|-------------------------|--------------|
| **Tier 1** | Puppeteer | `puppeteer-extra` + `puppeteer-extra-plugin-stealth` | Masks CDP, webdriver, Chrome runtime |
| **Tier 2** | Playwright | `playwright-extra` + `playwright-extra-plugin-stealth` | Same as above, better evasion |
| **Tier 3** | Selenium | `undetected-chromedriver` (Python) | Patches Chrome binary, best evasion |

**Installation Commands**:
```bash
# Tier 1 (Puppeteer)
npm install puppeteer-extra puppeteer-extra-plugin-stealth

# Tier 2 (Playwright) - DEV ONLY
npm install --save-dev playwright-extra playwright-extra-plugin-stealth

# Tier 3 (Selenium) - DEV ONLY
pip install undetected-chromedriver selenium
```

### 1.5 Other Options (Not Recommended)

#### **Nodriver** (Python, New)
- Pure Python implementation
- No WebDriver or CDP
- Still experimental
- Not battle-tested

#### **Browser Use** (High-level)
- Uses Playwright internally
- AI-powered navigation
- Overkill for simple scraping

---

## 2. What Makes Automation Detectable?

### 2.1 Detection Vectors

| Vector | Puppeteer | Playwright | Selenium | Real User |
|--------|-----------|------------|----------|-----------|
| **navigator.webdriver** | true (hidden) | true (hidden) | true | false |
| **CDP Detection** | ✗ Detectable | ✗ Detectable | ✓ No CDP | ✓ No CDP |
| **Chrome.runtime** | Missing | Missing | Can add | Present |
| **Permissions API** | Inconsistent | Better | Variable | Normal |
| **WebGL Vendor** | Swiftshader | Swiftshader | Can be real | Real GPU |
| **Canvas Fingerprint** | Consistent | Consistent | Can vary | Unique |
| **Audio Context** | Same | Same | Can vary | Unique |
| **Plugin Array** | Empty/Fake | Empty/Fake | Can load real | Real plugins |
| **Timezone/Locale** | Can spoof | Can spoof | Can spoof | Real |
| **Mouse Movements** | None/Fake | None/Fake | None/Fake | Human-like |
| **Timing Patterns** | Robotic | Robotic | Robotic | Variable |

### 2.2 What's Different from Manual Clicking?

**Key Differences**:

1. **No Mouse Movement**
   - Automation: Clicks happen instantly at exact coordinates
   - Real user: Mouse moves gradually, overshoots, corrects

2. **Perfect Timing**
   - Automation: Actions at precise millisecond intervals
   - Real user: Variable delays, pauses to read, hesitates

3. **No Scrolling**
   - Automation: Often scrolls programmatically (instant)
   - Real user: Smooth scrolling, reads while scrolling

4. **No Errors**
   - Automation: Perfect clicks, no mis-clicks
   - Real user: Occasional mis-clicks, corrections

5. **Browser Fingerprint**
   - Automation: Generic/fake fingerprint
   - Real user: Unique fingerprint (GPU, fonts, plugins)

6. **Network Patterns**
   - Automation: All resources loaded, in order
   - Real user: Ad blockers, extensions modify requests

7. **Focus Events**
   - Automation: Window always focused
   - Real user: Tabs in background, switches focus

**The Fundamental Problem**:
Even if you control the browser locally, the *automation protocol itself* (CDP, WebDriver) is detectable. Sites can detect:
- CDP endpoints being active
- WebDriver endpoints
- Automation-specific browser flags
- Lack of real user behavior patterns

---

## 3. CAPTCHA Interaction Design

### 3.1 Interactive Mode Architecture

```
┌─────────────────────────────────────────────────────┐
│  Scraping Flow                                      │
├─────────────────────────────────────────────────────┤
│  1. Attempt automated scrape                        │
│  2. Detect CAPTCHA/block (status code, page content)│
│  3. IF detected:                                    │
│     a. Keep browser open                            │
│     b. Notify user via UI                           │
│     c. Wait for user interaction                    │
│     d. Continue scraping after solve                │
└─────────────────────────────────────────────────────┘
```

### 3.2 CAPTCHA Detection Methods

**Indicators**:
- HTTP status: 403, 429
- Page title contains: "captcha", "verify", "human", "robot"
- Page contains elements: `<div class="g-recaptcha">`, `<iframe src="recaptcha">`
- Cloudflare challenge page detected
- Redirect to `/captcha` or `/verify`

### 3.3 User Interaction Flow

**UI Flow**:
```
1. Chat message appears: "🤖 CAPTCHA detected on example.com"
2. Show button: "Open Browser to Solve"
3. Launch visible browser (headless=false)
4. Browser opens at CAPTCHA page
5. User solves CAPTCHA manually
6. System detects successful solve (page change/cookie set)
7. Resume automated scraping with valid session
8. Return results to chat
```

**Implementation Options**:

**Option A: Local Browser** (Development)
- Launch visible Chromium window
- User solves on their machine
- Easy for development
- Only works locally

**Option B: Remote Browser** (Production)
- Use BrowserStack/LambdaTest/Selenium Grid
- User sees VNC-like interface in chat UI
- Works in production Lambda
- Requires paid service (~$30-100/month)

**Option C: Browser Extension** (Hybrid)
- User installs browser extension
- Extension connects to Lambda via WebSocket
- Extension opens tab, solves CAPTCHA, sends cookies
- Free but requires user setup

**Recommended**: Option A for local dev, Option C for production (free)

---

## 3.4 Login-Required Sites Handling

Many sites require authentication before allowing access to content. These should be handled similarly to CAPTCHAs.

### 3.4.1 Login Detection Methods

**Indicators**:
- HTTP redirects to `/login`, `/signin`, `/auth`
- HTTP status: 401 (Unauthorized), 403 (Forbidden with login prompt)
- Page title contains: "sign in", "log in", "authenticate", "login required"
- Page contains elements: `<form action="login">`, `input[type="password"]`, `.login-form`
- Content body is suspiciously small (< 1KB) with auth keywords
- Common login walls: "Sign in to continue", "Login to view", "Members only"

**Site-Specific Detection**:
- **LinkedIn**: Redirects to `linkedin.com/login`, shows "Join now" overlay
- **Medium**: Shows "Member-only story" paywall
- **Twitter/X**: Redirects to `twitter.com/i/flow/login`
- **GitHub**: Some repos/pages redirect to `github.com/login`
- **Patreon**: "Log in to view this post"

### 3.4.2 User Interaction Flow

**UI Flow** (similar to CAPTCHA):
```
1. Chat message appears: "🔐 Login required on linkedin.com"
2. Show button: "Open Browser to Login"
3. Launch visible browser (headless=false) at login page
4. User logs in manually
5. System waits for successful login (redirect to original URL)
6. Save session cookies to cache
7. Resume scraping with authenticated session
8. Return results to chat
```

**Session Persistence**:
- Save cookies to file: `~/.cache/lambdallmproxy/sessions/{domain}.json`
- Cookie format:
```json
{
  "domain": "linkedin.com",
  "cookies": [...],
  "expiresAt": "2025-12-31T23:59:59Z",
  "createdAt": "2025-10-21T12:00:00Z"
}
```
- Reuse session for subsequent requests to same domain
- Expire sessions after 30 days or when cookies expire
- Clear session if scrape fails with 401/403 (session invalidated)

### 3.4.3 Login Success Detection

**Indicators of Successful Login**:
- URL changes from `/login` to original target URL
- Presence of auth cookies: `session`, `auth_token`, `access_token`, `PHPSESSID`
- Page title no longer contains "login" keywords
- Profile/account elements appear in DOM: `.user-menu`, `.profile-icon`, `.account-dropdown`
- Redirect to originally requested URL

**Timeout**: 
- Wait up to 5 minutes for user to complete login
- Show countdown timer in UI: "Waiting for login... (4:32 remaining)"
- If timeout, return error with option to retry

### 3.4.4 Security Considerations

**Session Storage**:
- Store cookies encrypted at rest
- Never log or transmit sensitive cookie values
- Respect `HttpOnly` and `Secure` flags
- Clear sessions on user logout/reset

**Privacy**:
- User controls which sites to save sessions for
- Option to "Login once" (don't save) vs "Remember session"
- Clear warning: "Your login cookies will be stored locally"

---

## 4. Tiered Scraping Strategy

### 4.1 Scraping Tiers

**Tier 0: Direct HTTP** (Cheapest)
- **Method**: Simple HTTP request with DuckDuckGo/proxy
- **Cost**: ~100-200ms, ~10MB RAM
- **Success Rate**: 60-70% of sites
- **Use For**: Static content, news, blogs
- **Fallback If**: 403, 429, empty content, JavaScript required

**Tier 1: Puppeteer + Stealth Plugin** (Fast) ✅ Production
- **Method**: `puppeteer-extra` + `puppeteer-extra-plugin-stealth`
- **Cost**: ~0.5-1s, ~50-100MB RAM
- **Success Rate**: 80-85% of sites
- **Use For**: Simple dynamic sites, SPAs, most news/blogs
- **Fallback If**: 403, CAPTCHA detected, CDP detection
- **🔒 REQUIRED**: Must use `puppeteer-extra-plugin-stealth`, NOT standard puppeteer
- **Deployment**: Production Lambda + Local

**Tier 2: Playwright + Stealth Plugin** (Balanced) ⚠️ Local Only
- **Method**: `playwright-extra` + `playwright-extra-plugin-stealth`
- **Cost**: ~0.7-1.5s, ~100-150MB RAM
- **Success Rate**: 85-90% of sites
- **Use For**: Modern web apps, complex JavaScript, better evasion than Puppeteer
- **Fallback If**: 403, CAPTCHA, heavy protection
- **🔒 REQUIRED**: Must use `playwright-extra-plugin-stealth`, NOT standard playwright
- **Deployment**: Local development ONLY (too large for Lambda)

**Tier 3: Selenium + Undetected-ChromeDriver** (Most Powerful) ⚠️ Local Only
- **Method**: `undetected-chromedriver` (Python) + Selenium
- **Cost**: ~2-4s, ~200-300MB RAM
- **Success Rate**: 90-95% of sites (bypasses Cloudflare, DataDome)
- **Use For**: Sites with aggressive bot detection (Quora, LinkedIn, Cloudflare)
- **Fallback If**: CAPTCHA, manual verification required
- **🔒 REQUIRED**: Must use `undetected-chromedriver`, NOT standard selenium-webdriver
- **Deployment**: Local development ONLY (requires Python + patches Chrome binary)

**Tier 4: Interactive Mode** (Manual) - LOCAL ONLY
- **Method**: Visible browser, user solves CAPTCHA/login
- **Required**: Any browser automation tool (Puppeteer/Playwright/Selenium)
- **Cost**: Variable (user time), ~200-300MB RAM
- **Success Rate**: 99% (user can solve anything)
- **Use For**: When all automation fails, login required, CAPTCHA
- **Note**: LOCAL ONLY - Requires display server (X11/Wayland)

---

### 4.1.1 Deployment Constraints

**⚠️ IMPORTANT: Tier Availability by Environment**

**Production Lambda (AWS Deployed)**:
- ✅ **Tier 0: Direct HTTP** - Fully supported
- ✅ **Tier 1: Puppeteer** - Fully supported (with Lambda Layer)
- ❌ **Tier 2: Playwright** - NOT available (binary size limits)
- ❌ **Tier 3: Selenium** - NOT available (binary size limits)
- ❌ **Tier 4: Interactive** - NOT available (no display, requires local browser)

**Local Development (Running Lambda Locally)**:
- ✅ **Tier 0: Direct HTTP** - Fully supported
- ✅ **Tier 1: Puppeteer** - Fully supported
- ✅ **Tier 2: Playwright** - Fully supported
- ✅ **Tier 3: Selenium** - Fully supported
- ✅ **Tier 4: Interactive** - Fully supported (opens local browser)

**Why These Limits?**

| Constraint | Reason |
|------------|--------|
| Lambda size limit | AWS Lambda deployment package max: 250MB unzipped, 50MB zipped |
| Puppeteer layer | Chrome binary already consumes ~150MB of Lambda size |
| Playwright binaries | Requires 3 browsers (Chrome + Firefox + WebKit) = ~400MB |
| Selenium drivers | ChromeDriver + dependencies = ~100MB extra |
| Interactive mode | Requires X11/display server, not available in Lambda runtime |
| Local advantages | No size limits, can install any binaries, has display for interactive mode |

**Fallback Strategy**:
- Production Lambda will **max out at Tier 1**
- If Tier 2+ needed, fallback chain stops at Tier 1 and returns error
- Error message should suggest: "Run locally for advanced scraping (Playwright/Selenium)"
- Users running locally get full Tier 0-4 capability

**Environment Detection**:
```javascript
const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const IS_LOCAL = !IS_LAMBDA;
const MAX_TIER = IS_LAMBDA ? 1 : 4; // Production Lambda limited to Tier 0-1
```

---

### 4.2 Fallback Chain Logic

```javascript
async function scrapePage(url, options = {}) {
  const siteCategory = categorizeSite(url);
  const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const MAX_TIER = IS_LAMBDA ? 1 : 4; // Production limited to Tier 0-1
  
  // Check for existing session (login cookies)
  const session = await loadSession(url);
  if (session) {
    options.cookies = session.cookies;
  }
  
  // Determine starting tier based on site category
  const startTier = siteCategory === 'high-protection' ? (IS_LAMBDA ? 1 : 3) : 0;
  
  for (let tier = startTier; tier <= MAX_TIER; tier++) {
    try {
      let result;
      switch (tier) {
        case 0:
          result = await directHttpScrape(url, options);
          break;
        case 1:
          result = await puppeteerScrape(url, options);
          break;
        case 2:
          result = await playwrightScrape(url, options);
          break;
        case 3:
          result = await seleniumScrape(url, options);
          break;
        case 4:
          result = await interactiveScrape(url, options);
          break;
      }
      
      // Check for login requirement
      if (requiresLogin(result)) {
        console.log('Login detected, switching to interactive mode');
        return await handleLoginRequired(url, options);
      }
      
      return result;
      
    } catch (error) {
      // Check if error indicates we should try next tier
      if (shouldEscalate(error, tier)) {
        console.log(`Tier ${tier} failed, escalating to tier ${tier + 1}`);
        continue;
      }
      
      // Check for login requirement in error
      if (error.requiresLogin) {
        return await handleLoginRequired(url, options);
      }
      
      throw error;
    }
  }
  
  // If we hit MAX_TIER and still failed
  throw new Error(`All tiers exhausted (max: ${MAX_TIER}). ${IS_LAMBDA ? 'Try running locally for Tier 2-4.' : ''}`);
}

function shouldEscalate(error, currentTier) {
  const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const MAX_TIER = IS_LAMBDA ? 1 : 4;
  
  // Don't escalate if we're already at max tier for this environment
  if (currentTier >= MAX_TIER) {
    return false;
  }
  
  // 403, 429, CAPTCHA detection, bot detection
  const shouldTryNextTier = error.status === 403 || 
                            error.status === 429 ||
                            error.message.includes('CAPTCHA') ||
                            error.message.includes('bot detected');
  
  // If on deployed Lambda and escalation would require Tier 2+, return false
  if (IS_LAMBDA && currentTier >= 1 && shouldTryNextTier) {
    // Set a flag that can be checked by caller
    error.requiresLocalEnvironment = true;
    error.suggestedAction = 'This site requires Playwright, Selenium, or Interactive mode (Tier 2-4), which are only available when running locally. Please run the Lambda locally or use a third-party scraping service.';
    return false;
  }
  
  return shouldTryNextTier;
}

function requiresLogin(result) {
  // Check response for login indicators
  const indicators = [
    result.url?.includes('/login'),
    result.url?.includes('/signin'),
    result.status === 401,
    result.html?.includes('sign in to continue'),
    result.html?.includes('login required'),
    result.html?.includes('members only'),
    result.html?.match(/<form[^>]*action=["'][^"']*login/i),
    result.html?.match(/<input[^>]*type=["']password/i)
  ];
  
  return indicators.filter(Boolean).length >= 2; // At least 2 indicators
}

async function handleLoginRequired(url, options) {
  const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const domain = new URL(url).hostname;
  
  if (IS_LAMBDA) {
    // Provide detailed error message for deployed Lambda
    const error = new Error(
      `Login required for ${domain}. Interactive mode (Tier 4) is not available in the deployed Lambda environment. ` +
      `To scrape this site, either: ` +
      `(1) Run the Lambda locally with interactive mode enabled, ` +
      `(2) Manually save session cookies to ~/.cache/lambdallmproxy/sessions/${domain}.json and deploy with SESSION_COOKIE_* environment variables, or ` +
      `(3) Use a third-party scraping service that handles authentication.`
    );
    error.code = 'LOGIN_REQUIRED';
    error.requiresLocalEnvironment = true;
    error.domain = domain;
    throw error;
  }
  
  // Launch interactive mode (Tier 4) for login when running locally
  console.log(`[Local Mode] Opening interactive browser for ${domain} login...`);
  return await interactiveScrape(url, { 
    ...options, 
    reason: 'login',
    saveSession: true,
    headless: false // Force visible browser for login
  });
}

async function loadSession(url) {
  const domain = new URL(url).hostname;
  const sessionFile = `~/.cache/lambdallmproxy/sessions/${domain}.json`;
  
  try {
    const session = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
    if (new Date(session.expiresAt) > new Date()) {
      return session;
    }
  } catch (e) {
    // No session or expired
  }
  return null;
}
```

---

## 5. Site Categorization System

### 5.1 Protection Level Categories

**Category A: Low Protection** (Start Tier 0)
- News sites (CNN, BBC, Reuters)
- Blogs (Medium, WordPress)
- Documentation (GitHub, ReadTheDocs)
- Public APIs
- Government sites

**Category B: Medium Protection** (Start Tier 1)
- E-commerce (smaller sites)
- Social media (Twitter public pages)
- Forums (Reddit, Stack Overflow)
- Corporate websites

**Category C: High Protection** (Start Tier 3)
- **Quora** (aggressive fingerprinting)
- **LinkedIn** (requires login)
- **Amazon** (rate limiting + CAPTCHA)
- **eBay** (bot detection)
- **Instagram/Facebook** (requires login + CAPTCHA)
- **Cloudflare-protected** (many sites)

### 5.2 Auto-Detection

**Heuristics for Auto-Categorization**:

```javascript
function categorizeSite(url) {
  const domain = new URL(url).hostname;
  
  // Check known problematic domains
  const highProtection = [
    'quora.com', 'linkedin.com', 'amazon.com', 'ebay.com',
    'facebook.com', 'instagram.com', 'twitter.com',
    'indeed.com', 'glassdoor.com'
  ];
  
  if (highProtection.some(d => domain.includes(d))) {
    return 'high-protection';
  }
  
  // Check for known patterns
  if (domain.match(/\.(gov|edu)$/)) {
    return 'low-protection'; // Government/education usually easier
  }
  
  // Default to medium
  return 'medium-protection';
}
```

### 5.3 Learning from Failures

**Adaptive Strategy**:
- Track success/failure rates per domain
- Store in cache: `{ domain: 'example.com', successfulTier: 2 }`
- Next time, start at successful tier
- Reset after 24 hours (sites change protection)

```javascript
// Cache structure
{
  "quora.com": { 
    "tier": 3, 
    "lastSuccess": "2025-10-21T12:00:00Z",
    "failures": { "tier0": 15, "tier1": 12, "tier2": 8 }
  }
}
```

---

## 6. Implementation Architecture

### 6.1 File Structure

```
src/scrapers/
├── index.js                    # Main entry point, tier orchestrator
├── tier-orchestrator.js       # Environment-aware tier constraints (IMPLEMENTED ✅)
├── tier0-direct.js            # HTTP scraping (CURRENT)
├── tier1-puppeteer.js         # Puppeteer + stealth (CURRENT - uses puppeteer-extra)
├── tier2-playwright.js        # Playwright + stealth (NEW) (local-only)
├── tier3-selenium.js          # Selenium + undetected (NEW) (local-only)
├── tier4-interactive.js       # Interactive mode (NEW) (local-only)
├── captcha-detector.js        # CAPTCHA detection utilities (NEW)
├── site-categorizer.js        # Site classification (NEW)
└── scrape-cache.js            # Success/failure tracking (NEW)
```

### 6.2 Dependencies - PRODUCTION vs DEVELOPMENT

**⚠️ CRITICAL**: Separate production and dev dependencies to keep Lambda size under limits.

#### 6.2.1 Production Dependencies (package.json `dependencies`)

**ONLY Tier 0-1** (deployed Lambda):
```json
{
  "dependencies": {
    "puppeteer-core": "^21.5.0",
    "puppeteer-extra": "^3.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2"
  }
}
```

**Why puppeteer-extra is required**:
- Standard puppeteer/puppeteer-core is easily detected
- `puppeteer-extra-plugin-stealth` masks CDP, webdriver, and Chrome runtime
- **MUST** be production dependency for Tier 1 to work properly

#### 6.2.2 Development Dependencies (package.json `devDependencies`)

**Tier 2-4** (local development only):
```json
{
  "devDependencies": {
    "playwright": "^1.40.0",
    "playwright-extra": "^4.3.6",
    "playwright-extra-plugin-stealth": "^2.11.1",
    "selenium-webdriver": "^4.15.0",
    "@types/selenium-webdriver": "^4.1.20"
  }
}
```

**Why devDependencies**:
- Playwright browsers alone are ~400MB (exceeds Lambda 250MB limit)
- Selenium + ChromeDriver adds ~100MB
- These are only used when running locally (NODE_ENV=development)
- Saves ~500MB in deployed Lambda package

#### 6.2.3 Python Dependencies (for Tier 3)

**Local Development Only** (`requirements-dev.txt`):
```txt
# Tier 3: Selenium with undetected-chromedriver
undetected-chromedriver==3.5.4
selenium==4.15.0
```

**Installation**:
```bash
# Local development only
pip install -r requirements-dev.txt
```

**Why Python**:
- `undetected-chromedriver` is Python-only
- Most effective anti-detection solution
- Node.js wrapper will call Python subprocess
- Not deployed to Lambda (local-only)

### 6.3 Deployment Scripts

#### 6.3.1 Local Development Setup

**`scripts/setup-dev.sh`** (NEW):
```bash
#!/bin/bash
set -e

echo "🔧 Setting up local development environment..."

# Install Node.js production dependencies
echo "📦 Installing production dependencies..."
npm install --production=false

# Install Node.js dev dependencies (Playwright, Selenium)
echo "📦 Installing development dependencies (Playwright, Selenium)..."
npm install --save-dev playwright playwright-extra playwright-extra-plugin-stealth
npm install --save-dev selenium-webdriver @types/selenium-webdriver

# Install Playwright browsers
echo "🌐 Installing Playwright browsers (Chrome, Firefox, WebKit)..."
npx playwright install chromium firefox webkit

# Install Python dependencies (undetected-chromedriver)
echo "🐍 Installing Python dependencies (undetected-chromedriver)..."
if command -v python3 &> /dev/null; then
    pip3 install undetected-chromedriver==3.5.4 selenium==4.15.0
else
    echo "⚠️  Python 3 not found. Tier 3 (Selenium) will not be available."
    echo "   Install Python 3 to enable Tier 3."
fi

# Verify installations
echo "✅ Verifying installations..."
node -e "console.log('✅ Node.js:', process.version)"
npm list puppeteer-extra puppeteer-extra-plugin-stealth --depth=0 || echo "⚠️  puppeteer-extra not found"
npm list playwright playwright-extra --depth=0 || echo "⚠️  Playwright not found (dev only)"
python3 -c "import undetected_chromedriver; print('✅ undetected-chromedriver installed')" || echo "⚠️  Python deps not found (dev only)"

echo ""
echo "🎉 Development environment ready!"
echo ""
echo "Available tiers:"
echo "  ✅ Tier 0: Direct HTTP (always available)"
echo "  ✅ Tier 1: Puppeteer + stealth (production + dev)"
if npm list playwright --depth=0 &> /dev/null; then
    echo "  ✅ Tier 2: Playwright + stealth (dev only)"
else
    echo "  ⚠️  Tier 2: Playwright NOT installed (run: npm install --save-dev playwright playwright-extra)"
fi
if python3 -c "import undetected_chromedriver" &> /dev/null; then
    echo "  ✅ Tier 3: Selenium + undetected-chromedriver (dev only)"
else
    echo "  ⚠️  Tier 3: undetected-chromedriver NOT installed (run: pip3 install undetected-chromedriver)"
fi
echo ""
echo "To start dev server with all tiers: make dev"
```

#### 6.3.2 Production Lambda Build

**`scripts/build-lambda.sh`** (UPDATE):
```bash
#!/bin/bash
set -e

echo "🏗️  Building Lambda deployment package..."

# Clean previous build
rm -rf dist/
mkdir -p dist/

# Install ONLY production dependencies (excludes Playwright, Selenium)
echo "📦 Installing production dependencies (excluding dev deps)..."
npm ci --production

# Copy source files
echo "📋 Copying source files..."
cp -r src/ dist/src/
cp -r node_modules/ dist/node_modules/
cp package.json dist/

# Check package size
echo "📊 Checking package size..."
cd dist/
PACKAGE_SIZE=$(du -sh . | cut -f1)
echo "   Package size: $PACKAGE_SIZE"

# Verify critical dependencies are present
echo "✅ Verifying production dependencies..."
if [ ! -d "node_modules/puppeteer-extra" ]; then
    echo "❌ ERROR: puppeteer-extra not found in production build!"
    echo "   This is required for Tier 1 to work properly."
    exit 1
fi
if [ ! -d "node_modules/puppeteer-extra-plugin-stealth" ]; then
    echo "❌ ERROR: puppeteer-extra-plugin-stealth not found in production build!"
    exit 1
fi

# Verify dev dependencies are NOT included
if [ -d "node_modules/playwright" ]; then
    echo "❌ ERROR: Playwright found in production build!"
    echo "   This should be a devDependency only."
    exit 1
fi

echo "✅ Production build ready at dist/"
echo "   Available tiers: Tier 0 (Direct), Tier 1 (Puppeteer + stealth)"
echo "   Tier 2-4 will only work when running locally."
cd ..
```

#### 6.3.3 Makefile Targets

**Update `Makefile`**:
```makefile
# Local development with all tiers
.PHONY: setup-dev
setup-dev:
	@bash scripts/setup-dev.sh

# Development server (all tiers available)
.PHONY: dev
dev: setup-dev
	NODE_ENV=development npm run dev

# Production Lambda build (Tier 0-1 only)
.PHONY: build-lambda
build-lambda:
	@bash scripts/build-lambda.sh

# Deploy to AWS (production build)
.PHONY: deploy
deploy: build-lambda
	@echo "🚀 Deploying to AWS Lambda..."
	cd dist && sam build && sam deploy
```

### 6.3 Environment Variables

```bash
# Tier control
SCRAPING_DEFAULT_TIER=0           # Start tier (0-3)
SCRAPING_MAX_TIER=4               # Maximum tier to try
SCRAPING_ENABLE_INTERACTIVE=true  # Allow tier 4

# Playwright
PLAYWRIGHT_BROWSERS_PATH=/opt/playwright  # Browser binaries

# Selenium
SELENIUM_DRIVER_PATH=/opt/chromedriver
SELENIUM_HEADLESS=true

# Interactive mode
INTERACTIVE_TIMEOUT=300000        # 5 min for user to solve CAPTCHA
INTERACTIVE_NOTIFY_URL=ws://...   # WebSocket to notify UI

# Performance
SCRAPING_TIER0_TIMEOUT=5000       # 5s
SCRAPING_TIER1_TIMEOUT=30000      # 30s
SCRAPING_TIER2_TIMEOUT=45000      # 45s
SCRAPING_TIER3_TIMEOUT=60000      # 60s
```

### 6.4 Deployment Constraints

Important deployment constraint (read before implementation):

- Deployed/online Lambda: Only Tier 0 (Direct HTTP) and Tier 1 (Puppeteer with stealth) are supported. The hosted/deployed Lambda environment must be treated as limited to Direct and Puppeteer-based scraping due to binary size, runtime, and dependency constraints.

- Local-only tiers: Tier 2 (Playwright), Tier 3 (Selenium/undetected-chromedriver), and Tier 4 (Interactive/manual browser sessions) are considered "local-only" features. They should only be enabled when the Lambda is running in a developer's local environment or on a dedicated host that provides the required binaries, drivers, and privileged access.

- Behavior on deployed Lambda: If a site requires escalation past Tier 1 (for example, requires login or presents an unsolvable CAPTCHA in automated mode), the deployed Lambda should return a clear, actionable error indicating the site requires local escalation (e.g., "login or interactive verification required; run locally or use a configured proxy/third-party solver"). The system should not attempt to enable Playwright/Selenium or interactive flows automatically in the hosted environment.

These constraints should be enforced both by configuration (e.g., MAX_TIER environment variable) and by runtime guards (IS_LAMBDA checks in the orchestrator).

### 6.5 Deployment Scripts & Setup

**Development Environment Setup**:
```bash
#!/bin/bash
# scripts/setup-dev.sh - Setup local development environment

set -e

echo "🔧 Setting up development environment..."

# Install production dependencies
echo "📦 Installing production dependencies..."
npm install

# Install development dependencies (local-only scrapers)
echo "📦 Installing development dependencies..."
npm install --save-dev playwright playwright-extra playwright-extra-plugin-stealth
npm install --save-dev selenium-webdriver chromedriver

# Setup Python environment for undetected-chromedriver
if command -v python3 &> /dev/null; then
    echo "🐍 Setting up Python environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install undetected-chromedriver selenium
    echo "✅ Python environment ready"
else
    echo "⚠️  Python3 not found. Skipping Tier 3 (Selenium) setup."
    echo "   Install Python 3.8+ to use undetected-chromedriver."
fi

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install chromium firefox

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
# Development mode (enables local-only tiers)
NODE_ENV=development

# Scraping settings
HEADLESS=true
USE_PUPPETEER=true

# Tier control (1 for Lambda, 4 for local)
SCRAPING_MAX_TIER=4
SCRAPING_ENABLE_INTERACTIVE=true

# Python environment (for Tier 3 - Selenium)
PYTHON_VENV_PATH=./.venv
EOF
    echo "✅ .env file created"
fi

echo ""
echo "✅ Development environment setup complete!"
echo ""
echo "Available scraping tiers:"
echo "  Tier 0: Direct HTTP (production + local)"
echo "  Tier 1: Puppeteer + stealth (production + local)"
echo "  Tier 2: Playwright + stealth (local only)"
echo "  Tier 3: Selenium + undetected-chromedriver (local only)"
echo "  Tier 4: Interactive mode (local only)"
echo ""
echo "Run 'make dev' to start development server"
```

**Production Deployment Script**:
```bash
#!/bin/bash
# scripts/deploy-production.sh - Deploy to AWS Lambda

set -e

echo "🚀 Deploying to production Lambda..."

# Verify only production dependencies
echo "📦 Checking dependencies..."
if [ -f package.json ]; then
    # Check for local-only packages in dependencies (should be in devDependencies)
    if grep -q '"playwright"' package.json | grep -v devDependencies; then
        echo "❌ ERROR: Playwright found in dependencies. Should be devDependency."
        exit 1
    fi
    if grep -q '"selenium-webdriver"' package.json | grep -v devDependencies; then
        echo "❌ ERROR: Selenium found in dependencies. Should be devDependency."
        exit 1
    fi
fi

# Install production dependencies only
echo "📦 Installing production dependencies..."
npm ci --production

# Verify puppeteer-extra is installed
if ! npm list puppeteer-extra > /dev/null 2>&1; then
    echo "❌ ERROR: puppeteer-extra not found. Required for Tier 1."
    exit 1
fi

if ! npm list puppeteer-extra-plugin-stealth > /dev/null 2>&1; then
    echo "❌ ERROR: puppeteer-extra-plugin-stealth not found. Required for Tier 1."
    exit 1
fi

# Build and deploy
echo "🔨 Building Lambda package..."
# Your existing deployment commands here
# Example:
# npm run build
# serverless deploy
# or: sam build && sam deploy

echo "✅ Deployment complete!"
echo ""
echo "⚠️  Production Lambda limitations:"
echo "   - Only Tier 0 (Direct) and Tier 1 (Puppeteer) available"
echo "   - Tier 2-4 require local execution"
```

**Package.json Scripts**:
```json
{
  "scripts": {
    "setup": "bash scripts/setup-dev.sh",
    "dev": "NODE_ENV=development npx nodemon",
    "deploy": "bash scripts/deploy-production.sh",
    "test:tiers": "node tests/test-tier-orchestrator.js",
    "test:scraping": "node test-scraping-progress.js",
    "install:playwright": "npx playwright install chromium firefox",
    "install:python": "python3 -m venv .venv && source .venv/bin/activate && pip install undetected-chromedriver selenium"
  }
}
```

**Makefile Updates**:
```makefile
# Development setup
.PHONY: setup
setup:
	@echo "🔧 Setting up development environment..."
	@bash scripts/setup-dev.sh

# Development server with local tiers
.PHONY: dev
dev: 
	@echo "🚀 Starting development server (all tiers enabled)..."
	NODE_ENV=development SCRAPING_MAX_TIER=4 npx nodemon

# Production deployment (Tier 0-1 only)
.PHONY: deploy
deploy:
	@echo "🚀 Deploying to production (Tier 0-1 only)..."
	@bash scripts/deploy-production.sh

# Test tier orchestrator
.PHONY: test-tiers
test-tiers:
	@echo "🧪 Testing tier orchestrator..."
	@node tests/test-tier-orchestrator.js

# Test scraping with all tiers
.PHONY: test-scraping
test-scraping:
	@echo "🧪 Testing scraping (local tiers enabled)..."
	NODE_ENV=development SCRAPING_MAX_TIER=4 node test-scraping-progress.js $(URL)
```

**CI/CD Pipeline Considerations**:
```yaml
# .github/workflows/deploy.yml
name: Deploy to Lambda

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies (production only)
        run: npm ci --production
      
      - name: Verify tier constraints
        run: |
          # Ensure no local-only packages in production dependencies
          if npm list playwright 2>/dev/null; then
            echo "ERROR: Playwright should not be in production deps"
            exit 1
          fi
          
          # Verify stealth plugin is present
          if ! npm list puppeteer-extra-plugin-stealth 2>/dev/null; then
            echo "ERROR: Stealth plugin required for production"
            exit 1
          fi
      
      - name: Deploy to Lambda
        run: npm run deploy
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## 7. Cost & Performance Analysis

### 7.1 Per-Request Costs

| Tier | Time | RAM | Lambda Cost* | Success Rate |
|------|------|-----|--------------|--------------|
| 0: Direct | 0.2s | 10MB | $0.000001 | 60-70% |
| 1: Puppeteer | 1s | 100MB | $0.000017 | 80-85% |
| 2: Playwright | 1.5s | 150MB | $0.000038 | 85-90% |
| 3: Selenium | 4s | 300MB | $0.000200 | 90-95% |
| 4: Interactive | Variable | 300MB | $0.000200+ | 99% |

*Based on AWS Lambda pricing: $0.0000166667 per GB-second

### 7.2 Annual Cost Estimates

**Scenario: 10,000 scrapes/month**

**Current (Tier 1 only)**:
- 10,000 × $0.000017 = $0.17/month = $2/year
- But ~20% failure rate = need retries

**Tiered (Smart Fallback)**:
- Tier 0: 7,000 successful × $0.000001 = $0.007
- Tier 1: 2,000 successful × $0.000017 = $0.034
- Tier 2: 800 successful × $0.000038 = $0.030
- Tier 3: 200 successful × $0.000200 = $0.040
- **Total: ~$0.11/month = $1.32/year**
- Success rate: 95-98%

**Savings**: ~35% cost reduction + higher success rate

### 7.3 Lambda Configuration

**Tier 0-1**: 512MB RAM, 30s timeout (current)
**Tier 2**: 1024MB RAM, 60s timeout
**Tier 3**: 2048MB RAM, 120s timeout
**Tier 4**: 2048MB RAM, 300s timeout (with extension)

---

## 8. CAPTCHA Handling Details

### 8.1 Detection Implementation

```javascript
async function detectCaptcha(page) {
  const indicators = await page.evaluate(() => {
    const checks = {
      recaptcha: !!document.querySelector('.g-recaptcha, iframe[src*="recaptcha"]'),
      hcaptcha: !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"]'),
      cloudflare: document.title.includes('Just a moment') || 
                  document.body.textContent.includes('Checking your browser'),
      funcaptcha: !!document.querySelector('iframe[src*="funcaptcha"]'),
      generic: document.body.textContent.match(/verify.*human|solve.*puzzle/i)
    };
    return checks;
  });
  
  return Object.values(indicators).some(v => v);
}
```

### 8.2 Interactive Mode UI Mock

```
┌────────────────────────────────────────────────────┐
│ 🤖 Scraping quora.com                              │
├────────────────────────────────────────────────────┤
│ ⚠️  CAPTCHA detected!                              │
│                                                     │
│ The site requires human verification.              │
│                                                     │
│ Options:                                           │
│ 1. [Open Browser] - Solve manually (local only)   │
│ 2. [Use Extension] - Solve via browser extension  │
│ 3. [Skip] - Return error                          │
│                                                     │
│ Time remaining: 4:32                               │
└────────────────────────────────────────────────────┘
```

### 8.3 Session Persistence

After CAPTCHA is solved:
1. Extract cookies from browser
2. Save to cache: `{ domain: 'quora.com', cookies: [...], expires: Date }`
3. Reuse cookies for future requests (while valid)
4. Reduces CAPTCHA frequency

---

## 9. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Add Playwright support
- [ ] Create tier orchestrator
- [ ] Implement site categorization
- [ ] Add success/failure caching
- **Outcome**: Automated tier selection working

### Phase 2: Selenium Integration (Week 2)
- [ ] Add Selenium support
- [ ] Integrate undetected-chromedriver (Python subprocess)
- [ ] Test against known problematic sites
- [ ] Tune stealth settings
- **Outcome**: Can scrape Quora, Amazon, etc.

### Phase 3: CAPTCHA Detection (Week 3)
- [ ] Implement CAPTCHA detection
- [ ] Add notification system
- [ ] Create UI components for CAPTCHA alerts
- **Outcome**: System detects and reports CAPTCHAs

### Phase 4: Interactive Mode (Week 4)
- [ ] Implement local interactive mode
- [ ] Add browser extension for production
- [ ] Session/cookie persistence
- [ ] Testing with real CAPTCHAs
- **Outcome**: Users can solve CAPTCHAs manually

### Phase 5: Optimization (Week 5)
- [ ] Performance tuning
- [ ] Cache optimization
- [ ] Cost analysis and adjustment
- [ ] Documentation
- **Outcome**: Production-ready system

---

## 10. Risks & Mitigations

### Risk 1: Selenium Slower Than Acceptable
**Mitigation**: Only use for category C sites, keep as last resort

### Risk 2: Lambda Size Limits (50MB deployment, 250MB unzipped)
**Mitigation**: 
- Use Lambda Layers for browser binaries
- Separate Lambda functions per tier
- Use EFS for large binaries

### Risk 3: Interactive Mode Too Complex
**Mitigation**: Start with local-only, add production later

### Risk 4: Sites Update Detection Methods
**Mitigation**: Regular testing, community stealth plugins

### Risk 5: Cost Overruns
**Mitigation**: 
- Strict tier 0 timeout (5s)
- Cache successful tier per domain
- Monitor costs with CloudWatch

---

## 11. Success Metrics

**Before Implementation** (Current State):
- Success rate: ~65-70%
- Average time: 1-2s
- Cost: ~$0.17/10k requests
- CAPTCHA handling: None (fails)

**After Implementation** (Target):
- Success rate: 95-98%
- Average time: 1-3s (with smart tier selection)
- Cost: ~$0.11/10k requests (35% reduction)
- CAPTCHA handling: 99% (with user help)

---

## 12. Alternative: Third-Party Services

If implementation is too complex, consider:

**ScraperAPI** ($29-249/month)
- Handles bot detection automatically
- CAPTCHA solving included
- Rotating proxies
- No infrastructure needed

**BrightData** ($500+/month)
- Residential proxies
- CAPTCHA solver
- Enterprise-grade

**Oxylabs** ($300+/month)
- Similar to BrightData

**Trade-off**: Much easier but $300-3000/year vs $1-10/year self-hosted

---

## 13. Recommendations

**Immediate Actions** (No Code Yet):
1. ✅ Install Playwright: `npm install playwright playwright-extra playwright-extra-plugin-stealth`
2. ✅ Test Playwright vs Puppeteer on known problematic sites
3. ✅ Benchmark performance/success rate

**Priority Implementation**:
1. **High**: Playwright integration (Phase 1) - Biggest bang for buck
2. **Medium**: Site categorization (Phase 1) - Optimization
3. **Medium**: CAPTCHA detection (Phase 3) - UX improvement
4. **Low**: Selenium (Phase 2) - Only if Playwright insufficient
5. **Low**: Interactive mode (Phase 4) - Nice to have

**Skip If**:
- Selenium: If Playwright achieves >90% success rate
- Interactive mode: If success rate is acceptable
- Consider paid service: If development time > $300/year value

---

## 14. Questions to Answer Before Implementation

1. **What's the current failure rate per site category?**
   - Need metrics to justify additional complexity

2. **How often do users scrape problematic sites?**
   - If rare, maybe just fail gracefully

3. **Is 2-4s latency acceptable for tier 3?**
   - Some use cases need <1s response

4. **Lambda or separate service for Selenium?**
   - Selenium might need dedicated server

5. **Budget for third-party services?**
   - Might be cheaper than development time

---

## 15. Next Steps (No Action Yet)

**Before coding, we should**:
1. Run tests on current system against 100 diverse sites
2. Categorize failures (403, CAPTCHA, JavaScript, timeout)
3. Estimate ROI of each tier
4. Decide on priorities based on data
5. Get approval for complexity increase

**Then proceed with**: Phase 1 (Playwright) if data supports it

---

## Appendix: Code Snippets (Reference Only)

### Tier 1: Puppeteer with Stealth Plugin
```javascript
// src/scrapers/tier1-puppeteer.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Apply stealth plugin
puppeteer.use(StealthPlugin());

async function tier1Scrape(url, options = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ]
  });
  
  const page = await browser.newPage();
  
  // Additional anti-detection measures
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  await page.goto(url, { waitUntil: 'networkidle2' });
  const content = await page.content();
  
  await browser.close();
  return content;
}

module.exports = { tier1Scrape };
```

### Tier 2: Playwright with Stealth Plugin (Local Only)
```javascript
// src/scrapers/tier2-playwright.js
const { chromium } = require('playwright-extra');
const StealthPlugin = require('playwright-extra-plugin-stealth');

// Apply stealth plugin
chromium.use(StealthPlugin());

async function tier2Scrape(url, options = {}) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
  
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const content = await page.content();
  
  await browser.close();
  return content;
}

module.exports = { tier2Scrape };
```

### Tier 3: Selenium with Undetected ChromeDriver (Local Only)
```python
# src/scrapers/tier3_selenium.py
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def tier3_scrape(url, timeout=30):
    # Undetected ChromeDriver automatically patches detection vectors
    options = uc.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    
    driver = uc.Chrome(options=options, version_main=120)
    
    try:
        driver.get(url)
        
        # Wait for page to load
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        
        # Get page content
        content = driver.page_source
        
        return content
    finally:
        driver.quit()

if __name__ == '__main__':
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://example.com'
    content = tier3_scrape(url)
    print(content)
```

**Node.js wrapper for Python scraper**:
```javascript
// src/scrapers/tier3-selenium.js
const { spawn } = require('child_process');
const path = require('path');

async function tier3Scrape(url, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'tier3_selenium.py');
    const pythonPath = process.env.PYTHON_VENV_PATH 
      ? path.join(process.env.PYTHON_VENV_PATH, 'bin', 'python')
      : 'python3';
    
    const python = spawn(pythonPath, [pythonScript, url]);
    
    let output = '';
    let error = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    python.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Python script failed: ${error}`));
      }
    });
  });
}

module.exports = { tier3Scrape };
```

### Interactive Mode Pseudocode
```javascript
if (detectCaptcha(page)) {
  // Keep browser open
  browser.headless = false;
  
  // Notify UI via WebSocket
  wsNotify('captcha_detected', { url, screenshot });
  
  // Wait for user to solve (or timeout)
  await waitForCaptchaSolve(page, timeout = 300000);
  
  // Continue scraping
  return extractContent(page);
}
```

---

**End of Plan**
