/**
 * Local Puppeteer Scraper for Development
 * 
 * Runs Puppeteer locally with optional visible browser for debugging.
 * Falls back to puppeteer-core with system Chromium if full puppeteer not installed.
 * 
 * Features:
 * - Visible browser mode (headless: false)
 * - DevTools support
 * - Progress callbacks for real-time updates
 * - Stealth plugin for better bot detection evasion
 * - Proxy support (SOCKS5/HTTP)
 * - Same interface as Lambda Puppeteer handler
 * 
 * Usage:
 *   NODE_ENV=development make dev
 *   HEADLESS=false make dev  # See browser window
 */

let puppeteer;
let executablePath;
let StealthPlugin;

// Try to load puppeteer-extra with stealth plugin
try {
  puppeteer = require('puppeteer-extra');
  StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
  console.log('✅ Using puppeteer-extra with stealth plugin');
} catch (e) {
  console.log('⚠️ puppeteer-extra not available, trying standard puppeteer');
  // Try to load full puppeteer first, fall back to puppeteer-core
  try {
    puppeteer = require('puppeteer');
    console.log('✅ Using full Puppeteer (local Chromium)');
  } catch (e2) {
    console.log('⚠️ Full Puppeteer not installed, using puppeteer-core');
    puppeteer = require('puppeteer-core');
  }
}

