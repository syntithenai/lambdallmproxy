/**
 * Test script to verify LLM events are emitted when tools use LLMs
 */

// Load environment variables from .env file
require('dotenv').config();

const { callFunction } = require('./src/tools');

async function testLLMEventsInTools() {
    console.log('🧪 Testing LLM events emission in tools...');
    
    // Mock writeEvent function to capture events
    const capturedEvents = [];
    const mockWriteEvent = (eventType, eventData) => {
        console.log(`📡 Event captured: ${eventType}`, JSON.stringify(eventData, null, 2));
        capturedEvents.push({ type: eventType, data: eventData });
    };
    
    try {
        // Test search_web with generate_summary = true
        console.log('🔍 Testing search_web tool with summary generation...');
        const result = await callFunction('search_web', {
            query: 'JavaScript basics',
            limit: 2,
            timeout: 10,
            load_content: false,
            generate_summary: true
        }, {
            model: 'groq:llama-3.1-8b-instant',
            apiKey: process.env.GROQ_API_KEY,
            writeEvent: mockWriteEvent
        });
        
        const response = JSON.parse(result);
        console.log('✅ Tool call completed');
        console.log('📊 Response summary info:', {
            hasSummary: !!response.summary,
            hasError: !!response.summary_error,
            model: response.summary_model
        });
        
        // Check if LLM events were captured
        const llmRequestEvents = capturedEvents.filter(e => e.type === 'llm_request');
        const llmResponseEvents = capturedEvents.filter(e => e.type === 'llm_response');
        
        console.log('\n📈 Event Analysis:');
        console.log(`- LLM Request Events: ${llmRequestEvents.length}`);
        console.log(`- LLM Response Events: ${llmResponseEvents.length}`);
        
        if (llmRequestEvents.length > 0) {
            console.log('✅ LLM request events are being emitted in tools!');
            console.log('🔧 Request event structure:', {
                phase: llmRequestEvents[0].data.phase,
                tool: llmRequestEvents[0].data.tool,
                model: llmRequestEvents[0].data.model
            });
        } else {
            console.log('❌ No LLM request events captured');
        }
        
        if (llmResponseEvents.length > 0) {
            console.log('✅ LLM response events are being emitted in tools!');
            console.log('🔧 Response event structure:', {
                phase: llmResponseEvents[0].data.phase,
                tool: llmResponseEvents[0].data.tool,
                model: llmResponseEvents[0].data.model,
                hasResponse: !!llmResponseEvents[0].data.response
            });
        } else {
            console.log('❌ No LLM response events captured');
        }
        
        if (llmRequestEvents.length > 0 && llmResponseEvents.length > 0) {
            console.log('\n🎉 SUCCESS: LLM events are properly emitted when tools use LLMs!');
            return true;
        } else {
            console.log('\n⚠️ WARNING: Some LLM events are missing');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return false;
    }
}

// Run the test
if (require.main === module) {
    testLLMEventsInTools()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch((error) => {
            console.error('💥 Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = { testLLMEventsInTools };