#!/usr/bin/env node
/**
 * Test the /rag/embed-snippets endpoint to see what it returns
 */

const LAMBDA_URL = process.env.LAMBDA_URL || 'http://localhost:3000';

async function testEmbedding() {
  console.log('Testing /rag/embed-snippets endpoint...\n');
  
  const testSnippet = {
    id: 'test-snippet-123',
    content: 'This is a test snippet for embedding generation.',
    title: 'Test Snippet',
    tags: ['test'],
    timestamp: Date.now()
  };
  
  try {
    const response = await fetch(`${LAMBDA_URL}/rag/embed-snippets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippets: [testSnippet],
        force: true
      }),
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('\nResponse data:');
    console.log('- success:', data.success);
    console.log('- results count:', data.results?.length);
    
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      console.log('\nFirst result:');
      console.log('- id:', result.id);
      console.log('- status:', result.status);
      console.log('- chunks count:', result.chunks?.length);
      
      if (result.chunks && result.chunks.length > 0) {
        const chunk = result.chunks[0];
        console.log('\nFirst chunk:');
        console.log('- Keys:', Object.keys(chunk));
        console.log('- id:', chunk.id);
        console.log('- snippet_id:', chunk.snippet_id);
        console.log('- chunk_text length:', chunk.chunk_text?.length);
        console.log('- embedding exists:', !!chunk.embedding);
        console.log('- embedding type:', chunk.embedding?.constructor?.name);
        console.log('- embedding length:', chunk.embedding?.length);
        console.log('- embedding first 5 values:', chunk.embedding?.slice(0, 5));
        console.log('- embedding_dimensions:', chunk.embedding_dimensions);
        
        // Check if embedding is actually populated
        if (chunk.embedding && chunk.embedding.length > 0) {
          console.log('\n✅ Embedding is populated!');
        } else {
          console.log('\n❌ Embedding is EMPTY or missing!');
          console.log('Full chunk:', JSON.stringify(chunk, null, 2));
        }
      }
    }
    
    if (data.error) {
      console.error('\n❌ Error:', data.error);
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    console.error(error);
  }
}

testEmbedding();
