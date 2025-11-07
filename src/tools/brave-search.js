const path = require('path');
const { spawn } = require('child_process');

const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * Perform Brave Search using Selenium WebDriver (via Python script)
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results to return
 * @param {string} userEmail - User email for billing
 * @returns {Promise<Array>} - Array of search results
 */
async function performBraveSearch(query, maxResults = 5, userEmail = null) {
    if (IS_LAMBDA) {
        console.log('⚠️ Brave Search via Selenium not available on Lambda, skipping...');
        return null;
    }

    return new Promise((resolve, reject) => {
        console.log(`🦁 [Brave Search] Starting search for: "${query}"`);
        
        const scriptPath = path.join(__dirname, '../scrapers/brave-search.py');
        
        // Use system python3
        const pythonCommand = '/usr/bin/python3';
        
        const args = [
            scriptPath,
            query,
            '--max-results', maxResults.toString()
        ];

        console.log('🤖 [Brave Search] Spawning Python script:', pythonCommand, args.join(' '));

        const pythonProcess = spawn(pythonCommand, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdoutData = '';
        let stderrData = '';
        let stdoutClosed = false;
        let stderrClosed = false;

        pythonProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            console.log(`🔍 [Brave Search DEBUG] stdout chunk (${chunk.length} bytes)`);
            stdoutData += chunk;
        });

        pythonProcess.stdout.on('end', () => {
            console.log(`🔍 [Brave Search DEBUG] stdout stream ended`);
            stdoutClosed = true;
        });

        pythonProcess.stderr.on('data', (data) => {
            const message = data.toString();
            stderrData += message;
            // Log stderr in real-time for debugging
            console.log(`[Brave Search Python] ${message.trim()}`);
        });

        pythonProcess.stderr.on('end', () => {
            console.log(`🔍 [Brave Search DEBUG] stderr stream ended`);
            stderrClosed = true;
        });

        pythonProcess.on('close', (code) => {
            console.log(`🔍 [Brave Search DEBUG] Process closed with code: ${code}`);
            console.log(`🔍 [Brave Search DEBUG] stdout length: ${stdoutData.length}`);
            console.log(`🔍 [Brave Search DEBUG] stderr length: ${stderrData.length}`);
            
            if (code !== 0) {
                console.error(`❌ [Brave Search] Python script exited with code ${code}`);
                console.error(`[Brave Search] stderr: ${stderrData}`);
                resolve(null);
                return;
            }

            try {
                console.log(`🔍 [Brave Search DEBUG] Attempting to parse JSON...`);
                console.log(`🔍 [Brave Search DEBUG] stdout preview: ${stdoutData.substring(0, 200)}`);
                const result = JSON.parse(stdoutData);
                
                if (!result.success) {
                    console.error(`❌ [Brave Search] Search failed: ${result.error || 'Unknown error'}`);
                    resolve(null);
                    return;
                }

                console.log(`✅ [Brave Search] Found ${result.count} results`);

                // Log billing for search operation (FREE) - fire and forget
                if (userEmail) {
                    const { logToGoogleSheets } = require('../services/google-sheets-logger');
                    logToGoogleSheets({
                        timestamp: new Date().toISOString(),
                        email: userEmail || 'system',
                        provider: 'brave-search',
                        model: 'selenium-search',
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: 0,
                        cost: 0.00,
                        type: 'search',
                        metadata: JSON.stringify({ 
                            query, 
                            results: result.count,
                            source: 'brave-selenium'
                        })
                    }).then(() => {
                        console.log(`💰 [Brave Search] Logged billing: $0.00 (FREE)`);
                    }).catch((loggingError) => {
                        console.error('⚠️ [Brave Search] Failed to log billing:', loggingError.message);
                    });
                }

                resolve(result.results);

            } catch (parseError) {
                console.error(`❌ [Brave Search] Failed to parse JSON output:`, parseError.message);
                console.error(`[Brave Search] stdout: ${stdoutData}`);
                resolve(null);
            }
        });

        pythonProcess.on('error', (error) => {
            console.error(`❌ [Brave Search] Failed to spawn Python process:`, error.message);
            resolve(null);
        });
    });
}

module.exports = {
    performBraveSearch
};
