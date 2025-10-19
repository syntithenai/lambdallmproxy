#!/usr/bin/env node

/**
 * RAG Deployment Test Suite
 * Tests all deployed RAG functionality
 */

const LAMBDA_URL = 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

// You'll need to set this from the UI's localStorage
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

if (!AUTH_TOKEN) {
  console.error('❌ Please set AUTH_TOKEN environment variable');
  console.error('   Get it from browser localStorage: localStorage.getItem("authToken")');
  process.exit(1);
}

async function test1_SpreadsheetDiscovery() {
  console.log('\n📋 Test 1: User Spreadsheet Discovery');
  console.log('=====================================');
  
  try {
    const response = await fetch(`${LAMBDA_URL}/rag/user-spreadsheet`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    console.log('✅ Success:', result);
    
    if (result.spreadsheetId) {
      console.log('✅ Spreadsheet ID:', result.spreadsheetId);
      console.log('✅ Created:', result.created ? 'Yes (new)' : 'No (existing)');
      return result.spreadsheetId;
    } else {
      throw new Error('No spreadsheet ID returned');
    }
  } catch (error) {
    console.error('❌ Failed:', error.message);
    throw error;
  }
}

async function test2_EmbeddingGeneration() {
  console.log('\n🤖 Test 2: Embedding Generation');
  console.log('================================');
  
  const testSnippet = {
    id: 'test-' + Date.now(),
    content: 'This is a comprehensive test snippet designed to validate the RAG embedding generation system. It contains multiple sentences with varying complexity to ensure proper chunking and embedding generation. The content discusses various topics including machine learning, natural language processing, and vector search capabilities. This should generate at least 2-3 chunks for testing purposes.',
    title: 'Test Snippet - RAG Validation'
  };
  
  try {
    console.log('📝 Snippet ID:', testSnippet.id);
    console.log('📝 Content length:', testSnippet.content.length, 'chars');
    
    const response = await fetch(`${LAMBDA_URL}/rag/embed-snippets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        snippets: [testSnippet]
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    console.log('✅ Success:', result.success);
    
    if (result.results && result.results.length > 0) {
      const snippetResult = result.results[0];
      console.log('✅ Status:', snippetResult.status);
      console.log('✅ Chunks generated:', snippetResult.chunks?.length || 0);
      
      if (snippetResult.chunks && snippetResult.chunks.length > 0) {
        const firstChunk = snippetResult.chunks[0];
        console.log('✅ First chunk ID:', firstChunk.id);
        console.log('✅ Embedding dimensions:', firstChunk.embedding?.length || 0);
        console.log('✅ Embedding model:', firstChunk.embedding_model);
        console.log('✅ Chunk text preview:', firstChunk.chunk_text.substring(0, 100) + '...');
        
        return snippetResult;
      }
    }
    
    throw new Error('No chunks generated');
  } catch (error) {
    console.error('❌ Failed:', error.message);
    throw error;
  }
}

async function test3_QueryEmbedding() {
  console.log('\n🔍 Test 3: Query Embedding Generation');
  console.log('======================================');
  
  const testQuery = 'machine learning and natural language processing';
  
  try {
    console.log('📝 Query:', testQuery);
    
    const response = await fetch(`${LAMBDA_URL}/rag/embed-query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: testQuery
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    console.log('✅ Success:', result.success);
    console.log('✅ Embedding dimensions:', result.embedding?.length || 0);
    console.log('✅ Model:', result.model);
    
    return result.embedding;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    throw error;
  }
}

async function test4_GoogleSheetsSync(spreadsheetId, chunks) {
  console.log('\n📊 Test 4: Google Sheets Sync (Push)');
  console.log('=====================================');
  
  try {
    console.log('📝 Spreadsheet ID:', spreadsheetId);
    console.log('📝 Chunks to sync:', chunks.length);
    
    const response = await fetch(`${LAMBDA_URL}/rag/sync-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        operation: 'push',
        spreadsheetId,
        chunks
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    console.log('✅ Success:', result.success);
    console.log('✅ Pushed:', result.pushed, 'chunks');
    
    return result;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    throw error;
  }
}

async function test5_GoogleSheetsPull(spreadsheetId, snippetId) {
  console.log('\n📥 Test 5: Google Sheets Sync (Pull)');
  console.log('=====================================');
  
  try {
    console.log('📝 Spreadsheet ID:', spreadsheetId);
    console.log('📝 Snippet ID filter:', snippetId);
    
    const response = await fetch(`${LAMBDA_URL}/rag/sync-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        operation: 'pull',
        spreadsheetId,
        snippetIds: [snippetId]
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    console.log('✅ Success:', result.success);
    console.log('✅ Retrieved:', result.chunks?.length || 0, 'chunks');
    
    if (result.chunks && result.chunks.length > 0) {
      console.log('✅ First chunk ID:', result.chunks[0].id);
      console.log('✅ Embedding dimensions:', result.chunks[0].embedding?.length || 0);
    }
    
    return result.chunks;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    throw error;
  }
}

async function runAllTests() {
  console.log('🚀 RAG Deployment Test Suite');
  console.log('============================');
  console.log('Lambda URL:', LAMBDA_URL);
  console.log('Auth Token:', AUTH_TOKEN ? 'Set ✓' : 'Missing ✗');
  
  let spreadsheetId;
  let snippetResult;
  let queryEmbedding;
  
  try {
    // Test 1: Spreadsheet Discovery
    spreadsheetId = await test1_SpreadsheetDiscovery();
    
    // Test 2: Embedding Generation
    snippetResult = await test2_EmbeddingGeneration();
    
    // Test 3: Query Embedding
    queryEmbedding = await test3_QueryEmbedding();
    
    // Test 4: Push to Google Sheets
    if (spreadsheetId && snippetResult.chunks) {
      await test4_GoogleSheetsSync(spreadsheetId, snippetResult.chunks);
      
      // Test 5: Pull from Google Sheets
      await test5_GoogleSheetsPull(spreadsheetId, snippetResult.id);
    }
    
    console.log('\n✅ ALL TESTS PASSED!');
    console.log('===================');
    console.log('✓ Spreadsheet discovery works');
    console.log('✓ Embedding generation works');
    console.log('✓ Query embedding works');
    console.log('✓ Google Sheets sync (push) works');
    console.log('✓ Google Sheets sync (pull) works');
    console.log('\n📊 Next Steps:');
    console.log('1. Test vector search in browser console (requires IndexedDB)');
    console.log('2. Implement auto-push in SwagContext');
    console.log('3. Implement Search UI (Phase 6)');
    
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run tests
runAllTests();
