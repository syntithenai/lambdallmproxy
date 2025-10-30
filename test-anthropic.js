#!/usr/bin/env node

/**
 * Test script for Anthropic Claude integration
 * Tests basic chat functionality with the local Lambda server
 */

const https = require('https');
const http = require('http');

// Test configuration
const API_BASE = 'http://localhost:3000';
const TEST_MODEL = 'claude-3-5-haiku-20241022'; // Fast, cost-effective model for testing

/**
 * Make a POST request to the local Lambda server
 */
function makeRequest(endpoint, data, stream = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + endpoint);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data)),
        'Authorization': 'Bearer test-token-anthropic-integration'
      }
    };

    const req = http.request(url, options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk.toString();
        if (stream) {
          // Print streaming chunks as they arrive
          process.stdout.write(chunk.toString());
        }
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (stream) {
            resolve({ statusCode: res.statusCode, body: responseData });
          } else {
            try {
              resolve({ statusCode: res.statusCode, body: JSON.parse(responseData) });
            } catch (e) {
              resolve({ statusCode: res.statusCode, body: responseData });
            }
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

/**
 * Test 1: Non-streaming request
 */
async function testNonStreaming() {
  console.log('\n🧪 Test 1: Non-streaming Anthropic request');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const requestBody = {
    messages: [
      { role: 'user', content: 'Say "Hello from Claude" and nothing else.' }
    ],
    model: TEST_MODEL,
    providerType: 'anthropic',
    stream: false,
    max_tokens: 50
  };

  try {
    const response = await makeRequest('/chat', requestBody);
    console.log('\n✅ Response received:');
    console.log('Status:', response.statusCode);
    console.log('Body:', JSON.stringify(response.body, null, 2));
    
    // Validate response structure
    if (response.body.choices && response.body.choices[0]?.message?.content) {
      console.log('\n✅ Response format is correct (OpenAI-compatible)');
      console.log('Message:', response.body.choices[0].message.content);
    } else {
      console.log('\n❌ Unexpected response format');
    }
    
    // Check token usage
    if (response.body.usage) {
      console.log('\n📊 Token Usage:');
      console.log('  Prompt tokens:', response.body.usage.prompt_tokens);
      console.log('  Completion tokens:', response.body.usage.completion_tokens);
      console.log('  Total tokens:', response.body.usage.total_tokens);
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Test 2: Streaming request
 */
async function testStreaming() {
  console.log('\n\n🧪 Test 2: Streaming Anthropic request');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const requestBody = {
    messages: [
      { role: 'user', content: 'Count from 1 to 5, each number on a new line.' }
    ],
    model: TEST_MODEL,
    providerType: 'anthropic',
    stream: true,
    max_tokens: 100
  };

  try {
    console.log('\n📡 Streaming response:');
    console.log('─────────────────────');
    const response = await makeRequest('/chat', requestBody, true);
    console.log('\n─────────────────────');
    console.log('✅ Streaming completed successfully');
    console.log('Status:', response.statusCode);
    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Test 3: Provider configuration check
 */
async function testProviderConfig() {
  console.log('\n\n🧪 Test 3: Provider configuration check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Test with invalid API key to see error handling
    const requestBody = {
      messages: [
        { role: 'user', content: 'Test' }
      ],
      model: TEST_MODEL,
      providerType: 'anthropic',
      apiKey: 'invalid-key',
      stream: false,
      max_tokens: 10
    };

    const response = await makeRequest('/chat', requestBody);
    console.log('\n⚠️  Expected authentication error, but got success');
    return false;
  } catch (error) {
    if (error.message.includes('401') || error.message.includes('authentication')) {
      console.log('✅ API key validation working correctly');
      console.log('Error:', error.message);
      return true;
    } else {
      console.log('❌ Unexpected error:', error.message);
      return false;
    }
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Anthropic Claude Integration Tests     ║');
  console.log('╚══════════════════════════════════════════╝');
  
  const results = [];
  
  // Run tests sequentially
  results.push(await testNonStreaming());
  results.push(await testStreaming());
  results.push(await testProviderConfig());
  
  // Summary
  console.log('\n\n╔══════════════════════════════════════════╗');
  console.log('║           Test Summary                   ║');
  console.log('╚══════════════════════════════════════════╝');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📊 Tests passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('✅ All tests passed! Anthropic integration is working correctly.\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Check the output above for details.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
