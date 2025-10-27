#!/usr/bin/env node

require('dotenv').config();
const { google } = require('googleapis');

async function listSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GS_EMAIL,
      private_key: process.env.GS_KEY?.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GS_SHEET_ID;
  
  const response = await sheets.spreadsheets.get({ spreadsheetId });
  
  console.log('\n📊 All sheets in spreadsheet:\n');
  
  const allSheets = response.data.sheets.map(s => s.properties.title);
  allSheets.forEach(name => {
    console.log(`  - ${name}`);
  });
  
  console.log('\n🔍 Checking for potential duplicates...\n');
  
  // Look for similar sheet names
  const syntithenaiSheets = allSheets.filter(s => s.toLowerCase().includes('syntithenai'));
  
  if (syntithenaiSheets.length > 1) {
    console.log('⚠️  Found multiple sheets for syntithenai:');
    syntithenaiSheets.forEach(name => {
      console.log(`  - ${name}`);
    });
  } else if (syntithenaiSheets.length === 1) {
    console.log('✅ Only one sheet for syntithenai:', syntithenaiSheets[0]);
  }
  
  // Check for other duplicates (similar names)
  const grouped = {};
  allSheets.forEach(name => {
    const base = name.toLowerCase();
    if (!grouped[base]) {
      grouped[base] = [];
    }
    grouped[base].push(name);
  });
  
  console.log('\n🔎 All potential duplicates:\n');
  Object.entries(grouped).forEach(([base, names]) => {
    if (names.length > 1) {
      console.log(`⚠️  Multiple sheets with similar names:`);
      names.forEach(n => console.log(`    - ${n}`));
    }
  });
}

listSheets().catch(console.error);
