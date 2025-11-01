/**
 * Planning Endpoint
 * Takes a user query and generates a plan using Groq reasoning model
 * Returns SSE stream with: text response, search keywords, questions, and persona
 */

// Note: awslambda is a global object provided by Lambda runtime when using Response Streaming
// No import needed - it's automatically available

const { llmResponsesWithTools } = require('../llm_tools_adapter');
const { DEFAULT_REASONING_EFFORT, MAX_TOKENS_PLANNING } = require('../config/tokens');
const { authenticateRequest, getAllowedEmails } = require('../auth');
const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');
const { calculateLLMCost, isUIKey } = require('../utils/pricing-service');
const { buildProviderPool } = require('../credential-pool');
const { getLanguageInstruction } = require('../utils/languageInstructions');
const path = require('path');

/**
 * Log transaction to service account sheet
 * @param {string} accessToken - User's OAuth access token (unused, for backward compatibility)
 * @param {object} logData - Transaction data
 */
async function logToBothSheets(accessToken, logData) {
    // Always log to service account sheet (centralized tracking)
    try {
        await logToGoogleSheets(logData);
    } catch (error) {
        console.error('⚠️ Failed to log to service account sheet:', error.message);
    }
}

// Load provider catalog using centralized loader
const { loadProviderCatalog } = require('../utils/catalog-loader');
const providerCatalog = loadProviderCatalog();

const { RateLimitTracker } = require('../model-selection/rate-limit-tracker');
const { selectModel, selectWithFallback, RoundRobinSelector, SelectionStrategy } = require('../model-selection/selector');

// Global rate limit tracker for load balancing
let globalRateLimitTracker = null;

/**
 * Get or initialize the global rate limit tracker
 * @returns {RateLimitTracker} Global rate limit tracker instance
 */
function getRateLimitTracker() {
    if (!globalRateLimitTracker) {
        console.log('🔄 Initializing global RateLimitTracker for planning...');
        globalRateLimitTracker = new RateLimitTracker({
            resetInterval: 60000, // 1 minute
            windowSize: 60000,    // 1 minute
            trackTokens: true     // Enable token-based rate limiting
        });
        console.log('✅ Planning RateLimitTracker initialized');
    }
    return globalRateLimitTracker;
}

/**
 * Generate a research plan for a given query using intelligent model selection
 * @param {string} query - User's query
 * @param {Object} providers - Available providers with API keys
 * @param {string} requestedModel - Optional specific model to use
 * @param {Object} clarificationAnswers - Optional answers to previous clarification questions
 * @param {Object} previousContext - Optional context from previous clarification request
 * @param {string} language - User's preferred language for responses (ISO 639-1 code)
 * @returns {Promise<Object>} Plan object with queryType, reasoning, persona, etc.
 */
