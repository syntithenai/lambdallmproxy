/**
 * API Key Management Service
 * 
 * Manages REST API keys stored in Google Sheets.
 * Sheet: "User API Keys" in the logging spreadsheet.
 * 
 * Schema:
 * A: API Key (sk-...)
 * B: User Email
 * C: Key Name
 * D: Tier (free, pro, enterprise)
 * E: Created At
 * F: Last Used
 * G: Requests Count
 * H: Tokens Count
 * I: Revoked (TRUE/FALSE)
 * J: Notes
 */

const crypto = require('crypto');
const https = require('https');

const API_KEYS_SHEET_NAME = 'User API Keys';

/**
 * Generate new API key in OpenAI format (sk-...)
 */
function generateAPIKey() {
    const randomBytes = crypto.randomBytes(24);
    const key = `sk-${randomBytes.toString('base64url')}`;
    return key;
}

/**
 * Get OAuth2 access token using Service Account (from google-sheets-logger.js)
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
            },
            timeout: 30000
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
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('OAuth request timeout'));
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * Ensure "User API Keys" sheet exists
 */
async function ensureApiKeysSheetExists(spreadsheetId, accessToken) {
    // Check if sheet exists
    const metadata = await new Promise((resolve, reject) => {
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Get metadata failed: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
    
    const sheetExists = metadata.sheets?.some(
        sheet => sheet.properties.title === API_KEYS_SHEET_NAME
    );
    
    if (!sheetExists) {
        // Create sheet
        await new Promise((resolve, reject) => {
            const payload = JSON.stringify({
                requests: [{
                    addSheet: {
                        properties: {
                            title: API_KEYS_SHEET_NAME
                        }
                    }
                }]
            });
            
            const options = {
                hostname: 'sheets.googleapis.com',
                path: `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve();
                    } else {
                        reject(new Error(`Create sheet failed: ${res.statusCode}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
        
        // Add header row
        const headers = [
            'API Key',
            'User Email',
            'Key Name',
            'Tier',
            'Created At',
            'Last Used',
            'Requests Count',
            'Tokens Count',
            'Revoked',
            'Notes'
        ];
        
        await new Promise((resolve, reject) => {
            const payload = JSON.stringify({
                values: [headers]
            });
            
            const range = encodeURIComponent(`${API_KEYS_SHEET_NAME}!A1:J1`);
            const options = {
                hostname: 'sheets.googleapis.com',
                path: `/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        console.log(`✅ Created "User API Keys" sheet with headers`);
                        resolve();
                    } else {
                        reject(new Error(`Add headers failed: ${res.statusCode}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }
}

/**
 * Append row to sheet
 */
async function appendRow(spreadsheetId, sheetName, row, accessToken) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            values: [row]
        });
        
        const range = encodeURIComponent(`${sheetName}!A:J`);
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 30000
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Append row failed: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Append row timeout'));
        });
        
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Find row by value in specific column
 */
async function findRow(spreadsheetId, sheetName, searchValue, columnIndex, accessToken) {
    return new Promise((resolve, reject) => {
        const range = encodeURIComponent(`${sheetName}!A:J`);
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${range}`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const result = JSON.parse(data);
                    const rows = result.values || [];
                    
                    // Skip header row, search for value
                    for (let i = 1; i < rows.length; i++) {
                        if (rows[i][columnIndex] === searchValue) {
                            resolve({
                                rowIndex: i + 1, // 1-indexed
                                data: rows[i]
                            });
                            return;
                        }
                    }
                    
                    resolve(null); // Not found
                } else {
                    reject(new Error(`Find row failed: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

/**
 * Update specific row
 */
async function updateRow(spreadsheetId, sheetName, rowIndex, row, accessToken) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            values: [row]
        });
        
        const range = encodeURIComponent(`${sheetName}!A${rowIndex}:J${rowIndex}`);
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Update row failed: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Create new API key for user
 */
async function createAPIKey(userEmail, keyName = 'Default', tier = 'free', notes = '') {
    const apiKey = generateAPIKey();
    const timestamp = new Date().toISOString();
    
    // Get credentials
    const spreadsheetId = process.env.GS_SHEET_ID;
    const serviceAccountEmail = process.env.GS_EMAIL;
    const privateKey = (process.env.GS_KEY || '').replace(/\\n/g, '\n');
    
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
        throw new Error('Google Sheets configuration missing');
    }
    
    // Get access token
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    
    // Ensure sheet exists
    await ensureApiKeysSheetExists(spreadsheetId, accessToken);
    
    // Append row to "User API Keys" sheet
    const row = [
        apiKey,           // A: API Key
        userEmail,        // B: User Email
        keyName,          // C: Key Name
        tier,             // D: Tier
        timestamp,        // E: Created At
        '',               // F: Last Used (empty initially)
        '0',              // G: Requests Count
        '0',              // H: Tokens Count
        'FALSE',          // I: Revoked
        notes             // J: Notes
    ];
    
    await appendRow(spreadsheetId, API_KEYS_SHEET_NAME, row, accessToken);
    
    console.log(`✅ Created API key for ${userEmail}: ${apiKey.slice(0, 12)}...`);
    
    return {
        apiKey,
        userEmail,
        keyName,
        tier,
        createdAt: timestamp
    };
}

/**
 * Validate API key and get associated user
 */
async function validateAPIKey(apiKey) {
    // Get credentials
    const spreadsheetId = process.env.GS_SHEET_ID;
    const serviceAccountEmail = process.env.GS_EMAIL;
    const privateKey = (process.env.GS_KEY || '').replace(/\\n/g, '\n');
    
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
        return { valid: false, reason: 'Configuration error' };
    }
    
    // Get access token
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    
    // Find row with this API key
    const result = await findRow(
        spreadsheetId,
        API_KEYS_SHEET_NAME,
        apiKey,
        0, // Column A (API Key)
        accessToken
    );
    
    if (!result) {
        return { valid: false, reason: 'Invalid API key' };
    }
    
    const keyData = result.data;
    
    // Check if revoked (Column I, index 8)
    if (keyData[8] === 'TRUE') {
        return { valid: false, reason: 'API key revoked' };
    }
    
    // Update last used timestamp and increment request counter
    const now = new Date().toISOString();
    const requestsCount = parseInt(keyData[6] || '0') + 1;
    
    // Update row (preserve all columns, update F and G)
    const updatedRow = [
        keyData[0],              // A: API Key
        keyData[1],              // B: User Email
        keyData[2],              // C: Key Name
        keyData[3],              // D: Tier
        keyData[4],              // E: Created At
        now,                     // F: Last Used (updated)
        requestsCount.toString(), // G: Requests Count (incremented)
        keyData[7],              // H: Tokens Count
        keyData[8],              // I: Revoked
        keyData[9]               // J: Notes
    ];
    
    await updateRow(
        spreadsheetId,
        API_KEYS_SHEET_NAME,
        result.rowIndex,
        updatedRow,
        accessToken
    );
    
    return {
        valid: true,
        userEmail: keyData[1],           // Column B
        keyName: keyData[2],             // Column C
        tier: keyData[3],                // Column D
        requestsCount: requestsCount,
        tokensCount: parseInt(keyData[7] || '0')  // Column H
    };
}

/**
 * Increment token count for API key
 */
async function incrementTokenCount(apiKey, tokens) {
    // Get credentials
    const spreadsheetId = process.env.GS_SHEET_ID;
    const serviceAccountEmail = process.env.GS_EMAIL;
    const privateKey = (process.env.GS_KEY || '').replace(/\\n/g, '\n');
    
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
        return;
    }
    
    // Get access token
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    
    // Find row
    const result = await findRow(
        spreadsheetId,
        API_KEYS_SHEET_NAME,
        apiKey,
        0,
        accessToken
    );
    
    if (!result) return;
    
    const keyData = result.data;
    const tokensCount = parseInt(keyData[7] || '0') + tokens;
    
    // Update row (preserve all columns, update H)
    const updatedRow = [
        keyData[0],              // A: API Key
        keyData[1],              // B: User Email
        keyData[2],              // C: Key Name
        keyData[3],              // D: Tier
        keyData[4],              // E: Created At
        keyData[5],              // F: Last Used
        keyData[6],              // G: Requests Count
        tokensCount.toString(),  // H: Tokens Count (incremented)
        keyData[8],              // I: Revoked
        keyData[9]               // J: Notes
    ];
    
    await updateRow(
        spreadsheetId,
        API_KEYS_SHEET_NAME,
        result.rowIndex,
        updatedRow,
        accessToken
    );
    
    console.log(`✅ Incremented token count for API key: +${tokens} tokens (total: ${tokensCount})`);
}

/**
 * Revoke API key
 */
async function revokeAPIKey(apiKey) {
    // Get credentials
    const spreadsheetId = process.env.GS_SHEET_ID;
    const serviceAccountEmail = process.env.GS_EMAIL;
    const privateKey = (process.env.GS_KEY || '').replace(/\\n/g, '\n');
    
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
        return false;
    }
    
    // Get access token
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    
    // Find row
    const result = await findRow(
        spreadsheetId,
        API_KEYS_SHEET_NAME,
        apiKey,
        0,
        accessToken
    );
    
    if (!result) return false;
    
    const keyData = result.data;
    
    // Update row (set Column I to TRUE)
    const updatedRow = [
        keyData[0],    // A: API Key
        keyData[1],    // B: User Email
        keyData[2],    // C: Key Name
        keyData[3],    // D: Tier
        keyData[4],    // E: Created At
        keyData[5],    // F: Last Used
        keyData[6],    // G: Requests Count
        keyData[7],    // H: Tokens Count
        'TRUE',        // I: Revoked (set to TRUE)
        keyData[9]     // J: Notes
    ];
    
    await updateRow(
        spreadsheetId,
        API_KEYS_SHEET_NAME,
        result.rowIndex,
        updatedRow,
        accessToken
    );
    
    console.log(`🔒 Revoked API key: ${apiKey.slice(0, 12)}...`);
    return true;
}

/**
 * List all API keys for a user
 */
async function listUserAPIKeys(userEmail) {
    // Get credentials
    const spreadsheetId = process.env.GS_SHEET_ID;
    const serviceAccountEmail = process.env.GS_EMAIL;
    const privateKey = (process.env.GS_KEY || '').replace(/\\n/g, '\n');
    
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
        return [];
    }
    
    // Get access token
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    
    // Get all rows from sheet
    const range = encodeURIComponent(`${API_KEYS_SHEET_NAME}!A:J`);
    const response = await new Promise((resolve, reject) => {
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${range}`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`List keys failed: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
    
    const rows = response.values || [];
    
    // Filter rows for this user (skip header)
    const userKeys = rows.slice(1)
        .filter(row => row[1] === userEmail) // Column B (User Email)
        .map(row => ({
            apiKey: row[0]?.slice(0, 12) + '...',  // Masked key
            keyName: row[2],
            tier: row[3],
            createdAt: row[4],
            lastUsed: row[5] || 'Never',
            requestsCount: parseInt(row[6] || '0'),
            tokensCount: parseInt(row[7] || '0'),
            revoked: row[8] === 'TRUE'
        }));
    
    return userKeys;
}

module.exports = {
    generateAPIKey,
    createAPIKey,
    validateAPIKey,
    incrementTokenCount,
    revokeAPIKey,
    listUserAPIKeys
};
