/**
 * AWS Lambda handler for intelligent search + LLM response with streaming support
 * Combines DuckDuckGo search functionality with LLM processing to provide
 * comprehensive answers with citations and source references
 */

// AWS Lambda Response Streaming (available as global in runtime)

// Import Node.js modules
const https = require('https');

// Import modularized components
const { getAllowedEmails, verifyGoogleToken } = require('./auth');
const { PROVIDERS, parseProviderModel, getProviderConfig } = require('./providers');
const { MemoryTracker, TokenAwareMemoryTracker } = require('./memory-tracker');
const { SimpleHTMLParser } = require('./html-parser');
const { DuckDuckGoSearcher } = require('./search');
const { llmResponsesWithTools } = require('./llm_tools_adapter');
const { toolFunctions, callFunction } = require('./tools');






// Memory management constants
// Infer memory limit from environment when possible
const LAMBDA_MEMORY_LIMIT_MB = (process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE && parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE, 10))
    || (process.env.LAMBDA_MEMORY && parseInt(process.env.LAMBDA_MEMORY, 10))
    || 128;
const MEMORY_SAFETY_BUFFER_MB = 16; // Reserve 16MB for other operations
const MAX_CONTENT_SIZE_MB = LAMBDA_MEMORY_LIMIT_MB - MEMORY_SAFETY_BUFFER_MB;
const BYTES_PER_MB = 1024 * 1024;

// No legacy templates needed - tools-based approach handles everything dynamically

// --- Tools flow configuration ---
const MAX_TOOL_ITERATIONS = Number(process.env.MAX_TOOL_ITERATIONS ?? 3); // Allow more thorough research
const DEFAULT_REASONING_EFFORT = process.env.REASONING_EFFORT || 'medium';

// --- Token limit configuration ---
const MAX_TOKENS_PLANNING = Number(process.env.MAX_TOKENS_PLANNING ?? 300); // Planning query tokens
const MAX_TOKENS_TOOL_SYNTHESIS = Number(process.env.MAX_TOKENS_TOOL_SYNTHESIS ?? 512); // Tool synthesis tokens  
const MAX_TOKENS_FINAL_RESPONSE = Number(process.env.MAX_TOKENS_FINAL_RESPONSE ?? 2048); // Final response tokens - allow longer responses
const MAX_TOKENS_MATH_RESPONSE = Number(process.env.MAX_TOKENS_MATH_RESPONSE ?? 512); // Mathematical response tokens - concise math answers

// Emergency ultra-minimal system prompt to save tokens
const COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT = process.env.SYSTEM_PROMPT_SEARCH || `Answer using search results. Cite URLs.`;

function safeParseJson(s) {
    try { return JSON.parse(s); } catch { return {}; }
}

