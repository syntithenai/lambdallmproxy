/**
 * Google Sheets Logger for LLM API Requests
 * 
 * Logs LLM API usage to a Google Sheet using a Service Account
 * Tracks: user email, model, tokens in/out, cost, duration, timestamp
 */

const https = require('https');

// Pricing per 1M tokens (input/output) - update as needed
const PRICING = {
    // Gemini models (free tier has no cost, but track for monitoring)
    'gemini-2.0-flash': { input: 0, output: 0 },
    'gemini-2.5-flash': { input: 0, output: 0 },
    'gemini-2.5-pro': { input: 0, output: 0 },
    'gemini-1.5-flash': { input: 0, output: 0 },
    'gemini-1.5-pro': { input: 0, output: 0 },
    
    // OpenAI models (paid)
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.150, output: 0.600 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'o1-preview': { input: 15.00, output: 60.00 },
    'o1-mini': { input: 3.00, output: 12.00 },
    
    // Groq models
    // Free tier
    'llama-3.1-8b-instant': { input: 0, output: 0 },
    'llama-3.3-70b-versatile': { input: 0, output: 0 },
    'llama-3.1-70b-versatile': { input: 0, output: 0 },
    'llama-3.2-3b-preview': { input: 0, output: 0 },
    'mixtral-8x7b-32768': { input: 0, output: 0 },
    // Paid tier
    'meta-llama/llama-guard-4-12b': { input: 0.20, output: 0.20 },
    
    // Together AI models (paid service)
    // Source: https://www.together.ai/pricing (Oct 2025)
    'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8': { input: 0.20, output: 0.20 },
    'meta-llama/Llama-4-Scout-17B-16E-Instruct': { input: 0.20, output: 0.20 },
    'meta-llama/Llama-3.3-70B-Instruct-Turbo': { input: 0.88, output: 0.88 },
    'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': { input: 0.88, output: 0.88 }, // Uses trial credits
    'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': { input: 3.50, output: 3.50 },
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': { input: 0.88, output: 0.88 },
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': { input: 0.18, output: 0.18 },
    'meta-llama/Llama-3.2-3B-Instruct-Turbo': { input: 0.06, output: 0.06 },
    'virtueguard-text-lite': { input: 0.10, output: 0.10 },
    'deepseek-ai/DeepSeek-V3.1': { input: 0.55, output: 1.10 },
    'deepseek-ai/DeepSeek-V3': { input: 0.27, output: 1.10 },
    'deepseek-ai/DeepSeek-R1': { input: 0.55, output: 2.19 },
    'deepseek-ai/DeepSeek-R1-0528-tput': { input: 0.30, output: 0.60 },
    'deepseek-ai/DeepSeek-R1-Distill-Llama-70B': { input: 0.88, output: 0.88 },
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B': { input: 0.20, output: 0.20 },
    'Qwen/Qwen2.5-72B-Instruct-Turbo': { input: 1.20, output: 1.20 },
    'Qwen/Qwen2.5-7B-Instruct-Turbo': { input: 0.18, output: 0.18 },
    'Qwen/Qwen2.5-Coder-32B-Instruct': { input: 0.60, output: 0.60 },
    'moonshotai/Kimi-K2-Instruct': { input: 1.00, output: 1.00 },
    'mistralai/Mistral-Small-24B-Instruct-2501': { input: 0.30, output: 0.30 },
    'zai-org/GLM-4.5-Air-FP8': { input: 0.30, output: 0.30 },
    
    // Atlas Cloud models (paid service, marketplace pricing)
    // Note: Pricing varies by provider, these are estimates
    'meta-llama/Llama-3.3-70B-Instruct': { input: 0.88, output: 0.88 },
    'meta-llama/Llama-3.1-405B-Instruct': { input: 3.50, output: 3.50 },
    'Qwen/Qwen2.5-72B-Instruct': { input: 1.20, output: 1.20 },
    
    // Embedding models (OpenAI)
    // Source: https://openai.com/api/pricing/ (Oct 2025)
    'text-embedding-3-small': { input: 0.02, output: 0 },
    'text-embedding-3-large': { input: 0.13, output: 0 },
    'text-embedding-ada-002': { input: 0.10, output: 0 }
};

