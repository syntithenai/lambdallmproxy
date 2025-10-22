/**
 * Debug script for embedding generation and Google Sheets sync
 * 
 * Run this in the browser console to diagnose issues:
 * 1. Open DevTools (F12)
 * 2. Copy and paste this entire script
 * 3. Press Enter
 */

(async function debugEmbeddings() {
  console.log('🔍 RAG Embedding Debug Script');
  console.log('================================\n');

  // Check 1: LocalStorage configuration
  console.log('📋 LocalStorage Check:');
  const authToken = localStorage.getItem('authToken');
  const spreadsheetId = localStorage.getItem('rag_spreadsheet_id');
  const googleLinked = localStorage.getItem('rag_google_linked');
  const ragConfig = localStorage.getItem('rag_config');
  
  console.log('  - authToken:', authToken ? '✅ Present' : '❌ Missing');
  console.log('  - spreadsheetId:', spreadsheetId ? `✅ ${spreadsheetId}` : '❌ Missing');
  console.log('  - googleLinked:', googleLinked === 'true' ? '✅ true' : '❌ false');
  console.log('  - ragConfig:', ragConfig ? '✅ Present' : '❌ Missing');
  
  if (ragConfig) {
    try {
      const config = JSON.parse(ragConfig);
      console.log('    - Similarity threshold:', config.similarityThreshold);
      console.log('    - Sync enabled:', config.cloudSyncEnabled);
    } catch (e) {
      console.error('    ⚠️ Failed to parse config:', e);
    }
  }
  console.log();

  // Check 2: IndexedDB
  console.log('💾 IndexedDB Check:');
  try {
    const dbName = 'rag_db';
    const request = indexedDB.open(dbName, 1);
    
    await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    const db = request.result;
    console.log('  - Database:', db.name, '✅ Opened');
    console.log('  - Object stores:', Array.from(db.objectStoreNames).join(', '));
    
    // Count chunks
    const transaction = db.transaction(['chunks'], 'readonly');
    const store = transaction.objectStore('chunks');
    const countRequest = store.count();
    
    const count = await new Promise((resolve, reject) => {
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
    
    console.log('  - Chunks stored:', count);
    
    // Get first chunk as sample
    if (count > 0) {
      const cursorRequest = store.openCursor();
      const firstChunk = await new Promise((resolve, reject) => {
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          resolve(cursor ? cursor.value : null);
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      });
      
      if (firstChunk) {
        console.log('  - Sample chunk keys:', Object.keys(firstChunk).join(', '));
        console.log('  - Has id:', firstChunk.id ? '✅' : '❌');
        console.log('  - Has embedding:', firstChunk.embedding ? '✅' : '❌');
        console.log('  - Embedding length:', firstChunk.embedding?.length);
      }
    }
    
    db.close();
  } catch (e) {
    console.error('  ❌ IndexedDB error:', e);
  }
  console.log();

  // Check 3: Network - test backend connectivity
  console.log('🌐 Backend Connectivity:');
  const apiUrl = import.meta?.env?.VITE_LAMBDA_URL || 'http://localhost:3000';
  console.log('  - API URL:', apiUrl);
  
  try {
    const healthResponse = await fetch(`${apiUrl}/health`);
    console.log('  - Health check:', healthResponse.ok ? '✅ OK' : `❌ ${healthResponse.status}`);
  } catch (e) {
    console.error('  ❌ Connection failed:', e.message);
  }
  console.log();

  // Check 4: Google Identity Services
  console.log('🔐 Google Identity Services:');
  if (window.google?.accounts?.oauth2) {
    console.log('  - GIS loaded: ✅');
  } else {
    console.error('  - GIS loaded: ❌ Not available');
  }
  console.log();

  // Check 5: Test embedding generation (if user wants)
  console.log('📝 To test embedding generation:');
  console.log('  1. Select a snippet in SWAG');
  console.log('  2. Click "Add to Index"');
  console.log('  3. Watch console for these logs:');
  console.log('     - 📦 Backend response: {...}');
  console.log('     - 🔍 Chunk structure check: {...}');
  console.log('     - 💾 saveChunks called with: {...}');
  console.log('     - ✅ Saved X chunks for snippet Y');
  console.log('     - 📤 Using direct/backend Google Sheets sync...');
  console.log();

  // Check 6: Test Google Sheets sync manually
  if (spreadsheetId && authToken) {
    console.log('📊 Google Sheets Access Test:');
    console.log('  - Spreadsheet URL:');
    console.log(`    https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
    console.log('  - Open this URL to verify the sheet exists');
    console.log();
  }

  // Summary
  console.log('================================');
  console.log('🎯 Quick Diagnosis:');
  
  const issues = [];
  if (!authToken) issues.push('❌ Not logged in (no authToken)');
  if (!spreadsheetId) issues.push('❌ No spreadsheet ID configured');
  if (googleLinked !== 'true') issues.push('⚠️ Google account not linked (will use backend sync)');
  
  if (issues.length === 0) {
    console.log('  ✅ Configuration looks good!');
    console.log('  - Try generating an embedding and watch the console logs');
  } else {
    console.log('  Issues found:');
    issues.forEach(issue => console.log('    ' + issue));
    console.log('\n  Solutions:');
    if (!authToken) {
      console.log('    1. Log in to the app');
    }
    if (!spreadsheetId) {
      console.log('    2. Go to Settings > RAG and enable sync');
      console.log('       This will create your Google Sheet');
    }
    if (googleLinked !== 'true') {
      console.log('    3. (Optional) Link Google account in Settings > RAG');
      console.log('       for faster client-side sync');
    }
  }
  console.log();
  
  console.log('💡 Common Issues:');
  console.log('  1. "No items were added to search index"');
  console.log('     → Check for errors in console (saveChunks failures)');
  console.log('     → Verify backend returned chunks (📦 Backend response log)');
  console.log('  2. "No Google Sheet visible"');
  console.log('     → Verify spreadsheet ID is set (see URL above)');
  console.log('     → Check if sync is failing silently');
  console.log('     → Look for 📤 sync logs in console');
  console.log('  3. IndexedDB errors');
  console.log('     → Check if chunks have required "id" field');
  console.log('     → Look for ❌ PUT request failed logs');
  console.log();
  
  console.log('================================');
  console.log('Debug script complete! 🎉');
})();
