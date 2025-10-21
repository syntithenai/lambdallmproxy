# Advanced Scraping Strategy - Tier Scrapers

This directory contains the multi-tier web scraping system with environment-aware constraints and advanced anti-detection capabilities.

## 🎯 Overview

The system implements a **5-tier fallback chain** that automatically escalates through increasingly sophisticated scraping methods when simpler approaches fail:

```
Tier 0 (Direct) → Tier 1 (Puppeteer) → Tier 2 (Playwright) → Tier 3 (Selenium) → Tier 4 (Interactive)
```

## 🔒 Stealth Features

### Critical Requirements

1. **Tier 1 MUST use `puppeteer-extra-plugin-stealth`** - NOT standard Puppeteer
2. **Tier 2 uses `playwright-extra`** with the same stealth plugin
3. **Tier 3 uses Python's `undetected-chromedriver`** - the most advanced anti-detection

⚠️ **DO NOT** use standard `puppeteer` or `playwright` packages. They are easily detected by anti-bot systems.

## 📁 Files

### Core Scrapers

| File | Tier | Technology | Lambda | Local | Stealth Level |
|------|------|------------|--------|-------|---------------|
| `tier-0-direct.js` | 0 | Axios/HTTP | ✅ | ✅ | Basic |
| `tier-1-puppeteer.js` | 1 | Puppeteer-Extra + Stealth | ✅ | ✅ | Advanced |
| `tier-2-playwright.js` | 2 | Playwright-Extra + Stealth | ❌ | ✅ | Advanced |
| `tier-3-selenium.js` | 3 | Undetected-ChromeDriver | ❌ | ✅ | Maximum |
| `tier-4-interactive.js` | 4 | Playwright (non-headless) | ❌ | ✅ | Human |

### Infrastructure

- **`tier-orchestrator.js`**: Main orchestration logic with fallback chain
- **`puppeteer-scraper.js`**: Legacy scraper (deprecated, use tier-1 instead)
- **`puppeteer-local.js`**: Legacy local scraper (deprecated, use tier-2 instead)

## 🚀 Usage

### Basic Usage

```javascript
const { scrapeWithTierFallback } = require('./tier-orchestrator');

// Automatic tier selection and fallback
const result = await scrapeWithTierFallback('https://example.com');

console.log('Success:', result.success);
console.log('Tier used:', result.tier, result.tierName);
console.log('Content:', result.content);
```

### Using Specific Tier

```javascript
const Tier1 = require('./tier-1-puppeteer');

// Use Tier 1 directly
const result = await Tier1.scrape('https://example.com', {
  waitForSelector: 'body',
  blockResources: true,
  screenshot: false
});
```

### Environment-Aware Scraping

```javascript
const { getEnvironmentConstraints } = require('./tier-orchestrator');

const env = getEnvironmentConstraints();
console.log('Max tier available:', env.MAX_TIER);
console.log('Running on Lambda:', env.IS_LAMBDA);
console.log('Supports Playwright:', env.supportsPlaywright);
```

## 🔧 Configuration

### Environment Variables

```bash
# Maximum tier to use (0-4)
SCRAPING_MAX_TIER=4

# Enable interactive mode
SCRAPING_ENABLE_INTERACTIVE=true

# Development mode (enables local-only tiers)
NODE_ENV=development

# Python virtual environment path (for Tier 3)
PYTHON_VENV_PATH=./.venv
```

### Tier Options

#### Tier 0: Direct HTTP

```javascript
const scraper = new Tier0({
  timeout: 30000,
  retries: 3,
  headers: { 'Custom-Header': 'value' }
});
```

#### Tier 1: Puppeteer + Stealth

```javascript
const result = await Tier1.scrape(url, {
  headless: true,
  waitForSelector: '.content',
  waitTime: 2000,
  blockResources: true,
  screenshot: true,
  evaluate: () => {
    // Custom JavaScript to execute
    return document.title;
  }
});
```

#### Tier 2: Playwright + Stealth

```javascript
const scraper = new Tier2({
  browserType: 'chromium', // or 'firefox', 'webkit'
  headless: true
});

const result = await scraper.scrape(url, {
  waitForSelector: '.content',
  screenshot: true,
  fullPageScreenshot: true
});

await scraper.cleanup();
```

#### Tier 3: Selenium + Undetected-ChromeDriver

```javascript
const result = await Tier3.scrape(url, {
  headless: true,
  timeout: 60000,
  waitSelector: '.content',
  waitTime: 3000
});
```

#### Tier 4: Interactive Mode

```javascript
const result = await Tier4.startInteractive(url, async (page) => {
  console.log('Browser opened for manual interaction');
  console.log('Solve CAPTCHA or login manually');
  console.log('Press Enter when ready...');
  
  // Wait for user input
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
  
  // Extract data after manual interaction
  return await page.evaluate(() => ({
    title: document.title,
    data: /* extract what you need */
  }));
});
```

## 🔄 Tier Escalation Logic

