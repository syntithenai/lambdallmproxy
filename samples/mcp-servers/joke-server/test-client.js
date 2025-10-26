/**
 * Test client for MCP Joke Server
 * Runs automated tests against all endpoints
 */

const http = require('http');

const SERVER_URL = 'http://localhost:3100';

// JSON-RPC 2.0 request helper
async function jsonRpcRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: `test-${Date.now()}`,
      method,
      params
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(SERVER_URL, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Test suite
async function runTests() {
  console.log('🧪 Running MCP Joke Server Tests...\n');

  try {
    // Test 1: Health check
    console.log('Test 1: Health Check');
    const health = await new Promise((resolve, reject) => {
      http.get(`${SERVER_URL}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    console.log('✅ Health:', health.status);
    console.log(`   Total jokes: ${health.totalJokes}\n`);

    // Test 2: List tools
    console.log('Test 2: List Tools');
    const toolsList = await jsonRpcRequest('tools/list');
    console.log(`✅ Found ${toolsList.result.tools.length} tools:`);
    toolsList.result.tools.forEach(tool => {
      console.log(`   - ${tool.name}`);
    });
    console.log();

    // Test 3: Get random joke
    console.log('Test 3: Get Random Joke');
    const randomJoke = await jsonRpcRequest('tools/call', {
      name: 'get_random_joke',
      arguments: {}
    });
    const joke = JSON.parse(randomJoke.result.content[0].text);
    console.log('✅ Random joke:');
    console.log(`   ${joke.joke.setup}`);
    console.log(`   → ${joke.joke.punchline}\n`);

    // Test 4: Get joke by category
    console.log('Test 4: Get Programming Joke');
    const progJoke = await jsonRpcRequest('tools/call', {
      name: 'get_random_joke',
      arguments: { category: 'programming' }
    });
    const progJokeData = JSON.parse(progJoke.result.content[0].text);
    console.log('✅ Programming joke:');
    console.log(`   ${progJokeData.joke.setup}`);
    console.log(`   → ${progJokeData.joke.punchline}\n`);

    // Test 5: Get joke by ID
    console.log('Test 5: Get Joke by ID (42)');
    const jokeById = await jsonRpcRequest('tools/call', {
      name: 'get_joke_by_id',
      arguments: { id: 42 }
    });
    const jokeByIdData = JSON.parse(jokeById.result.content[0].text);
    console.log('✅ Joke #42:');
    console.log(`   ${jokeByIdData.joke.setup}`);
    console.log(`   → ${jokeByIdData.joke.punchline}\n`);

    // Test 6: Search jokes
    console.log('Test 6: Search for "computer" jokes');
    const searchResults = await jsonRpcRequest('tools/call', {
      name: 'search_jokes',
      arguments: { query: 'computer' }
    });
    const searchData = JSON.parse(searchResults.result.content[0].text);
    console.log(`✅ Found ${searchData.totalResults} jokes matching "computer"\n`);

    // Test 7: Get categories
    console.log('Test 7: Get Categories');
    const categories = await jsonRpcRequest('tools/call', {
      name: 'get_categories',
      arguments: {}
    });
    const categoriesData = JSON.parse(categories.result.content[0].text);
    console.log('✅ Categories:');
    Object.entries(categoriesData.categories).forEach(([cat, count]) => {
      console.log(`   - ${cat}: ${count} jokes`);
    });
    console.log();

    console.log('🎉 All tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('   Make sure the server is running on port 3100');
    console.error('   Start with: npm start');
    process.exit(1);
  }
}

// Run tests
runTests();
