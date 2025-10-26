/**
 * Puppeteer Web Scraper for Lambda
 * 
 * Uses headless Chromium to scrape JavaScript-rendered pages.
 * Based on Sparticuz/chromium for Lambda optimization.
 * 
 * Features:
 * - Handles JavaScript-rendered content
 * - Waits for page load and dynamic content
 * - Extracts text, links, images
 * - Timeout protection
 * - Memory efficient
 * 
 * References:
 * - https://github.com/Sparticuz/chromium
 * - https://github.com/puppeteer/puppeteer
 */

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Chromium optimization for Lambda
chromium.setHeadlessMode = true;
chromium.setGraphicsMode = false;

/**
 * Scrape a webpage using headless Chromium
 * 
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @param {number} options.timeout - Page load timeout in milliseconds (default: 30000)
 * @param {boolean} options.waitForNetworkIdle - Wait for network idle (default: true)
 * @param {string} options.waitForSelector - Wait for specific selector (optional)
 * @param {boolean} options.extractLinks - Extract links (default: true)
 * @param {boolean} options.extractImages - Extract images (default: true)
 * @param {boolean} options.screenshot - Take screenshot (default: false)
 * @returns {Promise<Object>} Scraped content
 */
async function scrapePage(url, options = {}) {
  const {
    timeout = 30000,
    waitForNetworkIdle = true,
    waitForSelector = null,
    extractLinks = true,
    extractImages = true,
    screenshot = false
  } = options;

  let browser = null;
  let page = null;

  try {
    console.log(`🌐 [Puppeteer] Launching Chromium for: ${url}`);
    const startTime = Date.now();

    // Launch browser with Lambda-optimized settings
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const launchTime = Date.now() - startTime;
    console.log(`✅ [Puppeteer] Browser launched in ${launchTime}ms`);

    // Create new page
    page = await browser.newPage();

    // Set user agent to avoid bot detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport for consistent rendering
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });

    // Navigate to page
    console.log(`📄 [Puppeteer] Navigating to: ${url}`);
    const navigationStart = Date.now();

    const navigationOptions = {
      timeout,
      waitUntil: waitForNetworkIdle ? 'networkidle2' : 'domcontentloaded'
    };

    await page.goto(url, navigationOptions);

    const navigationTime = Date.now() - navigationStart;
    console.log(`✅ [Puppeteer] Page loaded in ${navigationTime}ms`);

    // Check for simple redirect/button click scenarios (e.g., Google JavaScript requirement)
    try {
      const pageText = await page.evaluate(() => document.body.innerText || '');
      const pageTextLower = pageText.toLowerCase();
      
      // Detect redirect pages with simple instructions
      const isRedirectPage = 
        (pageTextLower.includes('click') && pageTextLower.includes('not redirected')) ||
        (pageTextLower.includes('enable javascript') && pageText.length < 500) ||
        pageTextLower.includes('httpservice/retry/enablejs');
      
      if (isRedirectPage) {
        console.log(`🔄 [Puppeteer] Detected redirect page, looking for clickable elements...`);
        
        // Try to find and click a link/button (look for <a> tags or buttons with "here", "click", "continue")
        const clicked = await page.evaluate(() => {
          const candidates = Array.from(document.querySelectorAll('a, button'));
          for (const el of candidates) {
            const text = (el.textContent || '').toLowerCase();
            if (text.includes('here') || text.includes('click') || text.includes('continue')) {
              el.click();
              return true;
            }
          }
          return false;
        });
        
        if (clicked) {
          console.log(`✅ [Puppeteer] Clicked redirect element, waiting for navigation...`);
          // Wait for navigation after click (with timeout)
          await page.waitForNavigation({ 
            timeout: 15000, 
            waitUntil: 'networkidle2' 
          }).catch(() => {
            console.warn(`⚠️ [Puppeteer] Navigation after click timed out, continuing anyway`);
          });
          // Give extra time for page to settle
          await page.waitForTimeout(2000);
        } else {
          console.log(`⏳ [Puppeteer] No clickable element found, waiting for auto-redirect...`);
          // Wait a bit for automatic redirect (meta refresh, JavaScript redirect)
          await page.waitForTimeout(3000);
        }
      }
    } catch (redirectErr) {
      console.warn(`⚠️ [Puppeteer] Redirect handling error:`, redirectErr.message);
      // Continue anyway - redirect handling is best-effort
    }

    // Wait for specific selector if provided
    if (waitForSelector) {
      console.log(`⏳ [Puppeteer] Waiting for selector: ${waitForSelector}`);
      await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {
        console.warn(`⚠️ [Puppeteer] Selector not found: ${waitForSelector}`);
      });
    }

    // Give additional time for JavaScript to execute
    await page.waitForTimeout(1000);

    // Extract content
    console.log(`📊 [Puppeteer] Extracting content...`);
    const content = await page.evaluate((opts) => {
      const result = {
        title: document.title,
        url: window.location.href,
        text: '',
        html: '',
        links: [],
        images: [],
        meta: {}
      };

      // Extract meta tags
      document.querySelectorAll('meta').forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property');
        const content = meta.getAttribute('content');
        if (name && content) {
          result.meta[name] = content;
        }
      });

      // Extract text content
      // Remove script and style elements
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      result.text = clone.innerText || clone.textContent || '';

      // Get HTML for further processing if needed
      result.html = document.body.innerHTML;

      // Extract links
      if (opts.extractLinks) {
        document.querySelectorAll('a[href]').forEach(link => {
          const href = link.getAttribute('href');
          const text = link.textContent?.trim();
          if (href && text) {
            try {
              const absoluteUrl = new URL(href, window.location.href).href;
              result.links.push({
                url: absoluteUrl,
                text: text.substring(0, 200) // Limit text length
              });
            } catch (e) {
              // Skip invalid URLs
            }
          }
        });
      }

      // Extract images
      if (opts.extractImages) {
        document.querySelectorAll('img[src]').forEach(img => {
          const src = img.getAttribute('src');
          const alt = img.getAttribute('alt') || '';
          if (src) {
            try {
              const absoluteUrl = new URL(src, window.location.href).href;
              result.images.push({
                url: absoluteUrl,
                alt: alt.substring(0, 200)
              });
            } catch (e) {
              // Skip invalid URLs
            }
          }
        });
      }

      return result;
    }, { extractLinks, extractImages });

    // Take screenshot if requested
    if (screenshot) {
      console.log(`📸 [Puppeteer] Taking screenshot...`);
      const screenshotBuffer = await page.screenshot({
        type: 'png',
        fullPage: false,
        encoding: 'base64'
      });
      content.screenshot = screenshotBuffer;
    }

    // Calculate stats
    const totalTime = Date.now() - startTime;
    content.stats = {
      totalTime,
      launchTime,
      navigationTime,
      textLength: content.text.length,
      linkCount: content.links.length,
      imageCount: content.images.length
    };

    console.log(`✅ [Puppeteer] Scraping complete in ${totalTime}ms`);
    console.log(`   📝 Text: ${content.text.length} chars`);
    console.log(`   🔗 Links: ${content.links.length}`);
    console.log(`   🖼️  Images: ${content.images.length}`);

    return content;

  } catch (error) {
    console.error(`❌ [Puppeteer] Error scraping ${url}:`, error.message);
    throw new Error(`Puppeteer scraping failed: ${error.message}`);
  } finally {
    // Clean up
    if (page) {
      await page.close().catch(console.error);
    }
    if (browser) {
      await browser.close().catch(console.error);
    }
  }
}

