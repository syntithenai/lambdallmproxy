/**
 * Test file for chunker-langchain.js
 * Compares performance and output between original and LangChain chunker
 */

const originalChunker = require('../src/rag/chunker');
const langchainChunker = require('../src/rag/chunker-langchain');

const testText = `
# Introduction to React Hooks

React Hooks are functions that let you "hook into" React state and lifecycle features from function components.

## useState Hook

The useState Hook is one of the most commonly used hooks. It allows you to add state to functional components.

\`\`\`javascript
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}
\`\`\`

### When to use useState

Use useState when you need to:
- Track simple state values (strings, numbers, booleans)
- Update state based on user interactions
- Trigger re-renders when state changes

## useEffect Hook

The useEffect Hook lets you perform side effects in function components. It serves the same purpose as componentDidMount, componentDidUpdate, and componentWillUnmount in React classes.

\`\`\`javascript
import React, { useState, useEffect } from 'react';

function DataFetcher() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetch('https://api.example.com/data')
      .then(response => response.json())
      .then(data => setData(data));
  }, []); // Empty dependency array means run once on mount
  
  return <div>{data ? JSON.stringify(data) : 'Loading...'}</div>;
}
\`\`\`

### Effect dependencies

The dependency array in useEffect determines when the effect runs:
- Empty array []: Run once on mount
- [value]: Run when value changes
- No array: Run on every render (usually not recommended)

## Best Practices

1. Always use the functional form of state updates when the new state depends on the old state
2. Keep effects focused - each effect should do one thing
3. Clean up side effects to prevent memory leaks
4. Use custom hooks to extract and reuse stateful logic
5. Follow the Rules of Hooks - only call hooks at the top level
`;

async function runTests() {
  console.log('='.repeat(80));
  console.log('Testing Chunker Comparison');
  console.log('='.repeat(80));

  // Test 1: Basic chunking
  console.log('\n--- Test 1: Basic Chunking ---');
  const options = {
    chunkSize: 500,
    chunkOverlap: 100,
  };

  const originalChunks = originalChunker.chunkText(testText, options);
  const langchainChunks = await langchainChunker.chunkText(testText, options);

  console.log(`Original Chunker: ${originalChunks.length} chunks`);
  console.log(`LangChain Chunker: ${langchainChunks.length} chunks`);

  // Test 2: Chunking stats
  console.log('\n--- Test 2: Chunking Statistics ---');
  const originalStats = originalChunker.getChunkingStats(testText, options);
  const langchainStats = await langchainChunker.getChunkingStats(testText, options);

  console.log('Original Stats:', originalStats);
  console.log('LangChain Stats:', langchainStats);

  // Test 3: Source metadata
  console.log('\n--- Test 3: Source Metadata ---');
  const metadataOptions = {
    ...options,
    sourceMetadata: {
      source_type: 'file',
      source_file_name: 'react-hooks-guide.md',
      source_mime_type: 'text/markdown',
      source_url: 'https://example.com/docs/react-hooks.md'
    }
  };

  const chunksWithMetadata = await langchainChunker.chunkText(testText, metadataOptions);
  console.log('Sample chunk with metadata:');
  console.log(JSON.stringify(chunksWithMetadata[0], null, 2));

  // Test 4: Markdown-aware splitting
  console.log('\n--- Test 4: Markdown-Aware Splitting ---');
  const mdSplitter = langchainChunker.createMarkdownSplitter({ chunkSize: 500, chunkOverlap: 50 });
  const mdChunks = await mdSplitter.splitText(testText);
  console.log(`Markdown-aware splitter: ${mdChunks.length} chunks`);
  console.log('First chunk preview:', mdChunks[0].substring(0, 100) + '...');

  // Test 5: Performance comparison
  console.log('\n--- Test 5: Performance Comparison ---');
  
  const iterations = 100;
  
  // Original chunker
  const originalStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    originalChunker.chunkText(testText, options);
  }
  const originalTime = Date.now() - originalStart;

  // LangChain chunker
  const langchainStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    await langchainChunker.chunkText(testText, options);
  }
  const langchainTime = Date.now() - langchainStart;

  console.log(`Original Chunker: ${originalTime}ms for ${iterations} iterations (${(originalTime/iterations).toFixed(2)}ms avg)`);
  console.log(`LangChain Chunker: ${langchainTime}ms for ${iterations} iterations (${(langchainTime/iterations).toFixed(2)}ms avg)`);

  // Test 6: Edge cases
  console.log('\n--- Test 6: Edge Cases ---');
  
  // Empty string
  const emptyChunks = await langchainChunker.chunkText('', options);
  console.log(`Empty string: ${emptyChunks.length} chunks (expected: 0)`);

  // Very short text
  const shortChunks = await langchainChunker.chunkText('Hello world!', options);
  console.log(`Short text: ${shortChunks.length} chunks (expected: 1)`);

  // Very long single line
  const longLine = 'a'.repeat(2000);
  const longLineChunks = await langchainChunker.chunkText(longLine, { chunkSize: 500, chunkOverlap: 100 });
  console.log(`Long single line (2000 chars): ${longLineChunks.length} chunks`);

  console.log('\n' + '='.repeat(80));
  console.log('All tests completed!');
  console.log('='.repeat(80));
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
