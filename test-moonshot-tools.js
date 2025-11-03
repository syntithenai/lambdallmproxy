#!/usr/bin/env node
require('dotenv').config();
const https = require('https');

const apiKey = process.env.LP_KEY_0;

const data = JSON.stringify({
  model: 'moonshotai/kimi-k2-instruct-0905',
  messages: [{role: 'user', content: 'Generate 2 feed items about AI'}],
  tools: [{
    type: 'function',
    function: {
      name: 'generate_feed_items',
      description: 'Generate feed items',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                content: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }],
  max_tokens: 500
});

console.log('🧪 Testing moonshot with tools...\n');

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
    console.log('Status:', res.statusCode);
    if (res.statusCode === 200) {
      console.log('✅ Tools work!');
      const parsed = JSON.parse(body);
      console.log('Tool calls:', parsed.choices[0].message.tool_calls?.length || 0);
    } else {
      console.log('❌ Error:');
      console.log(body);
    }
  });
});

req.on('error', err => console.error('Error:', err.message));
req.write(data);
req.end();
