/**
 * Tier 3: Selenium with Undetected ChromeDriver
 * 
 * 🔒 REQUIRED: Uses Python's undetected-chromedriver package
 * This is the most advanced anti-detection solution, specifically designed
 * to bypass Cloudflare, Distil Networks, and other bot detection systems.
 * 
 * Features:
 * - Most advanced bot detection evasion
 * - Bypasses Cloudflare "Checking your browser" challenges
 * - Handles aggressive anti-bot systems
 * - Python process with Node.js wrapper
 * 
 * ⚠️ LOCAL-ONLY: Not available on deployed Lambda (requires Python + large Chrome binary)
 * 
 * Availability: Local development only
 */

const { spawn } = require('child_process');
const path = require('path');

const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

// Prevent loading on Lambda
if (IS_LAMBDA) {
  throw new Error('Tier 3 (Selenium + undetected-chromedriver) is not available on Lambda. Use Tier 0 or 1 instead.');
}

/**
 * Get Python executable path (prefer Python 3.11 for distutils compatibility)
 * @returns {string} Path to Python executable
 */
function getPythonExecutable() {
  const fs = require('fs');
  
  // Prefer Python 3.11 if available (has distutils, needed by undetected-chromedriver)
  if (fs.existsSync('/usr/bin/python3.11')) {
    return '/usr/bin/python3.11';
  }
  
  // Check environment variable
  if (process.env.PYTHON_VENV_PATH) {
    const venvPython = path.join(process.env.PYTHON_VENV_PATH, 'bin', 'python3');
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
  }
  
  // Check default venv location
  const venvPython = path.join('.venv', 'bin', 'python3');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  
  // Fall back to system Python (packages installed with --break-system-packages or user install)
  return 'python3';
}

