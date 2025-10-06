/**
 * Planning Endpoint
 * Takes a user query and generates a plan using Groq reasoning model
 * Returns SSE stream with: text response, search keywords, questions, and persona
 */

// Note: awslambda is a global object provided by Lambda runtime when using Response Streaming
// No import needed - it's automatically available

const { llmResponsesWithTools } = require('../llm_tools_adapter');
const { DEFAULT_REASONING_EFFORT, MAX_TOKENS_PLANNING } = require('../config/tokens');
const { verifyGoogleToken, getAllowedEmails } = require('../auth');

/**
 * Generate a research plan for a given query
 * @param {string} query - User's query
 * @param {string} apiKey - Groq API key
 * @param {string} model - Groq model to use (defaults to reasoning model)
 * @returns {Promise<Object>} Plan object with text, searchKeywords, questions, persona
 */
async function generatePlan(query, apiKey, model = 'groq:llama-3.3-70b-versatile') {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Query parameter is required and must be a non-empty string');
    }
    
    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('API key is required');
    }
    
    const planningPrompt = `Analyze this user query and determine the optimal research strategy and expert approach:

Query: "${query}"

Provide a comprehensive analysis that considers:
1. What specific research questions are needed to gather all necessary facts
2. What expert persona/role would be most qualified to provide the best answer
3. Whether the query requires mathematical calculations, data processing, or computational analysis
4. The complexity level and depth of analysis needed
5. Any potential challenges or nuances in answering this query
6. Specific search keyword sets that would be most effective for research

You may provide detailed reasoning if the query is complex or multi-faceted.

Respond with JSON in this exact format:
{
  "text": "A comprehensive explanation of the research approach and strategy",
  "searchKeywords": [["keyword 1", "keyword 2"], ["keyword 3", "keyword 4"]],
  "questions": ["Question 1 phrased as a clear research query?", "Question 2?", "Question 3?"],
  "persona": "I am a [specific expert role/title] with expertise in [domain]. I specialize in [specific areas and computational tools when relevant]. I provide direct, concise answers that start with the key result.",
  "reasoning": "Detailed explanation of why this approach and persona are optimal",
  "complexityAssessment": "low|medium|high"
}

IMPORTANT: Each item in searchKeywords arrays must be a SEPARATE, INDIVIDUAL keyword or short phrase. Do NOT use commas within keyword strings. Split comma-separated keywords into separate array items.

Examples:
- CORRECT: [["Rolf Harris biography", "Rolf Harris career"], ["Rolf Harris wiki", "Rolf Harris news"]]
- WRONG: [["Rolf Harris biography,Rolf Harris career"], ["Rolf Harris wiki,Rolf Harris news"]]

Generate 1-5 specific, targeted research questions based on query complexity. For complex queries, provide more detailed reasoning and additional research questions. Be specific about the expert role and tailor it precisely to the query domain.`;

    try {
        const requestBody = {
            model,
            input: [
                { 
                    role: 'system', 
                    content: 'You are a research strategist. Analyze queries and determine optimal research approaches and expert personas. You may provide detailed analysis if the query is complex. Always respond with valid JSON only.' 
                },
                { role: 'user', content: planningPrompt }
            ],
            tools: [],
            options: {
                apiKey,
                reasoningEffort: DEFAULT_REASONING_EFFORT,
                temperature: 0.2,
                max_tokens: MAX_TOKENS_PLANNING * 2, // Allow more tokens for planning endpoint
                timeoutMs: 30000
            }
        };
        
        const response = await llmResponsesWithTools(requestBody);
        
        if (!response || !response.text) {
            throw new Error('No response from LLM');
        }
        
        // Parse the JSON response
        const parsed = JSON.parse(response.text.trim());
        
        // Validate required fields
        if (!parsed.text || !parsed.searchKeywords || !parsed.questions || !parsed.persona) {
            throw new Error('Invalid plan response: missing required fields');
        }
        
        // Ensure searchKeywords is an array of arrays
        if (!Array.isArray(parsed.searchKeywords) || !parsed.searchKeywords.every(s => Array.isArray(s))) {
            throw new Error('Invalid plan response: searchKeywords must be an array of arrays');
        }
        
        // Ensure questions is an array
        if (!Array.isArray(parsed.questions)) {
            throw new Error('Invalid plan response: questions must be an array');
        }
        
        return {
            text: parsed.text,
            searchKeywords: parsed.searchKeywords,
            questions: parsed.questions,
            persona: parsed.persona,
            reasoning: parsed.reasoning || '',
            complexityAssessment: parsed.complexityAssessment || 'medium'
        };
        
    } catch (error) {
        // If JSON parsing fails, provide a better error message
        if (error.message.includes('JSON')) {
            throw new Error(`Failed to parse LLM response as JSON: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Handler for the planning endpoint (with SSE streaming)
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Lambda response stream
 * @returns {Promise<void>} Streams response via responseStream
 */
async function handler(event, responseStream) {
    // Set streaming headers
    // Note: CORS headers are handled by Lambda Function URL configuration
    const metadata = {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    };
    
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
    
    try {
        // Get authorization header
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        
        // Extract token (support both "Bearer token" and just "token")
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;
        
        let verifiedUser = null;
        
        // Try to verify token if provided
        if (token) {
            verifiedUser = await verifyGoogleToken(token);
        }
        
        // Require authentication
        if (!verifiedUser) {
            responseStream.write(`event: error\ndata: ${JSON.stringify({
                error: 'Authentication required. Please provide a valid JWT token in the Authorization header.',
                code: 'UNAUTHORIZED'
            })}\n\n`);
            responseStream.end();
            return;
        }
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const query = body.query || '';
        const apiKey = body.apiKey || process.env.GROQ_API_KEY || '';
        const model = body.model || 'groq:llama-3.3-70b-versatile';
        
        // Validate inputs
        if (!query) {
            responseStream.write(`event: error\ndata: ${JSON.stringify({
                error: 'Query parameter is required'
            })}\n\n`);
            responseStream.end();
            return;
        }
        
        if (!apiKey) {
            responseStream.write(`event: error\ndata: ${JSON.stringify({
                error: 'API key is required'
            })}\n\n`);
            responseStream.end();
            return;
        }
        
        // Send status event
        responseStream.write(`event: status\ndata: ${JSON.stringify({
            message: 'Generating research plan...'
        })}\n\n`);
        
        // Generate plan
        const plan = await generatePlan(query, apiKey, model);
        
        // Send result event
        responseStream.write(`event: result\ndata: ${JSON.stringify(plan)}\n\n`);
        
        // Send complete event
        responseStream.write(`event: complete\ndata: ${JSON.stringify({
            success: true
        })}\n\n`);
        
        responseStream.end();
        
    } catch (error) {
        console.error('Planning endpoint error:', error);
        
        responseStream.write(`event: error\ndata: ${JSON.stringify({
            error: error.message || 'Internal server error'
        })}\n\n`);
        responseStream.end();
    }
}

module.exports = {
    handler,
    generatePlan
};
