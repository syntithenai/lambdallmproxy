/**
 * Puppeteer Lambda Function Handler
 * 
 * Dedicated Lambda function for web scraping with headless Chromium.
 * Separated from main Lambda to allow different memory configuration (1024MB+).
 * 
 * Architecture:
 * - Main Lambda (llmproxy): 256-512MB, general LLM proxy functionality
 * - Puppeteer Lambda (llmproxy-puppeteer): 1024MB+, heavy Chromium scraping
 * 
 * Invocation:
 * - Called by main Lambda via AWS SDK Lambda.invoke()
 * - Receives: { url, timeout, options }
 * - Returns: { success, data: {...scraped content...} } or { success: false, error }
 */

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Chromium optimization for Lambda
chromium.setHeadlessMode = true;
chromium.setGraphicsMode = false;

/**
 * Scrape a webpage using headless Chromium
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

    // Wait for specific selector if provided
    if (waitForSelector) {
      console.log(`⏳ [Puppeteer] Waiting for selector: ${waitForSelector}`);
      await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {
        console.warn(`⚠️ [Puppeteer] Selector not found: ${waitForSelector}`);
      });
    }

    // Extract content from the rendered page
    console.log(`📖 [Puppeteer] Extracting content...`);
    const extractionStart = Date.now();

    const content = await page.evaluate((opts) => {
      const result = {
        title: document.title || '',
        text: document.body?.innerText || '',
        links: [],
        images: [],
        meta: {}
      };

      // Extract links if requested
      if (opts.extractLinks) {
        const linkElements = document.querySelectorAll('a[href]');
        result.links = Array.from(linkElements)
          .map(a => ({
            url: a.href,
            text: (a.textContent || '').trim()
          }))
          .filter(link => link.url && link.url.startsWith('http'))
          .slice(0, 100); // Limit to 100 links
      }

      // Extract images if requested
      if (opts.extractImages) {
        const imgElements = document.querySelectorAll('img[src]');
        result.images = Array.from(imgElements)
          .map(img => ({
            url: img.src,
            alt: img.alt || ''
          }))
          .filter(img => img.url && img.url.startsWith('http'))
          .slice(0, 50); // Limit to 50 images
      }

      // Extract meta tags
      const metaTags = document.querySelectorAll('meta');
      Array.from(metaTags).forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property');
        const content = meta.getAttribute('content');
        if (name && content) {
          result.meta[name] = content;
        }
      });

      return result;
    }, { extractLinks, extractImages });

    const extractionTime = Date.now() - extractionStart;
    console.log(`✅ [Puppeteer] Content extracted in ${extractionTime}ms`);

    // Take screenshot if requested
    let screenshotData = null;
    if (screenshot) {
      console.log(`📸 [Puppeteer] Taking screenshot...`);
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

    console.log(`✅ [Puppeteer] Scraping complete: ${result.text.length} chars, ${result.links.length} links, ${result.images.length} images`);

    return result;

  } catch (error) {
    console.error(`❌ [Puppeteer] Scraping error:`, error);
    throw error;
  } finally {
    // Cleanup
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error('Error closing page:', e.message);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e.message);
      }
    }
  }
}

/**
 * Lambda handler
 * 
 * Event format:
 * {
 *   url: string (required),
 *   timeout: number (optional, default 30000),
 *   waitForNetworkIdle: boolean (optional, default true),
 *   waitForSelector: string (optional),
 *   extractLinks: boolean (optional, default true),
 *   extractImages: boolean (optional, default true),
 *   screenshot: boolean (optional, default false)
 * }
 */
exports.handler = async (event, context) => {
  const startTime = Date.now();
  console.log('📥 [Puppeteer Lambda] Received request:', JSON.stringify(event, null, 2));

  try {
    // Validate input
    if (!event.url) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Missing required parameter: url'
        })
      };
    }

    // Extract parameters
    const url = String(event.url).trim();
    const options = {
      timeout: event.timeout || 30000,
      waitForNetworkIdle: event.waitForNetworkIdle !== false,
      waitForSelector: event.waitForSelector || null,
      extractLinks: event.extractLinks !== false,
      extractImages: event.extractImages !== false,
      screenshot: event.screenshot || false
    };

    // Scrape the page
    const result = await scrapePage(url, options);

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: result
      })
    };

  } catch (error) {
    console.error('❌ [Puppeteer Lambda] Handler error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        stack: process.env.ENV === 'development' ? error.stack : undefined
      })
    };
  } finally {
    // Log Lambda invocation for billing
    try {
      const { logLambdaInvocation } = require('./services/google-sheets-logger');
      const durationMs = Date.now() - startTime;
      const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 1024;
      const memoryUsedMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
      const requestId = context?.requestId || context?.awsRequestId || 'local-' + Date.now();
      
      await logLambdaInvocation({
        userEmail: event.userEmail || 'unknown',
        endpoint: '/puppeteer-scrape',
        memoryLimitMB,
        memoryUsedMB,
        durationMs,
        requestId,
        timestamp: new Date().toISOString()
      });
    } catch (logError) {
      console.error('Failed to log Puppeteer Lambda invocation:', logError.message);
    }
  }
};