async function runToolLoop({ model, apiKey, userQuery, systemPrompt, stream }) {

    // Step 1: Initial planning query to determine research strategy and optimal persona
    stream?.writeEvent?.('log', { message: 'Analyzing query and determining research strategy...' });
    
    const planningPrompt = `Analyze this user query and determine:
1. What specific research questions are needed to gather all necessary facts
2. What expert persona/role would be most qualified to provide the best answer

Query: "${userQuery}"

IMPORTANT: Consider whether this query involves mathematical calculations, data processing, algorithmic problems, or computational analysis. If so, plan to use JavaScript code execution alongside research.

Respond with JSON in this exact format:
{
  "research_questions": ["Question 1 phrased as a clear search query?", "Question 2?", "Question 3?"],
  "optimal_persona": "I am a [specific expert role/title] with expertise in [domain]. I specialize in [specific areas and computational tools when relevant].",
  "reasoning": "Brief explanation of why this approach and persona are optimal, including computational tools if needed"
}

Generate 1-3 specific, targeted research questions that will help answer the user's query comprehensively. Be specific about the expert role (e.g., "financial analyst", "data scientist", "computational researcher") and tailor it to the query domain.`;

    try {
        const planningResponse = await llmResponsesWithTools({
            model,
            input: [
                { role: 'system', content: 'You are a research strategist. Analyze queries and determine optimal research approaches and expert personas. Always respond with valid JSON only.' },
                { role: 'user', content: planningPrompt }
            ],
            tools: [], // No tools needed for planning
            options: {
                apiKey,
                reasoningEffort: 'low',
                temperature: 0.1,
                max_tokens: MAX_TOKENS_PLANNING,
                timeoutMs: 15000
            }
        });

        let researchPlan = { research_questions: ["Initial research question"], optimal_persona: systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT, reasoning: "Default plan" };
        
        if (planningResponse?.text) {
            try {
                const parsed = JSON.parse(planningResponse.text.trim());
                if (parsed.research_questions && parsed.optimal_persona) {
                    researchPlan = parsed;
                    stream?.writeEvent?.('log', { 
                        message: `Research plan: ${researchPlan.research_questions.length} questions, Persona: ${researchPlan.optimal_persona.substring(0, 80)}...`
                    });
                    
                    // Send dedicated persona event for UI display
                    stream?.writeEvent?.('persona', {
                        persona: researchPlan.optimal_persona,
                        research_questions_needed: researchPlan.research_questions?.length || 1,
                        reasoning: researchPlan.reasoning
                    });
                    
                    // Send research questions event for UI display
                    stream?.writeEvent?.('research_questions', {
                        questions: researchPlan.research_questions,
                        questions_needed: researchPlan.research_questions?.length || 1,
                        reasoning: researchPlan.reasoning
                    });
                }
            } catch (e) {
                console.warn('Failed to parse planning response, using defaults:', e.message);
            }
        }

        // Get current date and time for environmental context
        const now = new Date();
        const currentDateTime = now.toISOString().split('T')[0] + ' ' + now.toTimeString().split(' ')[0] + ' UTC';
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
        const environmentContext = `\n\nCurrent Context: Today is ${dayOfWeek}, ${currentDateTime}. Use this temporal context when discussing recent events, current status, or time-sensitive information.`;

        // Update system prompt with determined persona and environmental context
        var dynamicSystemPrompt = researchPlan.optimal_persona + ' Use search tools to gather current information and cite all sources with URLs. For mathematical calculations, data analysis, or computational problems, use the execute_javascript tool to perform accurate calculations and show your work.' + environmentContext;
        
    } catch (e) {
        console.warn('Planning query failed, proceeding with default approach:', e.message);
        // Get current date and time for environmental context (fallback case)
        const now = new Date();
        const currentDateTime = now.toISOString().split('T')[0] + ' ' + now.toTimeString().split(' ')[0] + ' UTC';
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
        const environmentContext = `\n\nCurrent Context: Today is ${dayOfWeek}, ${currentDateTime}. Use this temporal context when discussing recent events, current status, or time-sensitive information.`;
        
        var dynamicSystemPrompt = (systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT) + ' For mathematical calculations, data analysis, or computational problems, use the execute_javascript tool to perform accurate calculations and show your work.' + environmentContext;
    }

    const input = [
        { role: 'system', content: dynamicSystemPrompt },
        { role: 'user', content: userQuery }
    ];

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        try {
            stream?.writeEvent?.('log', { message: `Tools iteration ${iter + 1}` });
        } catch {}

        const { output, text } = await llmResponsesWithTools({
            model,
            input,
            tools: toolFunctions,
            options: {
                apiKey,
                reasoningEffort: DEFAULT_REASONING_EFFORT,
                temperature: 0.2,
                max_tokens: MAX_TOKENS_TOOL_SYNTHESIS,
                timeoutMs: 30000
            }
        });

        if (!output || output.length === 0) {
            // No more tool calls needed - proceed to final synthesis
            break;
        }

        const calls = output.filter(x => x.type === 'function_call');
        
        if (calls.length > 0) {
            stream?.writeEvent?.('log', { 
                message: `Executing ${calls.length} tool${calls.length !== 1 ? 's' : ''}: ${calls.map(c => c.name).join(', ')}` 
            });
        }
        
        // Emit detailed tool call info for UI
        try {
            const detailedCalls = calls.map((tc, idx) => ({
                iteration: iter + 1,
                call_id: tc.call_id || tc.id || `iter-${iter + 1}-call-${idx + 1}`,
                name: tc.name,
                args: safeParseJson(tc.arguments || '{}')
            }));
            stream?.writeEvent?.('tools', { iteration: iter + 1, pending: calls.length, calls: detailedCalls });
        } catch {}

        const results = await Promise.allSettled(
            calls.map(async (tc, idx) => {
                const args = safeParseJson(tc.arguments || '{}');
                let output;
                try {
                    output = await callFunction(tc.name, args, { model, apiKey });
                } catch (e) {
                    output = JSON.stringify({ error: String(e?.message || e) });
                }
                const call_id = tc.call_id || tc.id || `iter-${iter + 1}-call-${idx + 1}`;
                const result = { iteration: iter + 1, call_id, name: tc.name, args, output: String(output) };
                try { stream?.writeEvent?.('tool_result', result); } catch {}
                return result;
            })
        );

        for (const r of results) {
            const item = r.status === 'fulfilled'
                ? r.value
                : { call_id: null, output: JSON.stringify({ error: String(r.reason?.message || r.reason) }) };
            
            // Emergency: Truncate tool outputs to prevent token explosion
            const truncatedOutput = String(item.output || '').substring(0, 300); // Extremely aggressive limit
            input.push({ type: 'function_call_output', call_id: item.call_id, output: truncatedOutput });
        }
        
        // Emergency: Prune conversation context if getting too large
        const contextStr = JSON.stringify(input);
        const estimatedTokens = Math.ceil(contextStr.length / 4); // Rough token estimate
        if (estimatedTokens > 3000) { // Emergency context limit
            console.warn(`🚨 EMERGENCY: Context too large (${estimatedTokens} tokens), pruning...`);
            // Keep only system prompt, user query, and last 2 tool results
            const systemMsg = input.find(m => m.role === 'system');
            const userMsg = input.find(m => m.role === 'user');
            const lastToolResults = input.filter(m => m.type === 'function_call_output').slice(-2);
            input = [systemMsg, userMsg, ...lastToolResults].filter(Boolean);
        }
    }

    // After all tool calls are complete, get the final synthesis
    try {
        console.log('🔄 Starting final synthesis step...');
        stream?.writeEvent?.('log', { message: 'Synthesizing comprehensive final answer...' });
        
        // Build minimal context to save tokens
        const allInformation = input
            .filter(item => item.type === 'function_call_output')
            .slice(0, 2) // Emergency: max 2 sources
            .map((item, index) => {
                try {
                    const data = JSON.parse(item.output);
                    if (data.summary) {
                        return `${index + 1}: ${data.summary.substring(0, 100)}...`; // Drastically reduced
                    } else if (data.content) {
                        return `${index + 1}: ${data.content.substring(0, 100)}...`;
                    }
                    return `${index + 1}: ${item.output.substring(0, 80)}...`;
                } catch {
                    return `${index + 1}: ${item.output.substring(0, 80)}...`;
                }
            })
            .join('\n');

        // Get current date and time for environmental context
        const now = new Date();
        const currentDateTime = now.toISOString().split('T')[0] + ' ' + now.toTimeString().split(' ')[0] + ' UTC';
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
        
        // Use the comprehensive final template from environment variables
        const finalTemplate = process.env.FINAL_TEMPLATE || `Q: {{ORIGINAL_QUERY}}
Data: {{ALL_INFORMATION}}
Answer with URLs:`;

        // Add environmental context to the final prompt
        const environmentalContext = `\n\nCurrent Environmental Context:\n- Date: ${dayOfWeek}, ${currentDateTime}\n- Analysis conducted in real-time with current information\n`;
        
        const finalPrompt = finalTemplate
            .replace('{{ORIGINAL_QUERY}}', userQuery)
            .replace('{{ALL_INFORMATION}}', allInformation) + environmentalContext;

        // Detect mathematical queries for concise responses
        const isMathQuery = /\b(calculate|compute|solve|equation|formula|math|add|subtract|multiply|divide|percentage|percent|interest|probability|statistics|algebra|geometry|trigonometry|\+|\-|\*|\/|\=|\^|√|∫|∑|\d+[\+\-\*\/]\d+)\b/i.test(userQuery);
        
        // Adjust system prompt and token limits for mathematical queries
        let mathSystemPrompt = dynamicSystemPrompt;
        let maxTokens = MAX_TOKENS_FINAL_RESPONSE;
        
        if (isMathQuery) {
            maxTokens = MAX_TOKENS_MATH_RESPONSE; // Use dedicated math response limit
            mathSystemPrompt = `${dynamicSystemPrompt}\n\nFor mathematical questions: Provide direct, concise answers. Show calculations clearly but keep explanations brief. Focus on the solution rather than lengthy descriptions.`;
        }

        const finalSynthesisInput = [
            { role: 'system', content: mathSystemPrompt },
            { role: 'user', content: finalPrompt }
        ];

        const finalResponse = await llmResponsesWithTools({
            model,
            input: finalSynthesisInput,
            tools: [], // No more tools, just final answer
            options: {
                apiKey,
                reasoningEffort: DEFAULT_REASONING_EFFORT,
                temperature: 0.2,
                max_tokens: maxTokens, // Adjust based on query type
                timeoutMs: 30000
            }
        });
        
        const result = finalResponse?.text || 'I was unable to provide a comprehensive answer based on the research conducted.';
        
        // Send the final response to the UI
        console.log('🎯 Sending final_answer event with content:', result?.substring?.(0, 100));
        stream?.writeEvent?.('final_answer', { 
            content: result,
            timestamp: new Date().toISOString()
        });
        
        return { finalText: result };
    } catch (e) {
        console.error('Final synthesis failed:', e?.message || e);
        const errorMsg = 'I apologize, but I encountered an issue while synthesizing the final answer.';
        
        // Send error as final answer
        stream?.writeEvent?.('final_answer', { 
            content: errorMsg,
            timestamp: new Date().toISOString()
        });
        
        return { finalText: errorMsg };
    }
}

