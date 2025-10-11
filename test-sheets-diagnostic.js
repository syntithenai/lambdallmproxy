#!/usr/bin/env node

/**
 * Quick diagnostic test for Google Sheets logging
 * Run this to check if everything is configured correctly
 */

require('dotenv').config();
const https = require('https');

console.log('\n🔍 Google Sheets Logging Diagnostic\n');
console.log('═'.repeat(50));

// Check 1: Environment Variables
console.log('\n1️⃣  Checking environment variables...');
const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!spreadsheetId) {
    console.log('   ❌ GOOGLE_SHEETS_LOG_SPREADSHEET_ID not set');
} else {
    console.log(`   ✅ Spreadsheet ID: ${spreadsheetId}`);
}

if (!serviceAccountEmail) {
    console.log('   ❌ GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL not set');
} else {
    console.log(`   ✅ Service Account: ${serviceAccountEmail}`);
}

if (!privateKey) {
    console.log('   ❌ GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY not set');
} else {
    const hasBegin = privateKey.includes('BEGIN PRIVATE KEY');
    const hasEnd = privateKey.includes('END PRIVATE KEY');
    const hasNewlines = privateKey.includes('\\n');
    
    console.log(`   ✅ Private key configured`);
    console.log(`      - Has BEGIN marker: ${hasBegin ? '✅' : '❌'}`);
    console.log(`      - Has END marker: ${hasEnd ? '✅' : '❌'}`);
    console.log(`      - Has newlines (\\n): ${hasNewlines ? '✅' : '❌'}`);
    console.log(`      - Length: ${privateKey.length} chars`);
}

if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
    console.log('\n❌ Configuration incomplete. Check your .env file.\n');
    process.exit(1);
}

// Check 2: OAuth Token
console.log('\n2️⃣  Testing OAuth authentication...');

async function testOAuth() {
    try {
        const jwt = require('jsonwebtoken');
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        
        const now = Math.floor(Date.now() / 1000);
        const claim = {
            iss: serviceAccountEmail,
            scope: 'https://www.googleapis.com/auth/spreadsheets',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now
        };
        
        const token = jwt.sign(claim, formattedKey, { algorithm: 'RS256' });
        console.log('   ✅ JWT token created successfully');
        
        // Exchange for access token
        const postData = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: token
        }).toString();
        
        const accessToken = await new Promise((resolve, reject) => {
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
        
        console.log('   ✅ Access token obtained successfully');
        return accessToken;
        
    } catch (error) {
        console.log('   ❌ OAuth failed:', error.message);
        if (error.message.includes('PEM')) {
            console.log('   💡 Hint: Check your private key format (needs \\n for newlines)');
        }
        throw error;
    }
}

// Check 3: Sheets API Access
async function testSheetsAPI(accessToken) {
    console.log('\n3️⃣  Testing Google Sheets API access...');
    
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
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
                    const sheet = JSON.parse(data);
                    console.log(`   ✅ Sheet accessible: "${sheet.properties.title}"`);
                    resolve(true);
                } else {
                    const errorData = JSON.parse(data);
                    console.log(`   ❌ API Error (${res.statusCode}):`, errorData.error.message);
                    
                    if (res.statusCode === 403) {
                        if (errorData.error.message.includes('API has not been used')) {
                            console.log('   💡 Fix: Enable Google Sheets API at:');
                            console.log('      https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=927667106833');
                        } else if (errorData.error.message.includes('permission')) {
                            console.log('   💡 Fix: Share the sheet with service account:');
                            console.log(`      ${serviceAccountEmail}`);
                        }
                    } else if (res.statusCode === 404) {
                        console.log('   💡 Fix: Check spreadsheet ID in .env file');
                    }
                    
                    reject(new Error(errorData.error.message));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

// Check 4: Ensure Sheet Exists
async function ensureSheetExists(accessToken, sheetName) {
    return new Promise((resolve, reject) => {
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
                        console.log(`   ✅ Sheet tab "${sheetName}" exists`);
                        resolve(true);
                        return;
                    }
                    
                    console.log(`   ⚠️  Sheet tab "${sheetName}" not found, creating...`);
                    
                    // Create the sheet tab
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
                                console.log(`   ✅ Created sheet tab: "${sheetName}"`);
                                resolve(true);
                            } else {
                                reject(new Error(`Failed to create sheet: ${createRes.statusCode} - ${createResData}`));
                            }
                        });
                    });
                    
                    createReq.on('error', reject);
                    createReq.write(createData);
                    createReq.end();
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

// Check 5: Write Test
async function testWrite(accessToken) {
    console.log('\n5️⃣  Testing write access...');
    
    const testRow = [
        new Date().toISOString(),
        'test@diagnostic.com',
        'test-provider',
        'test-model',
        100,
        200,
        300,
        '0.0000',
        '1.23',
        '',
        ''
    ];
    
    return new Promise((resolve, reject) => {
        const payload = { values: [testRow] };
        const postData = JSON.stringify(payload);
        
        const sheetName = process.env.GOOGLE_SHEETS_LOG_SHEET_NAME || 'LLM Usage Log';
        const encodedRange = encodeURIComponent(`${sheetName}!A:K`);
        
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
                    console.log('   ✅ Successfully wrote test row to sheet');
                    console.log('   📊 Check your sheet for the test entry!');
                    resolve(true);
                } else {
                    const errorData = JSON.parse(data);
                    console.log(`   ❌ Write failed (${res.statusCode}):`, errorData.error.message);
                    reject(new Error(errorData.error.message));
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Run all checks
(async () => {
    try {
        const sheetName = process.env.GOOGLE_SHEETS_LOG_SHEET_NAME || 'LLM Usage Log';
        
        const accessToken = await testOAuth();
        await testSheetsAPI(accessToken);
        
        console.log('\n4️⃣  Checking sheet tab...');
        await ensureSheetExists(accessToken, sheetName);
        
        await testWrite(accessToken);
        
        console.log('\n═'.repeat(50));
        console.log('✅ All checks passed! Logging is ready to use.\n');
        console.log('📊 View your sheet:');
        console.log(`   https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit\n`);
        
    } catch (error) {
        console.log('\n═'.repeat(50));
        console.log('❌ Diagnostic failed. See errors above.\n');
        console.log('📖 Full troubleshooting guide:');
        console.log('   See GOOGLE_SHEETS_TROUBLESHOOTING.md\n');
        process.exit(1);
    }
})();
