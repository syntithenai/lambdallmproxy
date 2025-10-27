/**
 * Tier 4: Interactive Mode with Manual Intervention
 * 
 * For sites with complex CAPTCHA, login requirements, or manual steps.
 * Opens a visible browser window and allows user to interact before scraping.
 * 
 * Features:
 * - Visible browser window (non-headless)
 * - Pause for manual CAPTCHA solving
 * - Pause for login/authentication
 * - User can navigate and interact
 * - Scrape after user confirms ready
 * 
 * ⚠️ LOCAL-ONLY: Not available on deployed Lambda (requires GUI)
 * 
 * Availability: Local development only (requires interactive environment)
 */

const IS_LAMBDA = !!process.env.AWS_FN;

// Prevent loading on Lambda
if (IS_LAMBDA) {
  throw new Error('Tier 4 (Interactive mode) is not available on Lambda. Use Tier 0, 1, or run locally.');
}

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const readline = require('readline');

// Add stealth plugin even for interactive mode
puppeteer.use(StealthPlugin());

/**
 * Create readline interface for user interaction
 * @returns {Object} Readline interface
 */
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask user a question and wait for response
 * @param {Object} rl - Readline interface
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's answer
 */
function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Scrape a URL using interactive mode with manual intervention
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @param {number} options.timeout - Navigation timeout in ms (default: 60000)
 * @param {boolean} options.screenshot - Take screenshot (default: false)
 * @param {string} options.waitMessage - Custom message to show user (optional)
 * @param {number} options.autoWaitTime - Auto-continue after this many ms (0 = wait forever)
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeTier4(url, options = {}) {
  const {
    timeout = 60000,
    screenshot = false,
    waitMessage = null,
    autoWaitTime = 0
  } = options;

  console.log(`👤 [Tier 4 - Interactive] Starting interactive scraping session...`);
  console.log(`🌐 [Tier 4] URL: ${url}`);
  console.log(`⚠️  [Tier 4] A browser window will open. You can manually interact with the page.`);
  
  const startTime = Date.now();
  let browser = null;
  let page = null;
  let rl = null;

  try {
    // Launch browser in NON-HEADLESS mode
    const launchStart = Date.now();
    console.log(`🚀 [Tier 4] Launching visible Chrome browser...`);
    
    browser = await puppeteer.launch({
      headless: false, // CRITICAL: Must be visible for user interaction
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--start-maximized'
      ],
      defaultViewport: null, // Use full window size
      ignoreHTTPSErrors: true
    });

    const launchTime = Date.now() - launchStart;
    console.log(`✅ [Tier 4] Browser launched in ${launchTime}ms`);

    // Create page
    page = await browser.newPage();

    // Add stealth JavaScript
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      window.chrome = { runtime: {} };
    });

    // Navigate to URL
    console.log(`📄 [Tier 4] Navigating to: ${url}`);
    const navStart = Date.now();
    
    const response = await page.goto(url, {
      timeout,
      waitUntil: 'networkidle2'
    });

    const navTime = Date.now() - navStart;
    console.log(`✅ [Tier 4] Page loaded in ${navTime}ms (status: ${response.status()})`);

    // Wait for user to complete manual tasks
    console.log(`\n${'='.repeat(70)}`);
    console.log(`👤 INTERACTIVE MODE - USER ACTION REQUIRED`);
    console.log(`${'='.repeat(70)}`);
    
    if (waitMessage) {
      console.log(`\n${waitMessage}\n`);
    } else {
      console.log(`\nPlease complete any manual tasks in the browser window:`);
      console.log(`  - Solve CAPTCHA if present`);
      console.log(`  - Login if required`);
      console.log(`  - Navigate to the desired page`);
      console.log(`  - Complete any other manual steps\n`);
    }
    
    console.log(`When ready, press ENTER to continue scraping...`);
    if (autoWaitTime > 0) {
      console.log(`(or wait ${autoWaitTime / 1000}s for automatic continuation)`);
    }
    console.log(`${'='.repeat(70)}\n`);

    // Wait for user confirmation
    if (autoWaitTime > 0) {
      // Auto-continue with timeout
      await Promise.race([
        new Promise(resolve => {
          rl = createReadline();
          rl.question('', () => {
            rl.close();
            resolve();
          });
        }),
        new Promise(resolve => setTimeout(resolve, autoWaitTime))
      ]);
      if (rl && !rl.closed) {
        rl.close();
      }
    } else {
      // Wait indefinitely for user
      rl = createReadline();
      await askQuestion(rl, '');
      rl.close();
    }

    console.log(`\n✅ [Tier 4] User confirmed ready, extracting content...`);

    // Extract content
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
    console.log(`✅ [Tier 4] Content extracted in ${extractTime}ms`);

    // Take screenshot if requested
    let screenshotData = null;
    if (screenshot) {
      console.log(`📸 [Tier 4] Taking screenshot...`);
      screenshotData = await page.screenshot({
        encoding: 'base64',
        fullPage: false
      });
    }

    const totalTime = Date.now() - startTime;

    const result = {
      success: true,
      tier: 4,
      method: 'interactive-manual',
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
      timestamp: new Date().toISOString(),
      userInteractive: true
    };

    console.log(`✅ [Tier 4] Complete: ${content.text.length} chars, ${content.links.length} links, ${content.images.length} images (${totalTime}ms)`);
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Browser will close in 3 seconds...`);
    console.log(`${'='.repeat(70)}\n`);
    
    // Give user time to see completion message
    await new Promise(resolve => setTimeout(resolve, 3000));

    return result;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [Tier 4] Failed after ${totalTime}ms:`, error.message);

    // Enhanced error for orchestrator
    const enhancedError = new Error(error.message);
    enhancedError.tier = 4;
    enhancedError.method = 'interactive-manual';
    enhancedError.responseTime = totalTime;
    
    throw enhancedError;

  } finally {
    // Cleanup readline
    if (rl && !rl.closed) {
      rl.close();
    }

    // Cleanup browser
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error(`⚠️ [Tier 4] Error closing page:`, e.message);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error(`⚠️ [Tier 4] Error closing browser:`, e.message);
      }
    }
  }
}

module.exports = {
  scrapeTier4
};
