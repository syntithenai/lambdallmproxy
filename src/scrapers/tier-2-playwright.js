/**
 * Tier 2: Playwright with Stealth
 * 
 * LOCAL-ONLY (Not available on deployed Lambda)
 * 
 * Uses Playwright with stealth plugins to bypass moderate anti-bot protections.
 * Playwright provides better fingerprint evasion than Puppeteer in some cases.
 * 
 * Dependencies (dev):
 * - playwright
 * - playwright-extra
 * - puppeteer-extra-plugin-stealth (works with playwright-extra via adapter)
 */

const TIER = 2;

/**
 * Scrape URL using Playwright with stealth plugins
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @param {number} options.timeout - Navigation timeout in ms (default: 30000)
 * @param {boolean} options.waitForDynamic - Wait for dynamic content (default: true)
 * @param {number} options.waitTime - Time to wait for dynamic content in ms (default: 2000)
 * @param {string} options.userAgent - Custom user agent
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeTier2(url, options = {}) {
  const {
    timeout = 30000,
    waitForDynamic = true,
    waitTime = 2000,
    userAgent = null,
    onProgress = null
  } = options;

  console.log(`\n🎭 [Tier ${TIER} - Playwright+Stealth] Scraping: ${url}`);
  const startTime = Date.now();
  
  // Helper to emit progress
  const emitProgress = (stage, data = {}) => {
    if (onProgress && typeof onProgress === 'function') {
      onProgress({ stage, url, ...data });
    }
  };

  let browser = null;
  let page = null;

  try {
    // Dynamically import Playwright modules (local-only)
    const { chromium } = require('playwright');
    const { chromium: playwrightExtra } = require('playwright-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');

    console.log(`🚀 [Tier ${TIER}] Launching Chromium with stealth plugins...`);
    
    emitProgress('initializing', { message: 'Launching Playwright with stealth plugins' });
    
    // Add stealth plugin
    playwrightExtra.use(StealthPlugin());

    // Launch browser with stealth
    const launchStart = Date.now();
    emitProgress('launching_browser', { message: 'Starting Chromium browser' });
    
    browser = await playwrightExtra.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    console.log(`✅ [Tier ${TIER}] Browser launched in ${Date.now() - launchStart}ms`);

    // Create new page
    page = await browser.newPage();

    // Set user agent if provided
    if (userAgent) {
      await page.setExtraHTTPHeaders({
        'User-Agent': userAgent
      });
    }

    // Set viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Navigate to URL
    console.log(`📄 [Tier ${TIER}] Navigating to: ${url}`);
    const navStart = Date.now();
    
    emitProgress('loading_page', { message: 'Loading page content' });
    
    const response = await page.goto(url, {
      timeout,
      waitUntil: 'domcontentloaded'
    });
    
    const status = response.status();
    console.log(`✅ [Tier ${TIER}] Page loaded in ${Date.now() - navStart}ms (status: ${status})`);

    // Wait for dynamic content if enabled
    if (waitForDynamic && waitTime > 0) {
      console.log(`⏳ [Tier ${TIER}] Waiting ${waitTime}ms for dynamic content...`);
      emitProgress('waiting', { message: `Waiting ${waitTime}ms for dynamic content` });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Extract content
    console.log(`📖 [Tier ${TIER}] Extracting content...`);
    emitProgress('extracting', { message: 'Extracting page content' });
    const extractStart = Date.now();

    const content = await page.evaluate(() => {
      // Extract text content
      const text = document.body?.innerText || '';
      
      // Extract links
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({
          text: a.innerText?.trim() || '',
          href: a.href
        }))
        .filter(link => link.href && !link.href.startsWith('javascript:'));

      // Extract images
      const images = Array.from(document.querySelectorAll('img[src]'))
        .map(img => ({
          src: img.src,
          alt: img.alt || ''
        }));

      // Extract meta tags
      const meta = {};
      document.querySelectorAll('meta').forEach(tag => {
        const name = tag.getAttribute('name') || tag.getAttribute('property');
        const content = tag.getAttribute('content');
        if (name && content) {
          meta[name] = content;
        }
      });

      return {
        text,
        links,
        images,
        meta,
        title: document.title || '',
        html: document.documentElement.outerHTML
      };
    });

    console.log(`✅ [Tier ${TIER}] Content extracted in ${Date.now() - extractStart}ms`);

    const totalTime = Date.now() - startTime;
    console.log(`✅ [Tier ${TIER}] Complete: ${content.text.length} chars, ${content.links.length} links, ${content.images.length} images (${totalTime}ms)`);

    emitProgress('complete', {
      message: 'Scraping completed successfully',
      contentLength: content.text.length,
      linksCount: content.links.length,
      imagesCount: content.images.length,
      duration: totalTime
    });

    return {
      url,
      status,
      tier: TIER,
      tierName: 'Playwright',
      ...content,
      timing: {
        total: totalTime,
        navigation: navStart,
        extraction: extractStart
      }
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [Tier ${TIER}] Error after ${totalTime}ms:`, error.message);
    
    error.tier = TIER;
    error.tierName = 'Playwright';
    error.timing = { total: totalTime };
    
    throw error;

  } finally {
    // Cleanup
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.warn(`⚠️ [Tier ${TIER}] Failed to close page:`, e.message);
      }
    }
    
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn(`⚠️ [Tier ${TIER}] Failed to close browser:`, e.message);
      }
    }
  }
}

module.exports = {
  scrapeTier2,
  TIER
};
