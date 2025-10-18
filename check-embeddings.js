const { createClient } = require('@libsql/client');
const client = createClient({ url: 'file:///home/stever/projects/lambdallmproxy/rag-kb.db' });

async function test() {
  const result = await client.execute({
    sql: 'SELECT id, chunk_text, embedding_vector FROM chunks WHERE snippet_name LIKE ? ORDER BY created_at DESC LIMIT 3',
    args: ['%README%']
  });
  
  console.log('Found', result.rows.length, 'README chunks\n');
  
  for (const chunk of result.rows) {
    const vec = new Float32Array(chunk.embedding_vector);
    const sum = vec.reduce((a, b) => a + Math.abs(b), 0);
    const avg = sum / vec.length;
    console.log('Chunk:', chunk.id);
    console.log('Text:', chunk.chunk_text.substring(0, 80));
    console.log('Vector length:', vec.length);
    console.log('Avg abs value:', avg.toFixed(6));
    console.log('Sample:', [vec[0], vec[1], vec[2], vec[3], vec[4]]);
    console.log('');
  }
}

test().catch(console.error);