async function generatePlan(query, providers = {}, requestedModel = null, eventCallback = null, clarificationAnswers = null, previousContext = null, forcePlan = false, language = 'en') {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Query parameter is required and must be a non-empty string');
    }
    
    if (!providers || Object.keys(providers).length === 0) {
        throw new Error('At least one provider with API key is required');
    }
    
    // Generate language instruction if not English
    const languageInstruction = language && language !== 'en' ? getLanguageInstruction(language) : '';
    
    // Declare finalModel at function scope for error handling
    let finalModel = 'unknown';
    
    // Build runtime catalog from base catalog and providers
    const runtimeCatalog = {
        providers: {}
    };
    
    console.log(`📋 Building runtime catalog from providers:`, Object.keys(providers));
    console.log(`📋 Base catalog has chat providers:`, !!providerCatalog.chat?.providers);
    
    // Copy chat providers from base catalog and apply API keys from UI settings
    if (providerCatalog.chat?.providers) {
        console.log(`📋 Base catalog provider types:`, Object.keys(providerCatalog.chat.providers));
        Object.entries(providerCatalog.chat.providers).forEach(([providerType, providerInfo]) => {
            const userProvider = providers[providerType];
            console.log(`🔍 Checking provider: ${providerType}, hasUserProvider: ${!!userProvider}, hasApiKey: ${!!(userProvider?.apiKey)}`);
            if (userProvider && userProvider.apiKey) {
                // Check if provider is restricted to image-only models
                // If allowedModels is set and none are chat models, skip this provider for chat
                if (userProvider.allowedModels && Array.isArray(userProvider.allowedModels) && userProvider.allowedModels.length > 0) {
                    // Check if any allowed model is an image model (contains FLUX, DALL-E, stable-diffusion, etc.)
                    const imageModelPatterns = ['FLUX', 'DALL-E', 'dalle', 'stable-diffusion', 'sdxl', 'playground'];
                    const hasOnlyImageModels = userProvider.allowedModels.every(modelName => 
                        imageModelPatterns.some(pattern => modelName.includes(pattern))
                    );
                    
                    if (hasOnlyImageModels) {
                        console.log(`⛔ Skipping ${providerType} for chat - only image models allowed: ${userProvider.allowedModels.join(', ')}`);
                        return; // Skip this provider for chat model selection
                    }
                }
                
                runtimeCatalog.providers[providerType] = {
                    ...providerInfo,
                    apiKey: userProvider.apiKey,
                    enabled: true
                };
                console.log(`✅ Added ${providerType} to runtime catalog with ${Object.keys(providerInfo.models || {}).length} models`);
            }
        });
    }
    
    console.log(`📊 Runtime catalog providers:`, Object.keys(runtimeCatalog.providers));

    // Create messages for planning prompt with available tools
    const { generatePlanningPrompt } = require('../lambda_search_llm_handler');
    
    // Get default tools array (same as chat endpoint uses)
    const defaultTools = [
        {
            type: 'function',
            function: {
                name: 'search_web',
                description: 'Search the web using DuckDuckGo. Use for current events, recent information, research, fact-checking, or any query needing up-to-date information. Returns a list of search results with titles, URLs, and snippets.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The search query' },
                        max_results: { type: 'number', description: 'Maximum number of results (default: 5)' }
                    },
                    required: ['query']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'scrape_url',
                description: 'Scrape and extract text content from a web URL. Use when you need the full content of a specific webpage.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'The URL to scrape' }
                    },
                    required: ['url']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'execute_javascript',
                description: 'Execute JavaScript code in a sandboxed environment. Use for calculations, data processing, algorithms, or any computational task. Has access to common libraries.',
                parameters: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', description: 'JavaScript code to execute' }
                    },
                    required: ['code']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'generate_chart',
                description: 'Generate charts, diagrams, flowcharts using Mermaid syntax or Chart.js. Use for ANY visualization needs.',
                parameters: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['mermaid', 'chartjs'], description: 'Chart type' },
                        config: { type: 'object', description: 'Chart configuration' }
                    },
                    required: ['type', 'config']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'manage_todos',
                description: '📝 **MANAGE TODO LIST**: Add or delete todos that track progress through complex workflows. When todos exist, they auto-progress after each successful completion. **USE THIS when**: user requests a multi-step plan, breaking down complex tasks, tracking implementation progress, or managing sequential workflows. **DO NOT use for simple single-step tasks.** Keywords: plan, steps, todo list, break down task, multi-step workflow, implementation phases.',
                parameters: {
                    type: 'object',
                    properties: {
                        add: { type: 'array', items: { type: 'string' }, description: 'Array of todo descriptions to add' },
                        delete: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] }, description: 'Array of todo IDs or descriptions to remove' }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'manage_snippets',
                description: '📝 **MANAGE KNOWLEDGE SNIPPETS**: Insert, retrieve, search, or delete knowledge snippets stored in your personal Google Sheet. Use to save important information, code examples, procedures, or any content you want to preserve and search later.',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['insert', 'capture', 'get', 'search', 'delete'] },
                        payload: { type: 'object', description: 'Action-specific parameters' }
                    },
                    required: ['action']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'generate_image',
                description: 'Generate images using AI models. Use for creating visuals, illustrations, or artwork.',
                parameters: {
                    type: 'object',
                    properties: {
                        prompt: { type: 'string', description: 'Image generation prompt' }
                    },
                    required: ['prompt']
                }
            }
        }
    ];
    
    let planningPrompt = generatePlanningPrompt(query, defaultTools);
    
    // If user provided answers to clarification questions, append them to the prompt
    if (clarificationAnswers && previousContext) {
        planningPrompt += `\n\n**PREVIOUS CLARIFICATION:**\nThe user was previously asked clarification questions. Here are their answers:\n\n`;
        planningPrompt += `Original Query: "${previousContext.originalQuery}"\n\n`;
        planningPrompt += `User's Clarification Answers:\n${clarificationAnswers}\n\n`;
        planningPrompt += `Based on these clarifications, please now provide a complete research plan with system and user prompts. Do NOT ask for more clarification - proceed with the plan.`;
    }
    
    const messages = [
        { 
            role: 'system', 
            content: 'You are a research strategist and planning expert. Analyze queries deeply and determine optimal research approaches and expert personas using step-by-step reasoning. You may provide detailed analysis if the query is complex. Always respond with valid JSON only.' 
        },
        { role: 'user', content: planningPrompt }
    ];

        // Use intelligent model selection with preference for reasoning models
        let selectedModel = null;
        const rateLimitTracker = getRateLimitTracker();
        
        try {
            // If a specific model was requested, try to use it
            if (requestedModel) {
                // Find the model in the catalog
                const [providerType, modelName] = requestedModel.includes(':') 
                    ? requestedModel.split(':')
                    : ['groq', requestedModel];
                    
                if (runtimeCatalog.providers[providerType]?.models?.[modelName]) {
                    selectedModel = {
                        name: modelName,
                        providerType: providerType,
                        ...runtimeCatalog.providers[providerType].models[modelName]
                    };
                    console.log('🎯 Using requested model for planning:', requestedModel);
                }
            }
            
            // If no specific model or model not found, use intelligent selection
            if (!selectedModel) {
                const selection = selectModel({
                    messages,
                    tools: [],
                    catalog: runtimeCatalog,
                    rateLimitTracker,
                    preferences: {
                        strategy: SelectionStrategy.QUALITY_OPTIMIZED, // Prefer best models for planning
                        preferFree: false, // Don't restrict to free models for planning
                        maxCostPerMillion: Infinity
                    },
                    roundRobinSelector: new RoundRobinSelector(),
                    max_tokens: MAX_TOKENS_PLANNING * 2
                });
                
                selectedModel = selection.model;
                console.log('🎯 Model selected for planning:', {
                    model: selectedModel.name || selectedModel.id,
                    provider: selectedModel.providerType,
                    category: selection.category,
                    requestType: selection.analysis.type,
                    estimatedTokens: selection.totalTokens
                });
                
                // Always prefer stable models for planning - avoid known problematic models
                const problematicModels = ['llama-3.3-70b-versatile'];
                const preferredModels = ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'llama-3.1-8b-instant'];
                
                // Check both name and id properties for model identification
                const currentModelName = selectedModel.name || selectedModel.id;
                if (problematicModels.includes(currentModelName)) {
                    console.log('⚠️ Planning: Selected model is known to have JSON issues. Finding stable alternative...');
                    
                    // Try to find a more stable alternative
                    for (const altModelName of preferredModels) {
                        if (runtimeCatalog.providers['groq']?.models?.[altModelName]) {
                            selectedModel = {
                                name: altModelName,
                                providerType: 'groq',
                                ...runtimeCatalog.providers['groq'].models[altModelName],
                                fallback: true,
                                reason: 'replaced_problematic_model'
                            };
                            console.log('🔄 Planning: Replaced with stable model:', altModelName);
                            break;
                        }
                    }
                } else {
                    console.log('✅ Planning: Selected model is stable:', currentModelName);
                }
            }        // Build final model string for llmResponsesWithTools
        const modelName = selectedModel.name || selectedModel.id;
        finalModel = `${selectedModel.providerType}:${modelName}`;
        const apiKey = runtimeCatalog.providers[selectedModel.providerType].apiKey;
        
        if (!apiKey) {
            throw new Error(`No API key available for provider: ${selectedModel.providerType}`);
        }

        // Try the selected model with rate limit fallback
        let response = null;
        let lastError = null;
        const maxRetries = 3; // Try up to 3 different models
        let currentAttempt = 0;
        let currentModel = selectedModel;
        let currentApiKey = apiKey;
        
        while (currentAttempt < maxRetries && !response) {
            try {
                finalModel = `${currentModel.providerType}:${currentModel.name || currentModel.id}`;
                
                const requestBody = {
                    model: finalModel,
                    input: messages,
                    tools: [],
                    options: {
                        apiKey: currentApiKey,
                        reasoningEffort: DEFAULT_REASONING_EFFORT,
                        temperature: 0.2,
                        max_tokens: MAX_TOKENS_PLANNING * 2,
                        timeoutMs: 30000
                    }
                };
                
                const isRetry = currentAttempt > 0;
                if (isRetry) {
                    console.log(`🔄 Planning: Retrying with fallback model (attempt ${currentAttempt + 1}/${maxRetries}): ${finalModel}`);
                } else {
                    console.log('🔍 Planning: Making LLM request with model:', finalModel);
                }
                
                // Send real-time event before LLM call
                if (eventCallback) {
                    eventCallback('llm_request', {
                        phase: 'planning',
                        model: finalModel,
                        provider: currentModel.providerType,
                        modelName: currentModel.name || currentModel.id,
                        timestamp: new Date().toISOString(),
                        status: 'requesting',
                        message: isRetry 
                            ? `Retrying planning request with ${finalModel}...`
                            : `Making planning request to ${finalModel}...`,
                        requestedModel: requestedModel,
                        selectedViaLoadBalancing: !requestedModel,
                        isRetry,
                        attemptNumber: currentAttempt + 1
                    });
                }
                
                response = await llmResponsesWithTools(requestBody);
                
                if (isRetry) {
                    console.log(`✅ Planning: Fallback successful with ${finalModel}`);
                }
                console.log('🔍 Planning: LLM response received, length:', response?.text?.length || 0);
                console.log('🔍 Planning: Raw LLM response preview:', response?.text?.substring(0, 300) || 'null');
                
                break; // Success, exit retry loop
                
            } catch (error) {
                lastError = error;
                
                // Check if it's a rate limit error
                const isRateLimitError = 
                    error.status === 429 ||
                    error.message?.includes('429') ||
                    error.message?.includes('rate limit') ||
                    error.message?.includes('quota exceeded');
                
                if (isRateLimitError && currentAttempt < maxRetries - 1) {
                    console.warn(`⚠️ Planning: Rate limit hit with ${finalModel}, trying fallback...`);
                    
                    // Mark the current provider as rate limited in tracker
                    rateLimitTracker.recordError(currentModel.providerType, currentModel.name || currentModel.id);
                    
                    // Try to select a fallback model
                    try {
                        const fallbackSelection = selectWithFallback({
                            messages,
                            tools: [],
                            catalog: runtimeCatalog,
                            rateLimitTracker,
                            preferences: {
                                strategy: SelectionStrategy.QUALITY_OPTIMIZED,
                                preferFree: false,
                                maxCostPerMillion: Infinity
                            },
                            roundRobinSelector: new RoundRobinSelector(),
                            max_tokens: MAX_TOKENS_PLANNING * 2
                        });
                        
                        currentModel = fallbackSelection.model;
                        currentApiKey = runtimeCatalog.providers[currentModel.providerType].apiKey;
                        currentAttempt++;
                        
                        console.log(`🔄 Planning: Selected fallback model: ${currentModel.providerType}:${currentModel.name || currentModel.id}`);
                        continue; // Try again with fallback model
                        
                    } catch (fallbackError) {
                        console.error('❌ Planning: Failed to select fallback model:', fallbackError.message);
                        throw lastError; // Can't get fallback, throw original error
                    }
                } else {
                    // Not a rate limit error or no more retries
                    throw error;
                }
            }
        }
        
        if (!response) {
            console.error(`❌ Planning: All ${maxRetries} attempts failed. Last error:`, lastError?.message);
            throw lastError || new Error('Planning request failed after all retries');
        }
        
        // Send real-time event after LLM call
        if (eventCallback) {
            eventCallback('llm_response', {
                phase: 'planning',
                model: finalModel,
                provider: selectedModel.providerType,
                modelName: selectedModel.name || selectedModel.id,
                timestamp: new Date().toISOString(),
                status: 'received',
                message: `Received response from ${finalModel}`,
                responseLength: response?.text?.length || 0,
                tokenUsage: {
                    promptTokens: response.promptTokens || 0,
                    completionTokens: response.completionTokens || 0,
                    totalTokens: response.totalTokens || 0
                }
            });
        }
        
        if (!response || !response.text) {
            const errorDetails = {
                message: 'No response from LLM',
                model: finalModel,
                provider: selectedModel.providerType,
                httpStatus: response?.httpStatus,
                httpHeaders: response?.httpHeaders
            };
            console.error('🚨 LLM No Response Error:', errorDetails);
            throw new Error(`No response from LLM (${finalModel}): ${JSON.stringify(errorDetails)}`);
        }
        
        // Parse the JSON response (handle markdown-wrapped JSON)
        let responseText = response.text.trim();
        
        // Check for model breakdown or gibberish response
        if (responseText.length < 50 || !responseText.includes('{') || !responseText.includes('}')) {
            console.error('🚨 Planning: Model returned gibberish or very short response:', responseText.substring(0, 200));
            throw new Error(`Model returned invalid response (possible breakdown): ${responseText.substring(0, 100)}...`);
        }
        
        // Check for repetitive patterns (model breakdown detection)
        const words = responseText.split(/\s+/).slice(0, 20);
        const uniqueWords = new Set(words);
        if (words.length > 10 && uniqueWords.size < words.length * 0.3) {
            console.error('🚨 Planning: Model breakdown detected - repetitive output:', responseText.substring(0, 200));
            throw new Error(`Model breakdown detected - repetitive output: ${responseText.substring(0, 100)}...`);
        }
        
        // Remove markdown JSON wrapper if present - handle both with and without newlines
        if (responseText.includes('```json')) {
            responseText = responseText.replace(/```json\s*/g, '').replace(/\s*```/g, '');
        } else if (responseText.includes('```')) {
            responseText = responseText.replace(/```\s*/g, '').replace(/\s*```/g, '');
        }
        
        // Trim again after removing markdown
        responseText = responseText.trim();
        
        // Try to find JSON within the response if it's not at the start
        if (!responseText.startsWith('{')) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                responseText = jsonMatch[0];
                console.log('🔍 Planning: Extracted JSON from response');
            } else {
                throw new Error(`No JSON found in response: ${responseText.substring(0, 200)}...`);
            }
        }
        
        console.log('🔍 Planning: Attempting to parse JSON, length:', responseText.length);
        
        let parsed;
        
        // FIRST: Try parsing without any cleaning (Gemini usually returns valid JSON)
        try {
            parsed = JSON.parse(responseText);
            console.log('✅ Planning: JSON parsed successfully without cleaning!');
            console.log('🔍 Planning: Parsed object keys:', Object.keys(parsed));
            console.log('🔍 Planning: queryType:', parsed.queryType);
            console.log('🔍 Planning: enhancedUserPrompt length:', parsed.enhancedUserPrompt?.length || 0);
        } catch (firstError) {
            console.log('⚠️ Planning: First parse failed, attempting JSON cleaning...', firstError.message);
            
            // Comprehensive JSON cleaning - fix common LLM JSON errors
            let cleanedJson = responseText;
            
            // First pass: Fix basic structure issues
            // Fix trailing commas before closing braces/brackets
            cleanedJson = cleanedJson.replace(/,(\s*[}\]])/g, '$1');
        
        // Fix missing quotes around property names (but avoid quoted strings)
        cleanedJson = cleanedJson.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        
        // Fix single quotes to double quotes (but be careful with apostrophes in strings)
        cleanedJson = cleanedJson.replace(/:\s*'([^']*?)'/g, ': "$1"');
        cleanedJson = cleanedJson.replace(/{\s*'([^']*?)'\s*:/g, '{"$1":');
        cleanedJson = cleanedJson.replace(/,\s*'([^']*?)'\s*:/g, ',"$1":');
        
        // Second pass: Fix array and nested structure issues
        // Fix broken arrays or objects
        cleanedJson = cleanedJson.replace(/\[\s*,/g, '[');
        cleanedJson = cleanedJson.replace(/,\s*,/g, ',');
        
        // Fix incomplete arrays that might be cut off
        // Look for incomplete array structures like `["item1", "item2", "incomplete`
        cleanedJson = cleanedJson.replace(/,\s*"[^"]*$/g, ''); // Remove incomplete string at end
        cleanedJson = cleanedJson.replace(/,\s*\{[^}]*$/g, ''); // Remove incomplete object at end
        cleanedJson = cleanedJson.replace(/,\s*\[[^\]]*$/g, ''); // Remove incomplete array at end
        
        // Third pass: Fix nested object issues in suggestedSources
        // Fix incomplete nested objects like {"type": "academic", "examples": ["item1", "item2"
        cleanedJson = cleanedJson.replace(/"examples":\s*\[[^\]]*$/g, '"examples": []'); // Close incomplete examples array
        cleanedJson = cleanedJson.replace(/"type":\s*"[^"]*",\s*"examples":\s*$/g, '"type": "unknown", "examples": []'); // Fix incomplete type/examples
        
        // Fourth pass: Handle unescaped quotes and string issues
        // Fix unescaped quotes in strings (more conservative approach)
        cleanedJson = cleanedJson.replace(/:\s*"([^"]*)"([^",}\]]*?)"(?=\s*[,}\]])/g, ': "$1\\"$2"');
        
        // Fifth pass: Clean up incomplete properties at the end
        // Remove incomplete property names or values at the end
        cleanedJson = cleanedJson.replace(/,\s*"[^"]*$/g, ''); // Remove incomplete property name
        cleanedJson = cleanedJson.replace(/,\s*"[^"]*":\s*"[^"]*$/g, ''); // Remove incomplete property value (string)
        cleanedJson = cleanedJson.replace(/,\s*"[^"]*":\s*[^,}]*$/g, ''); // Remove incomplete property value (non-string)
        cleanedJson = cleanedJson.replace(/,\s*"[^"]*":\s*\{[^}]*$/g, ''); // Remove incomplete object property
        cleanedJson = cleanedJson.replace(/,\s*"[^"]*":\s*\[[^\]]*$/g, ''); // Remove incomplete array property
        
        // Remove trailing comma if present
        cleanedJson = cleanedJson.replace(/,\s*$/, '');
        
        // Ensure the JSON starts and ends properly
        if (!cleanedJson.trim().startsWith('{')) {
            cleanedJson = '{' + cleanedJson;
        }
        if (!cleanedJson.trim().endsWith('}')) {
            cleanedJson = cleanedJson + '}';
        }
        
        console.log('🔍 Planning: Cleaned JSON for parsing, first 200 chars:', cleanedJson.substring(0, 200));
        
            try {
                parsed = JSON.parse(cleanedJson);
                console.log('✅ Planning: JSON parsed successfully after cleaning!');
                console.log('🔍 Planning: Parsed object keys:', Object.keys(parsed));
                console.log('🔍 Planning: queryType:', parsed.queryType);
                console.log('🔍 Planning: enhancedUserPrompt length:', parsed.enhancedUserPrompt?.length || 0);
            } catch (parseError) {
            console.error('🚨 Planning: JSON parse failed. Original text:', responseText.substring(0, 500));
            console.error('🚨 Planning: Cleaned text:', cleanedJson.substring(0, 500));
            
            // Try to extract just the valid JSON portion
            let extractedJson = null;
            // Find the position mentioned in the error (declare at outer scope for later use)
            const positionMatch = parseError.message.match(/position (\d+)/);
            
            try {
                if (positionMatch) {
                    const errorPosition = parseInt(positionMatch[1]);
                    console.log('🔍 Planning: Attempting recovery at position:', errorPosition);
                    
                    // Try truncating at the error position and finding the last valid closing brace
                    let truncated = cleanedJson.substring(0, errorPosition);
                    
                    // Enhanced truncation cleanup for complex nested structures
                    // Remove any incomplete property at the truncation point
                    truncated = truncated.replace(/,\s*"[^"]*$/, ''); // Remove incomplete property name
                    truncated = truncated.replace(/,\s*"[^"]*":\s*$/, ''); // Remove incomplete property with colon
                    truncated = truncated.replace(/,\s*"[^"]*":\s*"[^"]*$/, ''); // Remove incomplete string value
                    truncated = truncated.replace(/,\s*"[^"]*":\s*\{[^}]*$/, ''); // Remove incomplete object value
                    truncated = truncated.replace(/,\s*"[^"]*":\s*\[[^\]]*$/, ''); // Remove incomplete array value
                    
                    // Fix nested array issues in suggestedSources specifically
                    truncated = truncated.replace(/"examples":\s*\[[^\]]*$/, '"examples": []'); // Close incomplete examples array
                    truncated = truncated.replace(/"suggestedSources":\s*\[[^\]]*$/, '"suggestedSources": []'); // Close incomplete suggestedSources array
                    
                    // Remove incomplete array items
                    truncated = truncated.replace(/,\s*\{[^}]*$/, ''); // Remove incomplete object in array
                    truncated = truncated.replace(/,\s*"[^"]*":\s*"[^"]*$/, ''); // Remove incomplete property value
                    truncated = truncated.replace(/,\s*"[^"]*":\s*[^,}]*$/, ''); // Remove incomplete non-string value
                    truncated = truncated.replace(/,\s*$/, ''); // Remove trailing comma
                    
                    const lastBrace = truncated.lastIndexOf('}');
                    if (lastBrace > 0) {
                        extractedJson = truncated.substring(0, lastBrace + 1);
                    } else {
                        // If no closing brace found, try to add one
                        extractedJson = truncated.trim() + '}';
                    }
                    
                    console.log('🔍 Planning: Attempting to parse truncated JSON:', extractedJson.substring(0, 200));
                    parsed = JSON.parse(extractedJson);
                    console.log('✅ Planning: Successfully parsed truncated JSON');
                } else {
                    // Try to find any valid JSON object in the response
                    const jsonMatch = cleanedJson.match(/\{[^}]*\}/);
                    if (jsonMatch) {
                        extractedJson = jsonMatch[0];
                        console.log('🔍 Planning: Attempting to parse extracted JSON:', extractedJson.substring(0, 200));
                        parsed = JSON.parse(extractedJson);
                        console.log('✅ Planning: Successfully parsed extracted JSON');
                    }
                }
            } catch (secondParseError) {
                console.error('🚨 Planning: Truncated JSON parse also failed:', secondParseError.message);
            }
            
            if (!parsed) {
                // Final fallback: try to create a minimal valid response
                console.log('🔍 Planning: Attempting minimal response fallback');
                try {
                    // Extract what we can from the broken JSON
                    const queryTypeMatch = responseText.match(/"queryType":\s*"([^"]+)"/);
                    const complexityMatch = responseText.match(/"complexity":\s*"([^"]+)"/);
                    const personaMatch = responseText.match(/"expertPersona":\s*"([^"]+(?:"[^"]*"[^"]*)*?)"/);
                    
                    // Create a minimal valid response
                    const fallbackResponse = {
                        queryType: queryTypeMatch ? queryTypeMatch[1] : 'overview',
                        complexity: complexityMatch ? complexityMatch[1] : 'moderate',
                        researchApproach: 'search-based',
                        searchQueries: ['general search term 1', 'general search term 2', 'general search term 3'],
                        researchQuestions: ['What are the key aspects?', 'What are the main considerations?', 'What are the implications?'],
                        expertPersona: personaMatch ? personaMatch[1].replace(/\\"/g, '"') : 'You are a research expert.',
                        methodology: 'Comprehensive research approach',
                        estimatedSources: 8,
                        suggestedSources: [
                            {"type": "academic", "examples": ["Google Scholar", "research databases"]},
                            {"type": "professional", "examples": ["industry sources", "expert publications"]}
                        ]
                    };
                    
                    console.log('✅ Planning: Using fallback response due to JSON parsing failure');
                    parsed = fallbackResponse;
                } catch (fallbackError) {
                    console.error('🚨 Planning: Even fallback response failed:', fallbackError.message);
                    throw new Error(`JSON parsing failed at position ${positionMatch?.[1] || 'unknown'}: ${parseError.message}`);
                }
            }
            }  // Close the firstError catch block
        }  // Close the outer first parse try
        
        // Validate required fields - handle both old and new schema formats
        if (!parsed.queryType && !parsed.query_type) {
            throw new Error('Invalid plan response: missing queryType field');
        }
        
        // Build result object - normalize field names
        const baseResult = {
            queryType: parsed.queryType || parsed.query_type,
            reasoning: parsed.reasoning || '',
            persona: parsed.expertPersona || parsed.optimal_persona || '',
            complexityAssessment: parsed.complexity || parsed.complexity_assessment || 'medium',
            researchApproach: parsed.researchApproach || parsed.research_approach || 'search-based',
            _selectedModel: selectedModel, // Include selected model info
            _tokenUsage: {
                promptTokens: response.promptTokens || 0,
                completionTokens: response.completionTokens || 0,
                totalTokens: response.totalTokens || 0
            },
            _rawResponse: response
        };
        
        const queryType = parsed.queryType || parsed.query_type;
        
        if (queryType === 'minimal' || queryType === 'SIMPLE') {
            const simpleInstruction = parsed.simpleInstruction || parsed.simple_instruction || '';
            const persona = parsed.expertPersona || parsed.optimal_persona || 'You are a knowledgeable assistant';
            
            // Build enhanced prompts for simple queries
            let enhancedSystemPrompt = parsed.enhancedSystemPrompt || parsed.enhanced_system_prompt || '';
            let enhancedUserPrompt = parsed.enhancedUserPrompt || parsed.enhanced_user_prompt || '';
            
            if (!enhancedSystemPrompt || enhancedSystemPrompt.length < 30) {
                enhancedSystemPrompt = `${persona}. Provide a direct, factual answer to the user's question: "${query}". Be concise but complete.`;
            }
            
            // Add language instruction if not English
            if (languageInstruction) {
                enhancedSystemPrompt += `\n\n**LANGUAGE INSTRUCTION**: ${languageInstruction}`;
            }
            
            if (!enhancedUserPrompt || enhancedUserPrompt.length < 10) {
                enhancedUserPrompt = simpleInstruction || query;
            }
            
            return {
                ...baseResult,
                simpleInstruction,
                enhancedSystemPrompt,
                enhancedUserPrompt
            };
        } else if (queryType === 'overview' || queryType === 'OVERVIEW') {
            const searchStrategies = parsed.searchQueries || parsed.search_strategies || [];
            const researchQuestions = parsed.researchQuestions || parsed.research_questions || [];
            const suggestedSources = parsed.suggestedSources || parsed.suggested_sources || [];
            const methodology = parsed.methodology || '';
            const persona = parsed.expertPersona || parsed.optimal_persona || '';
            const estimatedSources = parsed.estimatedSources || 8;
            
            // Build enhanced prompts if not provided by LLM or if they're too generic
            let enhancedSystemPrompt = parsed.enhancedSystemPrompt || parsed.enhanced_system_prompt || '';
            let enhancedUserPrompt = parsed.enhancedUserPrompt || parsed.enhanced_user_prompt || '';
            
            // ALWAYS regenerate enhanced prompts with explicit tool instructions (override LLM's vague prompts)
            if (true) {  // Always regenerate to ensure explicit tool-calling instructions
                enhancedSystemPrompt = `${persona || 'You are a research expert.'} 

**RESEARCH EXECUTION PLAN FOR: "${query}"**

⚡ **YOU HAVE ACCESS TO THESE TOOLS - USE THEM IN YOUR FIRST RESPONSE:**

**AVAILABLE TOOLS:**
• manage_todos - Create a task list by adding multiple tasks at once
• search_web - Search the web for information (call this multiple times with different queries)
• manage_snippets - Save research findings with tags for later retrieval

**STEP 1: Call manage_todos tool to create your complete task list**
Add ALL of these tasks in one call to manage_todos:`;
                
                if (searchStrategies.length > 0) {
                    searchStrategies.slice(0, 6).forEach((term, i) => {
                        enhancedSystemPrompt += `
  ${i + 1}. Search for: "${term}"`;
                    });
                    if (searchStrategies.length > 6) {
                        enhancedSystemPrompt += `
  ... and ${searchStrategies.length - 6} more search tasks`;
                    }
                } else {
                    enhancedSystemPrompt += `
  1. Conduct research on ${query}
  2. Analyze findings
  3. Synthesize results`;
                }
                
                enhancedSystemPrompt += `

**STEP 2: Immediately call search_web tool multiple times**
Execute these web searches right now (do NOT wait):`;
                
                if (searchStrategies.length > 0) {
                    searchStrategies.slice(0, 5).forEach((term, i) => {
                        enhancedSystemPrompt += `
  ${i + 1}. Search query: "${term}"`;
                    });
                    if (searchStrategies.length > 5) {
                        enhancedSystemPrompt += `
  ... and ${searchStrategies.length - 5} more searches`;
                    }
                } else {
                    enhancedSystemPrompt += `
  1. Search for relevant information
  2. Search for additional details
  3. Search for supporting evidence`;
                }
                
                enhancedSystemPrompt += `

**STEP 3: Analyze and synthesize the search results**
Answer these key research questions:`;
                
                if (researchQuestions.length > 0) {
                    researchQuestions.slice(0, 5).forEach((q, i) => {
                        enhancedSystemPrompt += `
  ${i + 1}. ${q}`;
                    });
                    if (researchQuestions.length > 5) {
                        enhancedSystemPrompt += `
  ... and ${researchQuestions.length - 5} more questions`;
                    }
                }
                
                if (suggestedSources.length > 0) {
                    const sourceTypes = suggestedSources.map(s => s.type).join(', ');
                    enhancedSystemPrompt += `\n\n**SOURCE PRIORITY**: ${sourceTypes} sources`;
                }
                
                if (methodology) {
                    enhancedSystemPrompt += `\n**METHODOLOGY**: ${methodology}`;
                }
                
                enhancedSystemPrompt += `

🚨 **CRITICAL**: Your FIRST response must include:
  ✓ ONE call to manage_todos (add all tasks)
  ✓ MULTIPLE calls to search_web (execute all searches immediately)
  ✓ Do NOT just create todos and stop - execute the searches too!`;
            }
            
            // ALWAYS regenerate enhanced user prompt with explicit tool instructions (override LLM's vague prompts)
            if (true) {  // Always regenerate to ensure explicit tool-calling instructions
                enhancedUserPrompt = `📋 **RESEARCH EXECUTION INSTRUCTIONS**

Original Query: "${query}"

**YOU MUST USE THESE TOOLS IN YOUR FIRST RESPONSE:**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**STEP 1: USE manage_todos TOOL**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Call manage_todos to add ALL of these tasks at once:`;

                if (searchStrategies.length > 0) {
                    searchStrategies.slice(0, 6).forEach((term, i) => {
                        enhancedUserPrompt += `
  ${i + 1}. "Search for: ${term}"`;
                    });
                    if (searchStrategies.length > 6) {
                        enhancedUserPrompt += `
  ... and ${searchStrategies.length - 6} more tasks`;
                    }
                } else {
                    enhancedUserPrompt += `
  1. "Research ${query}"
  2. "Analyze findings"
  3. "Synthesize results"`;
                }
                
                enhancedUserPrompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**STEP 2: USE search_web TOOL MULTIPLE TIMES**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Execute these web searches NOW (do not wait for confirmation):`;

                if (searchStrategies.length > 0) {
                    searchStrategies.slice(0, 5).forEach((term, i) => {
                        enhancedUserPrompt += `
  ${i + 1}. Query: "${term}"`;
                    });
                    if (searchStrategies.length > 5) {
                        enhancedUserPrompt += `
  ... and ${searchStrategies.length - 5} more searches`;
                    }
                } else {
                    enhancedUserPrompt += `
  1. Search for key information
  2. Search for supporting evidence
  3. Search for additional details`;
                }
                
                enhancedUserPrompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**STEP 3: ANSWER RESEARCH QUESTIONS**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on search results, answer:`;
                
                if (researchQuestions.length > 0) {
                    researchQuestions.slice(0, 5).forEach((q, i) => {
                        enhancedUserPrompt += `
  ${i + 1}. ${q}`;
                    });
                    if (researchQuestions.length > 5) {
                        enhancedUserPrompt += `
  ... and ${researchQuestions.length - 5} more questions`;
                    }
                }
                
                if (suggestedSources.length > 0) {
                    enhancedUserPrompt += `

📚 **SOURCE PRIORITY**: ${suggestedSources.map(s => s.type).join(', ')} sources`;
                }

                enhancedUserPrompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  **EXECUTION CHECKLIST** ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your FIRST response MUST include:
  ☐ ONE manage_todos tool call (add all tasks)
  ☐ MULTIPLE search_web tool calls (execute immediately)
  ☐ Analysis of search results
  ☐ Answers to questions

**DO NOT**:
  ❌ Just create todos and stop
  ❌ Say "I will search..." without calling search_web
  ❌ Wait for user confirmation

**DO**:
  ✅ Call manage_todos once with all tasks
  ✅ Call search_web multiple times right away
  ✅ Provide comprehensive answers from search results`;
            }
            
            // Add language instruction to both prompts if not English
            if (languageInstruction) {
                enhancedSystemPrompt += `\n\n**LANGUAGE INSTRUCTION**: ${languageInstruction}`;
                enhancedUserPrompt += `\n\n**LANGUAGE**: ${languageInstruction}`;
            }
            
            return {
                ...baseResult,
                searchStrategies,
                researchQuestions,
                suggestedSources,
                enhancedSystemPrompt,
                enhancedUserPrompt,
                methodology,
                estimatedSources
            };
        } else if (queryType === 'long-form' || queryType === 'LONG_FORM') {
            const documentSections = parsed.documentSections || parsed.document_sections || [];
            const snippetWorkflow = parsed.snippetWorkflow || parsed.snippet_workflow || '';
            const suggestedSources = parsed.suggestedSources || parsed.suggested_sources || [];
            const persona = parsed.expertPersona || parsed.optimal_persona || '';
            
            // Build enhanced prompts for long-form queries
            let enhancedSystemPrompt = parsed.enhancedSystemPrompt || parsed.enhanced_system_prompt || '';
            let enhancedUserPrompt = parsed.enhancedUserPrompt || parsed.enhanced_user_prompt || '';
            
            // Extract search queries and research questions from planning result
            const searchQueries = parsed.searchQueries || parsed.search_strategies || [];
            const researchQuestions = parsed.researchQuestions || parsed.research_questions || [];
            const todos = parsed.todos || [];
            
            // ALWAYS regenerate enhanced prompts with explicit tool instructions (override LLM's vague prompts)
            if (true) {  // Always regenerate to ensure explicit tool-calling instructions
                enhancedSystemPrompt = `${persona || 'You are a research and writing expert.'} 

**YOUR TASK**: Create a comprehensive document about "${query}"

**🚨 CRITICAL: Execute ALL steps in your FIRST response - do not wait for confirmation!**

**STEP 1 - Create Complete Todo List:**
Call manage_todos tool to add ALL these tasks at once:`;
                
                // Add todos from planning result
                if (todos.length > 0) {
                    todos.slice(0, 8).forEach((todo, i) => {
                        const taskTitle = typeof todo === 'string' ? todo : (todo.task || todo.title || 'Research task');
                        enhancedSystemPrompt += `\n${i + 1}. ${taskTitle}`;
                    });
                    if (todos.length > 8) {
                        enhancedSystemPrompt += `\n... ${todos.length - 8} more tasks`;
                    }
                } else if (documentSections.length > 0) {
                    documentSections.slice(0, 6).forEach((section, i) => {
                        enhancedSystemPrompt += `\n${i + 1}. Research section: ${section.title}`;
                    });
                } else {
                    enhancedSystemPrompt += `\n1. Conduct comprehensive research on ${query}`;
                }
                
                enhancedSystemPrompt += `

**STEP 2 - Execute Multiple Web Searches:**
Immediately call search_web tool multiple times with these queries:`;
                
                if (searchQueries.length > 0) {
                    searchQueries.slice(0, 6).forEach((query, i) => {
                        enhancedSystemPrompt += `\n${i + 1}. "${query}"`;
                    });
                    if (searchQueries.length > 6) {
                        enhancedSystemPrompt += `\n... ${searchQueries.length - 6} more searches`;
                    }
                } else {
                    enhancedSystemPrompt += `\n1. [Relevant search term 1]\n2. [Relevant search term 2]\n3. [Continue with multiple searches]`;
                }
                
                enhancedSystemPrompt += `

**STEP 3 - Document Findings:**
Synthesize search results into comprehensive content.`;
                
                if (researchQuestions.length > 0) {
                    enhancedSystemPrompt += `\n\n**Answer these questions:**`;
                    researchQuestions.slice(0, 5).forEach((q, i) => {
                        enhancedSystemPrompt += `\n${i + 1}. ${q}`;
                    });
                }
                
                if (documentSections.length > 0) {
                    const sectionTitles = documentSections.map(s => s.title).slice(0, 5).join(', ');
                    enhancedSystemPrompt += `\n\n**Include sections:** ${sectionTitles}${documentSections.length > 5 ? '...' : ''}`;
                }
                
                enhancedSystemPrompt += `

**⚠️ EXECUTION REQUIREMENTS:**
✅ Call manage_todos ONCE with all tasks
✅ Call search_web MULTIPLE times (minimum 3-5 searches)
✅ Do NOT stop after creating todos - execute searches immediately
✅ Use manage_snippets to save findings with tag "als cures"

Start executing NOW - your first response must include manage_todos + multiple search_web calls.`;
            }
            
            // ALWAYS regenerate enhanced user prompt with explicit tool instructions (override LLM's vague prompts)
            if (true) {  // Always regenerate to ensure explicit tool-calling instructions
                enhancedUserPrompt = `**EXECUTE RESEARCH AND DOCUMENTATION TASK**

Query: "${query}"

**🚨 YOU MUST EXECUTE ALL THESE STEPS IN YOUR FIRST RESPONSE:**

**STEP 1 - Add All Todos:**
Use manage_todos to add this complete task list:`;

                if (todos.length > 0) {
                    todos.slice(0, 6).forEach((todo, i) => {
                        const taskTitle = typeof todo === 'string' ? todo : (todo.task || todo.title || 'Research task');
                        enhancedUserPrompt += `\n${i + 1}. ${taskTitle}`;
                    });
                    if (todos.length > 6) {
                        enhancedUserPrompt += `\n... plus ${todos.length - 6} more tasks`;
                    }
                } else if (documentSections.length > 0) {
                    documentSections.slice(0, 5).forEach((section, i) => {
                        enhancedUserPrompt += `\n${i + 1}. Research: ${section.title}`;
                    });
                } else {
                    enhancedUserPrompt += `\n1. Comprehensive research and documentation`;
                }
                
                enhancedUserPrompt += `

**STEP 2 - Execute Searches:**
Use search_web for these queries:`;

                if (searchQueries.length > 0) {
                    searchQueries.slice(0, 5).forEach((query, i) => {
                        enhancedUserPrompt += `\n${i + 1}. ${query}`;
                    });
                    if (searchQueries.length > 5) {
                        enhancedUserPrompt += `\n... plus ${searchQueries.length - 5} more searches`;
                    }
                } else {
                    enhancedUserPrompt += `\n1-3. Multiple relevant search queries`;
                }
                
                enhancedUserPrompt += `

**STEP 3 - Create Content:**`;
                
                if (snippetWorkflow) {
                    enhancedUserPrompt += `\nWorkflow: ${snippetWorkflow}`;
                }
                
                if (documentSections.length > 0) {
                    enhancedUserPrompt += `\n\nRequired sections:`;
                    documentSections.slice(0, 4).forEach((section, i) => {
                        enhancedUserPrompt += `\n${i + 1}. ${section.title}`;
                    });
                    if (documentSections.length > 4) {
                        enhancedUserPrompt += `\n... ${documentSections.length - 4} more`;
                    }
                }
                
                if (researchQuestions.length > 0) {
                    enhancedUserPrompt += `\n\nAnswer these:`;
                    researchQuestions.slice(0, 4).forEach((q, i) => {
                        enhancedUserPrompt += `\n${i + 1}. ${q}`;
                    });
                }
                
                if (suggestedSources.length > 0) {
                    enhancedUserPrompt += `\n\n📚 Prioritize: ${suggestedSources.map(s => s.type).join(', ')} sources`;
                }

                enhancedUserPrompt += `

**✅ CHECKLIST - Your response MUST include:**
□ manage_todos call (add ALL tasks at once)
□ search_web calls (minimum 3-5 searches)
□ Begin documenting findings
□ manage_snippets to save results (tag: "als cures")

**❌ DO NOT:**
- Create only ONE todo then stop
- Say "I will do X" without calling the tool
- Wait for user confirmation

**✅ DO:**
- Execute manage_todos + search_web in first response
- Call search_web multiple times
- Start documenting immediately

BEGIN EXECUTION NOW.`;
            }
            
            // Add language instruction to both prompts if not English
            if (languageInstruction) {
                enhancedSystemPrompt += `\n\n**LANGUAGE INSTRUCTION**: ${languageInstruction}`;
                enhancedUserPrompt += `\n\n**LANGUAGE**: ${languageInstruction}`;
            }
            
            return {
                ...baseResult,
                documentSections,
                snippetWorkflow,
                suggestedSources,
                enhancedSystemPrompt,
                enhancedUserPrompt
            };
        } else if (queryType === 'clarification' || queryType === 'NEEDS_CLARIFICATION') {
            const clarificationQuestions = parsed.clarificationQuestions || parsed.clarification_questions || [];
            const persona = parsed.expertPersona || parsed.optimal_persona || 'You are a helpful research assistant';
            
            // Build enhanced prompts for clarification
            let enhancedSystemPrompt = parsed.enhancedSystemPrompt || parsed.enhanced_system_prompt || '';
            let enhancedUserPrompt = parsed.enhancedUserPrompt || parsed.enhanced_user_prompt || '';
            
            if (!enhancedSystemPrompt || enhancedSystemPrompt.length < 30) {
                enhancedSystemPrompt = `${persona}. Ask clarifying questions to better understand the user's research needs before proceeding with detailed research.`;
            }
            
            if (!enhancedUserPrompt || enhancedUserPrompt.length < 30) {
                enhancedUserPrompt = `I need clarification on your request: "${query}"`;
                if (clarificationQuestions.length > 0) {
                    enhancedUserPrompt += `\n\nPlease clarify:\n${clarificationQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
                }
            }
            
            // Add language instruction if not English
            if (languageInstruction) {
                enhancedSystemPrompt += `\n\n**LANGUAGE INSTRUCTION**: ${languageInstruction}`;
            }
            
            return {
                ...baseResult,
                clarificationQuestions,
                enhancedSystemPrompt,
                enhancedUserPrompt
            };
        } else if ((queryType === 'guidance' || queryType === 'GUIDANCE') && !forcePlan) {
            // Handle guidance queries - complex multi-iteration projects needing workflow planning
            // Note: If forcePlan is true, we skip guidance and treat it as OVERVIEW
            const guidanceQuestions = parsed.guidanceQuestions || parsed.guidance_questions || [];
            const workflow = parsed.workflow || [];
            const iterations = parsed.iterations || parsed.suggested_iterations || 3;
            const persona = parsed.expertPersona || parsed.optimal_persona || 'You are an expert strategist and project planner';
            
            // Build enhanced prompts for guidance
            let enhancedSystemPrompt = parsed.enhancedSystemPrompt || parsed.enhanced_system_prompt || '';
            let enhancedUserPrompt = parsed.enhancedUserPrompt || parsed.enhanced_user_prompt || '';
            
            if (!enhancedSystemPrompt || enhancedSystemPrompt.length < 30) {
                enhancedSystemPrompt = `${persona}. You will guide the user through a complex, multi-step process for "${query}". Break down the work into manageable iterations.`;
                
                if (workflow.length > 0) {
                    enhancedSystemPrompt += ` Follow this workflow: ${workflow.map((w, i) => `Step ${i + 1}: ${w}`).join('; ')}.`;
                }
                
                enhancedSystemPrompt += ` Use research, planning, and execution tools strategically across ${iterations} iterations.`;
            }
            
            if (!enhancedUserPrompt || enhancedUserPrompt.length < 30) {
                enhancedUserPrompt = `I need guidance on: "${query}".`;
                
                if (guidanceQuestions.length > 0) {
                    enhancedUserPrompt += `\n\n**Key Questions to Address:**\n${guidanceQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
                }
                
                if (workflow.length > 0) {
                    enhancedUserPrompt += `\n\n**Suggested Workflow:**\n${workflow.map((w, i) => `${i + 1}. ${w}`).join('\n')}`;
                }
                
                enhancedUserPrompt += `\n\nPlease guide me through this process step by step, using multiple iterations of research, planning, and execution.`;
            }
            
            // Add language instruction if not English
            if (languageInstruction) {
                enhancedSystemPrompt += `\n\n**LANGUAGE INSTRUCTION**: ${languageInstruction}`;
            }
            
            return {
                ...baseResult,
                guidanceQuestions,
                workflow,
                iterations,
                enhancedSystemPrompt,
                enhancedUserPrompt
            };
        } else if ((queryType === 'guidance' || queryType === 'GUIDANCE') && forcePlan) {
            // Force plan mode - treat guidance as OVERVIEW and generate system/user prompts
            console.log('⚡ Force plan mode enabled - treating guidance as OVERVIEW');
            const searchQueries = parsed.searchQueries || parsed.search_queries || parsed.searchStrategies || [];
            const researchQuestions = parsed.researchQuestions || parsed.research_questions || [];
            const persona = parsed.expertPersona || parsed.optimal_persona || 'You are a knowledgeable research assistant';
            
            // Build enhanced prompts even though it's a guidance query
            let enhancedSystemPrompt = parsed.enhancedSystemPrompt || parsed.enhanced_system_prompt || '';
            let enhancedUserPrompt = parsed.enhancedUserPrompt || parsed.enhanced_user_prompt || '';
            
            if (!enhancedSystemPrompt || enhancedSystemPrompt.length < 30) {
                enhancedSystemPrompt = `${persona}. You will conduct comprehensive research on "${query}". Use available tools to gather information from multiple sources.`;
                
                if (researchQuestions.length > 0) {
                    enhancedSystemPrompt += ` Focus on answering these key questions: ${researchQuestions.join('; ')}.`;
                }
                
                enhancedSystemPrompt += ' Synthesize findings into a coherent analysis.';
            }
            
            if (!enhancedUserPrompt || enhancedUserPrompt.length < 30) {
                enhancedUserPrompt = `I need comprehensive research on: "${query}".`;
                
                if (researchQuestions.length > 0) {
                    enhancedUserPrompt += `\n\n**Research Questions:**\n${researchQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
                }
                
                if (searchQueries.length > 0) {
                    enhancedUserPrompt += `\n\n**Search Topics:**\n${searchQueries.map((sq, i) => `${i + 1}. ${sq}`).join('\n')}`;
                }
                
                enhancedUserPrompt += '\n\nPlease research these topics thoroughly and provide a comprehensive analysis.';
            }
            
            // Add language instruction if not English
            if (languageInstruction) {
                enhancedSystemPrompt += `\n\n**LANGUAGE INSTRUCTION**: ${languageInstruction}`;
            }
            
            return {
                ...baseResult,
                queryType: 'OVERVIEW', // Override to OVERVIEW when forcing plan
                searchQueries,
                researchQuestions,
                enhancedSystemPrompt,
                enhancedUserPrompt,
                forcedFromGuidance: true // Flag to indicate this was forced from guidance mode
            };
        } else {
            throw new Error(`Unknown query_type: ${queryType}`);
        }
        
    } catch (error) {
        console.error('🚨 Planning: Error with model:', finalModel, error.message);
        
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
async function handler(event, responseStream, context) {
    const startTime = Date.now();
    
    // Extract Lambda metrics
    const memoryLimitMB = context?.memoryLimitInMB || 0;
    const requestId = context?.requestId || '';
    const memoryUsedMB = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
    
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
    
    // Create SSE writer with disconnect detection
    const { createSSEStreamAdapter } = require('../streaming/sse-writer');
    const sseWriter = createSSEStreamAdapter(responseStream);
    
    let llmResponse = null;
    let userEmail = 'unknown';
    let query = 'unknown';
    let providers = {};
    let requestedModel = null;
    
    try {
        // Get authorization header
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        
        // Extract token (support both "Bearer token" and just "token")
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;
        
        console.log('🔐 Planning endpoint authentication:', {
            hasAuthHeader: !!authHeader,
            tokenLength: token?.length,
            tokenPrefix: token?.substring(0, 30) + '...',
            startsWithBearer: authHeader?.startsWith('Bearer '),
        });
        
        // Store googleToken for billing logging
        const googleToken = token;
        
        let verifiedUser = null;
        
        // Try to verify token if provided
        if (token) {
            console.log('🔍 Attempting to verify token...');
            const authResult = await authenticateRequest(`Bearer ${token}`);
            
            if (!authResult.authenticated) {
                console.error('❌ Token verification failed for planning endpoint');
                sseWriter.writeEvent('error', {
                    error: 'Authentication failed. Token is invalid or expired. Please sign out and sign in again.',
                    code: 'TOKEN_INVALID',
                    hint: 'Try logging out and back in to refresh your session'
                });
                responseStream.end();
                return;
            } else {
                verifiedUser = authResult.user;
                console.log('✅ Token verified successfully for user:', verifiedUser.email);
            }
        } else {
            console.error('❌ No token provided in Authorization header');
        }
        
        // Require authentication
        if (!verifiedUser) {
            console.error('❌ Authentication required but no verified user');
            sseWriter.writeEvent('error', {
                error: 'Authentication required. Please sign in with your Google account.',
                code: 'UNAUTHORIZED',
                hint: 'Click "Sign in with Google" at the top of the page'
            });
            responseStream.end();
            return;
        }
        
        // Store user email for logging
        userEmail = verifiedUser.email || 'unknown';
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        const userProviders = body.providers || {};
        requestedModel = body.model || null;
        const clarificationAnswers = body.clarificationAnswers || null; // User's answers to clarification questions
        const previousContext = body.previousContext || null; // Context from previous clarification request
        const forcePlan = body.forcePlan || false; // Force plan generation even if guidance mode
        const language = body.language || 'en'; // User's preferred language for responses
        
        console.log(`🎯 Planning request: forcePlan=${forcePlan}, hasClarificationAnswers=${!!clarificationAnswers}`);
        
        // Build provider pool (combines UI providers + environment providers)
        const providerPool = buildProviderPool(userProviders, true); // true = authorized user
        console.log(`🎯 Provider pool for planning (${userEmail}): ${providerPool.length} provider(s) available`);
        console.log(`📋 Provider pool details:`, JSON.stringify(providerPool.map(p => ({ 
            type: p.type, 
            id: p.id,
            hasApiKey: !!p.apiKey,
            source: p.source,
            model: p.model || p.modelName
        }))));
        
        // Convert provider pool to old format expected by generatePlan
        providers = {};
        for (const provider of providerPool) {
            if (!providers[provider.type]) {
                providers[provider.type] = {
                    apiKey: provider.apiKey, // Use apiKey (not provider.key)
                    endpoint: provider.apiEndpoint, // Use apiEndpoint (not endpoint)
                    model: provider.modelName || provider.model,
                    rateLimit: provider.rateLimitTPM || provider.rateLimit,
                    allowedModels: provider.allowedModels,
                    imageMaxQuality: provider.imageMaxQuality,
                    isServerSideKey: provider.isServerSideKey // Preserve for cost calculation
                };
                console.log(`✅ Added provider: ${provider.type}, hasKey: ${!!provider.apiKey}, keyPreview: ${provider.apiKey?.substring(0, 10)}...`);
            }
        }
        
        console.log(`🔑 Planning providers: ${Object.keys(providers).join(', ')}`);
        console.log(`📊 Provider details:`, JSON.stringify(Object.keys(providers).reduce((acc, key) => {
            acc[key] = { hasApiKey: !!providers[key].apiKey, endpoint: providers[key].endpoint };
            return acc;
        }, {})));
        
        // Validate inputs
        if (!query) {
            sseWriter.writeEvent('error', {
                error: 'Query parameter is required'
            });
            responseStream.end();
            return;
        }
        
        if (!providers || Object.keys(providers).length === 0) {
            sseWriter.writeEvent('error', {
                error: 'No providers available. Please configure providers in UI settings or environment variables.'
            });
            responseStream.end();
            return;
        }
        
        // Send status event
        sseWriter.writeEvent('status', {
            message: 'Generating research plan...'
        });
        
        // Send basic transparency info before making the request
        console.log('🔍 Planning: Preparing to generate research plan...');
        sseWriter.writeEvent('llm_request', {
            phase: 'planning',
            timestamp: new Date().toISOString(),
            status: 'initializing',
            query: query,
            requestedModel: requestedModel,
            message: 'Initializing planning request...'
        });
        
        // Generate plan (this calls llmResponsesWithTools internally with load balancing)
        console.log('🔍 Planning: Calling generatePlan...');
        const plan = await generatePlan(query, providers, requestedModel, (eventType, eventData) => {
            // Forward events from generatePlan to SSE stream
            sseWriter.writeEvent(eventType, eventData);
        }, clarificationAnswers, previousContext, forcePlan, language);
        
        // Extract token usage, selected model, and raw response for transparency and logging
        const tokenUsage = plan._tokenUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        const selectedModel = plan._selectedModel;
        const rawResponse = plan._rawResponse;
        const finalModelString = `${selectedModel.providerType}:${selectedModel.name}`;
        
        // Send detailed LLM transparency event after successful completion
        console.log('🔍 Planning: Sending llm_response transparency event with tokens:', tokenUsage.totalTokens);
        sseWriter.writeEvent('llm_response', {
            phase: 'planning',
            model: finalModelString,
            provider: selectedModel.providerType,
            modelName: selectedModel.name || selectedModel.id,
            timestamp: new Date().toISOString(),
            status: 'completed',
            requestedModel: requestedModel,
            selectedViaLoadBalancing: !requestedModel,
            query: query,
            message: `Planning request completed using ${finalModelString}`,
            tokenUsage: tokenUsage,
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens
        });
        
        sseWriter.writeEvent('llm_response', {
            phase: 'planning',
            model: finalModelString,
            provider: selectedModel.providerType,
            modelName: selectedModel.name || selectedModel.id,
            request: {
                model: finalModelString,
                messages: [{role: 'user', content: query}]
            },
            response: rawResponse,
            httpHeaders: rawResponse?.httpHeaders || {},
            httpStatus: rawResponse?.httpStatus || 200,
            timestamp: new Date().toISOString(),
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
            selectedViaLoadBalancing: !requestedModel // Indicate if load balancing was used
        });
        console.log('✅ Planning: llm_response event sent successfully');
        
        // Remove internal fields before sending to client
        const clientPlan = { ...plan };
        delete clientPlan._tokenUsage;
        delete clientPlan._rawResponse;
        delete clientPlan._selectedModel;
        
        // Check if this is a clarification response (needs user input)
        const needsClarification = plan.queryType === 'clarification' || 
                                    plan.queryType === 'NEEDS_CLARIFICATION' ||
                                    (plan.clarificationQuestions && plan.clarificationQuestions.length > 0);
        
        if (needsClarification) {
            // Send clarification_needed event instead of result
            sseWriter.writeEvent('clarification_needed', {
                questions: plan.clarificationQuestions || [],
                context: {
                    originalQuery: query,
                    persona: plan.expertPersona || 'You are a helpful research assistant',
                    reasoning: plan.reasoning || ''
                }
            });
        } else {
            // Send result event for complete plans
            sseWriter.writeEvent('result', clientPlan);
        }
        
        // Send complete event
        sseWriter.writeEvent('complete', {
            success: true,
            needsClarification
        });
        
        // Log to Google Sheets (async, non-blocking)
        const durationMs = Date.now() - startTime;
        
        // Log the planning request with actual token counts and selected model
        const providerInfo = providers[selectedModel.providerType];
        const isUserProvidedKey = providerInfo ? !providerInfo.isServerSideKey : false;
        const cost = calculateCost(selectedModel.name, tokenUsage.promptTokens, tokenUsage.completionTokens, null, isUserProvidedKey);
        logToBothSheets(googleToken, {
            timestamp: new Date().toISOString(),
            userEmail: userEmail,
            provider: selectedModel.providerType,
            model: selectedModel.name,
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
            cost,
            duration: durationMs / 1000,
            type: 'planning',
            memoryLimitMB,
            memoryUsedMB,
            requestId,
            queryType: plan.queryType,
            loadBalanced: !requestedModel
        }).catch(err => {
            // Don't fail the request if logging fails
            console.error('Failed to log planning request to sheets:', err);
        });
        
        responseStream.end();
        
    } catch (error) {
        console.error('Planning endpoint error:', error);
        
        // Handle client disconnect gracefully
        if (error.message === 'CLIENT_DISCONNECTED') {
            console.log('🔴 Client disconnected during planning, aborting handler');
            try {
                sseWriter.writeEvent('disconnect', {
                    reason: 'client_disconnected',
                    timestamp: Date.now()
                });
            } catch (disconnectErr) {
                console.log('Could not send disconnect event (client already gone)');
            }
            responseStream.end();
            return;
        }
        
        // Enhanced error reporting for rate limits and HTTP errors
        const errorMessage = error.message || 'Internal server error';
        let errorCode = 'UNKNOWN_ERROR';
        let httpStatus = null;
        let httpHeaders = {};
        let provider = null;
        let model = null;
        
        // Parse HTTP errors (429, etc.)
        const httpErrorMatch = errorMessage.match(/HTTP (\d+):/);
        if (httpErrorMatch) {
            httpStatus = parseInt(httpErrorMatch[1]);
            if (httpStatus === 429) {
                errorCode = 'RATE_LIMIT_EXCEEDED';
            }
        }
        
        // Extract model/provider info from error if available
        const modelMatch = errorMessage.match(/(groq(-free)?|openai|gemini):[^\s]+/);
        if (modelMatch) {
            const fullModel = modelMatch[0];
            const [providerType, modelName] = fullModel.split(':');
            provider = providerType;
            model = modelName;
        }
        
        // Check for rate limit keywords
        const isRateLimit = httpStatus === 429 || 
            errorMessage.toLowerCase().includes('rate limit') ||
            errorMessage.toLowerCase().includes('too many requests') ||
            errorMessage.toLowerCase().includes('quota exceeded');
            
        if (isRateLimit) {
            errorCode = 'RATE_LIMIT_EXCEEDED';
        }
        
        // Send detailed error event with full context
        const errorDetails = {
            error: errorMessage,
            code: errorCode,
            httpStatus,
            httpHeaders,
            provider,
            model,
            timestamp: new Date().toISOString(),
            isRateLimit,
            userEmail: userEmail,
            query: (typeof query !== 'undefined') ? query : 'unknown'
        };
        
        console.error('🚨 Planning Error Details:', errorDetails);
        
        // Send enhanced error to client
        console.log('🔍 Planning: Sending error event:', errorCode);
        sseWriter.writeEvent('error', errorDetails);
        
        // Send LLM error transparency event if it's an LLM-related error
        if (provider && model) {
            console.log('🔍 Planning: Sending llm_error event:', `${provider}:${model}`);
            sseWriter.writeEvent('llm_error', {
                phase: 'planning',
                model: `${provider}:${model}`,
                provider: provider,
                modelName: model,
                error: errorMessage,
                httpStatus,
                httpHeaders,
                timestamp: new Date().toISOString(),
                isRateLimit
            });
        }
        console.log('✅ Planning: Error events sent');
        
        responseStream.end();
    }
}

module.exports = {
    handler,
    generatePlan
};
