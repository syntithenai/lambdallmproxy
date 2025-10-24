/**
 * YouTube Caption Scraper using Selenium
 * 
 * Extracts captions/transcripts from YouTube videos using browser automation.
 * This is a fallback when API methods fail, providing higher success rates.
 * 
 * Features:
 * - Bypasses API restrictions by acting like a real user
 * - Handles age-restricted videos (with login prompt)
 * - Extracts captions from the transcript panel DOM
 * - Returns structured data with timestamps
 * 
 * Tier: 3 (Selenium) or 4 (Interactive with login)
 */

const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

if (IS_LAMBDA) {
  throw new Error('YouTube caption scraping via Selenium is not available on Lambda. Use InnerTube API or OAuth API instead.');
}

/**
 * Scrape YouTube captions using Selenium
 * 
 * @param {string} videoId - YouTube video ID
 * @param {Object} options - Scraping options
 * @param {boolean} options.includeTimestamps - Return timestamps with captions (default: false)
 * @param {string} options.language - Preferred caption language (default: 'en')
 * @param {boolean} options.interactive - Keep browser open for manual intervention (default: false)
 * @param {number} options.timeout - Maximum wait time in ms (default: 30000)
 * @returns {Promise<Object>} - Transcript data with text, timestamps, and metadata
 */
async function scrapeYouTubeCaptions(videoId, options = {}) {
    const {
        language = 'en',
        includeTimestamps = true,
        interactive = false,
        timeout = 30
    } = options;

    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'youtube-caption-scraper.py');
        
        // Use venv Python if available, fallback to system python3
        const venvPython = path.join(__dirname, '../../venv/bin/python3');
        const pythonCommand = require('fs').existsSync(venvPython) ? venvPython : 'python3';
        
        const args = [
            scriptPath,
            videoId,
            '--language', language,
            '--timeout', timeout.toString()
        ];

        if (includeTimestamps) {
            args.push('--timestamps');
        }

        if (interactive) {
            args.push('--interactive');
        }

        console.log('🤖 [Selenium] Spawning Python script:', pythonCommand, args.join(' '));

        const pythonProcess = spawn(pythonCommand, args, {

/**
 * Check if Selenium dependencies are installed
 * @returns {Promise<boolean>}
 */
async function checkSeleniumDependencies() {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // Check if Python 3 is available
    await execAsync('python3 --version');

    // Check if selenium is installed
    const { stdout } = await execAsync('python3 -c "import selenium; print(selenium.__version__)"');
    console.log(`✅ Selenium version: ${stdout.trim()}`);

    // Check if undetected-chromedriver is installed
    try {
      await execAsync('python3 -c "import undetected_chromedriver"');
      console.log(`✅ undetected-chromedriver is installed`);
    } catch {
      console.warn(`⚠️ undetected-chromedriver not found. Install with: pip install undetected-chromedriver`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`❌ Selenium dependencies missing:`, error.message);
    console.error(`Install with: pip install selenium undetected-chromedriver`);
    return false;
  }
}

module.exports = {
  scrapeYouTubeCaptions,
  checkSeleniumDependencies
};
