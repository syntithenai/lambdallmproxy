#!/usr/bin/env node
/**
 * Add development credit to user account
 * Usage: node scripts/add-dev-credit.js <email> <amount>
 * Example: node scripts/add-dev-credit.js user@example.com 1000.00
 */

require('dotenv').config();
const { appendToSheet, getAccessToken, getUserSheetName, getShardSpreadsheetId } = require('../src/services/google-sheets-logger');

async function addDevCredit(userEmail, amount) {
    try {
        console.log(`💰 Adding $${amount} development credit to ${userEmail}...`);
        
        const spreadsheetId = getShardSpreadsheetId(userEmail);
        const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
        
        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            throw new Error('Google Sheets not configured. Check .env file.');
        }
        
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        const accessToken = await getAccessToken(serviceAccountEmail, formattedKey);
        const sheetName = getUserSheetName(userEmail);
        
        const creditRow = [
            new Date().toISOString(),          // timestamp
            userEmail,                         // email
            'credit_added',                    // type
            'dev_credit',                      // model
            'system',                          // provider
            0,                                 // tokensIn
            0,                                 // tokensOut
            `-${amount}`,                      // cost (negative = credit)
            '0',                               // durationMs
            'SUCCESS',                         // status
            '',                                // periodStart
            '',                                // periodEnd
            '',                                // transactionCount
            ''                                 // breakdownJson
        ];
        
        await appendToSheet(spreadsheetId, `${sheetName}!A:N`, creditRow, accessToken);
        
        console.log(`✅ Successfully added $${amount} credit to ${userEmail}`);
        console.log(`🔄 Credit cache will update on next API call`);
        
    } catch (error) {
        console.error('❌ Error adding credit:', error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.error('Usage: node scripts/add-dev-credit.js <email> <amount>');
    console.error('Example: node scripts/add-dev-credit.js user@example.com 1000.00');
    process.exit(1);
}

const [email, amount] = args;
const creditAmount = parseFloat(amount);

if (isNaN(creditAmount) || creditAmount <= 0) {
    console.error('❌ Amount must be a positive number');
    process.exit(1);
}

addDevCredit(email, creditAmount);