/**
 * Legacy streaming handler (replaced by awslambda.streamifyResponse)
 */
const legacyStreamingHandler = async (event, responseStream, context) => {
    const startTime = Date.now();
    
    console.log('streamingHandler - responseStream type:', typeof responseStream);
    console.log('streamingHandler - responseStream methods:', responseStream ? Object.getOwnPropertyNames(responseStream) : 'null');
    
    try {
        // Set up headers for Server-Sent Events
        if (typeof responseStream.setContentType === 'function') {
            responseStream.setContentType('text/event-stream');
        }
        if (typeof responseStream.setHeader === 'function') {
            responseStream.setHeader('Cache-Control', 'no-cache');
            responseStream.setHeader('Connection', 'keep-alive');
            responseStream.setHeader('Access-Control-Allow-Origin', '*');
            responseStream.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, origin, accept');
            responseStream.setHeader('Access-Control-Allow-Methods', '*');
        }
    } catch (headerError) {
        console.error('Error setting headers:', headerError);
    }
    
    try {
        // Initialize query variable for error handling
        let query = '';
        let user = null;
        let allowEnvFallback = false;
        
        // Helper function to write events to the stream
        function writeEvent(type, data) {
            try {
                const eventText = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
                responseStream.write(eventText);
            } catch (writeError) {
                console.error('Stream write error:', writeError);
            }
        }
        
        // Send initial connection message
        writeEvent('log', {
            message: 'Connected! Processing request...',
            timestamp: new Date().toISOString()
        });
        
        // Extract parameters from request (POST only)
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        
        if (httpMethod !== 'POST') {
            writeEvent('error', {
                error: 'Method not allowed. Only POST requests are supported.',
                timestamp: new Date().toISOString()
            });
            responseStream.end();
            return;
        }
        
        const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        const limit = parseInt(body.limit) || 10;
        const fetchContent = body.fetchContent || false;
        const timeout = parseInt(body.timeout) || 30000;
        const model = body.model || 'groq:llama-3.1-8b-instant';
        const accessSecret = body.accessSecret || '';
        const apiKey = body.apiKey || '';
        const searchMode = body.searchMode || 'web_search';
        const googleToken = body.google_token || body.googleToken || null;

        // Authentication check
        if (process.env.ACCESS_SECRET) {
            if (!accessSecret || accessSecret !== process.env.ACCESS_SECRET) {
                writeEvent('error', {
                    error: 'Invalid or missing accessSecret',
                    code: 'INVALID_ACCESS_SECRET',
                    timestamp: new Date().toISOString()
                });
                responseStream.end();
                return;
            }
        }

        // Google token verification
        if (googleToken) {
            const verified = verifyGoogleToken(googleToken);
            const allowedEmails = getAllowedEmails();
            const whitelistEnabled = Array.isArray(allowedEmails) && allowedEmails.length > 0;
            
            if (verified && whitelistEnabled) {
                user = verified;
            }
            allowEnvFallback = !!(verified && whitelistEnabled);
        }
        
        if (!query) {
            writeEvent('error', {
                error: 'Query parameter is required',
                timestamp: new Date().toISOString()
            });
            responseStream.end();
            return;
        }
        
        if (!apiKey && !allowEnvFallback) {
            writeEvent('error', {
                error: 'API key required. Sign in with an allowed Google account or provide an apiKey.',
                code: 'NO_API_KEY',
                timestamp: new Date().toISOString()
            });
            responseStream.end();
            return;
        }

        // Send initialization event
        writeEvent('init', {
            query: query,
            model: model,
            searchMode: searchMode,
            user: user ? { email: user.email, name: user.name } : null,
            timestamp: new Date().toISOString()
        });

        // Create a stream adapter for real-time streaming
        const streamAdapter = {
            writeEvent: writeEvent,
            write: (data) => writeEvent('data', data)
        };
        
        // Send immediate feedback
        writeEvent('step', {
            type: 'starting',
            message: 'Starting search and analysis...',
            timestamp: new Date().toISOString()
        });
        
        // Process the request with tools-based approach
        const toolsRun = await runToolLoop({
            model,
            apiKey: apiKey || (allowEnvFallback ? (process.env[parseProviderModel(model).provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'] || '') : ''),
            userQuery: query,
            systemPrompt: COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT,
            stream: streamAdapter
        });
        
        const finalResult = {
            query: query,
            searches: [],
            searchResults: [],
            response: toolsRun.finalText || 'I apologize, but I encountered an issue while processing your request. Please try rephrasing your question.',
            metadata: {
                totalResults: 0,
                searchIterations: 0,
                finalModel: model,
                searchMode: 'tools'
            }
        };
        
        // Send final completion event
        writeEvent('complete', {
            result: finalResult,
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
        });
        
        responseStream.end();
        
    } catch (error) {
        const writeEvent = (type, data) => {
            try {
                const eventText = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
                responseStream.write(eventText);
            } catch (writeError) {
                console.error('Stream write error:', writeError);
            }
        };
        
        writeEvent('error', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        responseStream.end();
    }
};

// Using native Lambda Response Streaming for real-time SSE

/**
 * Main Lambda handler function (streamified). Streams SSE when requested,
 * otherwise responds with JSON. Keeps CORS-friendly headers.
 */
exports.handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    const startTime = Date.now();
    try {
        const accept = event.headers?.['accept'] || event.headers?.['Accept'] || '';
        const wantsSSE = accept.includes('text/event-stream') || event.queryStringParameters?.stream === 'true';

        if (wantsSSE) {
            // Delegate to legacy streaming handler that writes SSE events progressively
            return await legacyStreamingHandler(event, responseStream, context);
        }

        // Non-streaming JSON path: reuse existing logic and write body once
        const result = await handleNonStreamingRequest(event, context, startTime);
        try {
            if (typeof responseStream.setContentType === 'function') responseStream.setContentType('application/json');
            if (typeof responseStream.setHeader === 'function') {
                responseStream.setHeader('Cache-Control', 'no-cache');
                responseStream.setHeader('Connection', 'keep-alive');
                responseStream.setHeader('Access-Control-Allow-Origin', '*');
                responseStream.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, origin, accept');
                responseStream.setHeader('Access-Control-Allow-Methods', '*');
            }
        } catch (headerErr) {
            console.error('Error setting JSON headers:', headerErr);
        }
        responseStream.write(result?.body || '');
        responseStream.end();
    } catch (err) {
        // Ensure we always end the stream even on error
        try {
            if (typeof responseStream.setContentType === 'function') responseStream.setContentType('application/json');
        } catch {}
        const payload = { error: err?.message || 'Unhandled error' };
        try { responseStream.write(JSON.stringify(payload)); } catch {}
        try { responseStream.end(); } catch {}
    }
});

/**
 * Create a streaming response accumulator
 */
class StreamingResponse {
    constructor() {
        this.chunks = [];
    }
    
    write(data) {
        this.chunks.push(`data: ${JSON.stringify(data)}\n\n`);
    }
    
    writeEvent(type, data) {
        this.chunks.push(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    
    getResponse() {
        return this.chunks.join('');
    }
}

/**
 * Handle streaming requests with Server-Sent Events
 */
async function handleStreamingRequest(event, context, startTime) {
    const stream = new StreamingResponse();
    
    try {
        const initialMemory = process.memoryUsage();
        stream.writeEvent('log', {
            message: `Lambda handler started. Initial memory: RSS=${Math.round(initialMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(initialMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB`,
            timestamp: new Date().toISOString()
        });
    } catch (memoryError) {
        stream.writeEvent('log', {
            message: `Lambda handler started. Memory logging error: ${memoryError.message}`,
            timestamp: new Date().toISOString()
        });
    }
    
    // Initialize query variable for error handling
    let query = '';
    let user = null;
    let allowEnvFallback = false;
    
    try {
        // Extract parameters from request (POST only)
        let limit, fetchContent, timeout, model, accessSecret, apiKey, searchMode;
        
        // Extract the HTTP method (support both API Gateway and Function URL formats)
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        
        if (httpMethod !== 'POST') {
            stream.writeEvent('error', {
                error: 'Method not allowed. Only POST requests are supported.',
                timestamp: new Date().toISOString()
            });
            
            return {
                statusCode: 405,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                body: stream.getResponse()
            };
        }
        
    const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        limit = parseInt(body.limit) || 10;
        fetchContent = body.fetchContent || false;
        timeout = parseInt(body.timeout) || 30000;
        model = body.model || 'groq:llama-3.1-8b-instant';
        accessSecret = body.accessSecret || '';
        apiKey = body.apiKey || '';
        searchMode = body.searchMode || 'web_search';
        const googleToken = body.google_token || body.googleToken || null;

        // If server has ACCESS_SECRET set, require clients to provide it. Do NOT affect env-key fallback.
        if (process.env.ACCESS_SECRET) {
            if (!accessSecret || accessSecret !== process.env.ACCESS_SECRET) {
                stream.writeEvent('error', {
                    error: 'Invalid or missing accessSecret',
                    code: 'INVALID_ACCESS_SECRET',
                    timestamp: new Date().toISOString()
                });
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    },
                    body: stream.getResponse()
                };
            }
        }

        // Determine if user is allowed to use server-side API keys
        let tokenExpired = false;
        if (googleToken) {
            // First, let's check if the token appears to be expired by parsing it ourselves
            try {
                const base64Url = googleToken.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(
                    Buffer.from(base64, 'base64')
                        .toString()
                        .split('')
                        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                        .join('')
                );
                const payload = JSON.parse(jsonPayload);
                const now = Math.floor(Date.now() / 1000);
                tokenExpired = payload.exp < now;
            } catch (parseError) {
                // If we can't parse the token, let the regular verification handle it
            }
            
            if (tokenExpired) {
                stream.writeEvent('error', {
                    error: 'Google token has expired. Please clear your browser cache, refresh the page, and sign in again.',
                    code: 'TOKEN_EXPIRED',
                    timestamp: new Date().toISOString()
                });
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    },
                    body: stream.getResponse()
                };
            }
            
            const verified = verifyGoogleToken(googleToken);
            const allowedEmails = getAllowedEmails();
            const whitelistEnabled = Array.isArray(allowedEmails) && allowedEmails.length > 0;
            
            if (verified && whitelistEnabled) {
                user = verified;
            }
            // Combine sources: accessSecret OR verified allowlisted googleToken
            allowEnvFallback = !!(allowEnvFallback || (verified && whitelistEnabled));
            try {
                stream.writeEvent('log', {
                    message: `Auth Debug: googleToken length=${googleToken?.length}, verified=${!!verified}, whitelistEnabled=${whitelistEnabled}, allowedEmails=[${allowedEmails.join(', ')}], allowEnvFallback=${allowEnvFallback}, email=${verified?.email || 'n/a'}, tokenExpired=${tokenExpired}`,
                    timestamp: new Date().toISOString()
                });
            } catch {}
        } else {
            try {
                stream.writeEvent('log', {
                    message: `Auth Debug: No googleToken provided`,
                    timestamp: new Date().toISOString()
                });
            } catch {}
        }
        
        stream.writeEvent('log', {
            message: `Processing request for query: "${query}" with model: ${model}`,
            timestamp: new Date().toISOString()
        });
        
        // Validate required parameters
        if (!query) {
            stream.writeEvent('error', {
                error: 'Query parameter is required',
                timestamp: new Date().toISOString()
            });
            
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                body: stream.getResponse()
            };
        }
        
        // Enforce auth for server-side usage: require apiKey unless allowEnvFallback is true
        if (!apiKey && !allowEnvFallback) {
            stream.writeEvent('error', {
                error: 'API key required. Sign in with an allowed Google account or provide an apiKey.',
                code: 'NO_API_KEY',
                timestamp: new Date().toISOString()
            });
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                body: stream.getResponse()
            };
        }

        // Initialize streaming response data
        const streamingResults = {
            query: query,
            searches: [],
            finalResponse: null,
            metadata: {
                searchMode: searchMode,
                model: model,
                iterations: 0,
                maxIterations: 3,
                totalSearchResults: 0
            }
        };
        
    stream.writeEvent('init', { ...streamingResults, user: user ? { email: user.email, name: user.name } : null, allowEnvFallback });

        // Do not emit an empty initial snapshot; the client will render once real results arrive

        // Use tools-based approach only
        let finalResult = null;
        try {
            const toolsRun = await runToolLoop({
                model,
                apiKey: apiKey || (allowEnvFallback ? (process.env[parseProviderModel(model).provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'] || '') : ''),
                userQuery: query,
                systemPrompt: COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT,
                stream
            });
            
            finalResult = {
                success: true,
                mode: 'tools',
                answer: toolsRun.finalText || 'I apologize, but I encountered an issue while processing your request. Please try rephrasing your question.',
                searchResults: [],
                metadata: { tools: true }
            };
        } catch (e) {
            stream.writeEvent('error', {
                error: `Processing failed: ${e?.message || e}`,
                timestamp: new Date().toISOString()
            });
            
            finalResult = {
                success: false,
                mode: 'tools',
                answer: 'I apologize, but I encountered an error while processing your request. Please try again.',
                searchResults: [],
                metadata: { tools: true, error: true }
            };
        }
        
        // Send final completion event
        stream.writeEvent('complete', {
            result: finalResult,
            allResults: finalResult.searchResults,
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
        });
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Transfer-Encoding': 'chunked'
            },
            body: stream.getResponse()
        };
        
    } catch (error) {
        stream.writeEvent('error', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            },
            body: stream.getResponse()
        };
    }
}

