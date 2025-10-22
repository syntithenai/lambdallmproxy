/**
 * Test script for model selection functionality
 */

const { selectModel, analyzeQueryComplexity, mapReasoningLevel, detectImageData } = require('./src/model-selector');

console.log('🧪 Testing Model Selection Function\n');

// Test cases
const testCases = [
  {
    name: 'Simple query with basic reasoning',
    query: 'What is the capital of France?',
    reasoningLevel: 'basic',
    tokenLimit: 500,
    expectedPattern: /llama-3\.1-8b-instant/ // Should prefer fast model for simple queries
  },
  {
    name: 'Complex analysis with advanced reasoning',
    query: 'Analyze the economic impact of climate change policies on developing countries, considering multiple factors including GDP growth, employment rates, and international trade relationships.',
    reasoningLevel: 'advanced',
    tokenLimit: 2000,
    expectedPattern: /(llama-3\.3-70b-versatile|deepseek-r1-distill-llama-70b|openai\/gpt-oss-120b)/ // Should prefer capable model for complex analysis
  },
  {
    name: 'Moderate complexity with intermediate reasoning',
    query: 'Explain how machine learning algorithms work for image recognition.',
    reasoningLevel: 'intermediate',
    tokenLimit: 1000,
    expectedPattern: /(allam-2-7b|gemma2-9b-it|meta-llama\/llama-guard-4-12b)/ // Various intermediate models available
  },
  {
    name: 'High token limit requirement',
    query: 'Write a comprehensive research paper on artificial intelligence ethics.',
    reasoningLevel: 'advanced',
    tokenLimit: 8000,
    expectedPattern: /(deepseek-r1-distill-llama-70b|moonshotai\/kimi-k2-instruct|qwen\/qwen3-32b)/ // Models that can handle large context
  },
  {
    name: 'Simple calculation',
    query: 'Calculate 15 * 23 + 7',
    reasoningLevel: 'basic',
    tokenLimit: 100,
    expectedPattern: /llama-3\.1-8b-instant/ // Fast model for simple tasks
  },
  {
    name: 'Query with image data - should prefer vision models',
    query: 'Describe what you see in this image',
    reasoningLevel: 'intermediate',
    tokenLimit: 1000,
    fullPrompt: {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe what you see in this image' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
        ]
      }]
    },
    expectedPattern: /(meta-llama\/llama-4-scout-17b-16e-instruct|meta-llama\/llama-4-maverick-17b-128e-instruct)/ // Should prefer vision-capable models
  },
  {
    name: 'Query with image keywords but no actual image data',
    query: 'Tell me about image processing algorithms',
    reasoningLevel: 'intermediate',
    tokenLimit: 1000,
    fullPrompt: 'Tell me about image processing algorithms',
    expectedPattern: /(allam-2-7b|gemma2-9b-it|llama-3\.1-8b-instant)/ // Should not prefer vision models without actual image data
  }
];

// Run tests
let passed = 0;
let failed = 0;

async function runTests() {
  for (const [index, testCase] of testCases.entries()) {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`  Query: "${testCase.query.substring(0, 50)}${testCase.query.length > 50 ? '...' : ''}"`);
    console.log(`  Reasoning: ${testCase.reasoningLevel}, Token limit: ${testCase.tokenLimit}`);
    if (testCase.fullPrompt) {
      console.log(`  Full prompt provided: ${typeof testCase.fullPrompt === 'object' ? 'JSON object' : 'string'}`);
    }

    try {
      const selectedModel = await selectModel(testCase.query, testCase.reasoningLevel, testCase.tokenLimit, testCase.fullPrompt);
      console.log(`  Selected: ${selectedModel}`);

      if (testCase.expectedPattern.test(selectedModel)) {
        console.log(`  ✅ PASS\n`);
        passed++;
      } else {
        console.log(`  ❌ FAIL - Expected pattern: ${testCase.expectedPattern}\n`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ ERROR: ${error.message}\n`);
      failed++;
    }
  }

  // Test helper functions
  console.log('🔍 Testing Helper Functions\n');

  console.log('Query Complexity Analysis:');
  const complexityTests = [
    { query: 'What is 2+2?', expected: 'simple' },
    { query: 'Explain quantum physics', expected: 'moderate' },
    { query: 'Analyze the socioeconomic impacts of globalization on emerging markets', expected: 'complex' }
  ];

  complexityTests.forEach(test => {
    const result = analyzeQueryComplexity(test.query);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`${status} "${test.query}" -> ${result} (expected: ${test.expected})`);
  });

  console.log('\nReasoning Level Mapping:');
  const reasoningTests = ['basic', 'intermediate', 'advanced', 'invalid'];
  reasoningTests.forEach(level => {
    const result = mapReasoningLevel(level);
    const status = (level === 'invalid' && result === 'intermediate') || (level === result) ? '✅' : '❌';
    console.log(`${status} "${level}" -> ${result}`);
  });

  console.log('\nImage Data Detection:');
  const imageTests = [
    { input: 'Describe this image', expected: false }, // Just keywords, no actual image data
    { input: 'Describe what you see in this image', expected: true }, // Specific image analysis request
    { input: { messages: [{ content: 'Hello world' }] }, expected: false }, // No image content
    { input: { messages: [{ content: [{ type: 'text', text: 'Hello' }, { type: 'image_url', image_url: { url: 'test.jpg' } }] }] }, expected: true }, // Actual image content
    { input: { image_url: 'test.png' }, expected: true }, // Direct image field
    { input: null, expected: false }, // Null input
    { input: undefined, expected: false } // Undefined input
  ];

  imageTests.forEach(test => {
    const result = detectImageData(test.input);
    const status = result === test.expected ? '✅' : '❌';
    const inputDesc = test.input === null ? 'null' :
                     test.input === undefined ? 'undefined' :
                     typeof test.input === 'object' ? 'JSON object' : `"${test.input}"`;
    console.log(`${status} ${inputDesc} -> ${result} (expected: ${test.expected})`);
  });

  // Summary
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.');
  }
}

// Run the async tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
});