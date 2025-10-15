#!/usr/bin/env node
/**
 * Test script to list available Gemini models
 * Usage: GEMINI_API_KEY=your_key node test-gemini-models.js
 */

const https = require('https');

const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_FREE_API_KEY;

if (!apiKey) {
  console.error('❌ No API key found. Set GEMINI_API_KEY or GEMINI_FREE_API_KEY environment variable');
  process.exit(1);
}

console.log('🔍 Querying available Gemini models...\n');

const options = {
  hostname: 'generativelanguage.googleapis.com',
  path: '/v1beta/models?key=' + apiKey,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`❌ HTTP ${res.statusCode}:`, data);
      return;
    }
    
    try {
      const response = JSON.parse(data);
      
      if (!response.models || response.models.length === 0) {
        console.log('⚠️ No models found');
        return;
      }
      
      console.log(`✅ Found ${response.models.length} models:\n`);
      
      response.models.forEach(model => {
        const name = model.name.replace('models/', '');
        const methods = model.supportedGenerationMethods || [];
        const supportsGenerate = methods.includes('generateContent');
        const supportsStream = methods.includes('streamGenerateContent');
        
        console.log(`📦 ${name}`);
        console.log(`   Display Name: ${model.displayName || 'N/A'}`);
        console.log(`   Description: ${model.description || 'N/A'}`);
        console.log(`   Supports generateContent: ${supportsGenerate ? '✅' : '❌'}`);
        console.log(`   Supports streamGenerateContent: ${supportsStream ? '✅' : '❌'}`);
        console.log(`   Methods: ${methods.join(', ')}`);
        console.log('');
      });
      
    } catch (error) {
      console.error('❌ Failed to parse response:', error.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.end();
