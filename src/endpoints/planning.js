/**
 * Planning Endpoint
 * Takes a user query and generates a plan using Groq reasoning model
 * Returns JSON with: text response, search keywords, questions, and persona
 */

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
  "searchKeywords": [["keyword set 1", "keyword set 2"], ["alternative keyword set 1", "alternative keyword set 2"]],
  "questions": ["Question 1 phrased as a clear research query?", "Question 2?", "Question 3?"],
  "persona": "I am a [specific expert role/title] with expertise in [domain]. I specialize in [specific areas and computational tools when relevant]. I provide direct, concise answers that start with the key result.",
  "reasoning": "Detailed explanation of why this approach and persona are optimal",
  "complexityAssessment": "low|medium|high"
}

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
 * Handler for the planning endpoint
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} Lambda response
 */
async function handler(event) {
    try {
        // Get authorization header
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        
        // Verify JWT token (async - cryptographically verified)
        let verifiedUser = null;
        if (authHeader) {
            const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
            try {
                verifiedUser = await verifyGoogleToken(token);
                const allowedEmails = getAllowedEmails();
                
                // Check if user is in allowed list
                if (!verifiedUser || !allowedEmails || !allowedEmails.includes(verifiedUser.email)) {
                    verifiedUser = null;
                }
            } catch (error) {
                console.error('Token verification failed:', error.message);
            }
        }
        
        // Require authentication
        if (!verifiedUser) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Authentication required. Please provide a valid JWT token in the Authorization header.',
                    code: 'UNAUTHORIZED'
                })
            };
        }
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const query = body.query || '';
        const apiKey = body.apiKey || process.env.GROQ_API_KEY || '';
        const model = body.model || 'groq:llama-3.3-70b-versatile';
        
        // Validate inputs
        if (!query) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Query parameter is required'
                })
            };
        }
        
        if (!apiKey) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'API key is required'
                })
            };
        }
        
        // Generate plan
        const plan = await generatePlan(query, apiKey, model);
        
        // Return success response
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(plan)
        };
        
    } catch (error) {
        console.error('Planning endpoint error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: error.message || 'Internal server error'
            })
        };
    }
}

module.exports = {
    handler,
    generatePlan
};
