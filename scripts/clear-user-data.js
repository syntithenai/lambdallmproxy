#!/usr/bin/env node
/**
 * Clear all old schema data from user sheets
 * This removes all transactions for a user to allow fresh start with new schema
 * 
 * Usage: node scripts/clear-user-data.js <email>
 */

require('dotenv').config();
const https = require('https');
const { getUserSheetName } = require('../src/services/google-sheets-logger');
const { sign } = require('jsonwebtoken');

// Get OAuth token for Google Sheets API
async function getAccessToken(serviceAccountEmail, privateKey) {
    const jwtToken = sign(
        {
            iss: serviceAccountEmail,
            scope: 'https://www.googleapis.com/auth/spreadsheets',
            aud: 'https://oauth2.googleapis.com/token',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000)
        },
        privateKey,
        { algorithm: 'RS256' }
    );

    return new Promise((resolve, reject) => {
        const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtToken}`;
        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const response = JSON.parse(data);
                resolve(response.access_token);
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function clearUserData(email) {
    try {
        console.log(`\n🗑️  Clearing all data for: ${email}\n`);
        
        // Get spreadsheet ID from environment
        const spreadsheetIds = process.env.GS_SHEET_IDS || process.env.GS_SHEET_ID;
        if (!spreadsheetIds) {
            throw new Error('GOOGLE_SHEETS_LOG_SPREADSHEET_IDS not configured in .env');
        }
        
        const spreadsheetId = spreadsheetIds.split(',')[0].trim(); // Use first shard
        const serviceAccountEmail = process.env.GS_EMAIL;
        const privateKey = process.env.GS_KEY;
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            throw new Error('Google Sheets not configured. Check .env file.');
        }
        
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        const accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
        const sheetName = getUserSheetName(email);
        
        console.log(`📋 Sheet name: ${sheetName}`);
        console.log(`📊 Spreadsheet ID: ${spreadsheetId}\n`);
        
        // Get sheet metadata to find the sheet ID
        const metaResponse = await new Promise((resolve, reject) => {
            https.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });
        
        const sheet = metaResponse.sheets.find(s => s.properties.title === sheetName);
        
        if (!sheet) {
            console.log(`⚠️  Sheet "${sheetName}" not found - user has no data yet`);
            return;
        }
        
        const sheetId = sheet.properties.sheetId;
        const rowCount = sheet.properties.gridProperties.rowCount;
        
        console.log(`✅ Found sheet with ${rowCount} rows`);
        console.log(`\n⚠️  WARNING: This will DELETE ALL DATA in sheet "${sheetName}"`);
        console.log(`   This includes all transaction history and credits.`);
        console.log(`   A new $0.50 welcome credit will be added on next API call.\n`);
        
        // Clear all data except header row
        if (rowCount > 1) {
            console.log(`🗑️  Deleting rows 2-${rowCount}...`);
            
            const deleteRequest = {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: 'ROWS',
                            startIndex: 1,  // Row 2 (0-indexed)
                            endIndex: rowCount  // Up to last row
                        }
                    }
                }]
            };
            
            await new Promise((resolve, reject) => {
                const postData = JSON.stringify(deleteRequest);
                const req = https.request({
                    hostname: 'sheets.googleapis.com',
                    path: `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            resolve(JSON.parse(data));
                        } else {
                            reject(new Error(`Delete failed: ${res.statusCode} - ${data}`));
                        }
                    });
                });
                req.on('error', reject);
                req.write(postData);
                req.end();
            });
            
            console.log(`✅ Deleted ${rowCount - 1} rows`);
        } else {
            console.log(`ℹ️  Sheet already empty (only header row)`);
        }
        
        console.log(`\n✅ Successfully cleared all data for ${email}`);
        console.log(`\n💡 Next steps:`);
        console.log(`   1. User will receive $0.50 welcome credit on next API call`);
        console.log(`   2. All new transactions will use the new 14-column schema`);
        console.log(`   3. Credit balance will start fresh from $0.50\n`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

const email = process.argv[2];
if (!email) {
    console.error('Usage: node scripts/clear-user-data.js <email>');
    console.error('Example: node scripts/clear-user-data.js user@example.com');
    process.exit(1);
}

clearUserData(email);
