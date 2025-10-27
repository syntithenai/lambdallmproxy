// Simple test runner for guardrail auto-detection
const { loadGuardrailConfig } = require('../src/guardrails/config');

function runTest(context) {
  process.env.EN_GUARD = 'true';
  // Clear indexed provider env vars for deterministic behavior
  for (let i = 0; i < 10; i++) {
    delete process.env[`P_T${i}`];
    delete process.env[`P_K${i}`];
  }

  // Inject any context into the call
  const config = loadGuardrailConfig(context || {});
  console.log('Detected guardrail config:', config);
}

// Run with no context (rely on env vars)
console.log('\n--- Test 1: No context provided ---');
runTest({});

// Run with groq api key in context
console.log('\n--- Test 2: Context with groqApiKey ---');
runTest({ groqApiKey: 'fake-groq-key' });

// Run with gemini api key in context
console.log('\n--- Test 3: Context with geminiApiKey ---');
runTest({ geminiApiKey: 'fake-gemini-key' });

// Run with together api key in context
console.log('\n--- Test 4: Context with togetherApiKey ---');
runTest({ togetherApiKey: 'fake-together-key' });

console.log('\nDone.');