/**
 * Handle streaming requests with AWS Lambda Response Streaming
 */
async function handleNativeStreamingRequest(event, responseStream, context, startTime) {
    // Use the existing streaming logic but return the buffered response for now
    // This is a fallback until we can properly implement native streaming
    return await handleStreamingRequest(event, context, startTime);
}

/**
 * Execute multi-search with immediate streaming feedback
 */
// Legacy multi-search functions removed - using tools-based approach only

/**
 * Handle non-streaming requests (original behavior)
 */
async function handleNonStreamingRequest(event, context, startTime) {
    const initialMemory = process.memoryUsage();
    console.log(`Lambda handler started. Initial memory: RSS=${Math.round(initialMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(initialMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB`);
    
    let query = '';
    let allowEnvFallback = false;
    
    try {
        // Extract parameters from request
        let limit, fetchContent, timeout, model, accessSecret, apiKey, searchMode;
        
        // Extract the HTTP method (support both API Gateway and Function URL formats)
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        
        if (httpMethod === 'OPTIONS') {
            // Let AWS Lambda Function URL handle CORS preflight
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: ''
            };
        }
        
        if (httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Method not allowed. Only POST requests are supported.',
                    timestamp: new Date().toISOString()
                })
            };
        }
        
    const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        limit = parseInt(body.limit) || 10;
        fetchContent = body.fetchContent || false;
        timeout = parseInt(body.timeout) || 30000;
        model = body.model || 'groq:llama-3.1-8b-instant';
        accessSecret = body.accessSecret || '';
        apiKey = body.apiKey || '';
        searchMode = body.searchMode || 'web_search';
        const googleToken = body.google_token || body.googleToken || null;
        // If server has ACCESS_SECRET set, require clients to provide it. Do NOT affect env-key fallback.
        if (process.env.ACCESS_SECRET) {
            if (!accessSecret || accessSecret !== process.env.ACCESS_SECRET) {
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        error: 'Invalid or missing accessSecret',
                        code: 'INVALID_ACCESS_SECRET',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }
        let tokenExpired = false;
        if (googleToken) {
            // First, let's check if the token appears to be expired by parsing it ourselves
            try {
                const base64Url = googleToken.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(
                    Buffer.from(base64, 'base64')
                        .toString()
                        .split('')
                        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                        .join('')
                );
                const payload = JSON.parse(jsonPayload);
                const now = Math.floor(Date.now() / 1000);
                tokenExpired = payload.exp < now;
            } catch (parseError) {
                // If we can't parse the token, let the regular verification handle it
            }
            
            if (tokenExpired) {
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        error: 'Google token has expired. Please clear your browser cache, refresh the page, and sign in again.',
                        code: 'TOKEN_EXPIRED',
                        timestamp: new Date().toISOString()
                    })
                };
            }
            
            const verified = verifyGoogleToken(googleToken);
            const allowedEmails = getAllowedEmails();
            const whitelistEnabled = Array.isArray(allowedEmails) && allowedEmails.length > 0;
            
            // Combine sources: accessSecret OR verified allowlisted googleToken
            allowEnvFallback = !!(allowEnvFallback || (verified && whitelistEnabled));
            console.log(`Auth Debug (non-streaming): googleToken length=${googleToken?.length}, verified=${!!verified}, whitelistEnabled=${whitelistEnabled}, allowedEmails=[${allowedEmails.join(', ')}], allowEnvFallback=${allowEnvFallback}, email=${verified?.email || 'n/a'}, tokenExpired=${tokenExpired}`);
        } else {
            console.log(`Auth Debug (non-streaming): No googleToken provided`);
        }
        
    console.log(`Processing non-streaming request for query: "${query}" with model: ${model}`);
        
    // Validate required parameters
        if (!query) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Query parameter is required',
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Enforce auth for server-side usage: require apiKey unless allowEnvFallback is true
        if (!apiKey && !allowEnvFallback) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'API key required. Sign in with an allowed Google account or provide an apiKey.',
                    code: 'NO_API_KEY',
                    timestamp: new Date().toISOString()
                })
            };
        }
        
        // Use tools-based approach only
        let finalResult;
        try {
            const toolsRun = await runToolLoop({
                model,
                apiKey: apiKey || (allowEnvFallback ? (process.env[parseProviderModel(model).provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'] || '') : ''),
                userQuery: query,
                systemPrompt: COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT,
                stream: null
            });
            
            finalResult = {
                query,
                searches: [],
                searchResults: [],
                response: toolsRun.finalText || 'I apologize, but I encountered an issue while processing your request. Please try rephrasing your question.',
                metadata: { finalModel: model, mode: 'tools' }
            };
        } catch (e) {
            console.error('Tools flow failed:', e?.message || e);
            finalResult = {
                query,
                searches: [],
                searchResults: [],
                response: 'I apologize, but I encountered an error while processing your request. Please try again.',
                metadata: { finalModel: model, mode: 'tools', error: true }
            };
        }
        
        const processingTime = Date.now() - startTime;
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...finalResult,
                processingTime: processingTime,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Lambda handler error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message,
                query: query,
                timestamp: new Date().toISOString()
            })
        };
    }
}
