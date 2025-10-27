/**
 * Tier 1: Puppeteer with Stealth Plugin
 * 
 * 🔒 REQUIRED: Uses puppeteer-extra with puppeteer-extra-plugin-stealth
 * NOT standard puppeteer. Stealth plugin helps evade bot detection.
 * 
 * Features:
 * - Stealth plugin (evades basic bot detection)
 * - User-agent rotation
 * - Configurable headless mode
 * - Screenshot capability
 * - Lambda-compatible (uses @sparticuz/chromium)
 * 
 * Availability: Production Lambda + Local
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');

// 🔒 CRITICAL: Add stealth plugin to evade bot detection
puppeteer.use(StealthPlugin());

const IS_LAMBDA = !!process.env.AWS_FN;

/**
 * Get Puppeteer launch options for current environment
 * @param {Object} options - Custom options
 * @returns {Object} Launch options
 */
function getLaunchOptions(options = {}) {
  const baseOptions = {
    headless: options.headless !== false ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  };

  if (IS_LAMBDA) {
    // Lambda-specific configuration
    return {
      ...baseOptions,
      executablePath: chromium.executablePath(),
      args: [
        ...baseOptions.args,
        ...chromium.args,
        '--single-process',
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreHTTPSErrors: true
    };
  } else {
    // Local development
    return {
      ...baseOptions,
      // Let puppeteer find Chrome/Chromium locally
      args: [
        ...baseOptions.args,
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreHTTPSErrors: true
    };
  }
}

/**
 * Scrape a URL using Puppeteer with stealth
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @param {boolean} options.waitForSelector - CSS selector to wait for (optional)
 * @param {number} options.timeout - Navigation timeout in ms (default: 30000)
 * @param {boolean} options.screenshot - Take screenshot (default: false)
 * @param {boolean} options.headless - Run headless (default: true)
 * @param {number} options.waitAfterLoad - Additional wait time after page load (ms)
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeTier1(url, options = {}) {
  const {
    waitForSelector = null,
    timeout = 30000,
    screenshot = false,
    headless = true,
    waitAfterLoad = 2000
  } = options;

  console.log(`🎭 [Tier 1 - Puppeteer+Stealth] Scraping: ${url}`);
  const startTime = Date.now();

  let browser = null;
  let page = null;

  try {
    // Launch browser with stealth
    const launchStart = Date.now();
    const launchOptions = getLaunchOptions({ headless });
    
    console.log(`🚀 [Tier 1] Launching Chromium (stealth enabled)...`);
    browser = await puppeteer.launch(launchOptions);
    
    const launchTime = Date.now() - launchStart;
    console.log(`✅ [Tier 1] Browser launched in ${launchTime}ms`);

    // Create page
    page = await browser.newPage();

    // Set additional stealth measures
    await page.evaluateOnNewDocument(() => {
      // Override navigator properties
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
      // Mock chrome object
      window.chrome = { runtime: {} };
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // Set viewport
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1
    });

    // Set user agent (stealth plugin handles this, but can customize)
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    await page.setUserAgent(userAgent);

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    // Navigate to URL
    console.log(`📄 [Tier 1] Navigating to: ${url}`);
    const navStart = Date.now();
    
    const response = await page.goto(url, {
      timeout,
      waitUntil: 'networkidle2'
    });

    const navTime = Date.now() - navStart;
    console.log(`✅ [Tier 1] Page loaded in ${navTime}ms (status: ${response.status()})`);

    // Check for errors
    if (response.status() === 403) {
      throw new Error('Access forbidden (403) - site may be blocking scrapers');
    }
    if (response.status() === 429) {
      throw new Error('Rate limited (429) - too many requests');
    }

    // Wait for specific selector if provided
    if (waitForSelector) {
      console.log(`⏳ [Tier 1] Waiting for selector: ${waitForSelector}`);
      try {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      } catch (e) {
        console.warn(`⚠️ [Tier 1] Selector not found: ${waitForSelector}`);
      }
    }

    // Additional wait after load (for dynamic content)
    if (waitAfterLoad > 0) {
      console.log(`⏳ [Tier 1] Waiting ${waitAfterLoad}ms for dynamic content...`);
      await new Promise(resolve => setTimeout(resolve, waitAfterLoad));
    }

    // Extract content
    console.log(`📖 [Tier 1] Extracting content...`);
    const extractStart = Date.now();

    const content = await page.evaluate(() => {
      // Remove script and style tags
      const scripts = document.querySelectorAll('script, style, noscript');
      scripts.forEach(el => el.remove());

      // Extract text
      const text = document.body.innerText || document.body.textContent || '';

      // Extract title
      const title = document.title ||
                   document.querySelector('meta[property="og:title"]')?.content ||
                   document.querySelector('h1')?.textContent || '';

      // Extract description
      const description = document.querySelector('meta[name="description"]')?.content ||
                         document.querySelector('meta[property="og:description"]')?.content || '';

      // Extract links
      const links = Array.from(document.querySelectorAll('a[href]'))
        .slice(0, 100)
        .map(a => ({
          href: a.href,
          text: a.textContent.trim()
        }))
        .filter(link => link.href && !link.href.startsWith('#'));

      // Extract images
      const images = Array.from(document.querySelectorAll('img[src]'))
        .slice(0, 50)
        .map(img => ({
          src: img.src,
          alt: img.alt || ''
        }))
        .filter(img => img.src);

      return {
        title: title.trim(),
        description: description.trim(),
        text: text.replace(/\s+/g, ' ').trim(),
        html: document.documentElement.outerHTML,
        links,
        images
      };
    });

    const extractTime = Date.now() - extractStart;
    console.log(`✅ [Tier 1] Content extracted in ${extractTime}ms`);

    // Take screenshot if requested
    let screenshotData = null;
    if (screenshot) {
      console.log(`📸 [Tier 1] Taking screenshot...`);
      screenshotData = await page.screenshot({
        encoding: 'base64',
        fullPage: false
      });
    }

    const totalTime = Date.now() - startTime;

    const result = {
      success: true,
      tier: 1,
      method: 'puppeteer-stealth',
      url: page.url(),
      status: response.status(),
      title: content.title,
      description: content.description,
      text: content.text,
      html: content.html,
      links: content.links,
      images: content.images,
      screenshot: screenshotData,
      responseTime: totalTime,
      timings: {
        launch: launchTime,
        navigation: navTime,
        extraction: extractTime,
        total: totalTime
      },
      timestamp: new Date().toISOString()
    };

    console.log(`✅ [Tier 1] Complete: ${content.text.length} chars, ${content.links.length} links, ${content.images.length} images (${totalTime}ms)`);

    return result;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [Tier 1] Failed after ${totalTime}ms:`, error.message);

    // Enhanced error for orchestrator
    const enhancedError = new Error(error.message);
    enhancedError.tier = 1;
    enhancedError.method = 'puppeteer-stealth';
    enhancedError.responseTime = totalTime;
    
    // Check for specific error patterns
    if (error.message.includes('403') || error.message.includes('forbidden')) {
      enhancedError.status = 403;
      enhancedError.statusCode = 403;
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      enhancedError.status = 429;
      enhancedError.statusCode = 429;
    } else if (error.message.includes('timeout')) {
      enhancedError.status = 408;
      enhancedError.statusCode = 408;
    }
    
    throw enhancedError;

  } finally {
    // Cleanup
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error(`⚠️ [Tier 1] Error closing page:`, e.message);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error(`⚠️ [Tier 1] Error closing browser:`, e.message);
      }
    }
  }
}

module.exports = {
  scrapeTier1
};
