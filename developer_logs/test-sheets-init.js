#!/usr/bin/env node

/**
 * Initialize Google Sheet with Headers
 * Run this once to set up column headers
 */

require('dotenv').config();
const { initializeSheet } = require('./src/services/google-sheets-logger');

console.log('🔧 Initializing Google Sheet with headers...\n');

initializeSheet()
    .then(() => {
        console.log('\n✅ Sheet initialization complete!');
        console.log('📊 Check your Google Sheet for headers:');
        console.log(`   https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID}/edit`);
    })
    .catch(err => {
        console.error('\n❌ Failed to initialize sheet:', err.message);
        process.exit(1);
    });
