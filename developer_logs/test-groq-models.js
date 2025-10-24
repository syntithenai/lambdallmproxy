#!/usr/bin/env node

/**
 * Test which Groq models work with free tier API key
 * Tests chat completion models only (excludes TTS, Whisper, Prompt Guard)
 */

const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const GROQ_API_KEY = process.env.LLAMDA_LLM_PROXY_PROVIDER_KEY_0;

// Chat completion models to test (excluding TTS, Whisper, Prompt Guard)
const MODELS_TO_TEST = [
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'moonshotai/kimi-k2-instruct-0905',
    'moonshotai/kimi-k2-instruct',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'qwen/qwen3-32b',
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'groq/compound',
    'groq/compound-mini',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'allam-2-7b',
    'meta-llama/llama-guard-4-12b'
];

async function testModel(model) {
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: model,
                messages: [
                    { role: 'user', content: 'Say "OK" if you can respond.' }
                ],
                max_tokens: 10,
                temperature: 0
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        const reply = response.data.choices[0]?.message?.content || '';
        return {
            model,
            status: 'SUCCESS',
            response: reply.trim(),
            tokens: response.data.usage
        };
    } catch (error) {
        return {
            model,
            status: 'FAILED',
            error: error.response?.data?.error?.message || error.message,
            code: error.response?.status
        };
    }
}

async function main() {
    console.log('🧪 Testing Groq Models with Free Tier Key\n');
    console.log(`Testing ${MODELS_TO_TEST.length} models...\n`);

    const results = [];

    for (const model of MODELS_TO_TEST) {
        process.stdout.write(`Testing ${model.padEnd(50)}... `);
        const result = await testModel(model);
        results.push(result);

        if (result.status === 'SUCCESS') {
            console.log(`✅ SUCCESS (${result.tokens.total_tokens} tokens)`);
        } else {
            console.log(`❌ FAILED: ${result.error}`);
        }

        // Rate limiting: wait 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY\n');

    const successful = results.filter(r => r.status === 'SUCCESS');
    const failed = results.filter(r => r.status === 'FAILED');

    console.log(`✅ Working models (${successful.length}):`);
    successful.forEach(r => {
        console.log(`   - ${r.model}`);
    });

    console.log(`\n❌ Failed models (${failed.length}):`);
    failed.forEach(r => {
        console.log(`   - ${r.model}: ${r.error}`);
    });

    // Save results
    const fs = require('fs');
    fs.writeFileSync(
        'groq-model-test-results.json',
        JSON.stringify(results, null, 2)
    );
    console.log('\n📝 Full results saved to groq-model-test-results.json');

    // Generate .env additions
    console.log('\n' + '='.repeat(80));
    console.log('SUGGESTED .env ADDITIONS FOR LOAD BALANCING:\n');
    
    if (successful.length > 0) {
        successful.forEach((r, idx) => {
            const providerNum = idx + 1;
            console.log(`LLAMDA_LLM_PROXY_PROVIDER_TYPE_${providerNum}=groq-free`);
            console.log(`LLAMDA_LLM_PROXY_PROVIDER_KEY_${providerNum}=${GROQ_API_KEY}`);
            console.log(`LLAMDA_LLM_PROXY_PROVIDER_MODEL_${providerNum}=${r.model}`);
            console.log('');
        });
    }
}

main().catch(console.error);
