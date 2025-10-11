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
    
    // Groq models (free tier)
    'llama-3.1-8b-instant': { input: 0, output: 0 },
    'llama-3.3-70b-versatile': { input: 0, output: 0 },
    'llama-3.1-70b-versatile': { input: 0, output: 0 },
    'mixtral-8x7b-32768': { input: 0, output: 0 }
};

/**
 * Calculate cost based on token usage
 */
function calculateCost(model, promptTokens, completionTokens) {
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
        
        // Calculate cost
        const cost = calculateCost(
            logData.model,
            logData.promptTokens || 0,
            logData.completionTokens || 0
        );
        
        // Format duration
        const durationSeconds = (logData.durationMs / 1000).toFixed(2);
        
        // Prepare row data: Date, Email, Provider, Model, Tokens In, Tokens Out, Total Tokens, Cost ($), Duration (s), Error Code, Error Message
        const rowData = [
            logData.timestamp || new Date().toISOString(),
            logData.userEmail || 'unknown',
            logData.provider || 'unknown',
            logData.model || 'unknown',
            logData.promptTokens || 0,
            logData.completionTokens || 0,
            logData.totalTokens || 0,
            cost.toFixed(4),
            durationSeconds,
            logData.errorCode || '',
            logData.errorMessage || ''
        ];
        
        // Append to sheet
        await appendToSheet(spreadsheetId, `${sheetName}!A:K`, rowData, accessToken);
        
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
        
        // Add headers
        const headers = [
            'Timestamp',
            'User Email',
            'Provider',
            'Model',
            'Tokens In',
            'Tokens Out',
            'Total Tokens',
            'Cost ($)',
            'Duration (s)',
            'Error Code',
            'Error Message'
        ];
        
        await appendToSheet(spreadsheetId, `${sheetName}!A1:K1`, headers, accessToken);
        
        console.log('✅ Google Sheets initialized with headers');
    } catch (error) {
        console.error('❌ Failed to initialize Google Sheets:', error.message);
    }
}

module.exports = {
    logToGoogleSheets,
    initializeSheet,
    calculateCost
};
