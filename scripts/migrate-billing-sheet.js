#!/usr/bin/env node
/**
 * Migrate Billing Sheet for User
 * 
 * After sharding changes, each user gets their own sheet tab.
 * This script:
 * 1. Lists all sheets in the spreadsheet
 * 2. Finds the user's email-based sheet name
 * 3. If not found, creates it and migrates data from old sheets
 * 
 * Usage:
 *   node scripts/migrate-billing-sheet.js YOUR_EMAIL@example.com
 */

require('dotenv').config();
const https = require('https');

/**
 * Sanitize email address for use as sheet name
 */
function sanitizeEmailForSheetName(email) {
    if (!email || typeof email !== 'string') {
        return 'unknown_user';
    }
    
    let sanitized = email
        .toLowerCase()
        .replace(/@/g, '_at_')
        .replace(/\./g, '_dot_')
        .replace(/[:/\?*\[\]\\]/g, '_');
    
    if (sanitized.length > 100) {
        sanitized = sanitized.substring(0, 100);
    }
    
    return sanitized;
}

/**
 * Get OAuth access token for Google Sheets API
 */
function getAccessToken(serviceAccountEmail, privateKey) {
    return new Promise((resolve, reject) => {
        const jwtHeader = Buffer.from(JSON.stringify({
            alg: 'RS256',
            typ: 'JWT'
        })).toString('base64url');
        
        const now = Math.floor(Date.now() / 1000);
        const jwtClaimSet = Buffer.from(JSON.stringify({
            iss: serviceAccountEmail,
            scope: 'https://www.googleapis.com/auth/spreadsheets',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now
        })).toString('base64url');
        
        const crypto = require('crypto');
        const signatureInput = `${jwtHeader}.${jwtClaimSet}`;
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(signatureInput);
        const signature = signer.sign(privateKey, 'base64url');
        
        const jwt = `${signatureInput}.${signature}`;
        
        const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
        
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
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const response = JSON.parse(data);
                    resolve(response.access_token);
                } else {
                    reject(new Error(`Failed to get access token: ${res.statusCode} ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * Make Google Sheets API request
 */
function makeApiRequest(url, accessToken, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`API request failed: ${res.statusCode} ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        
        req.end();
    });
}

/**
 * List all sheets in spreadsheet
 */
async function listSheets(spreadsheetId, accessToken) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
    const response = await makeApiRequest(url, accessToken);
    return response.sheets.map(s => s.properties);
}

/**
 * Create new sheet
 */
async function createSheet(spreadsheetId, sheetName, accessToken) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    
    const body = {
        requests: [
            {
                addSheet: {
                    properties: {
                        title: sheetName
                    }
                }
            }
        ]
    };
    
    await makeApiRequest(url, accessToken, 'POST', body);
    console.log(`✅ Created sheet: ${sheetName}`);
}

/**
 * Add header row to new sheet
 */
async function addHeaderRow(spreadsheetId, sheetName, accessToken) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:P1?valueInputOption=RAW`;
    
    const body = {
        values: [[
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
        ]]
    };
    
    await makeApiRequest(url, accessToken, 'PUT', body);
    console.log(`✅ Added header row to ${sheetName}`);
}

/**
 * Get all data from a sheet
 */
async function getSheetData(spreadsheetId, sheetName, accessToken) {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A2:P`;
        return await makeApiRequest(url, accessToken);
    } catch (error) {
        if (error.message.includes('404')) {
            return { values: [] };
        }
        throw error;
    }
}

/**
 * Append data to sheet
 */
