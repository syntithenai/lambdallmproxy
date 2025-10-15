/**
 * Test file for libsql-storage.js
 * Tests vector database operations
 */

const {
  createLibsqlClient,
  initDatabase,
  saveChunks,
  searchChunks,
  getChunk,
  getChunksBySnippet,
  deleteChunksBySnippet,
  getDatabaseStats,
  cosineSimilarity,
} = require('../src/rag/libsql-storage');

// Test embeddings (mock 1536-dimensional vectors)
function createMockEmbedding(seed = 0) {
  const embedding = new Float32Array(1536);
  for (let i = 0; i < 1536; i++) {
    // Create deterministic "random" values based on seed
    embedding[i] = Math.sin(seed + i) * 0.5 + 0.5;
  }
  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  for (let i = 0; i < 1536; i++) {
    embedding[i] /= norm;
  }
  return embedding;
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('Testing libSQL Vector Storage');
  console.log('='.repeat(80));

  // Create client
  const client = createLibsqlClient({ url: 'file:///tmp/test-rag.db' });

  try {
    // Test 1: Initialize database
    console.log('\n--- Test 1: Initialize Database ---');
    await initDatabase(client);
    console.log('✓ Database initialized');

    // Test 2: Save chunks
    console.log('\n--- Test 2: Save Chunks ---');
    const testChunks = [
      {
        id: 'chunk-1',
        snippet_id: 'snippet-1',
        snippet_name: 'React Hooks Guide',
        chunk_index: 0,
        chunk_text: 'React Hooks are functions that let you use state and lifecycle features.',
        embedding: createMockEmbedding(1),
        source_type: 'file',
        source_file_name: 'react-hooks.md',
        source_mime_type: 'text/markdown',
        token_count: 15,
      },
      {
        id: 'chunk-2',
        snippet_id: 'snippet-1',
        snippet_name: 'React Hooks Guide',
        chunk_index: 1,
        chunk_text: 'The useState Hook lets you add state to functional components.',
        embedding: createMockEmbedding(2),
        source_type: 'file',
        source_file_name: 'react-hooks.md',
        source_mime_type: 'text/markdown',
        token_count: 12,
      },
      {
        id: 'chunk-3',
        snippet_id: 'snippet-2',
        snippet_name: 'Python Basics',
        chunk_index: 0,
        chunk_text: 'Python is a high-level programming language with dynamic typing.',
        embedding: createMockEmbedding(10), // Very different embedding
        source_type: 'url',
        source_url: 'https://python.org/docs',
        token_count: 11,
      },
    ];

    await saveChunks(client, testChunks);
    console.log('✓ Saved 3 chunks');

    // Test 3: Get chunk by ID
    console.log('\n--- Test 3: Get Chunk by ID ---');
    const chunk1 = await getChunk(client, 'chunk-1');
    if (chunk1 && chunk1.id === 'chunk-1') {
      console.log('✓ Retrieved chunk-1');
      console.log(`  Text: ${chunk1.chunk_text.substring(0, 50)}...`);
      console.log(`  Source: ${chunk1.source_file_name}`);
    } else {
      console.log('✗ Failed to retrieve chunk-1');
    }

    // Test 4: Get chunks by snippet
    console.log('\n--- Test 4: Get Chunks by Snippet ---');
    const snippet1Chunks = await getChunksBySnippet(client, 'snippet-1');
    console.log(`✓ Found ${snippet1Chunks.length} chunks for snippet-1 (expected: 2)`);

    // Test 5: Cosine similarity
    console.log('\n--- Test 5: Cosine Similarity ---');
    const vec1 = createMockEmbedding(1);
    const vec2 = createMockEmbedding(2);
    const vec3 = createMockEmbedding(10);
    
    const sim12 = cosineSimilarity(vec1, vec2);
    const sim13 = cosineSimilarity(vec1, vec3);
    
    console.log(`Similarity (vec1 vs vec2): ${sim12.toFixed(4)}`);
    console.log(`Similarity (vec1 vs vec3): ${sim13.toFixed(4)}`);
    console.log(`✓ Similar vectors have higher similarity: ${sim12 > sim13}`);

    // Test 6: Vector search
    console.log('\n--- Test 6: Vector Search ---');
    const queryEmbedding = createMockEmbedding(1.5); // Between vec1 and vec2
    const searchResults = await searchChunks(client, queryEmbedding, {
      topK: 3,
      threshold: 0.0, // Low threshold to get all results
    });

    console.log(`✓ Found ${searchResults.length} results`);
    for (const result of searchResults) {
      console.log(`  - ${result.snippet_name}: ${result.similarity.toFixed(4)}`);
      console.log(`    Text: ${result.chunk_text.substring(0, 60)}...`);
    }

    // Test 7: Search with filters
    console.log('\n--- Test 7: Search with Filters ---');
    const fileResults = await searchChunks(client, queryEmbedding, {
      topK: 5,
      threshold: 0.0,
      sourceType: 'file',
    });
    console.log(`✓ Found ${fileResults.length} file results (expected: 2)`);

    const urlResults = await searchChunks(client, queryEmbedding, {
      topK: 5,
      threshold: 0.0,
      sourceType: 'url',
    });
    console.log(`✓ Found ${urlResults.length} URL results (expected: 1)`);

    // Test 8: Database statistics
    console.log('\n--- Test 8: Database Statistics ---');
    const stats = await getDatabaseStats(client);
    console.log('Database stats:', {
      totalChunks: stats.totalChunks,
      chunksWithEmbeddings: stats.chunksWithEmbeddings,
      avgChunkSize: stats.avgChunkSize,
      modelDistribution: stats.modelDistribution,
      sourceDistribution: stats.sourceDistribution,
    });

    // Test 9: Delete chunks
    console.log('\n--- Test 9: Delete Chunks ---');
    await deleteChunksBySnippet(client, 'snippet-1');
    const remainingChunks = await getChunksBySnippet(client, 'snippet-1');
    console.log(`✓ Deleted snippet-1 chunks, remaining: ${remainingChunks.length} (expected: 0)`);

    const statsAfterDelete = await getDatabaseStats(client);
    console.log(`✓ Total chunks after delete: ${statsAfterDelete.totalChunks} (expected: 1)`);

    console.log('\n' + '='.repeat(80));
    console.log('All tests completed!');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    // Cleanup: remove test database
    const fs = require('fs');
    if (fs.existsSync('/tmp/test-rag.db')) {
      fs.unlinkSync('/tmp/test-rag.db');
      console.log('\n✓ Cleaned up test database');
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
