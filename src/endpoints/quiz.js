/**
 * Quiz Generation Endpoint
 * Generates interactive multiple-choice quizzes from content using LLM
 */

const { llmResponsesWithTools } = require('../llm_tools_adapter');
const { authenticateRequest } = require('../auth');
const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');
const { buildProviderPool } = require('../credential-pool');
const { searchWeb } = require('../tools/search_web');
const { buildModelRotationSequence, estimateTokenRequirements } = require('../model-selector-v2');

// Load provider catalog
const { loadProviderCatalog } = require('../utils/catalog-loader');
const providerCatalog = loadProviderCatalog();

// Quiz storage service
const quizService = require('../services/google-sheets-quiz');
const { extractProjectId } = require('../services/user-isolation');

/**
 * Generate a quiz from content
 * @param {string} content - Content to generate quiz from
 * @param {boolean} enrichment - Whether to enrich content with web search
 * @param {Object} providers - Available providers with API keys
 * @returns {Promise<Object>} Quiz object with title and questions
 */
async function generateQuiz(content, enrichment = false, providers = {}) {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('Content parameter is required and must be a non-empty string');
    }
    
    if (!providers || Object.keys(providers).length === 0) {
        throw new Error('At least one provider with API key is required');
    }
    
    let enrichedContent = content;
    
    // Enrich content with web search if requested
    if (enrichment) {
        try {
            console.log('🔍 Enriching content with web search...');
            
            // Extract key terms from content for search
            const searchPrompt = `Extract 2-3 key search terms from this content for finding additional information: "${content.substring(0, 200)}..."
Return only the search terms, comma separated.`;
            
            // Build model sequence for search term extraction
            const uiProviders = Object.entries(providers).map(([type, p]) => ({
                type: type, // Use the object key as the type
                apiKey: p.apiKey,
                enabled: true
            })).filter(p => p.type && p.apiKey);
            
            const estimatedTokens = estimateTokenRequirements(
                [{ role: 'user', content: searchPrompt }],
                false
            );
            
            const modelSequence = buildModelRotationSequence(uiProviders, {
                needsTools: false,
                needsVision: false,
                estimatedTokens,
                optimization: 'fast' // Use fast models for simple extraction
            });
            
            if (modelSequence.length === 0) {
                throw new Error('No available models for search term extraction');
            }
            
            // Try models in sequence for search term extraction
            let searchTermsResult = null;
            for (let i = 0; i < Math.min(3, modelSequence.length); i++) {
                const selectedModel = modelSequence[i];
                try {
                    searchTermsResult = await llmResponsesWithTools({
                        model: selectedModel.model,
                        input: [{ role: 'user', content: searchPrompt }],
                        tools: [],
                        options: {
                            apiKey: selectedModel.apiKey,
                            temperature: 0.3,
                            maxTokens: 100,
                            stream: false
                        }
                    });
                    break; // Success
                } catch (error) {
                    // Check if it's a rate limit error
                    const isRateLimitError = 
                        error.status === 429 ||
                        error.message?.includes('429') ||
                        error.message?.includes('rate limit') ||
                        error.message?.includes('quota exceeded');
                    
                    if (isRateLimitError) {
                        console.warn(`⚠️ Rate limit hit during search term extraction with ${selectedModel.model}:`, error.message?.substring(0, 100));
                        if (i < Math.min(3, modelSequence.length) - 1) {
                            console.log(`⏭️ Quiz search: Rate limit detected, trying fallback model...`);
                            continue;
                        }
                    } else {
                        console.warn(`⚠️ Search term extraction failed with ${selectedModel.model}:`, error.message?.substring(0, 100));
                        if (i < Math.min(3, modelSequence.length) - 1) continue;
                    }
                    throw error; // Re-throw if last attempt
                }
            }
            
            const searchTerms = searchTermsResult.content || searchTermsResult.text || '';
            console.log(`🔍 Search terms: ${searchTerms}`);
            
            // Perform web search
            const searchResults = await searchWeb(searchTerms, 5);
            
            if (searchResults && searchResults.length > 0) {
                const additionalContext = searchResults
                    .map(r => `${r.title}: ${r.snippet}`)
                    .join('\n\n');
                enrichedContent = `${content}\n\nAdditional Context:\n${additionalContext}`;
                console.log(`✅ Enriched content with ${searchResults.length} search results`);
            }
        } catch (error) {
            console.warn('⚠️ Failed to enrich content with web search:', error.message);
            // Continue with original content
        }
    }
    
    // Generate quiz using LLM with tool calling for structured output
    const quizPrompt = `Create an educational multiple-choice quiz based on the following content.

Content:
${enrichedContent}

Generate a quiz with exactly 10 questions. Each question must test understanding (not just recall), have exactly 4 answer choices, one correct answer, and a brief explanation. Vary difficulty levels and make distractors plausible but incorrect.`;

    // Define quiz schema as a tool for guaranteed structured output
    const quizTool = {
        type: 'function',
        function: {
            name: 'generate_quiz',
            description: 'Generate a structured multiple-choice quiz',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Quiz title (concise, related to the content)'
                    },
                    questions: {
                        type: 'array',
                        description: 'Array of exactly 10 quiz questions',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Question ID (e.g., "q1")' },
                                prompt: { type: 'string', description: 'Question text' },
                                choices: {
                                    type: 'array',
                                    description: 'Exactly 4 answer choices',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'string', description: 'Choice ID (a, b, c, d)' },
                                            text: { type: 'string', description: 'Choice text' }
                                        },
                                        required: ['id', 'text']
                                    },
                                    minItems: 4,
                                    maxItems: 4
                                },
                                answerId: { type: 'string', description: 'ID of correct choice' },
                                explanation: { type: 'string', description: 'Brief explanation' }
                            },
                            required: ['id', 'prompt', 'choices', 'answerId', 'explanation']
                        },
                        minItems: 10,
                        maxItems: 10
                    }
                },
                required: ['title', 'questions']
            }
        }
    };

    console.log('🧠 Generating quiz with LLM (tool calling for structured output)...');
    
    // Build model sequence for quiz generation
    const uiProviders = Object.entries(providers).map(([type, p]) => ({
        type: type,
        apiKey: p.apiKey,
        enabled: true
    })).filter(p => p.type && p.apiKey);
    
    const estimatedTokens = estimateTokenRequirements(
        [{ role: 'user', content: quizPrompt }],
        true // Tools enabled
    );
    
    const modelSequence = buildModelRotationSequence(uiProviders, {
        needsTools: true, // Require tool calling support
        needsVision: false,
        estimatedTokens,
        optimization: 'quality'
    });
    
    if (modelSequence.length === 0) {
        throw new Error('No available models with tool calling support for quiz generation');
    }
    
    // Try models in sequence until one succeeds
    let result = null;
    let lastError = null;
    
    for (let i = 0; i < modelSequence.length; i++) {
        const selectedModel = modelSequence[i];
        console.log(`🎯 Quiz: Trying model ${i + 1}/${modelSequence.length}: ${selectedModel.model}`);
        
        try {
            result = await llmResponsesWithTools({
                model: selectedModel.model,
                input: [{ role: 'user', content: quizPrompt }],
                tools: [quizTool],
                tool_choice: { type: 'function', function: { name: 'generate_quiz' } },
                options: {
                    apiKey: selectedModel.apiKey,
                    temperature: 0.7,
                    maxTokens: 5000,
                    stream: false
                }
            });
            
            console.log(`✅ Quiz: Successfully generated with ${selectedModel.model}`);
            break;
            
        } catch (error) {
            lastError = error;
            
            // Check if it's a rate limit error
            const isRateLimitError = 
                error.status === 429 ||
                error.message?.includes('429') ||
                error.message?.includes('rate limit') ||
                error.message?.includes('quota exceeded');
            
            if (isRateLimitError) {
                console.error(`❌ Quiz: Rate limit hit with ${selectedModel.model}:`, error.message?.substring(0, 200));
            } else {
                console.error(`❌ Quiz: Model ${selectedModel.model} failed:`, error.message?.substring(0, 200));
            }
            
            if (i < modelSequence.length - 1) {
                if (isRateLimitError) {
                    console.log(`⏭️ Quiz: Rate limit detected, trying fallback model...`);
                } else {
                    console.log(`⏭️ Quiz: Trying next model...`);
                }
                continue;
            }
        }
    }
    
    if (!result) {
        console.error(`❌ Quiz: All ${modelSequence.length} models failed. Last error:`, lastError?.message);
        throw new Error(`All models failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }
    
    // Extract quiz data from tool call response
    let quiz;
    try {
        // Check if response has tool calls (structured output)
        if (result.tool_calls && result.tool_calls.length > 0) {
            const toolCall = result.tool_calls[0];
            if (toolCall.function && toolCall.function.name === 'generate_quiz') {
                // Parse arguments (might be string or object)
                quiz = typeof toolCall.function.arguments === 'string'
                    ? JSON.parse(toolCall.function.arguments)
                    : toolCall.function.arguments;
                console.log('✅ Extracted quiz from tool call');
            }
        }
        
        // Fallback to parsing content as JSON (if no tool call)
        if (!quiz) {
            const response = (result.content || result.text || '').trim();
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, response];
            const jsonStr = jsonMatch[1] || response;
            quiz = JSON.parse(jsonStr);
            console.log('✅ Parsed quiz from JSON response');
        }
    } catch (parseError) {
        console.error('❌ Failed to extract quiz data:', parseError.message);
        console.error('Result:', JSON.stringify(result).substring(0, 500));
        throw new Error('Failed to extract quiz from LLM response');
    }
    
    // Validate quiz structure
    if (!quiz.title || !Array.isArray(quiz.questions)) {
        throw new Error('Invalid quiz structure: missing title or questions array');
    }
    
    if (quiz.questions.length !== 10) {
        console.warn(`⚠️ Quiz has ${quiz.questions.length} questions, expected 10`);
    }
    
    // Validate each question
    quiz.questions.forEach((q, index) => {
        if (!q.id) q.id = `q${index + 1}`;
        if (!q.prompt) throw new Error(`Question ${index + 1} missing prompt`);
        if (!Array.isArray(q.choices) || q.choices.length !== 4) {
            throw new Error(`Question ${index + 1} must have exactly 4 choices`);
        }
        if (!q.answerId) throw new Error(`Question ${index + 1} missing answerId`);
        
        // Validate choices
        q.choices.forEach((choice, cIndex) => {
            if (!choice.id) choice.id = String.fromCharCode(97 + cIndex); // a, b, c, d
            if (!choice.text) throw new Error(`Question ${index + 1}, choice ${cIndex + 1} missing text`);
        });
        
        // Ensure answerId matches one of the choice IDs
        const validAnswerIds = q.choices.map(c => c.id);
        if (!validAnswerIds.includes(q.answerId)) {
            throw new Error(`Question ${index + 1} answerId "${q.answerId}" not found in choices`);
        }
    });
    
    console.log(`✅ Generated quiz: "${quiz.title}" with ${quiz.questions.length} questions`);
    
    // Return quiz with usage data for cost tracking
    return {
        quiz,
        usage: result.usage,
        model: result.model,
        provider: result.provider
    };
}

/**
 * Quiz generation handler
 */
async function handleQuizGenerate(event) {
    const startTime = Date.now();
    
    try {
        // Extract and authenticate JWT token
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);
        
        if (!authResult.authenticated) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }
        
        const email = authResult.email;
        console.log(`🎯 Quiz generation request from: ${email}`);
        
        // Parse request body
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (parseError) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Invalid JSON in request body' })
            };
        }
        
        const { content, enrichment = false, providers } = body;
        
        // Validate required fields
        if (!content) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing required field: content' })
            };
        }
        
        // Build provider pool from user providers (array) + environment if authorized
        const userProviders = Array.isArray(providers) ? providers : [];
        if (userProviders.length === 0) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'No providers configured. Please add providers in Settings.' })
            };
        }
        
        const providerPool = buildProviderPool(userProviders, authResult.authorized);
        console.log(`🎯 Provider pool for quiz: ${providerPool.length} provider(s) available`);
        
        if (providerPool.length === 0) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'No valid providers available' })
            };
        }
        
        // Convert provider pool to legacy object format for generateQuiz function
        const providersObject = {};
        providerPool.forEach(p => {
            if (p.apiKey && p.type) {
                providersObject[p.type] = { apiKey: p.apiKey };
            }
        });
        
        // Generate quiz
        const result = await generateQuiz(content, enrichment, providersObject);
        const quiz = result.quiz;
        
        const duration = Date.now() - startTime;
        
        // Calculate cost with proper token tracking
        const promptTokens = result.usage?.prompt_tokens || 0;
        const completionTokens = result.usage?.completion_tokens || 0;
        const modelUsed = result.model || 'unknown';
        const providerUsed = result.provider || 'unknown';
        
        // Detect if user provided their own API key
        const isUserProvidedKey = Object.entries(providers).some(([type, key]) => 
            type === providerUsed && key && !key.startsWith('sk-proj-')
        );
        
        const cost = calculateCost(
            modelUsed,
            promptTokens,
            completionTokens,
            null,
            isUserProvidedKey
        );
        
        // Log to Google Sheets with proper cost tracking
        try {
            await logToGoogleSheets({
                timestamp: new Date().toISOString(),
                userEmail: email,
                type: 'quiz_generation',
                model: modelUsed,
                provider: providerUsed,
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
                cost,
                requestId: event.requestContext?.requestId || 'unknown',
                metadata: {
                    enrichment,
                    questionCount: quiz.questions.length,
                    quizTitle: quiz.title
                }
            });
        } catch (logError) {
            console.error('⚠️ Failed to log to Google Sheets:', logError.message);
        }
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quiz)
        };
        
    } catch (error) {
        console.error('❌ Quiz generation error:', error);
        
        const duration = Date.now() - startTime;
        
        // Log error to Google Sheets
        try {
            await logToGoogleSheets({
                timestamp: new Date().toISOString(),
                email: 'unknown',
                endpoint: 'quiz',
                requestType: 'quiz-error',
                duration: duration,
                status: 'error',
                errorMessage: error.message
            });
        } catch (logError) {
            console.error('⚠️ Failed to log error to Google Sheets:', logError.message);
        }
        
        return {
            statusCode: error.message.includes('required') || error.message.includes('Invalid') ? 400 : 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: error.message || 'Quiz generation failed',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
}

/**
 * Handle quiz statistics sync request
 * Syncs quiz statistics from frontend IndexedDB to Google Sheets
 */
async function handleQuizSyncStatistics(event) {
    try {
        // Extract and authenticate JWT token
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);
        
        if (!authResult.authenticated) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }
        
        const user = authResult.user;
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { statistics } = body;
        
        if (!statistics || !Array.isArray(statistics)) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'statistics parameter is required and must be an array'
                })
            };
        }
        
        console.log(`📊 Syncing ${statistics.length} quiz statistics for user ${user.email}`);
        
        // Log each statistic to Google Sheets
        let synced = 0;
        let failed = 0;
        
        for (const stat of statistics) {
            try {
                await logToGoogleSheets({
                    timestamp: new Date(stat.completedAt).toISOString(),
                    user_email: user.email,
                    endpoint: 'quiz-statistics',
                    operation: 'quiz-completion',
                    quiz_title: stat.quizTitle,
                    quiz_id: stat.id,
                    score: stat.score,
                    total_questions: stat.totalQuestions,
                    percentage: stat.percentage,
                    time_taken_ms: stat.timeTaken,
                    enrichment_used: stat.enrichment,
                    snippet_ids: stat.snippetIds.join(','),
                    answers: JSON.stringify(stat.answers)
                });
                synced++;
            } catch (error) {
                console.error(`Failed to sync quiz ${stat.id}:`, error);
                failed++;
            }
        }
        
        console.log(`✅ Quiz statistics sync complete: ${synced} synced, ${failed} failed`);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                synced,
                failed,
                message: `Successfully synced ${synced} quiz statistics`
            })
        };
        
    } catch (error) {
        console.error('Error syncing quiz statistics:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: error.message || 'Failed to sync quiz statistics',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
}

/**
 * Get quizzes for authenticated user
 */
async function handleGetQuizzes(event) {
    try {
        const user = authenticateRequest(event);
        
        // Extract project ID from headers (optional filter)
        const projectId = extractProjectId(event);
        
        // Get user's Google Drive OAuth token
        const accessToken = event.headers['x-drive-token'] || event.headers['X-Drive-Token'];
        
        if (!accessToken) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Google Drive connection required',
                    message: 'Please connect to Google Drive in Settings → Cloud Sync'
                })
            };
        }
        
        const quizzes = await quizService.getQuizzes(user.email, projectId, accessToken);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quizzes)
        };
    } catch (error) {
        console.error('Error getting quizzes:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: error.message || 'Failed to retrieve quizzes'
            })
        };
    }
}

/**
 * Save or update a quiz
 */
async function handleSaveQuiz(event) {
    try {
        const user = authenticateRequest(event);
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { id, quiz_title, source_content, questions, completed, score, completed_at } = body;
        
        if (!quiz_title || !questions || !Array.isArray(questions)) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Missing required fields',
                    message: 'quiz_title and questions (array) are required'
                })
            };
        }
        
        // Extract project ID from headers
        const projectId = extractProjectId(event);
        
        // Get user's Google Drive OAuth token
        const accessToken = event.headers['x-drive-token'] || event.headers['X-Drive-Token'];
        
        if (!accessToken) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Google Drive connection required',
                    message: 'Please connect to Google Drive in Settings → Cloud Sync'
                })
            };
        }
        
        let quiz;
        
        if (id) {
            // Update existing quiz
            const updates = {};
            if (quiz_title !== undefined) updates.quiz_title = quiz_title;
            if (source_content !== undefined) updates.source_content = source_content;
            if (questions !== undefined) updates.questions = questions;
            if (completed !== undefined) updates.completed = completed;
            if (score !== undefined) updates.score = score;
            if (completed_at !== undefined) updates.completed_at = completed_at;
            
            quiz = await quizService.updateQuiz(id, updates, user.email, projectId, accessToken);
        } else {
            // Insert new quiz
            quiz = await quizService.insertQuiz({
                quiz_title,
                source_content,
                questions,
                completed: completed || false,
                score: score || null,
                completed_at: completed_at || ''
            }, user.email, projectId, accessToken);
        }
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quiz)
        };
    } catch (error) {
        console.error('Error saving quiz:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: error.message || 'Failed to save quiz'
            })
        };
    }
}

/**
 * Delete a quiz
 */
async function handleDeleteQuiz(event) {
    try {
        const user = authenticateRequest(event);
        
        // Extract quiz ID from path parameters
        const id = event.pathParameters?.id;
        
        if (!id) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Missing quiz ID',
                    message: 'Quiz ID is required in the URL path'
                })
            };
        }
        
        // Extract project ID from headers
        const projectId = extractProjectId(event);
        
        // Get user's Google Drive OAuth token
        const accessToken = event.headers['x-drive-token'] || event.headers['X-Drive-Token'];
        
        if (!accessToken) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Google Drive connection required',
                    message: 'Please connect to Google Drive in Settings → Cloud Sync'
                })
            };
        }
        
        const deleted = await quizService.deleteQuiz(id, user.email, projectId, accessToken);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: `Quiz "${deleted.quiz_title}" deleted successfully`,
                id: deleted.id
            })
        };
    } catch (error) {
        console.error('Error deleting quiz:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: error.message || 'Failed to delete quiz'
            })
        };
    }
}

/**
 * Get a specific quiz by ID
 */
async function handleGetQuiz(event) {
    try {
        const user = authenticateRequest(event);
        
        // Extract quiz ID from path parameters
        const id = event.pathParameters?.id;
        
        if (!id) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Missing quiz ID',
                    message: 'Quiz ID is required in the URL path'
                })
            };
        }
        
        // Extract project ID from headers
        const projectId = extractProjectId(event);
        
        // Get user's Google Drive OAuth token
        const accessToken = event.headers['x-drive-token'] || event.headers['X-Drive-Token'];
        
        if (!accessToken) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Google Drive connection required',
                    message: 'Please connect to Google Drive in Settings → Cloud Sync'
                })
            };
        }
        
        const quiz = await quizService.getQuiz(id, user.email, projectId, accessToken);
        
        if (!quiz) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Quiz not found',
                    message: 'Quiz does not exist or you do not have access to it'
                })
            };
        }
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quiz)
        };
    } catch (error) {
        console.error('Error getting quiz:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: error.message || 'Failed to retrieve quiz'
            })
        };
    }
}

module.exports = {
    handleQuizGenerate,
    handleQuizSyncStatistics,
    handleGetQuizzes,
    handleSaveQuiz,
    handleDeleteQuiz,
    handleGetQuiz,
    generateQuiz
};
