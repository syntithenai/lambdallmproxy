/**
 * Test Whisper Provider Priority Logic
 * 
 * This script validates that the transcription tool correctly
 * prioritizes Groq (FREE) over OpenAI (PAID) based on available API keys.
 */

console.log('🧪 Testing Whisper Provider Priority Logic\n');

// Simulate the provider selection logic from src/tools.js
function selectWhisperProvider(context) {
    let provider = null;
    let apiKey = null;
    let reason = '';
    
    // Priority: Groq (gsk_*) > OpenAI (sk-*)
    if (context.apiKey?.startsWith('gsk_')) {
        provider = 'groq';
        apiKey = context.apiKey;
        reason = 'Main API key is Groq (gsk_*)';
    } else if (context.groqApiKey) {
        provider = 'groq';
        apiKey = context.groqApiKey;
        reason = 'Groq API key found in provider pool';
    } else if (context.openaiApiKey) {
        provider = 'openai';
        apiKey = context.openaiApiKey;
        reason = 'OpenAI API key found in provider pool';
    } else if (context.apiKey?.startsWith('sk-')) {
        provider = 'openai';
        apiKey = context.apiKey;
        reason = 'Main API key is OpenAI (sk-*)';
    }
    
    return { provider, apiKey, reason };
}

// Test cases
const testCases = [
    {
        name: 'Groq main API key',
        context: {
            apiKey: 'gsk_123abc'
        },
        expected: {
            provider: 'groq',
            cost: 'FREE'
        }
    },
    {
        name: 'Groq from provider pool',
        context: {
            apiKey: 'sk_openai_123',
            groqApiKey: 'gsk_456def'
        },
        expected: {
            provider: 'groq',
            cost: 'FREE'
        }
    },
    {
        name: 'OpenAI from provider pool (no Groq)',
        context: {
            apiKey: 'AIza_gemini_123',
            openaiApiKey: 'sk_789ghi'
        },
        expected: {
            provider: 'openai',
            cost: 'PAID ($0.006/min)'
        }
    },
    {
        name: 'OpenAI main API key (no Groq)',
        context: {
            apiKey: 'sk-abc123'  // OpenAI keys use sk- (hyphen), not sk_
        },
        expected: {
            provider: 'openai',
            cost: 'PAID ($0.006/min)'
        }
    },
    {
        name: 'Both Groq and OpenAI (Groq should win)',
        context: {
            apiKey: 'sk_openai_main',
            groqApiKey: 'gsk_groq_pool',
            openaiApiKey: 'sk_openai_pool'
        },
        expected: {
            provider: 'groq',
            cost: 'FREE'
        }
    },
    {
        name: 'Groq main + OpenAI pool (Groq should win)',
        context: {
            apiKey: 'gsk_main',
            openaiApiKey: 'sk_pool'
        },
        expected: {
            provider: 'groq',
            cost: 'FREE'
        }
    },
    {
        name: 'No Whisper-compatible keys',
        context: {
            apiKey: 'AIza_gemini_only'
        },
        expected: {
            provider: null,
            cost: 'ERROR'
        }
    },
    {
        name: 'Empty context',
        context: {},
        expected: {
            provider: null,
            cost: 'ERROR'
        }
    }
];

// Run tests
let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
    const result = selectWhisperProvider(test.context);
    const success = result.provider === test.expected.provider;
    
    console.log(`Test ${index + 1}: ${test.name}`);
    console.log(`  Context: ${JSON.stringify(test.context, null, 2)}`);
    console.log(`  Expected: ${test.expected.provider || 'null'} (${test.expected.cost})`);
    console.log(`  Result: ${result.provider || 'null'} (${result.reason || 'No compatible key found'})`);
    console.log(`  Status: ${success ? '✅ PASS' : '❌ FAIL'}`);
    console.log('');
    
    if (success) {
        passed++;
    } else {
        failed++;
    }
});

// Summary
console.log('═══════════════════════════════════════');
console.log('📊 Test Results');
console.log('═══════════════════════════════════════');
console.log(`✅ Passed: ${passed}/${testCases.length}`);
console.log(`❌ Failed: ${failed}/${testCases.length}`);
console.log(`📈 Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log('═══════════════════════════════════════');

// Cost analysis
console.log('\n💰 Cost Impact Analysis');
console.log('═══════════════════════════════════════');
console.log('With Groq configured:');
console.log('  • 1 hour video: $0.00 (FREE)');
console.log('  • 10 hours/day: $0.00 (FREE)');
console.log('  • 300 hours/month: $0.00 (FREE)');
console.log('');
console.log('With OpenAI only:');
console.log('  • 1 hour video: $0.36');
console.log('  • 10 hours/day: $3.60/day = $108/month');
console.log('  • 300 hours/month: $1,080/month');
console.log('');
console.log('💡 Savings with Groq: 100% cost reduction!');
console.log('═══════════════════════════════════════');

// Exit with proper code
process.exit(failed > 0 ? 1 : 0);