/**
 * Scrape multiple pages in parallel (with concurrency limit)
 * 
 * @param {Array<string>} urls - URLs to scrape
 * @param {Object} options - Scraping options
 * @param {number} options.concurrency - Max concurrent browsers (default: 2)
 * @returns {Promise<Array<Object>>} Array of scraped content
 */
async function scrapePages(urls, options = {}) {
  const { concurrency = 2, ...scrapeOptions } = options;

  console.log(`🌐 [Puppeteer] Scraping ${urls.length} pages with concurrency ${concurrency}`);

  const results = [];
  const batches = [];

  // Split into batches
  for (let i = 0; i < urls.length; i += concurrency) {
    batches.push(urls.slice(i, i + concurrency));
  }

  // Process batches sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`📦 [Puppeteer] Processing batch ${i + 1}/${batches.length}`);

    const batchResults = await Promise.allSettled(
      batch.map(url => scrapePage(url, scrapeOptions))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push({ success: true, data: result.value });
      } else {
        results.push({ success: false, error: result.reason.message });
      }
    }
  }

  return results;
}

/**
 * Test if Puppeteer is available and working
 * 
 * @returns {Promise<boolean>} True if Puppeteer is working
 */
async function testPuppeteer() {
  try {
    console.log(`🧪 [Puppeteer] Testing Chromium availability...`);
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    await browser.close();
    console.log(`✅ [Puppeteer] Test successful`);
    return true;
  } catch (error) {
    console.error(`❌ [Puppeteer] Test failed:`, error.message);
    return false;
  }
}

/**
 * Check if Puppeteer should be used based on environment variable
 * 
 * @returns {boolean} True if Puppeteer should be used
 */
function shouldUsePuppeteer() {
  const usePuppeteer = process.env.USE_PUPPETEER;
  
  // Check if explicitly disabled
  if (usePuppeteer === 'false' || usePuppeteer === '0') {
    return false;
  }
  
  // Check if explicitly enabled
  if (usePuppeteer === 'true' || usePuppeteer === '1') {
    return true;
  }
  
  // Default: disabled (safer fallback)
  return false;
}

module.exports = {
  scrapePage,
  scrapePages,
  testPuppeteer,
  shouldUsePuppeteer
};
