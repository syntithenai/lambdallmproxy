/**
 * Quiz Generation Endpoint
 * Generates interactive multiple-choice quizzes from content using LLM
 */

const { llmResponsesWithTools } = require('../llm_tools_adapter');
const { authenticateRequest } = require('../auth');
const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');
const { buildProviderPool } = require('../credential-pool');
const { searchWeb } = require('../tools/search_web');

// Load provider catalog
const { loadProviderCatalog } = require('../utils/catalog-loader');
const providerCatalog = loadProviderCatalog();

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
            
            const pool = buildProviderPool(providers, providerCatalog);
            const searchTermsResult = await llmResponsesWithTools(
                searchPrompt,
                '',
                [],
                pool,
                null,
                null,
                false,
                null
            );
            
            const searchTerms = searchTermsResult.finalResponse.trim();
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
    
    // Generate quiz using LLM
    const quizPrompt = `You are a quiz generator. Create an educational multiple-choice quiz based on the following content.

Content:
${enrichedContent}

Generate a quiz with exactly 10 questions. Each question must have:
- A clear, specific prompt
- Exactly 4 answer choices (A, B, C, D)
- One correct answer
- A brief explanation of why the correct answer is right

Format your response as JSON with this structure:
{
  "title": "Quiz title (concise, related to the content)",
  "questions": [
    {
      "id": "q1",
      "prompt": "Question text?",
      "choices": [
        {"id": "a", "text": "Choice A"},
        {"id": "b", "text": "Choice B"},
        {"id": "c", "text": "Choice C"},
        {"id": "d", "text": "Choice D"}
      ],
      "answerId": "b",
      "explanation": "Brief explanation of correct answer"
    }
  ]
}

Ensure questions test understanding, not just recall. Vary difficulty levels. Make distractors plausible but clearly incorrect.

Return ONLY the JSON, no additional text.`;

    console.log('🧠 Generating quiz with LLM...');
    
    const pool = buildProviderPool(providers, providerCatalog);
    const result = await llmResponsesWithTools(
        quizPrompt,
        '',
        [],
        pool,
        null,
        null,
        false,
        null
    );
    
    const response = result.finalResponse.trim();
    
    // Try to parse JSON response
    let quiz;
    try {
        // Remove markdown code blocks if present
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, response];
        const jsonStr = jsonMatch[1] || response;
        quiz = JSON.parse(jsonStr);
    } catch (parseError) {
        console.error('❌ Failed to parse quiz JSON:', parseError.message);
        console.error('Response:', response.substring(0, 500));
        throw new Error('Failed to parse quiz from LLM response');
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
        // Authenticate request
        const { email, accessToken } = await authenticateRequest(event);
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
        
        if (!providers || Object.keys(providers).length === 0) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing required field: providers' })
            };
        }
        
        // Generate quiz
        const result = await generateQuiz(content, enrichment, providers);
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
        // Authenticate request
        const { user } = await authenticateRequest(event);
        
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

module.exports = {
    handleQuizGenerate,
    handleQuizSyncStatistics,
    generateQuiz
};