/**
 * Scrape a URL using undetected-chromedriver via Python
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @param {number} options.timeout - Navigation timeout in ms (default: 30000)
 * @param {boolean} options.screenshot - Take screenshot (default: false)
 * @param {boolean} options.headless - Run headless (default: false for better Cloudflare bypass)
 * @param {number} options.waitAfterLoad - Additional wait time after page load (ms)
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeTier3(url, options = {}) {
  const {
    timeout = 30000,
    screenshot = false,
    headless = false,  // Default to visible browser for better bypass
    waitAfterLoad = 2000,
    onProgress = null
  } = options;

  console.log(`🐍 [Tier 3 - Selenium+Undetected] Scraping: ${url}`);
  const startTime = Date.now();
  
  // Helper to emit progress
  const emitProgress = (stage, data = {}) => {
    if (onProgress && typeof onProgress === 'function') {
      onProgress({ stage, url, ...data });
    }
  };

  return new Promise((resolve, reject) => {
    // Path to Python script
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'undetected-chrome.py');
    const pythonExe = getPythonExecutable();

    console.log(`🐍 [Tier 3] Using Python: ${pythonExe}`);
    console.log(`🐍 [Tier 3] Script: ${scriptPath}`);

    // Emit initialization progress
    emitProgress('initializing', {
      message: 'Starting Selenium with undetected ChromeDriver',
      python: pythonExe
    });

    // Spawn Python process
    const python = spawn(pythonExe, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    });

    let stdoutData = '';
    let stderrData = '';

    // Collect stdout (JSON result)
    python.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    // Collect stderr (logs)
    python.stderr.on('data', (data) => {
      const message = data.toString();
      stderrData += message;
      // Forward Python logs to console
      process.stderr.write(message);
      
      // Emit progress based on Python log messages
      const msg = message.toLowerCase();
      if (msg.includes('starting chrome') || msg.includes('launching')) {
        emitProgress('launching_browser', { message: 'Launching Chrome browser with stealth' });
      } else if (msg.includes('navigating') || msg.includes('loading')) {
        emitProgress('loading_page', { message: 'Loading page content' });
      } else if (msg.includes('waiting') || msg.includes('sleep')) {
        emitProgress('waiting', { message: 'Waiting for page to settle' });
      } else if (msg.includes('extract')) {
        emitProgress('extracting', { message: 'Extracting page content' });
      } else if (msg.includes('screenshot')) {
        emitProgress('capturing', { message: 'Capturing screenshot' });
      }
    });

    // Handle process completion
    python.on('close', (code) => {
      const totalTime = Date.now() - startTime;

      if (code === 0) {
        try {
          // Parse JSON result from Python
          const pythonResult = JSON.parse(stdoutData);

          if (pythonResult.success) {
            // Transform Python result to our format
            const result = {
              success: true,
              tier: 3,
              method: 'selenium-undetected',
              url,
              title: pythonResult.title || '',
              description: '', // Python script doesn't extract meta description
              text: pythonResult.text || '',
              html: pythonResult.html || '',
              links: pythonResult.links || [],
              images: pythonResult.images || [],
              screenshot: pythonResult.screenshot || null,
              responseTime: totalTime,
              timings: {
                ...pythonResult.timings,
                total: totalTime
              },
              timestamp: new Date().toISOString()
            };

            console.log(`✅ [Tier 3] Complete: ${result.text.length} chars, ${result.links.length} links, ${result.images.length} images (${totalTime}ms)`);
            
            // Emit completion progress
            emitProgress('complete', {
              message: 'Scraping completed successfully',
              contentLength: result.text.length,
              linksCount: result.links.length,
              imagesCount: result.images.length,
              duration: totalTime
            });
            
            resolve(result);
          } else {
            // Python script returned error
            const error = new Error(pythonResult.error || 'Python script failed');
            error.tier = 3;
            error.method = 'selenium-undetected';
            error.responseTime = totalTime;
            error.pythonError = pythonResult.error;
            reject(error);
          }
        } catch (parseError) {
          // JSON parsing failed
          const error = new Error(`Failed to parse Python output: ${parseError.message}`);
          error.tier = 3;
          error.method = 'selenium-undetected';
          error.responseTime = totalTime;
          error.stdoutData = stdoutData;
          error.stderrData = stderrData;
          reject(error);
        }
      } else {
        // Python process exited with error
        const error = new Error(`Python process exited with code ${code}`);
        error.tier = 3;
        error.method = 'selenium-undetected';
        error.responseTime = totalTime;
        error.exitCode = code;
        error.stderrData = stderrData;
        
        // Check for specific error patterns
        if (stderrData.includes('undetected_chromedriver') && stderrData.includes('not installed')) {
          error.message = 'undetected-chromedriver not installed. Run: pip install undetected-chromedriver selenium';
          error.installRequired = true;
        } else if (stderrData.includes('403') || stderrData.includes('forbidden')) {
          error.status = 403;
          error.statusCode = 403;
        } else if (stderrData.includes('429') || stderrData.includes('rate limit')) {
          error.status = 429;
          error.statusCode = 429;
        }
        
        console.error(`❌ [Tier 3] Failed after ${totalTime}ms:`, error.message);
        reject(error);
      }
    });

    // Handle spawn errors
    python.on('error', (error) => {
      const totalTime = Date.now() - startTime;
      const enhancedError = new Error(`Failed to spawn Python process: ${error.message}`);
      enhancedError.tier = 3;
      enhancedError.method = 'selenium-undetected';
      enhancedError.responseTime = totalTime;
      enhancedError.originalError = error;
      
      if (error.code === 'ENOENT') {
        enhancedError.message = 'Python not found. Please install Python 3.8+ and run: npm run install:python';
        enhancedError.installRequired = true;
      }
      
      console.error(`❌ [Tier 3] Spawn error after ${totalTime}ms:`, enhancedError.message);
      reject(enhancedError);
    });

    // Send configuration to Python script via stdin
    const config = {
      url,
      timeout,
      headless,
      waitAfterLoad,
      screenshot
    };

    try {
      python.stdin.write(JSON.stringify(config));
      python.stdin.end();
    } catch (writeError) {
      const error = new Error(`Failed to write to Python stdin: ${writeError.message}`);
      error.tier = 3;
      error.method = 'selenium-undetected';
      error.originalError = writeError;
      reject(error);
    }
  });
}

module.exports = {
  scrapeTier3
};