async function appendData(spreadsheetId, sheetName, rows, accessToken) {
    if (rows.length === 0) return;
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A:P:append?valueInputOption=RAW`;
    
    const body = {
        values: rows
    };
    
    await makeApiRequest(url, accessToken, 'POST', body);
    console.log(`✅ Appended ${rows.length} rows to ${sheetName}`);
}

/**
 * Main migration function
 */
async function migrate(userEmail) {
    console.log('\n🔄 Starting billing sheet migration...\n');
    
    // Get configuration
    const spreadsheetId = process.env.GS_SHEET_ID || process.env.GS_SHEET_IDS;
    const serviceAccountEmail = process.env.GS_EMAIL;
    const privateKey = process.env.GS_KEY?.replace(/\\n/g, '\n');
    
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
        console.error('❌ Missing Google Sheets configuration in .env file');
        process.exit(1);
    }
    
    console.log(`📧 User Email: ${userEmail}`);
    const sheetName = sanitizeEmailForSheetName(userEmail);
    console.log(`📄 Expected Sheet Name: ${sheetName}\n`);
    
    // Get access token
    console.log('🔐 Getting OAuth access token...');
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    console.log('✅ Access token obtained\n');
    
    // List all sheets
    console.log('📋 Listing all sheets in spreadsheet...');
    const sheets = await listSheets(spreadsheetId, accessToken);
    console.log(`Found ${sheets.length} sheets:\n`);
    
    sheets.forEach((sheet, i) => {
        console.log(`  ${i + 1}. ${sheet.title} (ID: ${sheet.sheetId})`);
    });
    console.log('');
    
    // Check if user's sheet exists
    const userSheetExists = sheets.some(s => s.title === sheetName);
    
    if (userSheetExists) {
        console.log(`✅ Sheet "${sheetName}" already exists!`);
        
        // Get row count
        const data = await getSheetData(spreadsheetId, sheetName, accessToken);
        const rowCount = data.values?.length || 0;
        console.log(`📊 Current row count: ${rowCount} rows\n`);
        
        if (rowCount > 0) {
            console.log('✅ Migration not needed - sheet already has data');
            return;
        }
    }
    
    // Create sheet if it doesn't exist
    if (!userSheetExists) {
        console.log(`📝 Creating sheet "${sheetName}"...`);
        await createSheet(spreadsheetId, sheetName, accessToken);
        await addHeaderRow(spreadsheetId, sheetName, accessToken);
        console.log('');
    }
    
    // Look for old sheets with user's data (LOG, SUMMARY, etc.)
    console.log('🔍 Looking for data in old sheets...\n');
    
    const oldSheetNames = ['LOG', 'SUMMARY', 'Sheet1', 'LLM_LOG'];
    let totalMigrated = 0;
    
    for (const oldSheetName of oldSheetNames) {
        const oldSheetExists = sheets.some(s => s.title === oldSheetName);
        
        if (!oldSheetExists) {
            console.log(`⏭️  Skipping "${oldSheetName}" (doesn't exist)`);
            continue;
        }
        
        console.log(`📖 Reading data from "${oldSheetName}"...`);
        const oldData = await getSheetData(spreadsheetId, oldSheetName, accessToken);
        
        if (!oldData.values || oldData.values.length === 0) {
            console.log(`  ℹ️  No data found in "${oldSheetName}"`);
            continue;
        }
        
        // Filter rows for this user (column B = User Email)
        const userRows = oldData.values.filter(row => {
            const email = row[1]; // Column B
            return email && email.toLowerCase() === userEmail.toLowerCase();
        });
        
        if (userRows.length === 0) {
            console.log(`  ℹ️  No data for ${userEmail} in "${oldSheetName}"`);
            continue;
        }
        
        console.log(`  📦 Found ${userRows.length} rows for ${userEmail}`);
        console.log(`  💾 Migrating to "${sheetName}"...`);
        
        await appendData(spreadsheetId, sheetName, userRows, accessToken);
        totalMigrated += userRows.length;
    }
    
    console.log(`\n✅ Migration complete!`);
    console.log(`📊 Total rows migrated: ${totalMigrated}\n`);
    
    if (totalMigrated === 0) {
        console.log('ℹ️  No data found to migrate. This might be a new user.');
        console.log('   The sheet is ready and will populate as you use the service.\n');
    }
}

// Parse command line arguments
const userEmail = process.argv[2];

if (!userEmail) {
    console.error('❌ Error: Please provide your email address');
    console.error('\nUsage:');
    console.error('  node scripts/migrate-billing-sheet.js YOUR_EMAIL@example.com\n');
    process.exit(1);
}

// Run migration
migrate(userEmail).catch(error => {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});