The orchestrator automatically escalates to the next tier when:

1. **403 Forbidden** - Access denied by server
2. **429 Too Many Requests** - Rate limited
3. **CAPTCHA Detection** - CAPTCHA challenge detected
4. **Bot Detection** - Site detects automation
5. **Timeout/Failure** - Request times out or fails

### Lambda Limitation Handling

When running on Lambda and tier limit is exceeded:

```javascript
{
  success: false,
  error: "Site requires advanced scraping...",
  requiresLocalEnvironment: true,
  suggestedAction: "This site requires Playwright, Selenium, or Interactive mode...",
  code: "TIER_LIMIT_EXCEEDED"
}
```

## 🧪 Testing

### Test All Tiers

```bash
make test-tiers
```

### Test Specific Tier

```bash
make test-tier-0  # Direct HTTP
make test-tier-1  # Puppeteer + stealth
make test-tier-2  # Playwright + stealth
make test-tier-3  # Selenium + undetected-chromedriver
```

### Integration Tests

```bash
npm run test:scraping
```

## 📦 Dependencies

### Production (Lambda-compatible)

```json
{
  "puppeteer-extra": "^3.3.6",
  "puppeteer-extra-plugin-stealth": "^2.11.2",
  "puppeteer-core": "^23.11.1",
  "@sparticuz/chromium": "^131.0.0",
  "axios": "^1.6.2"
}
```

### Development (Local-only)

```json
{
  "playwright": "^1.40.0",
  "playwright-extra": "^4.3.6",
  "selenium-webdriver": "^4.16.0",
  "chromedriver": "^120.0.1"
}
```

### Python (Local-only)

```bash
pip install undetected-chromedriver selenium
```

## ⚠️ Important Notes

1. **Lambda Constraints**:
   - Only Tier 0 and Tier 1 work on Lambda
   - Package size limit: 50MB (zipped), 250MB (unzipped)
   - Tier 2-4 require local execution

2. **Stealth Plugin Requirements**:
   - Always use `puppeteer-extra`, never `puppeteer`
   - Always use `playwright-extra`, never `playwright`
   - Tier 3 requires Python 3.8+

3. **Resource Management**:
   - Always call `cleanup()` on Tier 2 scrapers
   - Tier 3 spawns Python processes - ensure proper cleanup
   - Tier 4 opens visible browsers - requires user interaction

4. **Performance**:
   - Tier 0 is fastest (~100-500ms)
   - Tier 1 is moderate (~2-5s)
   - Tier 2-3 are slower (~5-15s)
   - Tier 4 depends on user interaction

## 🔍 Debugging

### Enable Debug Logging

```javascript
process.env.DEBUG = 'scraper:*';
```

### Check Tier Availability

```javascript
const Tier0 = require('./tier-0-direct');
const Tier1 = require('./tier-1-puppeteer');
const Tier2 = require('./tier-2-playwright');

const availability = await Promise.all([
  Tier0.checkAvailability(),
  Tier1.checkAvailability(),
  Tier2.checkAvailability()
]);

availability.forEach(tier => {
  console.log(`${tier.tierName}: ${tier.available ? '✅' : '❌'}`);
  console.log(`  Reason: ${tier.reason}`);
});
```

## 📚 Further Reading

- [ADVANCED_SCRAPING_STRATEGY_PLAN.md](../../ADVANCED_SCRAPING_STRATEGY_PLAN.md) - Complete strategy documentation
- [IMPLEMENTATION_COMPLETE.md](../../IMPLEMENTATION_COMPLETE.md) - Implementation summary
- [puppeteer-extra documentation](https://github.com/berstend/puppeteer-extra)
- [playwright-extra documentation](https://github.com/berstend/puppeteer-extra/tree/master/packages/playwright-extra)
- [undetected-chromedriver documentation](https://github.com/ultrafunkamsterdam/undetected-chromedriver)

## 🆘 Troubleshooting

### "Module not found: puppeteer-extra"
```bash
npm install
```

### "Playwright browsers not installed"
```bash
make install-playwright
# or
npx playwright install chromium firefox
```

### "Python module 'undetected_chromedriver' not found"
```bash
make install-python
# or
python3 -m venv .venv
source .venv/bin/activate
pip install undetected-chromedriver selenium
```

### "Tier 2-4 not available on Lambda"
This is expected! Use Tier 0 or Tier 1 on Lambda, or run locally for advanced tiers.

## 🎯 Best Practices

1. **Start with lower tiers**: Let the orchestrator handle escalation
2. **Set appropriate timeouts**: Balance speed vs success rate
3. **Handle errors gracefully**: Check `result.success` before using data
4. **Clean up resources**: Always call `cleanup()` on browser-based scrapers
5. **Test locally first**: Before deploying to Lambda, test locally
6. **Monitor tier usage**: Log which tiers are being used to optimize

---

**Last Updated**: October 21, 2025  
**Version**: 1.0.0  
**Status**: Production Ready ✅
