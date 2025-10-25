/**
 * Google Sheets Logger for LLM API Requests
 * 
 * Logs LLM API usage to a Google Sheet using a Service Account
 * Tracks: user email, model, tokens in/out, cost, duration, timestamp
 * 
 * ARCHITECTURE:
 * - Each user gets their own sheet (tab) named after their email
 * - This avoids hitting Google Sheets' 10M cell limit per workbook
 * - Maximum supported users: 200 (Google Sheets tab limit per workbook)
 * - Sheet naming: Email address is sanitized (replace @ with _at_, . with _dot_)
 */

const https = require('https');

/**
 * Sanitize email address for use as sheet name
 * Google Sheets tab names have restrictions:
 * - Max 100 characters
 * - Cannot contain: : / ? * [ ] \
 * 
 * @param {string} email - User's email address
 * @returns {string} Sanitized sheet name
 */
function sanitizeEmailForSheetName(email) {
    if (!email || typeof email !== 'string') {
        return 'unknown_user';
    }
    
    // Replace @ and . with readable equivalents
    // Example: user@example.com -> user_at_example_dot_com
    let sanitized = email
        .toLowerCase()
        .replace(/@/g, '_at_')
        .replace(/\./g, '_dot_')
        .replace(/[:/\?*\[\]\\]/g, '_'); // Remove invalid characters
    
    // Truncate to 100 characters (Google Sheets limit)
    if (sanitized.length > 100) {
        sanitized = sanitized.substring(0, 100);
    }
    
    return sanitized;
}

/**
 * Get sheet name for a user (creates unique tab per user)
 * 
 * @param {string} userEmail - User's email address
 * @returns {string} Sheet name for this user
 */
function getUserSheetName(userEmail) {
    return sanitizeEmailForSheetName(userEmail);
}

// Pricing per 1M tokens (input/output) - update as needed
// NOTE: All pricing uses PAID TIER rates (free tier models map to paid tier for pricing)
const PRICING = {
    // Gemini models (PAID TIER PRICING - free tier keys charged at these rates)
    // Source: https://ai.google.dev/pricing (Oct 2025)
    'gemini-2.0-flash': { input: 0.075, output: 0.30 },      // Same as 1.5-flash
    'gemini-2.5-flash': { input: 0.075, output: 0.30 },      // Flash series
    'gemini-2.5-pro': { input: 1.25, output: 5.00 },         // Pro series
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },      // $0.075/$0.30 per 1M tokens
    'gemini-1.5-pro': { input: 1.25, output: 5.00 },         // $1.25/$5.00 per 1M tokens
    
    // OpenAI models (paid)
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.150, output: 0.600 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'o1-preview': { input: 15.00, output: 60.00 },
    'o1-mini': { input: 3.00, output: 12.00 },
    
    // Groq models (PAID TIER PRICING - free tier users are charged these rates)
    // Source: https://groq.com/pricing (Oct 2025)
    // Free tier models use paid tier pricing for cost calculation
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },          // Paid: $0.05/$0.08 per 1M tokens
    'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },       // Paid: $0.59/$0.79 per 1M tokens
    'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },       // Paid: $0.59/$0.79 per 1M tokens
    'llama-3.2-3b-preview': { input: 0.06, output: 0.06 },          // Paid: $0.06/$0.06 per 1M tokens
    'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },            // Paid: $0.24/$0.24 per 1M tokens
    'llama-3.1-405b-reasoning': { input: 2.78, output: 4.20 },      // Paid: $2.78/$4.20 per 1M tokens
    'meta-llama/llama-guard-4-12b': { input: 0.20, output: 0.20 },  // Paid: $0.20/$0.20 per 1M tokens
    
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

// Summarization configuration (hardcoded - no env vars needed)
const ARCHIVE_AFTER_DAYS = 90;  // Days before summarizing transactions

/**
 * Get list of shard spreadsheet IDs
 * Supports both old single ID and new comma-separated list
 * 
 * @returns {Array<string>} - Array of spreadsheet IDs
 */
function getShardSpreadsheetIds() {
    // Try new format first (comma-separated list)
    const newFormat = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_IDS;
    if (newFormat) {
        return newFormat.split(',').map(id => id.trim()).filter(id => id.length > 0);
    }
    
    // Fallback to old format (single ID)
    const oldFormat = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
    if (oldFormat) {
        return [oldFormat];
    }
    
    throw new Error('Missing GOOGLE_SHEETS_LOG_SPREADSHEET_IDS or GOOGLE_SHEETS_LOG_SPREADSHEET_ID');
}

/**
 * Determine which shard a user belongs to
 * Uses consistent hash to assign users to spreadsheets
 * 
 * @param {string} userEmail - User's email
 * @returns {string} - Spreadsheet ID for this user's shard
 */
function getShardSpreadsheetId(userEmail) {
    const shards = getShardSpreadsheetIds();
    
    if (shards.length === 1) {
        // Single spreadsheet - no sharding
        return shards[0];
    }
    
    // Hash email to determine shard (consistent hashing)
    const hash = userEmail.split('').reduce((sum, char) => {
        return sum + char.charCodeAt(0);
    }, 0);
    
    const shardIndex = hash % shards.length;
    
    console.log(`  📊 User ${userEmail} → Shard ${shardIndex + 1}/${shards.length}`);
    
    return shards[shardIndex];
}

/**
 * Calculate cost based on token usage or fixed cost (for image generation)
 * @param {string} model - Model name
 * @param {number} promptTokens - Input tokens (0 for image generation)
 * @param {number} completionTokens - Output tokens (0 for image generation)
 * @param {number} fixedCost - Fixed cost for non-token-based requests (image generation)
 */
/**
 * Calculate LLM API cost from token usage
 * 
 * ✅ CREDIT SYSTEM: LLM costs are PASS-THROUGH (no markup)
 * Users pay exactly what we pay to the LLM providers.
 * Only Lambda infrastructure costs get 4x markup (see calculateLambdaCost).
 * 
 * NOTE: Calculate costs in both local and production environments.
 * This allows tracking real API costs during development.
 * 
 * @param {string} model - Model name (e.g., 'gpt-4-turbo', 'llama-3.1-70b')
 * @param {number} promptTokens - Number of prompt/input tokens
 * @param {number} completionTokens - Number of completion/output tokens
 * @param {number|null} fixedCost - Optional fixed cost (e.g., image generation)
 * @returns {number} Total cost in dollars (no markup)
 */
/**
 * Calculate LLM operation cost
 * 
 * ✅ PRICING SYSTEM: Applies profit margin ONLY for server-side API keys
 * - User-provided keys (UI): $0 cost (pass-through, user pays provider directly)
 * - Server-side keys (environment): LLM cost + LLM_PROFIT_MARGIN% surcharge
 * 
 * @param {string} model - Model identifier (e.g., 'gpt-4', 'llama-3.1-8b-instant')
 * @param {number} promptTokens - Number of input/prompt tokens
 * @param {number} completionTokens - Number of output/completion tokens
 * @param {number|null} fixedCost - Fixed cost for operations like image generation (optional)
 * @param {boolean} isUserProvidedKey - Whether this is a user-provided API key from UI (default: false)
 * @returns {number} Cost in dollars
 */
function calculateCost(model, promptTokens, completionTokens, fixedCost = null, isUserProvidedKey = false) {
    // ✅ User-provided keys: $0 cost (they pay the provider directly)
    if (isUserProvidedKey) {
        console.log(`💰 Cost calculation: $0.00 (user-provided key)`);
        return 0;
    }
    
    // If fixed cost provided (e.g., image generation), apply surcharge
    if (fixedCost !== null && fixedCost !== undefined) {
        const surcharge = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
        const totalCost = fixedCost * (1 + surcharge);
        console.log(`💰 Cost calculation: $${fixedCost.toFixed(6)} + ${(surcharge * 100).toFixed(0)}% surcharge = $${totalCost.toFixed(6)} (server-side key, fixed cost)`);
        return totalCost;
    }
    
    // Map free tier model names to paid tier for pricing lookup
    // This ensures consistent pricing even if environment providers use free tier keys
    let pricingModel = model;
    if (model && (model.includes('groq-free') || model.includes('gemini-free'))) {
        pricingModel = model.replace('-free', '');
        console.log(`💰 Mapping free tier model ${model} → ${pricingModel} for pricing`);
    }
    
    // Calculate token-based cost using PAID TIER pricing
    const pricing = PRICING[pricingModel] || { input: 0, output: 0 };
    const inputCost = (promptTokens / 1000000) * pricing.input;
    const outputCost = (completionTokens / 1000000) * pricing.output;
    const baseCost = inputCost + outputCost;
    
    // Apply surcharge for server-side keys
    const surcharge = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
    const totalCost = baseCost * (1 + surcharge);
    
    console.log(`💰 Cost calculation: $${baseCost.toFixed(6)} + ${(surcharge * 100).toFixed(0)}% surcharge = $${totalCost.toFixed(6)} (server-side key)`);
    
    return totalCost;
}

/**
 * Calculate AWS Lambda invocation cost
 * 
 * ✅ CREDIT SYSTEM: Applies 4x profit margin to Lambda infrastructure costs
 * 
 * Pricing (us-east-1, x86_64, October 2025):
 * - Compute: $0.0000166667 per GB-second (AWS cost)
 * - Requests: $0.20 per 1M requests = $0.0000002 per request (AWS cost)
 * - Profit Margin: 4x multiplier (configurable via LAMBDA_PROFIT_MARGIN env var)
 * 
 * Example: 256MB for 500ms = $0.0000023 AWS cost × 4 = $0.0000092 charged to user
 * 
 * @param {number} memoryMB - Memory allocated in MB
 * @param {number} durationMs - Execution duration in milliseconds
 * @returns {number} Total cost in dollars (including profit margin)
 */