// Find Chromium executable if needed
if (!puppeteer.executablePath || typeof puppeteer.executablePath !== 'function') {
  
  // Common Chromium locations
  const possiblePaths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  
  const fs = require('fs');
  executablePath = possiblePaths.find(p => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  
  if (!executablePath) {
    console.error('❌ Could not find Chromium/Chrome.');
    console.error('💡 Options:');
    console.error('   1. Install full Puppeteer: npm install puppeteer');
    console.error('   2. Install system Chrome/Chromium');
    console.error('   3. Set PUPPETEER_EXECUTABLE_PATH environment variable');
    throw new Error('Chromium not found. See error message above for solutions.');
  }
  
  console.log(`✅ Found system Chromium at: ${executablePath}`);
}

/**
 * Scrape a webpage using local Puppeteer
 * 
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @param {number} options.timeout - Page load timeout (default: 30000)
 * @param {boolean} options.waitForNetworkIdle - Wait for network idle (default: true)
 * @param {string} options.waitForSelector - Wait for specific selector
 * @param {boolean} options.extractLinks - Extract links (default: true)
 * @param {boolean} options.extractImages - Extract images (default: true)
 * @param {boolean} options.screenshot - Take screenshot (default: false)
 * @param {boolean} options.headless - Run headless (default: true, override with HEADLESS env)
 * @param {boolean} options.devtools - Open DevTools (default: false)
 * @param {number} options.slowMo - Slow down actions for visibility (default: 0)
 * @param {Function} options.onProgress - Progress callback (stage, data)
 * @returns {Promise<Object>} Scraped content with same format as Lambda handler
 */
async function scrapePage(url, options = {}) {
  const {
    timeout = 30000,
    waitForNetworkIdle = true,
    waitForSelector = null,
    extractLinks = true,
    extractImages = true,
    screenshot = false,
    headless = process.env.HEADLESS !== 'false',
    devtools = process.env.DEVTOOLS === 'true' || options.devtools || false,
    slowMo = parseInt(process.env.SLOW_MO || '0') || options.slowMo || 0,
    onProgress = null,
    proxyServer = null,
    proxyUsername = null,
    proxyPassword = null
  } = options;

  let browser = null;
  let page = null;

  const progress = (stage, data = {}) => {
    if (onProgress) {
      onProgress({ stage, url, ...data });
    }
  };

  try {
    console.log(`🌐 [Puppeteer Local] Launching browser for: ${url}`);
    console.log(`   Mode: ${headless ? 'headless' : 'visible'}, DevTools: ${devtools}, SlowMo: ${slowMo}ms`);
    if (proxyServer) {
      console.log(`   Proxy: ${proxyServer} (${proxyUsername ? 'authenticated' : 'no auth'})`);
    }
    
    const startTime = Date.now();
    progress('launching', { headless, devtools, proxy: !!proxyServer });

    // Launch browser with local settings
    const launchOptions = {
      headless,
      devtools,
      slowMo,
      ignoreHTTPSErrors: true,
      args: [
        '--window-size=1920,1080',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ]
    };

    // Add proxy if provided
    if (proxyServer) {
      launchOptions.args.push(`--proxy-server=${proxyServer}`);
    }

    // Add executable path if using puppeteer-core
    if (executablePath) {
      launchOptions.executablePath = executablePath;
      console.log(`   Using Chromium at: ${executablePath}`);
    }

    // Start maximized if visible
    if (!headless) {
      launchOptions.args.push('--start-maximized');
    }

    browser = await puppeteer.launch(launchOptions);

    const launchTime = Date.now() - startTime;
    console.log(`✅ [Puppeteer Local] Browser launched in ${launchTime}ms`);
    progress('launched', { launchTime, proxy: !!proxyServer });

    // Create new page
    page = await browser.newPage();

    // Authenticate proxy if credentials provided
    if (proxyServer && proxyUsername && proxyPassword) {
      await page.authenticate({
        username: proxyUsername,
        password: proxyPassword
      });
      console.log(`   ✅ Proxy authenticated`);
    }

    // Enhanced anti-detection measures
    // 1. Set realistic user agent (rotate between common ones)
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    ];
    const selectedUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(selectedUA);
    
    // 2. Set extra HTTP headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    });
    
    // 3. Override navigator.webdriver property and other bot detection signals
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Override permissions API
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Add chrome object if missing (Chrome-specific)
      if (!window.chrome) {
        window.chrome = {
          runtime: {},
        };
      }
      
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    // Set viewport (unless visible and maximized)
    if (headless) {
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });
    }

    // Navigate to page
    console.log(`📄 [Puppeteer Local] Navigating to: ${url}`);
    const navigationStart = Date.now();
    progress('navigating', { url });

    const navigationOptions = {
      timeout,
      waitUntil: waitForNetworkIdle ? 'networkidle2' : 'domcontentloaded'
    };

    try {
      const response = await page.goto(url, navigationOptions);
      
      // Check response status
      if (response) {
        const status = response.status();
        console.log(`📄 [Puppeteer Local] Response status: ${status}`);
        
        if (status === 403) {
          throw new Error(`403 Forbidden - The site is blocking automated browsers. The page may have bot detection (Cloudflare, reCAPTCHA, etc.). Try using a different scraping method or tool.`);
        } else if (status === 404) {
          throw new Error(`404 Not Found - The requested URL does not exist: ${url}`);
        } else if (status >= 400) {
          throw new Error(`HTTP ${status} error when accessing ${url}`);
        }
      }
    } catch (error) {
      // Enhance error messages
      if (error.message.includes('Navigation timeout') || error.message.includes('timeout exceeded')) {
        throw new Error(`Navigation timeout (${timeout}ms exceeded) when loading ${url}. The page may be too slow or blocking automated access.`);
      } else if (error.message.includes('net::ERR_')) {
        // Network errors
        throw new Error(`Network error: ${error.message}. Check your internet connection and verify the URL is accessible.`);
      } else if (error.message.includes('403')) {
        // Already formatted above, just rethrow
        throw error;
      } else {
        // Generic navigation error
        throw new Error(`Failed to navigate to ${url}: ${error.message}`);
      }
    }

    const navigationTime = Date.now() - navigationStart;
    console.log(`✅ [Puppeteer Local] Page loaded in ${navigationTime}ms`);
    progress('page_loaded', { navigationTime });

    // Wait for specific selector if provided
    if (waitForSelector) {
      console.log(`⏳ [Puppeteer Local] Waiting for selector: ${waitForSelector}`);
      progress('waiting_selector', { selector: waitForSelector });
      
      await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {
        console.warn(`⚠️ [Puppeteer Local] Selector not found: ${waitForSelector}`);
      });
    }

    // Give additional time for JavaScript to execute
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extract content from the rendered page
    console.log(`📖 [Puppeteer Local] Extracting content...`);
    const extractionStart = Date.now();
    progress('extracting');

    const content = await page.evaluate((opts) => {
      const result = {
        title: document.title || '',
        text: '',
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

      // Extract text content (remove scripts and styles)
      const clone = document.body ? document.body.cloneNode(true) : document.createElement('body');
      clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      result.text = clone.innerText || clone.textContent || '';

      // Extract links if requested
      if (opts.extractLinks) {
        const linkElements = document.querySelectorAll('a[href]');
        result.links = Array.from(linkElements)
          .map(a => {
            try {
              const absoluteUrl = new URL(a.href, window.location.href).href;
              return {
                url: absoluteUrl,
                text: (a.textContent || '').trim().substring(0, 200)
              };
            } catch {
              return null;
            }
          })
          .filter(link => link && link.url && link.url.startsWith('http'))
          .slice(0, 100); // Limit to 100 links
      }

      // Extract images if requested
      if (opts.extractImages) {
        const imgElements = document.querySelectorAll('img[src]');
        result.images = Array.from(imgElements)
          .map(img => {
            try {
              const absoluteUrl = new URL(img.src, window.location.href).href;
              return {
                url: absoluteUrl,
                alt: img.alt || ''
              };
            } catch {
              return null;
            }
          })
          .filter(img => img && img.url && img.url.startsWith('http'))
          .slice(0, 50); // Limit to 50 images
      }

      return result;
    }, { extractLinks, extractImages });

    const extractionTime = Date.now() - extractionStart;
    console.log(`✅ [Puppeteer Local] Content extracted in ${extractionTime}ms`);
    progress('extracted', { 
      textLength: content.text.length,
      linkCount: content.links.length,
      imageCount: content.images.length
    });

    // Take screenshot if requested
    let screenshotData = null;
    if (screenshot) {
      console.log(`📸 [Puppeteer Local] Taking screenshot...`);
      progress('screenshot');
      
      screenshotData = await page.screenshot({
        type: 'png',
        fullPage: false,
        encoding: 'base64'
      });
    }

    const totalTime = Date.now() - startTime;

    const result = {
      url,
      title: content.title,
      text: content.text,
      links: content.links,
      images: content.images,
      meta: content.meta,
      screenshot: screenshotData,
      stats: {
        totalTime,
        launchTime,
        navigationTime,
        extractionTime,
        textLength: content.text.length,
        linkCount: content.links.length,
        imageCount: content.images.length
      }
    };

    console.log(`✅ [Puppeteer Local] Scraping complete: ${result.text.length} chars, ${result.links.length} links, ${result.images.length} images (${totalTime}ms total)`);
    progress('complete', { 
      textLength: result.text.length,
      linkCount: result.links.length,
      imageCount: result.images.length,
      totalTime
    });

    return result;

  } catch (error) {
    console.error(`❌ [Puppeteer Local] Scraping error:`, error);
    progress('error', { error: error.message });
    throw error;
  } finally {
    // Cleanup
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error('[Puppeteer Local] Error closing page:', e.message);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('[Puppeteer Local] Error closing browser:', e.message);
      }
    }
  }
}

module.exports = { scrapePage };
