/**
 * Browser Console Test Commands for RAG System
 * 
 * Open your deployed UI in browser, login, then paste these commands
 * into the browser console to test RAG functionality.
 */

// ============================================
// Test 1: Check Spreadsheet Discovery
// ============================================
async function testSpreadsheetDiscovery() {
  console.log('📋 Testing Spreadsheet Discovery...');
  
  const spreadsheetId = localStorage.getItem('rag_spreadsheet_id');
  console.log('Cached Spreadsheet ID:', spreadsheetId);
  
  if (!spreadsheetId) {
    console.log('⚠️ No cached ID, triggering discovery...');
    // The UI should auto-discover on login, but you can trigger manually
  }
  
  return spreadsheetId;
}

// ============================================
// Test 2: Generate Embeddings (Via UI)
// ============================================
console.log(`
📝 To test embedding generation:

1. Go to SWAG page
2. Create a new snippet with some content (or use existing)
3. Select the snippet (checkbox)
4. Click "Bulk Operations" → "Add To Search Index"
5. Watch the console for:
   - "Generating embeddings for X snippets"
   - "✅ Generated X embeddings for Y snippets"
   - "📤 Syncing X chunks to Google Sheets..." (NEW!)
   - "✅ Synced to Google Sheets" (NEW!)
   
The embeddings should now auto-sync to Google Sheets!
`);

// ============================================
// Test 3: Check IndexedDB
// ============================================
async function testIndexedDB() {
  console.log('💾 Testing IndexedDB...');
  
  // Import ragDB from your app (if available in console scope)
  // This might require you to expose it globally in development
  
  // Alternatively, check manually:
  // DevTools → Application → IndexedDB → rag_embeddings → chunks
  
  console.log('📍 Check: DevTools → Application → IndexedDB → rag_embeddings → chunks');
  console.log('Expected: Entries with id, snippet_id, chunk_text, embedding (1536 floats)');
}

// ============================================
// Test 4: Vector Search (Browser Console)
// ============================================
async function testVectorSearch(query = 'test search') {
  console.log('🔍 Testing Vector Search...');
  
  // Step 1: Get query embedding
  const apiUrl = window.location.origin.includes('localhost') 
    ? 'http://localhost:3000' 
    : 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';
  
  console.log('📝 Query:', query);
  console.log('🌐 API URL:', apiUrl);
  
  const embedResponse = await fetch(`${apiUrl}/rag/embed-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  
  const { embedding } = await embedResponse.json();
  console.log('✅ Query embedding:', embedding.length, 'dimensions');
  
  // Step 2: Search locally (requires ragDB to be accessible)
  // You'll need to expose ragDB globally or import it
  
  console.log('⚠️ To complete search, run in component context:');
  console.log(`
    import { ragDB } from './utils/ragDB';
    const results = await ragDB.vectorSearch(embedding, 5, 0.7);
    console.log('Search results:', results);
  `);
  
  return embedding;
}

// ============================================
// Test 5: Check Google Sheets
// ============================================
console.log(`
📊 To verify Google Sheets sync:

1. Get spreadsheet ID: localStorage.getItem('rag_spreadsheet_id')
2. Open in browser: https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID
3. Check RAG_Embeddings_v1 sheet
4. Verify columns: id, snippet_id, chunk_index, chunk_text, embedding, embedding_model, created_at
5. Embedding column should contain JSON arrays like: [0.123, -0.456, ...]
`);

// ============================================
// Test 6: Manual Pull from Google Sheets
// ============================================
async function testPullFromSheets() {
  console.log('📥 Testing Pull from Google Sheets...');
  
  const spreadsheetId = localStorage.getItem('rag_spreadsheet_id');
  const authToken = localStorage.getItem('authToken');
  const apiUrl = window.location.origin.includes('localhost') 
    ? 'http://localhost:3000' 
    : 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';
  
  if (!spreadsheetId || !authToken) {
    console.error('❌ Missing spreadsheet ID or auth token');
    return;
  }
  
  const response = await fetch(`${apiUrl}/rag/sync-embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      operation: 'pull',
      spreadsheetId
    })
  });
  
  const result = await response.json();
  console.log('✅ Pulled chunks:', result.chunks?.length || 0);
  console.log('Sample chunk:', result.chunks?.[0]);
  
  return result.chunks;
}

// ============================================
// Quick Test Suite
// ============================================
async function runQuickTests() {
  console.log('🚀 Running Quick Test Suite...\n');
  
  try {
    // Test 1
    await testSpreadsheetDiscovery();
    
    // Test 3
    await testIndexedDB();
    
    // Test 4
    const embedding = await testVectorSearch('test query');
    
    // Test 6
    const chunks = await testPullFromSheets();
    
    console.log('\n✅ Quick tests complete!');
    console.log('📊 Summary:');
    console.log('- Spreadsheet ID cached:', !!localStorage.getItem('rag_spreadsheet_id'));
    console.log('- Query embedding generated:', embedding?.length === 1536);
    console.log('- Chunks in Sheets:', chunks?.length || 0);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// ============================================
// Export test functions
// ============================================
console.log('✅ RAG Browser Tests Loaded!');
console.log('Available functions:');
console.log('- testSpreadsheetDiscovery()');
console.log('- testIndexedDB()');
console.log('- testVectorSearch(query)');
console.log('- testPullFromSheets()');
console.log('- runQuickTests()');
console.log('\nRun: runQuickTests()');
