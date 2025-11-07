const path = require('path');
const { spawn } = require('child_process');

const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * Perform Google Search using Selenium WebDriver (via Python script)
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results to return
 * @param {string} userEmail - User email for billing
 * @returns {Promise<Array>} - Array of search results
 */
async function performGoogleSearch(query, maxResults = 5, userEmail = null) {
    if (IS_LAMBDA) {
        console.log('⚠️ Google Search via Selenium not available on Lambda, skipping...');
        return null;
    }

    return new Promise((resolve, reject) => {
        console.log(`🔍 [Google Search] Starting search for: "${query}"`);
        
        const scriptPath = path.join(__dirname, '../scrapers/google-search.py');
        
        // Use system python3 (undetected-chromedriver is installed there)
        const pythonCommand = '/usr/bin/python3';
        
        // Get proxy credentials from environment
        const proxyUsername = process.env.WS_U || process.env.PXY_USER;
        const proxyPassword = process.env.WS_P || process.env.PXY_PASS;
        const useProxy = !!(proxyUsername && proxyPassword);
        
        const args = [
            scriptPath,
            query,
            '--max-results', maxResults.toString(),
            '--timeout', '30'
        ];
        
        // Add proxy credentials if available
        if (useProxy) {
            args.push('--proxy-username', proxyUsername);
            args.push('--proxy-password', proxyPassword);
            console.log('🔒 [Google Search] Proxy enabled:', `${proxyUsername}@p.webshare.io`);
        }

        console.log('🤖 [Google Search] Spawning Python script:', pythonCommand, args.filter(a => a !== proxyPassword).join(' '));

        const pythonProcess = spawn(pythonCommand, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
            // Log stderr in real-time for debugging
            const stderrLine = data.toString().trim();
            if (stderrLine) {
                console.log('🤖 [Google Search]', stderrLine);
            }
        });

        pythonProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`❌ [Google Search] Python script failed with code: ${code}`);
                console.error(`❌ [Google Search] stderr: ${stderr}`);
                reject(new Error(`Google Search script exited with code ${code}: ${stderr}`));
                return;
            }

            try {
                // Parse JSON output from Python script
                const result = JSON.parse(stdout);
                
                if (result.error) {
                    console.log(`⚠️ [Google Search] Search returned error: ${result.error}`);
                    resolve(null);
                    return;
                }

                if (!result.success || !result.results || result.results.length === 0) {
                    console.log(`⚠️ [Google Search] No results found`);
                    resolve(null);
                    return;
                }

                console.log(`✨ [Google Search] Successfully extracted ${result.results.length} results`);

                // Log billing for Google Search (free, but track usage)
                if (userEmail && result.results.length > 0) {
                    try {
                        const { logLLMRequest } = require('../services/google-sheets-logger');
                        await logLLMRequest(
                            userEmail,
                            'Google Search',
                            'google-search',
                            0, // promptTokens
                            0, // completionTokens
                            0, // totalTokens
                            0, // cost (free)
                            { query, resultsCount: result.results.length },
                            null // no response body
                        );
                        console.log(`💰 [Google Search] Logged free search to billing (${result.results.length} results)`);
                    } catch (logError) {
                        console.error(`⚠️ [Google Search] Failed to log billing:`, logError.message);
                    }
                }

                resolve(result.results);

            } catch (parseError) {
                console.error(`❌ [Google Search] Failed to parse JSON output:`, parseError);
                console.error(`❌ [Google Search] stdout:`, stdout);
                reject(new Error(`Failed to parse search results: ${parseError.message}`));
            }
        });

        pythonProcess.on('error', (error) => {
            console.error(`❌ [Google Search] Failed to spawn Python process:`, error);
            reject(error);
        });
    });
}

module.exports = {
    performGoogleSearch
};
