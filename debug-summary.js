/**
 * Test script to debug LLM summary generation in tools
 */

const { callFunction } = require('./src/tools');

async function debugSummaryGeneration() {
    console.log('🔍 Debugging summary generation...');
    
    try {
        // Test search_web with generate_summary = true and better error handling
        const result = await callFunction('search_web', {
            query: 'JavaScript basics',
            limit: 1,
            timeout: 15,
            load_content: false,
            generate_summary: true
        }, {
            model: 'groq:llama-3.1-8b-instant',
            apiKey: process.env.GROQ_API_KEY
        });
        
        const response = JSON.parse(result);
        console.log('📋 Full response:', JSON.stringify(response, null, 2));
        
        if (response.summary_error) {
            console.log('❌ Summary Error:', response.summary_error);
        }
        
        if (response.summary) {
            console.log('✅ Summary generated:', response.summary);
        }
        
        // Check environment
        console.log('\n🔧 Environment check:');
        console.log('- GROQ_API_KEY exists:', !!process.env.GROQ_API_KEY);
        console.log('- API key length:', process.env.GROQ_API_KEY?.length || 0);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

debugSummaryGeneration();