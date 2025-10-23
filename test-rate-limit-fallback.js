#!/usr/bin/env node

/**
 * Test Rate Limit Fallback Logic
 * 
 * Simulates the provider selection logic when rate limits are hit
 */

// Simulate expanded providers (10 groq-free instances)
const chatEnabledProviders = [
  { id: 'groq-free-0', type: 'groq-free', model: 'llama-3.1-8b-instant', apiKey: 'test' },
  { id: 'groq-free-1', type: 'groq-free', model: 'llama-3.3-70b-versatile', apiKey: 'test' },
  { id: 'groq-free-2', type: 'groq-free', model: 'meta-llama/llama-4-maverick-17b-128e-instruct', apiKey: 'test' },
  { id: 'groq-free-3', type: 'groq-free', model: 'meta-llama/llama-4-scout-17b-16e-instruct', apiKey: 'test' },
  { id: 'groq-free-4', type: 'groq-free', model: 'moonshotai/kimi-k2-instruct', apiKey: 'test' },
  { id: 'groq-free-5', type: 'groq-free', model: 'moonshotai/kimi-k2-instruct-0905', apiKey: 'test' },
  { id: 'groq-free-6', type: 'groq-free', model: 'openai/gpt-oss-20b', apiKey: 'test' },
  { id: 'groq-free-7', type: 'groq-free', model: 'openai/gpt-oss-120b', apiKey: 'test' },
  { id: 'groq-free-8', type: 'groq-free', model: 'qwen/qwen3-32b', apiKey: 'test' },
  { id: 'groq-free-9', type: 'groq-free', model: 'allam-2-7b', apiKey: 'test' },
];

// Simulate rate limit scenario
const attemptedProviders = new Set();
const selectedProvider = chatEnabledProviders[1]; // Start with llama-3.3-70b-versatile
const model = selectedProvider.model;

console.log('🧪 Testing Rate Limit Fallback Logic\n');
console.log(`📍 Starting with: ${selectedProvider.id} (model: ${model})`);
console.log(`   Provider type: ${selectedProvider.type}\n`);

attemptedProviders.add(selectedProvider.id);

// Simulate rate limit hit
console.log('❌ Rate limit hit on:', selectedProvider.id, '(model:', model, ')');
console.log('🔍 Looking for fallback provider...\n');

const currentProviderType = selectedProvider.type;
const currentProviderId = selectedProvider.id;
const currentModel = model;

// FIXED LOGIC: First priority - same type but different model/instance
let nextProvider = chatEnabledProviders.find(p => 
    !attemptedProviders.has(p.id) && 
    p.type === currentProviderType &&  // Same type (e.g., groq-free)
    p.id !== currentProviderId &&       // Different instance ID
    p.model !== currentModel            // Different model
);

if (nextProvider) {
    console.log('✅ Found fallback provider:');
    console.log(`   ID: ${nextProvider.id}`);
    console.log(`   Type: ${nextProvider.type}`);
    console.log(`   Model: ${nextProvider.model}`);
    console.log('\n🎯 Result: Will retry with different Groq model');
} else {
    console.log('❌ No fallback provider found (would try different provider types next)');
}

// Test OLD LOGIC for comparison
console.log('\n---\n');
console.log('🔍 OLD LOGIC (for comparison):');
let oldNextProvider = chatEnabledProviders.find(p => 
    !attemptedProviders.has(p.id) && 
    p.type !== currentProviderType  // ❌ Different type only
);

if (oldNextProvider) {
    console.log('Found provider:', oldNextProvider.id);
} else {
    console.log('❌ No fallback provider found (all groq-free excluded!)');
}

// Show all available providers
console.log('\n---\n');
console.log('📋 All Available Providers:');
chatEnabledProviders.forEach((p, idx) => {
    const attempted = attemptedProviders.has(p.id) ? '❌ TRIED' : '✅ Available';
    console.log(`   ${idx + 1}. ${p.id} - ${p.model} - ${attempted}`);
});

console.log('\n✨ With the fix, the system will try all 10 Groq models before giving up!');