/**
 * Calculate cost based on token usage or fixed cost (for image generation)
 * @param {string} model - Model name
 * @param {number} promptTokens - Input tokens (0 for image generation)
 * @param {number} completionTokens - Output tokens (0 for image generation)
 * @param {number} fixedCost - Fixed cost for non-token-based requests (image generation)
 */
function calculateCost(model, promptTokens, completionTokens, fixedCost = null) {
    // If fixed cost provided (e.g., image generation), use that
    if (fixedCost !== null && fixedCost !== undefined) {
        return fixedCost;
    }
    
    // Otherwise calculate from tokens
    const pricing = PRICING[model] || { input: 0, output: 0 };
    const inputCost = (promptTokens / 1000000) * pricing.input;
    const outputCost = (completionTokens / 1000000) * pricing.output;
    return inputCost + outputCost;
}

/**
 * Get OAuth2 access token using Service Account JWT
 */
async function getAccessToken(serviceAccountEmail, privateKey) {
    const jwt = require('jsonwebtoken');
    
    const now = Math.floor(Date.now() / 1000);
    const claim = {
        iss: serviceAccountEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };
    
    const token = jwt.sign(claim, privateKey, { algorithm: 'RS256' });
    
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: token
        }).toString();
        
        const options = {
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const response = JSON.parse(data);
                    resolve(response.access_token);
                } else {
                    reject(new Error(`OAuth failed: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * Check if a sheet tab exists, create it if not
 */
async function ensureSheetExists(spreadsheetId, sheetName, accessToken) {
    return new Promise((resolve, reject) => {
        // First, get list of sheets
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const spreadsheet = JSON.parse(data);
                    const sheetExists = spreadsheet.sheets?.some(
                        sheet => sheet.properties.title === sheetName
                    );
                    
                    if (sheetExists) {
                        resolve(true);
                        return;
                    }
                    
                    // Sheet doesn't exist, create it
                    const createPayload = {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: sheetName
                                }
                            }
                        }]
                    };
                    
                    const createData = JSON.stringify(createPayload);
                    const createOptions = {
                        hostname: 'sheets.googleapis.com',
                        path: `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(createData)
                        }
                    };
                    
                    const createReq = https.request(createOptions, (createRes) => {
                        let createResData = '';
                        createRes.on('data', chunk => createResData += chunk);
                        createRes.on('end', () => {
                            if (createRes.statusCode === 200) {
                                console.log(`✅ Created sheet tab: "${sheetName}"`);
                                resolve(true);
                            } else {
                                reject(new Error(`Failed to create sheet: ${createRes.statusCode} - ${createResData}`));
                            }
                        });
                    });
                    
                    createReq.on('error', reject);
                    createReq.write(createData);
                    createReq.end();
                    
                } else {
                    reject(new Error(`Failed to check sheets: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

/**
 * Append row to Google Sheet
 */
async function appendToSheet(spreadsheetId, range, values, accessToken) {
    return new Promise((resolve, reject) => {
        const payload = {
            values: [values]
        };
        
        const postData = JSON.stringify(payload);
        const encodedRange = encodeURIComponent(range);
        
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Sheets API error: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * Log LLM request to Google Sheets
 * 
 * @param {Object} logData - Request data to log
 * @param {string} logData.userEmail - User's email address
 * @param {string} logData.provider - LLM provider (openai, groq, gemini)
 * @param {string} logData.model - Model name
 * @param {number} logData.promptTokens - Input tokens
 * @param {number} logData.completionTokens - Output tokens
 * @param {number} logData.totalTokens - Total tokens
 * @param {number} logData.durationMs - Request duration in milliseconds
 * @param {string} logData.timestamp - ISO timestamp
 * @param {string} logData.errorCode - Error code if request failed (optional)
 * @param {string} logData.errorMessage - Error message if request failed (optional)
 */
async function logToGoogleSheets(logData) {
    try {
        // Check if Google Sheets logging is configured
        const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
        const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
        const sheetName = process.env.GOOGLE_SHEETS_LOG_SHEET_NAME || 'LLM Usage Log';
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            console.log('ℹ️ Google Sheets logging not configured (skipping)');
            return;
        }
        
        // Format private key (handle escaped newlines)
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        
        // Get OAuth access token
        const accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
        
        // Ensure the sheet tab exists (creates it if needed)
        await ensureSheetExists(spreadsheetId, sheetName, accessToken);
        
        // Calculate cost (use provided cost for image generation, or calculate from tokens)
        const cost = calculateCost(
            logData.model,
            logData.promptTokens || 0,
            logData.completionTokens || 0,
            logData.cost  // Pass through fixed cost if provided (e.g., for image generation)
        );
        
        // Format duration
        const durationMs = logData.duration || logData.durationMs || 0;
        const durationSeconds = (durationMs / 1000).toFixed(2);
        
        // Prepare row data with Lambda metrics
        const rowData = [
            logData.timestamp || new Date().toISOString(),
            logData.userEmail || 'unknown',
            logData.provider || 'unknown',
            logData.model || 'unknown',
            logData.type || 'chat',  // Type: chat, embedding, guardrail_input, guardrail_output, planning
            logData.promptTokens || 0,
            logData.completionTokens || 0,
            logData.totalTokens || 0,
            cost.toFixed(4),
            durationSeconds,
            logData.memoryLimitMB || '',      // Lambda memory limit
            logData.memoryUsedMB || '',       // Lambda memory used
            logData.requestId || '',          // Lambda request ID
            logData.errorCode || '',
            logData.errorMessage || ''
        ];
        
        // Append to sheet (now includes Type + Lambda metrics)
        await appendToSheet(spreadsheetId, `${sheetName}!A:O`, rowData, accessToken);
        
        console.log(`✅ Logged to Google Sheets: ${logData.model} (${logData.totalTokens} tokens, $${cost.toFixed(4)})`);
    } catch (error) {
        // Log error but don't fail the request
        console.error('❌ Failed to log to Google Sheets:', error.message);
    }
}

/**
 * Initialize Google Sheets with headers if needed
 * Call this once to set up the sheet structure
 */
async function initializeSheet() {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
        const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
        const sheetName = process.env.GOOGLE_SHEETS_LOG_SHEET_NAME || 'LLM Usage Log';
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            console.log('ℹ️ Google Sheets logging not configured');
            return;
        }
        
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        const accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
        
        // Ensure the sheet tab exists
        await ensureSheetExists(spreadsheetId, sheetName, accessToken);
        
        // Add headers (including Type, Lambda metrics)
        const headers = [
            'Timestamp',
            'User Email',
            'Provider',
            'Model',
            'Type',  // chat, embedding, guardrail_input, guardrail_output, planning
            'Tokens In',
            'Tokens Out',
            'Total Tokens',
            'Cost ($)',
            'Duration (s)',
            'Memory Limit (MB)',  // NEW: Lambda memory configuration
            'Memory Used (MB)',   // NEW: Lambda memory consumption
            'Request ID',         // NEW: Lambda request ID for debugging
            'Error Code',
            'Error Message'
        ];
        
        await appendToSheet(spreadsheetId, `${sheetName}!A1:O1`, headers, accessToken);
        
        console.log('✅ Google Sheets initialized with headers');
    } catch (error) {
        console.error('❌ Failed to initialize Google Sheets:', error.message);
    }
}

/**
 * Get all sheet data for a specific range
 */
async function getSheetData(spreadsheetId, range, accessToken) {
    return new Promise((resolve, reject) => {
        const encodedRange = encodeURIComponent(range);
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Get sheet data failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Get total cost for a specific user by aggregating from Google Sheets
 * 
 * @param {string} userEmail - User's email address
 * @returns {Promise<number>} Total cost in dollars
 */
async function getUserTotalCost(userEmail) {
    try {
        // Check if Google Sheets logging is configured
        const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
        const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
        const sheetName = process.env.GOOGLE_SHEETS_LOG_SHEET_NAME || 'LLM Usage Log';
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            console.log('ℹ️ Google Sheets logging not configured - returning 0 cost');
            return 0;
        }
        
        // Format private key (handle escaped newlines)
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        
        // Get OAuth access token
        const accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
        
        // Read all data from the sheet (columns A-K, skip header row)
        const range = `${sheetName}!A2:K`;
        const sheetData = await getSheetData(spreadsheetId, range, accessToken);
        
        if (!sheetData.values || sheetData.values.length === 0) {
            console.log(`ℹ️ No usage data found for ${userEmail}`);
            return 0;
        }
        
        // Aggregate cost for the user
        // Column indexes: 0=Timestamp, 1=Email, 2=Provider, 3=Model, 4=TokensIn, 5=TokensOut, 6=TotalTokens, 7=Cost, 8=Duration, 9=ErrorCode, 10=ErrorMessage
        let totalCost = 0;
        let recordCount = 0;
        
        for (const row of sheetData.values) {
            const rowEmail = row[1]; // Column B (index 1) is User Email
            const rowCost = parseFloat(row[7]) || 0; // Column H (index 7) is Cost ($)
            
            if (rowEmail === userEmail) {
                totalCost += rowCost;
                recordCount++;
            }
        }
        
        console.log(`📊 Found ${recordCount} records for ${userEmail}, total cost: $${totalCost.toFixed(4)}`);
        
        return totalCost;
    } catch (error) {
        console.error('❌ Failed to get user total cost:', error.message);
        // Return 0 on error to avoid blocking users
        return 0;
    }
}

/**
 * Get detailed billing data for a specific user from service sheet
 * 
 * @param {string} userEmail - User's email address
 * @param {Object} filters - Optional filters (startDate, endDate, type, provider)
 * @returns {Promise<Array>} Array of transaction objects
 */
async function getUserBillingData(userEmail, filters = {}) {
    try {
        // Check if Google Sheets logging is configured
        const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
        const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
        const sheetName = process.env.GOOGLE_SHEETS_LOG_SHEET_NAME || 'LLM Usage Log';
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            console.log('ℹ️ Google Sheets logging not configured - returning empty array');
            return [];
        }
        
        // Format private key (handle escaped newlines)
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        
        // Get OAuth access token
        const accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
        
        // Read all data from the sheet (columns A-K, skip header row)
        const range = `${sheetName}!A2:K`;
        const sheetData = await getSheetData(spreadsheetId, range, accessToken);
        
        if (!sheetData.values || sheetData.values.length === 0) {
            console.log(`ℹ️ No usage data found for ${userEmail}`);
            return [];
        }
        
        // Parse filters
        const startDate = filters.startDate ? new Date(filters.startDate) : null;
        const endDate = filters.endDate ? new Date(filters.endDate) : null;
        const typeFilter = filters.type?.toLowerCase();
        const providerFilter = filters.provider?.toLowerCase();
        
        // Convert rows to transaction objects and filter
        const transactions = [];
        
        for (const row of sheetData.values) {
            const rowEmail = row[1]; // Column B (index 1) is User Email
            
            // Skip if not this user
            if (rowEmail !== userEmail) continue;
            
            const timestamp = row[0]; // Column A - ISO timestamp
            const provider = row[2]; // Column C
            const model = row[3]; // Column D
            const tokensIn = parseInt(row[4]) || 0; // Column E
            const tokensOut = parseInt(row[5]) || 0; // Column F
            const totalTokens = parseInt(row[6]) || 0; // Column G
            const cost = parseFloat(row[7]) || 0; // Column H
            const duration = parseFloat(row[8]) || 0; // Column I
            const errorCode = row[9] || ''; // Column J
            const errorMessage = row[10] || ''; // Column K
            
            // Apply date filters
            if (startDate || endDate) {
                const txDate = new Date(timestamp);
                if (startDate && txDate < startDate) continue;
                if (endDate && txDate > endDate) continue;
            }
            
            // Apply provider filter
            if (providerFilter && provider.toLowerCase() !== providerFilter) continue;
            
            // Create transaction object
            const transaction = {
                timestamp,
                provider,
                model,
                tokensIn,
                tokensOut,
                totalTokens,
                cost,
                duration,
                type: 'chat', // Service sheet doesn't distinguish type, default to chat
                error: errorCode ? { code: errorCode, message: errorMessage } : null
            };
            
            // Apply type filter (service sheet doesn't have type, so only filter if explicitly 'chat')
            if (typeFilter && typeFilter !== 'chat') continue;
            
            transactions.push(transaction);
        }
        
        console.log(`📊 Found ${transactions.length} transactions for ${userEmail} (filtered from ${sheetData.values.length} total)`);
        
        return transactions;
    } catch (error) {
        console.error('❌ Failed to get user billing data:', error.message);
        // Return empty array on error to avoid blocking users
        return [];
    }
}

module.exports = {
    logToGoogleSheets,
    initializeSheet,
    calculateCost,
    getUserTotalCost,
    getUserBillingData
};