function calculateLambdaCost(memoryMB, durationMs) {
    // Convert memory to GB and duration to seconds
    const memoryGB = memoryMB / 1024;
    const durationSeconds = durationMs / 1000;
    
    // Calculate compute cost (GB-seconds)
    const computeCost = memoryGB * durationSeconds * 0.0000166667;
    
    // Calculate request cost
    const requestCost = 0.0000002;
    
    // Total AWS cost
    const awsCost = computeCost + requestCost;
    
    // Apply profit margin (default 4x, configurable via env var)
    const profitMargin = parseFloat(process.env.LAMBDA_PROFIT_MARGIN) || 4;
    const totalCost = awsCost * profitMargin;
    
    return totalCost;
}

/**
 * Get OAuth2 access token using Service Account JWT
 */
async function getAccessToken(serviceAccountEmail, privateKey) {
    const jwt = require('jsonwebtoken');
    
    console.log('🔑 Building JWT token...');
    console.log('   Service account:', serviceAccountEmail);
    console.log('   Private key length:', privateKey.length);
    
    const now = Math.floor(Date.now() / 1000);
    const claim = {
        iss: serviceAccountEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };
    
    let token;
    try {
        token = jwt.sign(claim, privateKey, { algorithm: 'RS256' });
        console.log('✅ JWT token signed');
    } catch (jwtError) {
        console.error('❌ JWT signing failed:', jwtError.message);
        throw new Error(`JWT signing failed: ${jwtError.message}`);
    }
    
    console.log('🌐 Requesting OAuth token from Google...');
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
            },
            timeout: 60000, // 60 second timeout (increased from 30s)
            family: 4 // Force IPv4 (sometimes IPv6 causes timeout issues)
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('📥 OAuth response status:', res.statusCode);
                if (res.statusCode === 200) {
                    try {
                        const response = JSON.parse(data);
                        console.log('✅ OAuth token received');
                        resolve(response.access_token);
                    } catch (parseError) {
                        console.error('❌ Failed to parse OAuth response:', parseError.message);
                        console.error('   Response data:', data);
                        reject(new Error(`Failed to parse OAuth response: ${parseError.message}`));
                    }
                } else {
                    console.error('❌ OAuth request failed:', res.statusCode);
                    console.error('   Response:', data);
                    reject(new Error(`OAuth failed: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('timeout', () => {
            console.error('❌ OAuth request timeout (60s)');
            console.error('   This may indicate network/firewall blocking Google APIs');
            req.destroy();
            reject(new Error('OAuth request timeout after 60 seconds'));
        });
        
        req.on('error', (error) => {
            console.error('❌ OAuth request error:', error.message);
            reject(error);
        });
        req.write(postData);
        req.end();
    });
}

/**
 * Ensure sheet has proper headers in the first row
 * If the first row is missing or doesn't look like headers, add them
 * 
 * @param {string} sheetName - Name of the sheet
 * @param {string} spreadsheetId - Google Sheets spreadsheet ID
 * @param {string} accessToken - OAuth access token
 */
async function ensureSheetHeaders(sheetName, spreadsheetId, accessToken) {
    const expectedHeaders = [
        'Timestamp', 'Email', 'Type', 'Model', 'Provider',
        'Tokens In', 'Tokens Out', 'Cost', 'Duration (ms)', 'Status'
    ];
    
    return new Promise((resolve, reject) => {
        // Read first row
        const range = `${sheetName}!A1:J1`;
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
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
                    const result = JSON.parse(data);
                    const firstRow = result.values?.[0] || [];
                    
                    // Check if headers exist and look correct
                    const hasValidHeaders = firstRow.length > 0 && 
                        firstRow.some(cell => expectedHeaders.includes(cell));
                    
                    if (hasValidHeaders) {
                        console.log(`✅ Sheet "${sheetName}" has valid headers`);
                        resolve(true);
                    } else {
                        // Insert headers at the top
                        console.log(`📝 Adding headers to sheet "${sheetName}"`);
                        const insertOptions = {
                            hostname: 'sheets.googleapis.com',
                            path: `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            }
                        };
                        
                        const insertPayload = JSON.stringify({
                            requests: [{
                                insertDimension: {
                                    range: {
                                        sheetId: 0, // Will be updated with correct sheetId
                                        dimension: 'ROWS',
                                        startIndex: 0,
                                        endIndex: 1
                                    },
                                    inheritFromBefore: false
                                }
                            }]
                        });
                        
                        // First, get sheetId for the sheet name
                        getSheetId(sheetName, spreadsheetId, accessToken)
                            .then(sheetId => {
                                const payload = JSON.stringify({
                                    requests: [{
                                        insertDimension: {
                                            range: {
                                                sheetId: sheetId,
                                                dimension: 'ROWS',
                                                startIndex: 0,
                                                endIndex: 1
                                            },
                                            inheritFromBefore: false
                                        }
                                    }]
                                });
                                
                                const insertReq = https.request(insertOptions, (insertRes) => {
                                    let insertData = '';
                                    insertRes.on('data', chunk => insertData += chunk);
                                    insertRes.on('end', () => {
                                        if (insertRes.statusCode === 200) {
                                            // Now write headers to A1:J1
                                            const writeRange = `${sheetName}!A1:J1`;
                                            const writeOptions = {
                                                hostname: 'sheets.googleapis.com',
                                                path: `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(writeRange)}?valueInputOption=RAW`,
                                                method: 'PUT',
                                                headers: {
                                                    'Authorization': `Bearer ${accessToken}`,
                                                    'Content-Type': 'application/json'
                                                }
                                            };
                                            
                                            const writePayload = JSON.stringify({
                                                values: [expectedHeaders]
                                            });
                                            
                                            const writeReq = https.request(writeOptions, (writeRes) => {
                                                let writeData = '';
                                                writeRes.on('data', chunk => writeData += chunk);
                                                writeRes.on('end', () => {
                                                    if (writeRes.statusCode === 200) {
                                                        console.log(`✅ Headers added to "${sheetName}"`);
                                                        resolve(true);
                                                    } else {
                                                        reject(new Error(`Failed to write headers: ${writeRes.statusCode}`));
                                                    }
                                                });
                                            });
                                            
                                            writeReq.on('error', reject);
                                            writeReq.write(writePayload);
                                            writeReq.end();
                                        } else {
                                            reject(new Error(`Failed to insert row: ${insertRes.statusCode}`));
                                        }
                                    });
                                });
                                
                                insertReq.on('error', reject);
                                insertReq.write(payload);
                                insertReq.end();
                            })
                            .catch(reject);
                    }
                } else {
                    reject(new Error(`Failed to read headers: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

/**
 * Get sheetId for a sheet name
 */
async function getSheetId(sheetName, spreadsheetId, accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
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
                    const result = JSON.parse(data);
                    const sheet = result.sheets?.find(s => s.properties.title === sheetName);
                    if (sheet) {
                        resolve(sheet.properties.sheetId);
                    } else {
                        reject(new Error(`Sheet "${sheetName}" not found`));
                    }
                } else {
                    reject(new Error(`Failed to get sheetId: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

/**
 * Consolidate multiple user sheets into one
 * Merges all matching sheets, sorts by timestamp, and deletes duplicates
 * 
 * @param {Array} matchingSheets - Array of sheet objects to consolidate
 * @param {string} targetSheetName - Final sheet name to keep
 * @param {string} spreadsheetId - Google Sheets spreadsheet ID
 * @param {string} accessToken - OAuth access token
 */
async function consolidateUserSheets(matchingSheets, targetSheetName, spreadsheetId, accessToken) {
    console.log(`🔄 Consolidating ${matchingSheets.length} sheets into "${targetSheetName}"...`);
    
    // 1. Read all data from all matching sheets
    const allTransactions = [];
    
    for (const sheet of matchingSheets) {
        const sheetName = sheet.properties.title;
        const transactions = await readSheetTransactions(sheetName, spreadsheetId, accessToken);
        console.log(`   📥 Read ${transactions.length} transactions from "${sheetName}"`);
        allTransactions.push(...transactions);
    }
    
    // 2. Sort by timestamp (oldest first)
    allTransactions.sort((a, b) => {
        const dateA = new Date(a[0]); // Timestamp is first column
        const dateB = new Date(b[0]);
        return dateA - dateB;
    });
    
    console.log(`   📊 Total transactions after merge: ${allTransactions.length}`);
    
    // 3. Determine which sheet to keep (prefer exact match, or first one)
    const targetSheet = matchingSheets.find(s => s.properties.title === targetSheetName) || matchingSheets[0];
    const targetSheetTitle = targetSheet.properties.title;
    
    // 4. Clear the target sheet
    await clearSheet(targetSheetTitle, spreadsheetId, accessToken);
    
    // 5. Ensure headers exist
    await ensureSheetHeaders(targetSheetTitle, spreadsheetId, accessToken);
    
    // 6. Write all consolidated data to target sheet
    if (allTransactions.length > 0) {
        await writeSheetData(targetSheetTitle, allTransactions, spreadsheetId, accessToken);
        console.log(`   ✅ Wrote ${allTransactions.length} transactions to "${targetSheetTitle}"`);
    }
    
    // 7. Delete the other sheets
    for (const sheet of matchingSheets) {
        if (sheet.properties.sheetId !== targetSheet.properties.sheetId) {
            await deleteSheet(sheet.properties.sheetId, spreadsheetId, accessToken);
            console.log(`   🗑️  Deleted duplicate sheet: "${sheet.properties.title}"`);
        }
    }
    
    // 8. Rename target sheet if needed (to match canonical format)
    if (targetSheetTitle !== targetSheetName) {
        await renameSheet(targetSheet.properties.sheetId, targetSheetName, spreadsheetId, accessToken);
        console.log(`   ✏️  Renamed "${targetSheetTitle}" → "${targetSheetName}"`);
    }
    
    console.log(`✅ Consolidation complete: "${targetSheetName}" now contains all ${allTransactions.length} transactions`);
}

/**
 * Read all transactions from a sheet
 */
async function readSheetTransactions(sheetName, spreadsheetId, accessToken) {
    return new Promise((resolve, reject) => {
        const range = `${sheetName}!A:J`;
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
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
                    const result = JSON.parse(data);
                    const rows = result.values || [];
                    
                    // Filter out header row and empty rows
                    const transactions = rows.filter((row, index) => {
                        if (index === 0) return false; // Skip header
                        if (!row || row.length === 0) return false; // Skip empty
                        if (!row[0]) return false; // Skip if no timestamp
                        return true;
                    });
                    
                    resolve(transactions);
                } else {
                    reject(new Error(`Failed to read sheet: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

/**
 * Clear all data from a sheet
 */
async function clearSheet(sheetName, spreadsheetId, accessToken) {
    return new Promise((resolve, reject) => {
        const range = `${sheetName}!A:J`;
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
            method: 'POST',
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
                    resolve(true);
                } else {
                    reject(new Error(`Failed to clear sheet: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write('{}');
        req.end();
    });
}

/**
 * Write data to a sheet (appending rows)
 */
async function writeSheetData(sheetName, rows, spreadsheetId, accessToken) {
    return new Promise((resolve, reject) => {
        const range = `${sheetName}!A2:J`; // Start at row 2 (after headers)
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        
        const payload = JSON.stringify({
            values: rows
        });
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    reject(new Error(`Failed to write data: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Delete a sheet by sheetId
 */
async function deleteSheet(sheetId, spreadsheetId, accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        
        const payload = JSON.stringify({
            requests: [{
                deleteSheet: {
                    sheetId: sheetId
                }
            }]
        });
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    reject(new Error(`Failed to delete sheet: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Rename a sheet
 */
async function renameSheet(sheetId, newName, spreadsheetId, accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        
        const payload = JSON.stringify({
            requests: [{
                updateSheetProperties: {
                    properties: {
                        sheetId: sheetId,
                        title: newName
                    },
                    fields: 'title'
                }
            }]
        });
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    reject(new Error(`Failed to rename sheet: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Check if a sheet tab exists, create it if not
 * 
 * @param {string} spreadsheetId - Google Sheets spreadsheet ID
 * @param {string} sheetName - Name of the sheet to ensure exists
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<boolean>} True if sheet exists or was created
 * @throws {Error} If 200 sheet limit is reached (error code: SHEET_LIMIT_REACHED)
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
            },
            timeout: 30000 // 30 second timeout
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                if (res.statusCode === 200) {
                    const spreadsheet = JSON.parse(data);
                    
                    // Check for exact match first
                    const exactMatch = spreadsheet.sheets?.find(
                        sheet => sheet.properties.title === sheetName
                    );
                    
                    // DUPLICATE PREVENTION: Check for similar sheet names (case-insensitive)
                    // This prevents accidental duplicates from different capitalization
                    const normalizedSheetName = sheetName.toLowerCase();
                    const existingSheets = spreadsheet.sheets || [];
                    const matchingSheets = existingSheets.filter(
                        sheet => sheet.properties.title.toLowerCase() === normalizedSheetName
                    );
                    
                    if (matchingSheets.length > 1) {
                        // CONSOLIDATION: Multiple sheets match - merge them into one
                        console.log(`🔄 Found ${matchingSheets.length} sheets matching "${sheetName}", consolidating...`);
                        try {
                            await consolidateUserSheets(matchingSheets, sheetName, spreadsheetId, accessToken);
                            console.log(`✅ Consolidated ${matchingSheets.length} sheets into "${sheetName}"`);
                            resolve(true);
                        } catch (consolidateError) {
                            console.error(`❌ Failed to consolidate sheets:`, consolidateError);
                            reject(consolidateError);
                        }
                        return;
                    } else if (matchingSheets.length === 1) {
                        // Single match found - validate and ensure headers
                        const matchedSheet = matchingSheets[0];
                        console.log(`✅ Found existing sheet: "${matchedSheet.properties.title}"`);
                        
                        // Ensure headers are present
                        try {
                            await ensureSheetHeaders(matchedSheet.properties.title, spreadsheetId, accessToken);
                            resolve(true);
                        } catch (headerError) {
                            console.error(`❌ Failed to ensure headers:`, headerError);
                            reject(headerError);
                        }
                        return;
                    }
                    
                    // Check if we're at the 200 sheet limit
                    const currentSheetCount = spreadsheet.sheets?.length || 0;
                    if (currentSheetCount >= 200) {
                        console.error(`❌ Google Sheets limit reached: ${currentSheetCount}/200 sheets`);
                        const error = new Error(
                            `System capacity reached: Maximum 200 users supported. ` +
                            `The system is currently at full capacity (${currentSheetCount} users). ` +
                            `Please try again later or contact the system administrator.`
                        );
                        error.code = 'SHEET_LIMIT_REACHED';
                        error.userMessage = 'System at full capacity. Unable to create new user account. Please try again later.';
                        reject(error);
                        return;
                    }
                    
                    // Sheet doesn't exist and we have capacity, create it
                    console.log(`📋 Creating new user sheet: "${sheetName}" (${currentSheetCount + 1}/200)`);
                    
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
                                console.log(`✅ Created sheet tab: "${sheetName}" (${currentSheetCount + 1}/200)`);
                                resolve(true);
                            } else if (createRes.statusCode === 400 && createResData.includes('exceeded')) {
                                // Google API returned 400 with "exceeded" message (backup check)
                                console.error(`❌ Google Sheets API limit error: ${createResData}`);
                                const error = new Error(
                                    `System capacity reached: Maximum 200 users supported. ` +
                                    `Please try again later or contact the system administrator.`
                                );
                                error.code = 'SHEET_LIMIT_REACHED';
                                error.userMessage = 'System at full capacity. Unable to create new user account. Please try again later.';
                                reject(error);
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
        
        req.on('timeout', () => {
            console.error('❌ Sheets API request timeout (30s) - ensureSheetExists');
            req.destroy();
            reject(new Error('Google Sheets API request timeout after 30 seconds'));
        });
        
        req.on('error', reject);
        req.end();
    });
}

/**
 * Check if sheet has any data (including headers)
 */
async function isSheetEmpty(spreadsheetId, sheetName, accessToken) {
    return new Promise((resolve, reject) => {
        const encodedRange = encodeURIComponent(`${sheetName}!A1:P1000`);
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheetId}/values/${encodedRange}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            timeout: 30000 // 30 second timeout to prevent indefinite hangs
        };
        
        console.log(`🔍 isSheetEmpty: Checking ${sheetName} in spreadsheet ${spreadsheetId}`);
        const startTime = Date.now();
        
        const req = https.request(options, (res) => {
            let data = '';
            let dataSize = 0;
            
            res.on('data', chunk => {
                data += chunk;
                dataSize += chunk.length;
                // Defensive: Prevent memory issues from huge responses
                if (dataSize > 5 * 1024 * 1024) { // 5MB limit
                    console.error(`❌ isSheetEmpty: Response too large (${dataSize} bytes), aborting`);
                    req.destroy();
                    reject(new Error(`Response too large: ${dataSize} bytes`));
                }
            });
            
            res.on('end', () => {
                const duration = Date.now() - startTime;
                console.log(`✅ isSheetEmpty: Response received in ${duration}ms (${res.statusCode})`);
                
                if (res.statusCode === 200) {
                    try {
                        const result = JSON.parse(data);
                        const isEmpty = !result.values || result.values.length === 0;
                        console.log(`✅ isSheetEmpty: Sheet ${isEmpty ? 'IS' : 'IS NOT'} empty`);
                        resolve(isEmpty);
                    } catch (parseError) {
                        console.error(`❌ isSheetEmpty: JSON parse error:`, parseError.message);
                        reject(new Error(`Failed to parse response: ${parseError.message}`));
                    }
                } else if (res.statusCode === 404) {
                    // Sheet range doesn't exist, so it's empty
                    console.log(`ℹ️ isSheetEmpty: Sheet not found (404), treating as empty`);
                    resolve(true);
                } else {
                    console.error(`❌ isSheetEmpty: Unexpected status ${res.statusCode}, response: ${data.substring(0, 200)}`);
                    reject(new Error(`Failed to check if sheet is empty: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('timeout', () => {
            const duration = Date.now() - startTime;
            console.error(`❌ isSheetEmpty: Request timeout after ${duration}ms (limit: 30s)`);
            console.error(`   Spreadsheet: ${spreadsheetId}, Sheet: ${sheetName}`);
            req.destroy();
            reject(new Error('Google Sheets API request timeout after 30 seconds (isSheetEmpty)'));
        });
        
        req.on('error', (error) => {
            const duration = Date.now() - startTime;
            console.error(`❌ isSheetEmpty: Network error after ${duration}ms:`, error.message);
            console.error(`   Error code: ${error.code}, Spreadsheet: ${spreadsheetId}`);
            reject(error);
        });
        
        req.end();
    });
}

/**
 * Add header row to sheet
 */
async function addHeaderRow(spreadsheetId, sheetName, accessToken) {
    const headers = [
        'Timestamp',
        'User Email',
        'Provider',
        'Model',
        'Type',
        'Tokens In',
        'Tokens Out',
        'Total Tokens',
        'Cost',
        'Duration (s)',
        'Memory Limit (MB)',
        'Memory Used (MB)',
        'Request ID',
        'Error Code',
        'Error Message',
        'Hostname'
    ];
    
    return new Promise((resolve, reject) => {
        const payload = {
            values: [headers]
        };
        
        const postData = JSON.stringify(payload);
        const encodedRange = encodeURIComponent(`${sheetName}!A1:P1`);
        
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 30000 // 30 second timeout
        };
        
        console.log(`🔍 addHeaderRow: Adding headers to ${sheetName} (${Buffer.byteLength(postData)} bytes)`);
        const startTime = Date.now();
        
        const req = https.request(options, (res) => {
            let data = '';
            let dataSize = 0;
            
            res.on('data', chunk => {
                data += chunk;
                dataSize += chunk.length;
                // Defensive: Prevent memory issues
                if (dataSize > 1 * 1024 * 1024) { // 1MB limit for header response
                    console.error(`❌ addHeaderRow: Response too large (${dataSize} bytes)`);
                    req.destroy();
                    reject(new Error(`Response too large: ${dataSize} bytes`));
                }
            });
            
            res.on('end', () => {
                const duration = Date.now() - startTime;
                console.log(`✅ addHeaderRow: Response received in ${duration}ms (${res.statusCode})`);
                
                if (res.statusCode === 200) {
                    try {
                        const result = JSON.parse(data);
                        console.log('✅ Added header row to sheet successfully');
                        resolve(result);
                    } catch (parseError) {
                        console.error(`❌ addHeaderRow: JSON parse error:`, parseError.message);
                        reject(new Error(`Failed to parse response: ${parseError.message}`));
                    }
                } else {
                    console.error(`❌ Failed to add headers: ${res.statusCode} - ${data.substring(0, 200)}`);
                    reject(new Error(`Failed to add headers: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('timeout', () => {
            const duration = Date.now() - startTime;
            console.error(`❌ addHeaderRow: Request timeout after ${duration}ms`);
            console.error(`   Spreadsheet: ${spreadsheetId}, Sheet: ${sheetName}`);
            req.destroy();
            reject(new Error('Google Sheets API request timeout after 30 seconds (addHeaderRow)'));
        });
        
        req.on('error', (error) => {
            const duration = Date.now() - startTime;
            console.error(`❌ addHeaderRow: Network error after ${duration}ms:`, error.message);
            console.error(`   Error code: ${error.code}`);
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
}

/**
 * Clear all data from sheet
 */
async function clearSheet(spreadsheetId, sheetName, accessToken) {
    return new Promise((resolve, reject) => {
        const encodedRange = encodeURIComponent(`${sheetName}!A:Z`);
        
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:clear`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': '0'
            },
            timeout: 30000 // 30 second timeout
        };
        
        console.log(`🔍 clearSheet: Clearing ${sheetName} in spreadsheet ${spreadsheetId}`);
        const startTime = Date.now();
        
        const req = https.request(options, (res) => {
            let data = '';
            let dataSize = 0;
            
            res.on('data', chunk => {
                data += chunk;
                dataSize += chunk.length;
                // Defensive: Prevent memory issues
                if (dataSize > 1 * 1024 * 1024) { // 1MB limit
                    console.error(`❌ clearSheet: Response too large (${dataSize} bytes)`);
                    req.destroy();
                    reject(new Error(`Response too large: ${dataSize} bytes`));
                }
            });
            
            res.on('end', () => {
                const duration = Date.now() - startTime;
                console.log(`✅ clearSheet: Response received in ${duration}ms (${res.statusCode})`);
                
                if (res.statusCode === 200) {
                    try {
                        const result = JSON.parse(data);
                        console.log('✅ Sheet cleared successfully');
                        resolve(result);
                    } catch (parseError) {
                        console.error(`❌ clearSheet: JSON parse error:`, parseError.message);
                        reject(new Error(`Failed to parse response: ${parseError.message}`));
                    }
                } else {
                    console.error(`❌ Failed to clear sheet: ${res.statusCode} - ${data.substring(0, 200)}`);
                    reject(new Error(`Failed to clear sheet: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('timeout', () => {
            const duration = Date.now() - startTime;
            console.error(`❌ clearSheet: Request timeout after ${duration}ms`);
            console.error(`   Spreadsheet: ${spreadsheetId}, Sheet: ${sheetName}`);
            req.destroy();
            reject(new Error('Google Sheets API request timeout after 30 seconds (clearSheet)'));
        });
        
        req.on('error', (error) => {
            const duration = Date.now() - startTime;
            console.error(`❌ clearSheet: Network error after ${duration}ms:`, error.message);
            console.error(`   Error code: ${error.code}`);
            reject(error);
        });
        
        req.end();
    });
}

/**
 * Append data to a Google Sheet
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
            },
            timeout: 30000 // 30 second timeout
        };
        
        console.log(`🔍 appendToSheet: Appending to ${range} (${Buffer.byteLength(postData)} bytes)`);
        const startTime = Date.now();
        
        const req = https.request(options, (res) => {
            let data = '';
            let dataSize = 0;
            
            res.on('data', chunk => {
                data += chunk;
                dataSize += chunk.length;
                // Defensive: Prevent memory issues
                if (dataSize > 2 * 1024 * 1024) { // 2MB limit
                    console.error(`❌ appendToSheet: Response too large (${dataSize} bytes)`);
                    req.destroy();
                    reject(new Error(`Response too large: ${dataSize} bytes`));
                }
            });
            
            res.on('end', () => {
                const duration = Date.now() - startTime;
                console.log(`📊 appendToSheet response: ${res.statusCode} (${duration}ms)`);
                
                if (res.statusCode === 200) {
                    try {
                        const result = JSON.parse(data);
                        const updatedRange = result.updates?.updatedRange || 'unknown';
                        const updatedRows = result.updates?.updatedRows || 0;
                        console.log(`✅ appendToSheet SUCCESS: ${updatedRows} rows added to ${range}`);
                        console.log(`   Updated range: ${updatedRange}`);
                        console.log(`   Full response:`, JSON.stringify(result.updates, null, 2));
                        resolve(result);
                    } catch (parseError) {
                        console.error(`❌ appendToSheet: JSON parse error:`, parseError.message);
                        reject(new Error(`Failed to parse response: ${parseError.message}`));
                    }
                } else {
                    console.error(`❌ appendToSheet FAILED: ${res.statusCode} - ${data.substring(0, 200)}`);
                    reject(new Error(`Sheets API error: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('timeout', () => {
            const duration = Date.now() - startTime;
            console.error(`❌ appendToSheet: Request timeout after ${duration}ms`);
            console.error(`   Spreadsheet: ${spreadsheetId}, Range: ${range}`);
            req.destroy();
            reject(new Error('Google Sheets API request timeout after 30 seconds (appendToSheet)'));
        });
        
        req.on('error', (error) => {
            const duration = Date.now() - startTime;
            console.error(`❌ appendToSheet network error after ${duration}ms:`, error.message);
            console.error(`   Error code: ${error.code}, Range: ${range}`);
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
}

/**
 * Log LLM request to Google Sheets
 * 
 * Each user gets their own sheet (tab) to avoid hitting the 10M cell limit.
 * Maximum supported users: 200 (Google Sheets workbook tab limit)
 * 
 * @param {Object} logData - Request data to log
 * @param {string} logData.userEmail - User's email address (REQUIRED - used to determine sheet name)
 * @param {string} logData.provider - LLM provider (openai, groq, gemini)
 * @param {string} logData.model - Model name
 * @param {number} logData.promptTokens - Input tokens
 * @param {number} logData.completionTokens - Output tokens
 * @param {number} logData.totalTokens - Total tokens
 * @param {number} logData.durationMs - Request duration in milliseconds
 * @param {string} logData.timestamp - ISO timestamp
 * @param {string} logData.errorCode - Error code if request failed (optional)
 * @param {string} logData.errorMessage - Error message if request failed (optional)
 * @throws {Error} If 200 sheet limit is reached (error code: SHEET_LIMIT_REACHED)
 */
async function logToGoogleSheets(logData) {
    // Check if Google Sheets logging is configured
    const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
    
    // Get user-specific sheet name (each user gets their own tab)
    const userEmail = logData.userEmail || 'unknown';
    const sheetName = getUserSheetName(userEmail);
    
    // ⚡ SHARDING: Get user-specific spreadsheet ID
    const spreadsheetId = getShardSpreadsheetId(userEmail);
    
    console.log('🔍 Google Sheets config check:', {
        hasSpreadsheetId: !!spreadsheetId,
        hasServiceAccountEmail: !!serviceAccountEmail,
        hasPrivateKey: !!privateKey,
        userEmail,
        sheetName,
        shard: spreadsheetId ? spreadsheetId.substring(0, 8) + '...' : 'NONE',  // Show shard hint
        logDataType: logData.type,
        logDataModel: logData.model
    });
    
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
        console.log('❌ Google Sheets logging not configured (skipping)', {
            spreadsheetId: spreadsheetId ? 'SET' : 'MISSING',
            serviceAccountEmail: serviceAccountEmail ? 'SET' : 'MISSING',
            privateKey: privateKey ? 'SET' : 'MISSING'
        });
        return;
    }
    
    try {
        // Format private key (handle escaped newlines)
        console.log('🔐 Formatting private key...');
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        console.log('🔐 Private key formatted, length:', formattedKey.length);
        
        // Get OAuth access token
        console.log('🔑 Getting OAuth access token...');
        let accessToken;
        try {
            accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
            console.log('✅ Got OAuth access token');
        } catch (authError) {
            console.error('❌ OAuth token error:', authError.message);
            console.error('   Stack:', authError.stack);
            throw authError;
        }
        
        // Ensure the user-specific sheet tab exists (creates it if needed)
        console.log(`📋 Ensuring user sheet exists: "${sheetName}" for ${userEmail}`);
        try {
            await ensureSheetExists(spreadsheetId, sheetName, accessToken);
            console.log('✅ Sheet exists or created');
        } catch (sheetError) {
            console.error('❌ Sheet creation/check error:', sheetError.message);
            console.error('   Stack:', sheetError.stack);
            throw sheetError;
        }
        
        // Check if sheet is empty and add headers if needed
        console.log('🔍 Checking if sheet is empty...');
        try {
            const isEmpty = await isSheetEmpty(spreadsheetId, sheetName, accessToken);
            if (isEmpty) {
                console.log('📝 Sheet is empty, adding header row...');
                await addHeaderRow(spreadsheetId, sheetName, accessToken);
            } else {
                console.log('✅ Sheet has data, skipping headers');
            }
        } catch (headerError) {
            console.warn('⚠️ Could not check/add headers (continuing anyway):', headerError.message);
        }
        
        // NOTE: Welcome credit is now added in getUserCreditBalance() on first balance check
        // This ensures users get credit even before making their first API call
        
        // Calculate cost (use provided cost for credit_added type, or calculate from tokens)
        let cost;
        if (logData.type === 'credit_added' && logData.cost !== undefined) {
            // For credit purchases (PayPal, etc.), use the exact amount without surcharge
            cost = logData.cost;
            console.log('💰 Credit purchase: using exact amount:', cost);
        } else {
            // For regular LLM/Lambda calls, calculate cost with surcharge
            cost = calculateCost(
                logData.model,
                logData.promptTokens || 0,
                logData.completionTokens || 0,
                logData.cost  // Pass through fixed cost if provided (e.g., for image generation)
            );
            console.log('💰 Calculated cost:', cost);
        }
        
        // Format duration
        const durationMs = logData.duration || logData.durationMs || 0;
        
        // Prepare row data in NEW 14-COLUMN SCHEMA
        // Old schema had: timestamp, email, provider, model, type, promptTokens, completionTokens, totalTokens, cost, duration, memoryLimitMB, memoryUsedMB, requestId, errorCode, errorMessage, hostname (16 columns)
        // New schema has: timestamp, email, type, model, provider, tokensIn, tokensOut, cost, durationMs, status, periodStart, periodEnd, transactionCount, breakdownJson (14 columns)
        const rowData = [
            logData.timestamp || new Date().toISOString(),  // A: timestamp
            logData.userEmail || 'unknown',                 // B: email
            logData.type || 'chat',                         // C: type (chat, embedding, credit_added, summary, etc.)
            logData.model || 'unknown',                     // D: model
            logData.provider || 'unknown',                  // E: provider
            logData.promptTokens || 0,                      // F: tokensIn
            logData.completionTokens || 0,                  // G: tokensOut
            cost.toFixed(4),                                // H: cost
            durationMs.toString(),                          // I: durationMs
            logData.errorCode ? 'ERROR' : 'SUCCESS',        // J: status
            '',                                             // K: periodStart (empty for regular transactions)
            '',                                             // L: periodEnd (empty for regular transactions)
            '',                                             // M: transactionCount (empty for regular transactions)
            ''                                              // N: breakdownJson (empty for regular transactions)
        ];
        
        console.log('📤 Appending row to user sheet...');
        console.log(`   User: ${userEmail}`);
        console.log(`   Sheet: ${sheetName}`);
        console.log('   Range:', `${sheetName}!A:N`);  // ⚡ SCHEMA UPDATE: Now using 14 columns (A-N)
        console.log('   Data preview:', {
            timestamp: rowData[0],
            email: rowData[1],
            type: rowData[2],
            model: rowData[3],
            provider: rowData[4],
            cost: rowData[7]
        });
        
        // Append to user-specific sheet (now 14 columns)
        try {
            await appendToSheet(spreadsheetId, `${sheetName}!A:N`, rowData, accessToken);
            console.log(`✅ Logged to Google Sheets [${sheetName}]: ${logData.model} (${logData.promptTokens + logData.completionTokens} tokens, $${cost.toFixed(4)})`);
        } catch (appendError) {
            console.error('❌ Append to sheet error:', appendError.message);
            console.error('   Stack:', appendError.stack);
            throw appendError;
        }
    } catch (error) {
        // Re-throw SHEET_LIMIT_REACHED errors so they can be handled by the caller
        if (error.code === 'SHEET_LIMIT_REACHED') {
            console.error('❌ CRITICAL: Sheet limit reached - throwing error to caller');
            throw error;
        }
        
        // Log other errors but don't fail the request
        console.error('❌ Failed to log to Google Sheets:', error.message);
        console.error('   Full error:', error);
        console.error('   Stack trace:', error.stack);
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
        // ⚡ NEW 14-COLUMN SCHEMA (reduced from 16 columns)
        const headers = [
            'Timestamp',           // A - ISO timestamp
            'Email',               // B - User email
            'Type',                // C - chat, embedding, credit_added, summary, etc.
            'Model',               // D - Model name
            'Provider',            // E - Provider name
            'Tokens In',           // F - Input tokens
            'Tokens Out',          // G - Output tokens
            'Cost ($)',            // H - Transaction cost
            'Duration (ms)',       // I - Duration in milliseconds
            'Status',              // J - SUCCESS, ERROR, ARCHIVED
            'Period Start',        // K - Summary period start (for summaries only)
            'Period End',          // L - Summary period end (for summaries only)
            'Transaction Count',   // M - Number of transactions in summary (for summaries only)
            'Breakdown JSON'       // N - Provider/model breakdown for summaries (JSON string)
        ];
        
        await appendToSheet(spreadsheetId, `${sheetName}!A1:N1`, headers, accessToken);
        
        console.log('✅ Google Sheets initialized with 14-column headers');
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
            },
            timeout: 30000 // 30 second timeout - CRITICAL for billing endpoint
        };

        console.log(`🔍 getSheetData: Fetching ${range} from spreadsheet ${spreadsheetId}`);
        const startTime = Date.now();
        
        const req = https.request(options, (res) => {
            let data = '';
            let dataSize = 0;
            
            res.on('data', chunk => {
                data += chunk;
                dataSize += chunk.length;
                // Defensive: Prevent memory issues from large billing data
                if (dataSize > 10 * 1024 * 1024) { // 10MB limit
                    console.error(`❌ getSheetData: Response too large (${dataSize} bytes), aborting`);
                    console.error(`   Range: ${range}, this indicates excessive billing data`);
                    req.destroy();
                    reject(new Error(`Response too large: ${dataSize} bytes. Range ${range} has too much data.`));
                }
            });
            
            res.on('end', () => {
                const duration = Date.now() - startTime;
                console.log(`✅ getSheetData: Response received in ${duration}ms (${res.statusCode}, ${dataSize} bytes)`);
                
                if (res.statusCode === 200) {
                    try {
                        const result = JSON.parse(data);
                        const rowCount = result.values?.length || 0;
                        console.log(`✅ getSheetData: Successfully parsed ${rowCount} rows from ${range}`);
                        resolve(result);
                    } catch (parseError) {
                        console.error(`❌ getSheetData: JSON parse error:`, parseError.message);
                        console.error(`   Data size: ${dataSize} bytes, Range: ${range}`);
                        reject(new Error(`Failed to parse response: ${parseError.message}`));
                    }
                } else {
                    console.error(`❌ getSheetData: Request failed with status ${res.statusCode}`);
                    console.error(`   Range: ${range}, Response: ${data.substring(0, 200)}`);
                    reject(new Error(`Get sheet data failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('timeout', () => {
            const duration = Date.now() - startTime;
            console.error(`❌ getSheetData: Request timeout after ${duration}ms (limit: 30s)`);
            console.error(`   CRITICAL: This is the function that caused 7 production timeouts!`);
            console.error(`   Spreadsheet: ${spreadsheetId}, Range: ${range}`);
            console.error(`   Possible causes: Google API unresponsive, network issues, DNS resolution failure`);
            req.destroy();
            reject(new Error('Google Sheets API request timeout after 30 seconds (getSheetData) - Check CloudWatch logs for network issues'));
        });

        req.on('error', (error) => {
            const duration = Date.now() - startTime;
            console.error(`❌ getSheetData: Network error after ${duration}ms:`, error.message);
            console.error(`   Error code: ${error.code}, Spreadsheet: ${spreadsheetId}, Range: ${range}`);
            console.error(`   Common codes: ECONNREFUSED (service down), ETIMEDOUT (network), ENOTFOUND (DNS)`);
            reject(error);
        });
        
        req.end();
    });
}

/**
 * Get total cost for a specific user by reading from their dedicated sheet
 * 
 * Each user has their own sheet (tab), so we only need to sum the cost column.
 * This is much faster than filtering a shared sheet with millions of rows.
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
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            console.log('ℹ️ Google Sheets logging not configured - returning 0 cost');
            return 0;
        }
        
        // Get user-specific sheet name
        const sheetName = getUserSheetName(userEmail);
        
        // Format private key (handle escaped newlines)
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        
        // Get OAuth access token
        const accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
        
        // Read all data from the user's sheet (columns A-P, skip header row)
        // Schema: Timestamp, User Email, Provider, Model, Type, Tokens In, Tokens Out, Total Tokens, Cost, Duration, Memory Limit, Memory Used, Request ID, Error Code, Error Message, Hostname
        const range = `${sheetName}!A2:P`;
        
        let sheetData;
        try {
            sheetData = await getSheetData(spreadsheetId, range, accessToken);
        } catch (error) {
            // Sheet doesn't exist yet (user has no usage data)
            if (error.message.includes('404') || error.message.includes('not found')) {
                console.log(`ℹ️ No sheet found for ${userEmail} - user has no usage data yet`);
                return 0;
            }
            throw error;
        }
        
        if (!sheetData.values || sheetData.values.length === 0) {
            console.log(`ℹ️ No usage data found in sheet for ${userEmail}`);
            return 0;
        }
        
        // Aggregate cost for the user (sum column I - index 8)
        // Column indexes: 0=Timestamp, 1=Email, 2=Provider, 3=Model, 4=Type, 5=TokensIn, 6=TokensOut, 7=TotalTokens, 8=Cost, ...
        let totalCost = 0;
        let recordCount = 0;
        let debugSample = [];
        
        for (const row of sheetData.values) {
            const rowCost = parseFloat(row[8]) || 0; // Column I (index 8) is Cost ($)
            
            // Skip rows with suspiciously high costs (likely schema misalignment from old logs)
            // Typical costs are $0.0001 to $0.50 per request. Anything over $1 is suspicious.
            if (rowCost > 1.0) {
                console.log(`⚠️ Skipping suspicious cost row: ${rowCost} (likely old schema misalignment)`);
                continue;
            }
            
            totalCost += rowCost;
            recordCount++;
            
            // Collect sample for debugging (first 3 and last 3)
            if (debugSample.length < 3 || recordCount > sheetData.values.length - 3) {
                debugSample.push({
                    timestamp: row[0],
                    model: row[3],
                    type: row[4],
                    cost: rowCost
                });
            }
        }
        
        console.log(`📊 [${sheetName}] Found ${recordCount} records, total cost: $${totalCost.toFixed(4)}`);
        console.log(`🔍 Sample records:`, JSON.stringify(debugSample, null, 2));
        
        return totalCost;
    } catch (error) {
        console.error('❌ Failed to get user total cost:', error.message);
        // Return 0 on error to avoid blocking users
        return 0;
    }
}

/**
 * Get detailed billing data for a specific user from their dedicated sheet
 * 
 * Each user has their own sheet (tab), so we just read that sheet directly.
 * This is much faster than filtering a shared sheet with millions of rows.
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
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            console.log('ℹ️ Google Sheets logging not configured - returning empty array');
            return [];
        }
        
        // Get user-specific sheet name
        const sheetName = getUserSheetName(userEmail);
        
        // Format private key (handle escaped newlines)
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        
        // Get OAuth access token
        const accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
        
        // Read all data from the user's sheet (columns A-P, skip header row)
        // Schema: Timestamp, User Email, Provider, Model, Type, Tokens In, Tokens Out, Total Tokens, Cost, Duration, Memory Limit, Memory Used, Request ID, Error Code, Error Message, Hostname
        const range = `${sheetName}!A2:P`;
        
        let sheetData;
        try {
            sheetData = await getSheetData(spreadsheetId, range, accessToken);
        } catch (error) {
            // Sheet doesn't exist yet (user has no usage data)
            if (error.message.includes('404') || error.message.includes('not found')) {
                console.log(`ℹ️ No sheet found for ${userEmail} - user has no usage data yet`);
                return [];
            }
            throw error;
        }
        
        if (!sheetData.values || sheetData.values.length === 0) {
            console.log(`ℹ️ No usage data found in sheet for ${userEmail}`);
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
            const timestamp = row[0]; // Column A - ISO timestamp
            const provider = row[2]; // Column C
            const model = row[3]; // Column D
            const type = row[4] || 'chat'; // Column E - Type (default to 'chat' for old entries)
            const tokensIn = parseInt(row[5]) || 0; // Column F
            const tokensOut = parseInt(row[6]) || 0; // Column G
            const totalTokens = parseInt(row[7]) || 0; // Column H
            const cost = parseFloat(row[8]) || 0; // Column I
            const duration = parseFloat(row[9]) || 0; // Column J
            const memoryLimit = parseInt(row[10]) || 0; // Column K
            const memoryUsed = parseInt(row[11]) || 0; // Column L
            const requestId = row[12] || ''; // Column M
            const errorCode = row[13] || ''; // Column N
            const errorMessage = row[14] || ''; // Column O
            const hostname = row[15] || 'unknown'; // Column P
            
            // Apply date filters
            if (startDate || endDate) {
                const txDate = new Date(timestamp);
                if (startDate && txDate < startDate) continue;
                if (endDate && txDate > endDate) continue;
            }
            
            // Apply type filter
            if (typeFilter && type.toLowerCase() !== typeFilter) continue;
            
            // Apply provider filter
            if (providerFilter && provider.toLowerCase() !== providerFilter) continue;
            
            // Create transaction object
            const transaction = {
                timestamp,
                provider,
                model,
                type,
                tokensIn,
                tokensOut,
                totalTokens,
                cost,
                durationMs: duration * 1000, // Convert seconds to milliseconds for consistency with UI
                memoryLimitMB: memoryLimit,
                memoryUsedMB: memoryUsed,
                requestId,
                hostname,
                status: errorCode ? 'error' : 'success',
                error: errorCode || errorMessage || ''
            };
            
            transactions.push(transaction);
        }
        
        console.log(`📊 [${sheetName}] Found ${transactions.length} transactions (filtered from ${sheetData.values.length} total)`);
        
        return transactions;
    } catch (error) {
        console.error('❌ Failed to get user billing data:', error.message);
        // Return empty array on error to avoid blocking users
        return [];
    }
}

/**
 * Log AWS Lambda invocation to Google Sheets
 * 
 * Each user gets their own sheet (tab) to avoid hitting the 10M cell limit.
 * 
 * @param {Object} logData - Lambda invocation data
 * @param {string} logData.userEmail - User's email address (REQUIRED - used to determine sheet name)
 * @param {string} logData.endpoint - Endpoint path (e.g., /chat, /search, /transcribe)
 * @param {number} logData.memoryLimitMB - Lambda memory limit in MB
 * @param {number} logData.memoryUsedMB - Lambda memory used in MB
 * @param {number} logData.durationMs - Request duration in milliseconds
 * @param {string} logData.requestId - Lambda request ID
 * @param {string} logData.timestamp - ISO timestamp
 * @param {string} logData.errorCode - Error code if request failed (optional)
 * @param {string} logData.errorMessage - Error message if request failed (optional)
 */
async function logLambdaInvocation(logData) {
    try {
        // Check if Google Sheets logging is configured
        const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
        const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
        
        // Get user-specific sheet name (each user gets their own tab)
        const userEmail = logData.userEmail || 'unknown';
        const sheetName = getUserSheetName(userEmail);
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            console.log('ℹ️ Google Sheets logging not configured (skipping Lambda invocation log)');
            return;
        }
        
        // Format private key (handle escaped newlines)
        console.log('🔐 [Lambda Log] Formatting private key...');
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        console.log('🔐 [Lambda Log] Private key formatted, length:', formattedKey.length);
        
        // Get OAuth access token
        console.log('🔑 [Lambda Log] Getting OAuth access token...');
        let accessToken;
        try {
            accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
            console.log('✅ [Lambda Log] Got OAuth access token');
        } catch (authError) {
            console.error('❌ [Lambda Log] OAuth token error:', authError.message);
            throw authError;
        }
        
        // Ensure the user-specific sheet tab exists (creates it if needed)
        console.log(`📋 [Lambda Log] Ensuring user sheet exists: "${sheetName}" for ${userEmail}`);
        try {
            await ensureSheetExists(spreadsheetId, sheetName, accessToken);
            console.log('✅ [Lambda Log] Sheet exists or created');
        } catch (sheetError) {
            console.error('❌ [Lambda Log] Sheet creation/check error:', sheetError.message);
            throw sheetError;
        }
        
        // Check if sheet is empty and add headers if needed
        console.log('🔍 [Lambda Log] Checking if sheet is empty...');
        try {
            const isEmpty = await isSheetEmpty(spreadsheetId, sheetName, accessToken);
            if (isEmpty) {
                console.log('📝 [Lambda Log] Sheet is empty, adding header row...');
                await addHeaderRow(spreadsheetId, sheetName, accessToken);
            } else {
                console.log('✅ [Lambda Log] Sheet has data, skipping headers');
            }
        } catch (headerError) {
            console.warn('⚠️ [Lambda Log] Could not check/add headers (continuing anyway):', headerError.message);
        }
        
        // Calculate Lambda cost
        const lambdaCost = calculateLambdaCost(logData.memoryLimitMB, logData.durationMs);
        console.log('💰 [Lambda Log] Calculated cost:', lambdaCost);
        
        // Format duration in seconds
        const durationSeconds = (logData.durationMs / 1000).toFixed(2);
        
        // Get hostname
        const os = require('os');
        const hostname = logData.hostname || process.env.AWS_LAMBDA_FUNCTION_NAME || os.hostname() || 'unknown';
        
        // Prepare row data - use same schema as LLM logs but with lambda_invocation type
        const rowData = [
            logData.timestamp || new Date().toISOString(),
            logData.userEmail || 'unknown',
            'aws-lambda',                      // Provider = 'aws-lambda' for Lambda invocations
            logData.endpoint || 'unknown',     // Model = endpoint path
            'lambda_invocation',               // Type = 'lambda_invocation'
            0,                                 // Tokens In (N/A for Lambda)
            0,                                 // Tokens Out (N/A for Lambda)
            0,                                 // Total Tokens (N/A for Lambda)
            lambdaCost.toFixed(8),            // Cost (8 decimals for precision)
            durationSeconds,                   // Duration in seconds
            logData.memoryLimitMB || '',       // Lambda memory limit
            logData.memoryUsedMB || '',        // Lambda memory used
            logData.requestId || '',           // Lambda request ID
            logData.errorCode || '',           // Error code
            logData.errorMessage || '',        // Error message
            hostname                           // Server hostname
        ];
        
        console.log('📤 [Lambda Log] Appending row to user sheet...');
        console.log(`   User: ${userEmail}`);
        console.log(`   Sheet: ${sheetName}`);
        console.log('   Range:', `${sheetName}!A:P`);
        console.log('   Data preview:', {
            timestamp: rowData[0],
            email: rowData[1],
            provider: rowData[2],
            endpoint: rowData[3],
            type: rowData[4],
            cost: rowData[8],
            duration: rowData[9],
            memoryUsed: rowData[11]
        });
        
        // Append to user-specific sheet
        try {
            await appendToSheet(spreadsheetId, `${sheetName}!A:P`, rowData, accessToken);
            console.log(`✅ Logged Lambda invocation [${sheetName}]: ${logData.endpoint} (${logData.durationMs}ms, ${logData.memoryUsedMB}MB, $${lambdaCost.toFixed(8)})`);
        } catch (appendError) {
            console.error('❌ [Lambda Log] Append to sheet error:', appendError.message);
            console.error('   Stack:', appendError.stack);
            throw appendError;
        }
    } catch (error) {
        // Re-throw SHEET_LIMIT_REACHED errors so they can be handled by the caller
        if (error.code === 'SHEET_LIMIT_REACHED') {
            console.error('❌ CRITICAL: Sheet limit reached during Lambda invocation logging - throwing error to caller');
            throw error;
        }
        
        // Log other errors but don't fail the request
        console.error('❌ Failed to log Lambda invocation to Google Sheets:', error.message);
    }
}

/**
 * Get all rows from a sheet (for reading transactions)
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet/tab name
 * @param {string} accessToken - Google API access token
 * @returns {Promise<Array>} - Array of row objects
 */
async function getSheetRows(spreadsheetId, sheetName, accessToken) {
    const range = `${sheetName}!A:N`;  // All columns (A-N, 14 columns)
    
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );
    
    if (!response.ok) {
        console.error(`❌ Failed to read sheet: ${await response.text()}`);
        return [];
    }
    
    const data = await response.json();
    const rows = data.values || [];
    
    // Skip header row and parse into objects
    return rows.slice(1).map((row, index) => ({
        rowIndex: index + 2, // +2 because: 1-indexed, skipped header
        timestamp: row[0],
        email: row[1],
        type: row[2],
        model: row[3],
        provider: row[4],
        tokensIn: row[5],
        tokensOut: row[6],
        cost: row[7],
        durationMs: row[8],
        status: row[9],
        periodStart: row[10],
        periodEnd: row[11],
        transactionCount: row[12],
        breakdownJson: row[13]  // NEW: JSON breakdown for summary entries
    }));
}

/**
 * Delete specific rows from a sheet
 * Deletes from bottom up to avoid index shifting issues
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet/tab name
 * @param {Array} rowsToDelete - Array of row objects with rowIndex property
 * @param {string} accessToken - Google API access token
 */
async function deleteRowsFromSheet(spreadsheetId, sheetName, rowsToDelete, accessToken) {
    if (!rowsToDelete || rowsToDelete.length === 0) {
        return;
    }
    
    // Get sheet ID (needed for batch update)
    const metaResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );
    
    const metadata = await metaResponse.json();
    const sheet = metadata.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
        console.error(`❌ Sheet "${sheetName}" not found in ${spreadsheetId}`);
        return;
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Sort row indices descending (delete from bottom up)
    const rowIndices = rowsToDelete
        .map(row => row.rowIndex)
        .filter(idx => idx !== undefined)
        .sort((a, b) => b - a); // Descending order
    
    // Batch delete in chunks of 100 (API limit)
    for (let i = 0; i < rowIndices.length; i += 100) {
        const chunk = rowIndices.slice(i, i + 100);
        
        const requests = chunk.map(rowIndex => ({
            deleteDimension: {
                range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: rowIndex - 1,  // 0-indexed for API
                    endIndex: rowIndex         // Exclusive end
                }
            }
        }));
        
        const deleteResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requests })
            }
        );
        
        if (!deleteResponse.ok) {
            console.error(`❌ Failed to delete rows: ${await deleteResponse.text()}`);
        }
    }
}

/**
 * Sort sheet by timestamp column (chronological order)
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet/tab name
 * @param {string} accessToken - Google API access token
 */
async function sortSheetByTimestamp(spreadsheetId, sheetName, accessToken) {
    // Get sheet ID
    const metaResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );
    
    const metadata = await metaResponse.json();
    const sheet = metadata.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
        console.error(`❌ Sheet "${sheetName}" not found`);
        return;
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Sort request (column 0 = timestamp, ascending)
    const sortResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [{
                    sortRange: {
                        range: {
                            sheetId: sheetId,
                            startRowIndex: 1  // Skip header row
                        },
                        sortSpecs: [{
                            dimensionIndex: 0,  // Column A (timestamp)
                            sortOrder: 'ASCENDING'
                        }]
                    }
                }]
            })
        }
    );
    
    if (!sortResponse.ok) {
        console.error(`❌ Failed to sort sheet: ${await sortResponse.text()}`);
    }
}

/**
 * Append summary entry to user's sheet
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet/tab name
 * @param {Object} summary - Summary object
 * @param {string} accessToken - Google API access token
 */
async function appendSummaryToSheet(spreadsheetId, sheetName, summary, accessToken) {
    const row = [
        summary.timestamp,
        summary.email,
        summary.type,
        summary.model,
        summary.provider,
        summary.tokensIn,
        summary.tokensOut,
        summary.cost,
        summary.durationMs,
        summary.status,
        summary.periodStart,
        summary.periodEnd,
        summary.transactionCount,
        summary.breakdownJson  // NEW: JSON string with provider/model breakdowns
    ];
    
    const range = `${sheetName}!A:N`;  // 14 columns (A-N)
    
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [row]
            })
        }
    );
    
    if (!response.ok) {
        throw new Error(`Failed to append summary: ${await response.text()}`);
    }
}

/**
 * Check if user has old transactions that need summarization
 * Called during balance check to trigger on-demand summarization
 * 
 * @param {string} userEmail - User's email address
 * @param {string} spreadsheetId - Active spreadsheet ID
 * @param {string} accessToken - Google API access token
 * @returns {Promise<boolean>} - True if summarization was performed
 */
async function summarizeOldTransactionsIfNeeded(userEmail, spreadsheetId, accessToken) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ARCHIVE_AFTER_DAYS);
    
    console.log(`🔍 Checking summarization need for ${userEmail} (cutoff: ${cutoffDate.toISOString()})`);
    
    const sheetName = getUserSheetName(userEmail);
    const rows = await getSheetRows(spreadsheetId, sheetName, accessToken);
    
    if (!rows || rows.length === 0) {
        console.log(`  ✓ No transactions for ${userEmail}`);
        return false;
    }
    
    // Find regular transactions (not summaries) older than cutoff
    const oldTransactions = rows.filter(row => {
        if (!row.timestamp) return false;
        if (row.type === 'summary') return false;  // Skip existing summaries
        const timestamp = new Date(row.timestamp);
        return timestamp < cutoffDate;
    });
    
    if (oldTransactions.length === 0) {
        console.log(`  ✓ No old transactions to summarize for ${userEmail}`);
        return false;
    }
    
    console.log(`📊 Summarizing ${oldTransactions.length} transactions for ${userEmail}`);
    
    // Find existing summary entries to merge
    const existingSummaries = rows.filter(row => row.type === 'summary');
    
    // Aggregate ALL old transactions AND existing summaries
    const allToAggregate = [...oldTransactions, ...existingSummaries];
    
    // Build provider and model breakdowns
    const byProvider = {};
    const byModel = {};
    
    for (const row of allToAggregate) {
        // For regular transactions, add to breakdown
        if (row.type !== 'summary') {
            const provider = row.provider || 'unknown';
            const model = row.model || 'unknown';
            const tokensIn = parseInt(row.tokensIn) || 0;
            const tokensOut = parseInt(row.tokensOut) || 0;
            const cost = parseFloat(row.cost) || 0;
            
            // Aggregate by provider
            if (!byProvider[provider]) {
                byProvider[provider] = { cost: 0, tokensIn: 0, tokensOut: 0, count: 0 };
            }
            byProvider[provider].cost += cost;
            byProvider[provider].tokensIn += tokensIn;
            byProvider[provider].tokensOut += tokensOut;
            byProvider[provider].count += 1;
            
            // Aggregate by model
            if (!byModel[model]) {
                byModel[model] = { cost: 0, tokensIn: 0, tokensOut: 0, count: 0, provider };
            }
            byModel[model].cost += cost;
            byModel[model].tokensIn += tokensIn;
            byModel[model].tokensOut += tokensOut;
            byModel[model].count += 1;
        } else {
            // For existing summaries, merge their breakdowns
            try {
                const breakdown = JSON.parse(row.breakdownJson || '{}');
                
                // Merge provider breakdown
                if (breakdown.byProvider) {
                    for (const [provider, stats] of Object.entries(breakdown.byProvider)) {
                        if (!byProvider[provider]) {
                            byProvider[provider] = { cost: 0, tokensIn: 0, tokensOut: 0, count: 0 };
                        }
                        byProvider[provider].cost += stats.cost || 0;
                        byProvider[provider].tokensIn += stats.tokensIn || 0;
                        byProvider[provider].tokensOut += stats.tokensOut || 0;
                        byProvider[provider].count += stats.count || 0;
                    }
                }
                
                // Merge model breakdown
                if (breakdown.byModel) {
                    for (const [model, stats] of Object.entries(breakdown.byModel)) {
                        if (!byModel[model]) {
                            byModel[model] = { 
                                cost: 0, 
                                tokensIn: 0, 
                                tokensOut: 0, 
                                count: 0, 
                                provider: stats.provider || 'unknown' 
                            };
                        }
                        byModel[model].cost += stats.cost || 0;
                        byModel[model].tokensIn += stats.tokensIn || 0;
                        byModel[model].tokensOut += stats.tokensOut || 0;
                        byModel[model].count += stats.count || 0;
                    }
                }
            } catch (e) {
                console.warn(`  ⚠️  Failed to parse breakdown JSON for existing summary: ${e.message}`);
            }
        }
    }
    
    const summary = {
        timestamp: new Date(Math.max(...allToAggregate.map(r => new Date(r.timestamp || r.periodEnd)))).toISOString(),
        email: userEmail,
        type: 'summary',
        model: 'AGGREGATED',
        provider: 'AGGREGATED',
        tokensIn: allToAggregate.reduce((sum, r) => sum + (parseInt(r.tokensIn) || 0), 0),
        tokensOut: allToAggregate.reduce((sum, r) => sum + (parseInt(r.tokensOut) || 0), 0),
        cost: allToAggregate.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0),
        durationMs: allToAggregate.reduce((sum, r) => sum + (parseInt(r.durationMs) || 0), 0),
        status: 'ARCHIVED',
        periodStart: new Date(Math.min(...allToAggregate.map(r => new Date(r.timestamp || r.periodStart)))).toISOString(),
        periodEnd: new Date(Math.max(...allToAggregate.map(r => new Date(r.timestamp || r.periodEnd)))).toISOString(),
        transactionCount: allToAggregate.reduce((sum, r) => sum + (parseInt(r.transactionCount) || 1), 0),
        breakdownJson: JSON.stringify({ byProvider, byModel })
    };
    
    console.log(`  📊 Summary: ${summary.transactionCount} transactions, ${summary.tokensIn + summary.tokensOut} tokens, $${summary.cost.toFixed(4)}`);
    console.log(`  📊 Breakdown: ${Object.keys(byProvider).length} providers, ${Object.keys(byModel).length} models`);
    
    // Delete old rows (both transactions and old summaries)
    await deleteRowsFromSheet(spreadsheetId, sheetName, allToAggregate, accessToken);
    console.log(`  ✅ Deleted ${allToAggregate.length} old rows from sheet`);
    
    // Append new summary entry
    await appendSummaryToSheet(spreadsheetId, sheetName, summary, accessToken);
    console.log(`  📊 Added summary entry for period ${summary.periodStart} to ${summary.periodEnd}`);
    
    // Sort sheet by timestamp (chronological order)
    await sortSheetByTimestamp(spreadsheetId, sheetName, accessToken);
    console.log(`  ✅ Sheet sorted chronologically`);
    
    return true;
}

/**
 * Get user's current credit balance from billing sheet
 * ✅ CREDIT SYSTEM: Calculate balance from all transactions
 * 
 * @param {string} userEmail - User's email address
 * @returns {Promise<number>} Current credit balance (positive = has credit)
 */
async function getUserCreditBalance(userEmail) {
    try {
        const spreadsheetId = getShardSpreadsheetId(userEmail);  // ⚡ SHARDING: User-specific spreadsheet
        const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            console.log('❌ Google Sheets logging not configured - cannot calculate balance');
            return 0;
        }
        
        // Format private key
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        
        // Get OAuth access token
        const accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
        
        // ⚡ SUMMARIZATION: Trigger on-demand summarization before balance calculation
        await summarizeOldTransactionsIfNeeded(userEmail, spreadsheetId, accessToken);
        
        // Get user sheet name
        const sheetName = getUserSheetName(userEmail);
        
        // Get all data from user's sheet (now reads 14 columns including breakdown_json)
        const range = `${sheetName}!A:N`;  // ⚡ SCHEMA UPDATE: Now using 14 columns (A-N)
        const data = await getSheetData(spreadsheetId, range, accessToken);
        
        // ✅ CREDIT SYSTEM: Check if user has any credit_added entries
        let hasWelcomeCredit = false;
        if (data && data.values && data.values.length > 1) {
            // Check if any transaction is a credit_added type
            for (let i = 1; i < data.values.length; i++) {
                const row = data.values[i];
                const type = row[2]; // ⚡ SCHEMA UPDATE: Type is now column index 2 (was 4 in old schema)
                if (type === 'credit_added') {
                    hasWelcomeCredit = true;
                    break;
                }
            }
        }
        
        // Add welcome credit if user doesn't have any credit entries yet
        if (!hasWelcomeCredit && userEmail !== 'unknown') {
            // User has no credit entries - add $0.50 welcome credit
            console.log(`🎁 Adding $0.50 welcome credit for ${userEmail} (no existing credits found)`);
            
            try {
                const welcomeCreditRow = [
                    new Date().toISOString(),          // timestamp (A)
                    userEmail,                         // email (B)
                    'credit_added',                    // type (C) ⚡ NEW SCHEMA
                    'welcome_credit',                  // model (D)
                    'system',                          // provider (E)
                    0,                                 // tokensIn (F)
                    0,                                 // tokensOut (G)
                    '-0.50',                           // cost (H) - negative = credit
                    '0',                               // durationMs (I)
                    'SUCCESS',                         // status (J)
                    '',                                // periodStart (K) - empty for regular transaction
                    '',                                // periodEnd (L) - empty for regular transaction
                    '',                                // transactionCount (M) - empty for regular transaction
                    ''                                 // breakdownJson (N) - empty for regular transaction
                ];
                
                // Append welcome credit to sheet (14 columns)
                await appendToSheet(spreadsheetId, `${sheetName}!A:N`, welcomeCreditRow, accessToken);
                console.log(`✅ Added $0.50 welcome credit to ${userEmail}`);
                
                // Return the welcome credit balance
                return 0.50;
                
            } catch (creditError) {
                console.error('❌ Failed to add welcome credit:', creditError.message);
                // Return 0 if we couldn't add the credit
                return 0;
            }
        }
        
        // Existing user - calculate balance from transactions (including summaries)
        let balance = 0;
        for (let i = 1; i < data.values.length; i++) {
            const row = data.values[i];
            const type = row[2]; // ⚡ SCHEMA UPDATE: Type is now column index 2 (was 4)
            const cost = parseFloat(row[7] || 0); // ⚡ SCHEMA UPDATE: Cost is now column index 7 (was 8)
            
            if (type === 'credit_added') {
                // Credits are stored as negative costs, so we add the absolute value
                balance += Math.abs(cost);
            } else if (type === 'summary') {
                // ⚡ SUMMARIZATION: Summary entries count as regular costs
                balance -= cost;
            } else {
                // Regular usage costs
                balance -= cost;
            }
        }
        
        console.log(`💳 Credit balance for ${userEmail}: $${balance.toFixed(4)}`);
        return balance;
        
    } catch (error) {
        console.error('❌ Failed to get credit balance:', error);
        console.error('   Error details:', {
            message: error?.message,
            code: error?.code,
            stack: error?.stack?.split('\n')[0]
        });
        // Return -1 to signal error (not 0, which looks like "no credit")
        // This allows fail-safe logic to distinguish between "no credit" and "error fetching credit"
        return -1;
    }
}

module.exports = {
    logToGoogleSheets,
    logLambdaInvocation,
    initializeSheet,
    calculateCost,
    calculateLambdaCost,
    getUserTotalCost,
    getUserBillingData,
    clearSheet,
    addHeaderRow,
    getUserSheetName,           // Export for testing/debugging
    sanitizeEmailForSheetName,  // Export for testing/debugging
    getUserCreditBalance        // ✅ NEW: Credit balance calculation
};
