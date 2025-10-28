#!/usr/bin/env node
/**
 * Test REST API Endpoints
 * 
 * Usage:
 *   1. Start dev server: make dev
 *   2. Create API key: node scripts/create-api-key.js test@example.com
 *   3. Run tests: node scripts/test-rest-api.js sk-your-key-here
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.argv[2];

if (!API_KEY) {
    console.error('❌ Usage: node scripts/test-rest-api.js <api-key>');
    console.error('');
    console.error('Steps:');
    console.error('  1. Start dev server: make dev');
    console.error('  2. Create API key: node scripts/create-api-key.js test@example.com');
    console.error('  3. Run this script with the API key');
    process.exit(1);
}

/**
 * Make HTTP request
 */
function makeRequest(options, body = null) {
    return new Promise((resolve, reject) => {
        const protocol = options.protocol === 'https:' ? https : http;
        
        const req = protocol.request(options, (res) => {
            let data = '';
            
            res.on('data', chunk => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        
        req.end();
    });
}

/**
 * Test /v1/models endpoint
 */
async function testModelsEndpoint() {
    console.log('\n📋 Testing GET /v1/models...\n');
    
    const url = new URL(`${BASE_URL}/v1/models`);
    
    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${API_KEY}`
        },
        protocol: url.protocol
    };
    
    try {
        const response = await makeRequest(options);
        
        if (response.statusCode === 200) {
            const data = JSON.parse(response.body);
            console.log(`✅ Status: ${response.statusCode}`);
            console.log(`📊 Found ${data.data?.length || 0} models`);
            console.log('');
            console.log('Sample models:');
            (data.data || []).slice(0, 5).forEach(model => {
                console.log(`  - ${model.id} (${model.owned_by})`);
            });
            return true;
        } else {
            console.error(`❌ Status: ${response.statusCode}`);
            console.error('Response:', response.body);
            return false;
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        return false;
    }
}

/**
 * Test /v1/chat/completions endpoint (streaming)
 */
async function testChatCompletionsStreaming() {
    console.log('\n💬 Testing POST /v1/chat/completions (streaming)...\n');
    
    const url = new URL(`${BASE_URL}/v1/chat/completions`);
    
    const requestBody = {
        model: 'groq/llama-3.3-70b-versatile',
        messages: [
            { role: 'user', content: 'Say "Hello from REST API test!" and nothing else.' }
        ],
        stream: true,
        max_tokens: 50
    };
    
    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        protocol: url.protocol
    };
    
    return new Promise((resolve) => {
        const protocol = url.protocol === 'https:' ? https : http;
        
        const req = protocol.request(options, (res) => {
            console.log(`📡 Status: ${res.statusCode}`);
            console.log('📨 Streaming response:');
            console.log('');
            
            let fullContent = '';
            let chunkCount = 0;
            
            res.on('data', chunk => {
                const text = chunk.toString();
                const lines = text.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        
                        if (data === '[DONE]') {
                            console.log('\n');
                            console.log('✅ Stream completed');
                            console.log(`📊 Received ${chunkCount} chunks`);
                            console.log(`📝 Full response: "${fullContent}"`);
                            resolve(true);
                            return;
                        }
                        
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            
                            if (content) {
                                process.stdout.write(content);
                                fullContent += content;
                                chunkCount++;
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    } else if (line.startsWith('event: ')) {
                        const eventType = line.slice(7);
                        console.log(`\n[Event: ${eventType}]`);
                    }
                }
            });
            
            res.on('end', () => {
                if (chunkCount === 0) {
                    console.log('❌ No content chunks received');
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error('❌ Error:', error.message);
            resolve(false);
        });
        
        req.write(JSON.stringify(requestBody));
        req.end();
    });
}

/**
 * Main test function
 */
async function runTests() {
    console.log('🧪 REST API Test Suite');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`🔑 API Key: ${API_KEY.slice(0, 12)}...`);
    console.log('');
    
    let allPassed = true;
    
    // Test 1: Models endpoint
    const modelsTest = await testModelsEndpoint();
    allPassed = allPassed && modelsTest;
    
    // Test 2: Chat completions (streaming)
    const chatTest = await testChatCompletionsStreaming();
    allPassed = allPassed && chatTest;
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📊 Test Results:');
    console.log(`  GET /v1/models: ${modelsTest ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  POST /v1/chat/completions (streaming): ${chatTest ? '✅ PASS' : '❌ FAIL'}`);
    console.log('');
    
    if (allPassed) {
        console.log('🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('❌ Some tests failed');
        process.exit(1);
    }
}

runTests();
