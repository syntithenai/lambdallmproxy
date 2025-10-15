/**
 * Test file for file-loaders.js
 * Tests loading various file formats
 */

const path = require('path');
const fs = require('fs').promises;
const {
  loadFile,
  loadAndChunkFile,
  loadText,
  loadHTML,
  loadCSV,
  loadJSON,
  getMimeType,
} = require('../src/rag/file-loaders');

// Test samples
const testHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Document</title>
  <meta name="description" content="A test HTML document">
  <style>body { font-family: Arial; }</style>
  <script>console.log('test');</script>
</head>
<body>
  <h1>Welcome to the Test</h1>
  <p>This is a paragraph with some <strong>bold text</strong>.</p>
  <p>And another paragraph with a <a href="#">link</a>.</p>
</body>
</html>
`;

const testCSV = `name,age,city
Alice,30,New York
Bob,25,San Francisco
Charlie,35,Chicago`;

const testJSON = {
  users: [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' },
  ],
  metadata: {
    version: '1.0',
    created: '2025-10-15',
  }
};

const testMarkdown = `# Test Document

This is a **markdown** document with:

- Lists
- *Italic text*
- \`code\`

## Code Example

\`\`\`javascript
function hello() {
  return 'world';
}
\`\`\`
`;

async function runTests() {
  console.log('='.repeat(80));
  console.log('Testing File Loaders');
  console.log('='.repeat(80));

  // Test 1: getMimeType
  console.log('\n--- Test 1: MIME Type Detection ---');
  const mimeTests = [
    ['document.pdf', 'application/pdf'],
    ['file.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['page.html', 'text/html'],
    ['data.csv', 'text/csv'],
    ['config.json', 'application/json'],
    ['readme.md', 'text/markdown'],
    ['notes.txt', 'text/plain'],
  ];

  for (const [filename, expectedMime] of mimeTests) {
    const detected = getMimeType(filename);
    const match = detected === expectedMime ? '✓' : '✗';
    console.log(`${match} ${filename}: ${detected}`);
  }

  // Test 2: Load HTML from buffer
  console.log('\n--- Test 2: Load HTML ---');
  try {
    const htmlBuffer = Buffer.from(testHTML, 'utf-8');
    const { text, metadata } = await loadHTML(htmlBuffer);
    console.log('✓ HTML loaded successfully');
    console.log('Title:', metadata.title);
    console.log('Description:', metadata.description);
    console.log('Text preview:', text.substring(0, 100) + '...');
    console.log('Text length:', text.length, 'chars');
  } catch (error) {
    console.log('✗ HTML loading failed:', error.message);
  }

  // Test 3: Load CSV from buffer
  console.log('\n--- Test 3: Load CSV ---');
  try {
    const csvBuffer = Buffer.from(testCSV, 'utf-8');
    const { text, metadata } = await loadCSV(csvBuffer);
    console.log('✓ CSV loaded successfully');
    console.log('Rows:', metadata.rows);
    console.log('Columns:', metadata.columns);
    console.log('Headers:', metadata.headers.join(', '));
    console.log('Markdown table preview:');
    console.log(text.substring(0, 200));
  } catch (error) {
    console.log('✗ CSV loading failed:', error.message);
  }

  // Test 4: Load JSON from buffer
  console.log('\n--- Test 4: Load JSON ---');
  try {
    const jsonBuffer = Buffer.from(JSON.stringify(testJSON), 'utf-8');
    const { text, metadata } = await loadJSON(jsonBuffer);
    console.log('✓ JSON loaded successfully');
    console.log('Type:', metadata.type);
    console.log('Item count:', metadata.itemCount);
    console.log('Text preview:');
    console.log(text.substring(0, 200) + '...');
  } catch (error) {
    console.log('✗ JSON loading failed:', error.message);
  }

  // Test 5: Load text from buffer
  console.log('\n--- Test 5: Load Markdown ---');
  try {
    const mdBuffer = Buffer.from(testMarkdown, 'utf-8');
    const { text, metadata } = await loadFile(mdBuffer, 'text/markdown');
    console.log('✓ Markdown loaded successfully');
    console.log('Lines:', metadata.lines);
    console.log('Chars:', metadata.chars);
    console.log('MIME type:', metadata.source_mime_type);
    console.log('Text preview:', text.substring(0, 150) + '...');
  } catch (error) {
    console.log('✗ Markdown loading failed:', error.message);
  }

  // Test 6: Load and chunk file
  console.log('\n--- Test 6: Load and Chunk ---');
  try {
    const longText = testMarkdown.repeat(10); // Make it longer
    const buffer = Buffer.from(longText, 'utf-8');
    
    const result = await loadAndChunkFile(buffer, {
      mimeType: 'text/markdown',
      chunkOptions: {
        chunkSize: 500,
        chunkOverlap: 100,
      },
    });

    console.log('✓ File loaded and chunked successfully');
    console.log('Total text length:', result.text.length, 'chars');
    console.log('Total chunks:', result.metadata.totalChunks);
    console.log('First chunk preview:');
    console.log(result.chunks[0].chunk_text.substring(0, 150) + '...');
    console.log('First chunk metadata:', {
      chunk_index: result.chunks[0].chunk_index,
      token_count: result.chunks[0].token_count,
      source_type: result.chunks[0].source_type,
      source_mime_type: result.chunks[0].source_mime_type,
    });
  } catch (error) {
    console.log('✗ Load and chunk failed:', error.message);
  }

  // Test 7: Error handling
  console.log('\n--- Test 7: Error Handling ---');
  try {
    await loadJSON(Buffer.from('invalid json {', 'utf-8'));
    console.log('✗ Should have thrown error for invalid JSON');
  } catch (error) {
    console.log('✓ Correctly caught invalid JSON error');
  }

  try {
    await loadCSV(Buffer.from('', 'utf-8'));
    console.log('✓ Handled empty CSV gracefully');
  } catch (error) {
    console.log('✗ Failed to handle empty CSV:', error.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log('All tests completed!');
  console.log('='.repeat(80));
  console.log('\nNote: PDF and DOCX tests require actual files.');
  console.log('To test those formats, create sample files and run:');
  console.log('  const result = await loadFile("./sample.pdf");');
  console.log('  const result = await loadFile("./sample.docx");');
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
