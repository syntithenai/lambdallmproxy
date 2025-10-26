#!/usr/bin/env node
/**
 * Copy data from one sheet to another
 */

require('dotenv').config();
const https = require('https');

/**
 * Get OAuth access token
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
 * Make API request
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
 * Get all data from a sheet
 */
async function getSheetData(spreadsheetId, sheetName, accessToken) {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A:Z`;
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
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A:Z:append?valueInputOption=RAW`;
    
    const body = {
        values: rows
    };
    
    await makeApiRequest(url, accessToken, 'POST', body);
}

async function main() {
    const sourceSheet = process.argv[2];
    const targetSheet = process.argv[3];
    
    if (!sourceSheet || !targetSheet) {
        console.error('Usage: node copy-sheet-data.js SOURCE_SHEET TARGET_SHEET');
        process.exit(1);
    }
    
    const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_IDS;
    const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    console.log(`\n📋 Copying data from "${sourceSheet}" to "${targetSheet}"\n`);
    
    console.log('🔐 Getting OAuth token...');
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    
    console.log('📖 Reading source sheet...');
    const sourceData = await getSheetData(spreadsheetId, sourceSheet, accessToken);
    
    if (!sourceData.values || sourceData.values.length === 0) {
        console.log('❌ No data found in source sheet');
        process.exit(1);
    }
    
    console.log(`✅ Found ${sourceData.values.length} rows in source sheet`);
    
    // Skip header row, copy data rows only
    const dataRows = sourceData.values.slice(1);
    
    if (dataRows.length === 0) {
        console.log('ℹ️  No data rows to copy (only header)');
        process.exit(0);
    }
    
    console.log(`💾 Appending ${dataRows.length} rows to target sheet...`);
    await appendData(spreadsheetId, targetSheet, dataRows, accessToken);
    
    console.log('✅ Copy complete!\n');
}

main().catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
});
