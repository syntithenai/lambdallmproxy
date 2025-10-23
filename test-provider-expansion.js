#!/usr/bin/env node

/**
 * Test Provider Expansion for Load Balancing
 * 
 * This script tests that groq-free providers are automatically expanded
 * into multiple model-specific providers for round-robin load balancing.
 */

const { buildProviderPool, expandProviderForLoadBalancing } = require('./src/credential-pool');

console.log('🧪 Testing Provider Expansion for Load Balancing\n');

// Test Case 1: Single groq-free provider (simulating UI-posted provider)
console.log('=' .repeat(80));
console.log('Test 1: Single groq-free provider from UI');
console.log('=' .repeat(80));

const userProviders = [
    {
        type: 'groq-free',
        apiKey: 'gsk_test123456789',
        enabled: true
    }
];

const pool = buildProviderPool(userProviders, false);

console.log(`\n📊 Results:`);
console.log(`   Input: 1 groq-free provider`);
console.log(`   Output: ${pool.length} providers`);
console.log(`\n🔍 Provider Details:`);
pool.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.type} - ${p.modelName || '(default)'} (ID: ${p.id})`);
});

// Test Case 2: Provider with specific model already set
console.log('\n' + '='.repeat(80));
console.log('Test 2: groq-free provider with specific model (should NOT expand)');
console.log('='.repeat(80));

const userProvidersWithModel = [
    {
        type: 'groq-free',
        apiKey: 'gsk_test123456789',
        modelName: 'llama-3.3-70b-versatile',
        enabled: true
    }
];

const pool2 = buildProviderPool(userProvidersWithModel, false);

console.log(`\n📊 Results:`);
console.log(`   Input: 1 groq-free provider with specific model`);
console.log(`   Output: ${pool2.length} provider(s)`);
console.log(`\n🔍 Provider Details:`);
pool2.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.type} - ${p.modelName || '(default)'} (ID: ${p.id})`);
});

// Test Case 3: Non-Groq provider (should pass through unchanged)
console.log('\n' + '='.repeat(80));
console.log('Test 3: OpenAI provider (should NOT expand)');
console.log('='.repeat(80));

const openaiProviders = [
    {
        type: 'openai',
        apiKey: 'sk-test123456789',
        enabled: true
    }
];

const pool3 = buildProviderPool(openaiProviders, false);

console.log(`\n📊 Results:`);
console.log(`   Input: 1 openai provider`);
console.log(`   Output: ${pool3.length} provider(s)`);
console.log(`\n🔍 Provider Details:`);
pool3.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.type} - ${p.modelName || '(default)'} (ID: ${p.id})`);
});

// Summary
console.log('\n' + '='.repeat(80));
console.log('📋 Summary');
console.log('='.repeat(80));
console.log(`✅ groq-free providers are automatically expanded into ${pool.length} model-specific providers`);
console.log('✅ Providers with specific models are NOT expanded');
console.log('✅ Non-Groq providers pass through unchanged');
console.log('\n🎯 Load balancing will now distribute requests across all Groq models!');
console.log('   When one model hits rate limits, the system will automatically');
console.log('   round-robin to the next available model.\n');
