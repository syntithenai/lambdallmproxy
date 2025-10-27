#!/usr/bin/env node

/**
 * Test local transcription with localhost URL
 * Run this to verify the local file detection works
 */

const { transcribeUrl } = require('./src/tools/transcribe');

async function test() {
    console.log('🧪 Testing local transcription...\n');
    
    const url = 'http://localhost:3000/samples/long-form-ai-speech.mp3';
    const apiKey = process.env.OPENAI_KEY || 'test-key';
    
    console.log(`URL: ${url}`);
    console.log(`API Key: ${apiKey ? '✅ Set' : '❌ Not set'}\n`);
    
    if (!process.env.OPENAI_KEY) {
        console.log('⚠️  Warning: OPENAI_KEY not set in environment');
        console.log('   The transcription will fail at the Whisper API call,');
        console.log('   but we can still test if local file detection works.\n');
    }
    
    try {
        const result = await transcribeUrl({
            url,
            apiKey,
            provider: 'openai',
            model: 'whisper-1',
            onProgress: (event) => {
                console.log(`📊 Progress: ${event.type}`);
            }
        });
        
        if (result.error) {
            console.log('\n❌ Error:', result.error);
        } else {
            console.log('\n✅ Success!');
            console.log(`Text length: ${result.text?.length || 0} characters`);
            console.log(`First 100 chars: ${result.text?.substring(0, 100)}...`);
        }
    } catch (error) {
        console.log('\n❌ Exception:', error.message);
        console.log('Stack:', error.stack);
    }
}

test().catch(console.error);
