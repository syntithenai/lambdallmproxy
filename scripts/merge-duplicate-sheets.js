#!/usr/bin/env node
/**
 * Merge Duplicate User Sheets
 * 
 * This script finds and merges duplicate billing sheets for the same email address.
 * It combines all transaction rows into the oldest sheet and deletes the duplicates.
 * 
 * Usage: node scripts/merge-duplicate-sheets.js [--dry-run] [--email=user@example.com]
 */

require('dotenv').config();
const { google } = require('googleapis');

const DRY_RUN = process.argv.includes('--dry-run');
const EMAIL_FILTER = process.argv.find(arg => arg.startsWith('--email='))?.split('=')[1];

/**
 * Convert email to expected sheet name format
 */
function emailToSheetName(email) {
  return email
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/[:/\?*\[\]\\]/g, '_')
    .substring(0, 100);
}

/**
 * Convert sheet name back to email (best effort)
 */
function sheetNameToEmail(sheetName) {
  return sheetName
    .replace(/_at_/g, '@')
    .replace(/_dot_/g, '.');
}

async function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GS_EMAIL,
      private_key: process.env.GS_KEY?.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

async function mergeDuplicateSheets() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GS_SHEET_ID;
  
  console.log('📊 Fetching spreadsheet metadata...\n');
  
  const response = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = response.data.sheets;
  
  // Group sheets by normalized email
  const sheetsByEmail = {};
  
  allSheets.forEach(sheet => {
    const name = sheet.properties.title;
    const sheetId = sheet.properties.sheetId;
    
    // Skip system sheets
    if (name === 'Sheet1' || name === 'LLM Usage Log' || name === 'unknown') {
      return;
    }
    
    // Convert sheet name to email
    const email = sheetNameToEmail(name);
    const normalizedEmail = email.toLowerCase();
    
    // Filter by email if specified
    if (EMAIL_FILTER && !normalizedEmail.includes(EMAIL_FILTER.toLowerCase())) {
      return;
    }
    
    if (!sheetsByEmail[normalizedEmail]) {
      sheetsByEmail[normalizedEmail] = [];
    }
    
    sheetsByEmail[normalizedEmail].push({
      name: name,
      sheetId: sheetId,
      email: email
    });
  });
  
  // Find duplicates
  const duplicates = Object.entries(sheetsByEmail).filter(([email, sheets]) => sheets.length > 1);
  
  if (duplicates.length === 0) {
    console.log('✅ No duplicate sheets found!\n');
    return;
  }
  
  console.log(`⚠️  Found ${duplicates.length} email(s) with duplicate sheets:\n`);
  
  for (const [email, sheetList] of duplicates) {
    console.log(`\n📧 Email: ${email}`);
    console.log(`   Duplicate sheets (${sheetList.length}):`);
    sheetList.forEach(s => console.log(`     - ${s.name} (ID: ${s.sheetId})`));
    
    if (DRY_RUN) {
      console.log('   [DRY RUN] Would merge these sheets');
      continue;
    }
    
    // Sort by sheet ID (older sheets have lower IDs)
    sheetList.sort((a, b) => a.sheetId - b.sheetId);
    
    const primarySheet = sheetList[0];
    const duplicateSheets = sheetList.slice(1);
    
    console.log(`\n   ✅ Primary sheet (keeping): ${primarySheet.name}`);
    console.log(`   🗑️  Merging from: ${duplicateSheets.map(s => s.name).join(', ')}`);
    
    // Fetch data from all sheets
    const allRows = [];
    
    for (const sheet of sheetList) {
      console.log(`\n   📥 Fetching data from: ${sheet.name}`);
      
      const dataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheet.name}!A:P`
      });
      
      const rows = dataResponse.data.values || [];
      
      if (rows.length > 1) {
        // Skip header row
        const dataRows = rows.slice(1);
        console.log(`      Found ${dataRows.length} transaction(s)`);
        allRows.push(...dataRows);
      } else {
        console.log(`      No transactions found`);
      }
    }
    
    if (allRows.length === 0) {
      console.log('   ⚠️  No transactions to merge, skipping...');
      continue;
    }
    
    // Sort by timestamp (oldest first)
    allRows.sort((a, b) => {
      const timeA = new Date(a[0] || 0).getTime();
      const timeB = new Date(b[0] || 0).getTime();
      return timeA - timeB;
    });
    
    // Remove duplicate rows (same timestamp + email + model + type)
    const uniqueRows = [];
    const seen = new Set();
    
    for (const row of allRows) {
      const key = `${row[0]}_${row[1]}_${row[3]}_${row[4]}`; // timestamp_email_model_type
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRows.push(row);
      }
    }
    
    console.log(`\n   🔄 Total unique transactions: ${uniqueRows.length}`);
    console.log(`   (Removed ${allRows.length - uniqueRows.length} duplicate rows)`);
    
    // Clear primary sheet (keep header)
    console.log(`\n   🧹 Clearing primary sheet: ${primarySheet.name}`);
    
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${primarySheet.name}!A2:P`
    });
    
    // Write merged data to primary sheet
    console.log(`   📝 Writing ${uniqueRows.length} transactions to primary sheet`);
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${primarySheet.name}!A:P`,
      valueInputOption: 'RAW',
      requestBody: {
        values: uniqueRows
      }
    });
    
    // Delete duplicate sheets
    for (const dupSheet of duplicateSheets) {
      console.log(`   🗑️  Deleting duplicate sheet: ${dupSheet.name}`);
      
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteSheet: {
              sheetId: dupSheet.sheetId
            }
          }]
        }
      });
    }
    
    console.log(`\n   ✅ Successfully merged all sheets for ${email}`);
  }
  
  console.log('\n✨ Merge complete!\n');
}

// Run the script
if (require.main === module) {
  console.log('🔧 Duplicate Sheet Merger\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will make changes)'}`);
  if (EMAIL_FILTER) {
    console.log(`Filter: Only processing emails containing "${EMAIL_FILTER}"`);
  }
  console.log('');
  
  mergeDuplicateSheets()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      console.error(error);
      process.exit(1);
    });
}

module.exports = { mergeDuplicateSheets, emailToSheetName, sheetNameToEmail };
