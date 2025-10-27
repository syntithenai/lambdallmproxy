#!/usr/bin/env node

/**
 * Clear all data from the Google Sheets log and add fresh headers
 * 
 * Usage: node scripts/clear-logs-sheet.js
 */

require('dotenv').config();
const { clearSheet, addHeaderRow } = require('../src/services/google-sheets-logger');

async function main() {
    console.log('🧹 Clearing Google Sheets log...\n');
    
    // Check environment variables
    const spreadsheetId = process.env.GS_SHEET_ID;
    const serviceAccountEmail = process.env.GS_EMAIL;
    const privateKey = process.env.GS_KEY;
    const sheetName = process.env.GS_NAME || 'LLM Usage Log';
    
    if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
        console.error('❌ Missing required environment variables:');
        console.error('   GOOGLE_SHEETS_LOG_SPREADSHEET_ID:', !!spreadsheetId);
        console.error('   GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL:', !!serviceAccountEmail);
        console.error('   GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY:', !!privateKey);
        process.exit(1);
    }
    
    console.log('📊 Sheet configuration:');
    console.log('   Spreadsheet ID:', spreadsheetId);
    console.log('   Sheet name:', sheetName);
    console.log('   URL: https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit\n');
    
    try {
        // Get OAuth token
        console.log('🔑 Getting OAuth access token...');
        const jwt = require('jsonwebtoken');
        const https = require('https');
        
        const now = Math.floor(Date.now() / 1000);
        const claim = {
            iss: serviceAccountEmail,
            scope: 'https://www.googleapis.com/auth/spreadsheets',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now
        };
        
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        const token = jwt.sign(claim, formattedKey, { algorithm: 'RS256' });
        
        const accessToken = await new Promise((resolve, reject) => {
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
        
        console.log('✅ Got OAuth token\n');
        
        // Clear the sheet
        console.log('🗑️  Clearing all data from sheet...');
        await clearSheet(spreadsheetId, sheetName, accessToken);
        
        // Add headers
        console.log('📝 Adding header row...');
        await addHeaderRow(spreadsheetId, sheetName, accessToken);
        
        console.log('\n✅ Done! Sheet has been cleared and headers added.');
        console.log('   Next log will start at row 2.');
        console.log('   View at: https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
