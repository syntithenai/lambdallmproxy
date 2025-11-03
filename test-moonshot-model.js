#!/usr/bin/env node
require('dotenv').config();
const https = require('https');

// Try first available Groq API key
const apiKey = process.env.LP_KEY_0;

if (!apiKey) {
  console.log('❌ No API key found in LP_KEY_0');
  process.exit(1);
}

const data = JSON.stringify({
  model: 'moonshotai/kimi-k2-instruct-0905',
  messages: [{role: 'user', content: 'Say hello in one word'}],
  max_tokens: 10
});

console.log('🧪 Testing moonshotai/kimi-k2-instruct-0905...\n');

const req = https.request({
  hostname: 'api.groq.com',
  path: '/openai/v1/chat/completions',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('');
    
    if (res.statusCode === 200) {
      console.log('✅ Model is AVAILABLE and working!');
      const parsed = JSON.parse(body);
      console.log('Response:', parsed.choices[0].message.content);
    } else if (res.statusCode === 404) {
      console.log('❌ Model NOT FOUND (404) - Should mark as deprecated');
    } else if (res.statusCode === 400) {
      console.log('❌ Model DECOMMISSIONED (400) - Should mark as deprecated');
      const parsed = JSON.parse(body);
      console.log('Error:', parsed.error?.message || body);
    } else {
      console.log('❌ Error response:');
      console.log(body);
    }
  });
});

req.on('error', err => {
  console.error('❌ Request error:', err.message);
});

req.write(data);
req.end();
