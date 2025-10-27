#!/usr/bin/env node
/**
 * Check credit balance for a user
 * Usage: node scripts/check-balance.js <email>
 */

require('dotenv').config();
const { getUserCreditBalance } = require('../src/services/google-sheets-logger');

async function checkBalance(email) {
    try {
        console.log(`\n🔍 Checking credit balance for: ${email}\n`);
        const balance = await getUserCreditBalance(email);
        console.log(`\n✅ Final Balance: $${balance.toFixed(2)}\n`);
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

const email = process.argv[2] || 'awsroot.syntithenai@gmail.com';
checkBalance(email);
