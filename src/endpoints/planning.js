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
const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');
const { logToBillingSheet } = require('../services/user-billing-sheet');
const path = require('path');

/**
 * Log transaction to both service account sheet and user's personal billing sheet
 * @param {string} accessToken - User's OAuth access token (can be null)
 * @param {object} logData - Transaction data
 */
async function logToBothSheets(accessToken, logData) {
    // Always log to service account sheet (admin tracking)
    try {
        await logToGoogleSheets(logData);
    } catch (error) {
        console.error('⚠️ Failed to log to service account sheet:', error.message);
    }
    
    // Also log to user's personal billing sheet if token available
    if (accessToken && logData.userEmail && logData.userEmail !== 'unknown') {
        try {
            await logToBillingSheet(accessToken, logData);
        } catch (error) {
            console.error('⚠️ Failed to log to user billing sheet:', error.message);
            // Don't fail the request if user billing logging fails
        }
    }
}

// Load provider catalog (try multiple locations)
let providerCatalog;
try {
    // First try the relative path (for development)
    providerCatalog = require('../../PROVIDER_CATALOG.json');
} catch (e) {
    try {
        // Then try the Lambda deployment path
        providerCatalog = require('/var/task/PROVIDER_CATALOG.json');
    } catch (e2) {
        // Finally try the same directory as this file
        const catalogPath = path.join(__dirname, '..', '..', 'PROVIDER_CATALOG.json');
        providerCatalog = require(catalogPath);
    }
}
const { RateLimitTracker } = require('../model-selection/rate-limit-tracker');
const { selectModel, RoundRobinSelector, SelectionStrategy } = require('../model-selection/selector');

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
 * @returns {Promise<Object>} Plan object with queryType, reasoning, persona, etc.
 */
async function generatePlan(query, providers = {}, requestedModel = null, eventCallback = null) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Query parameter is required and must be a non-empty string');
    }
    
    if (!providers || Object.keys(providers).length === 0) {
        throw new Error('At least one provider with API key is required');
    }
    
    // Declare finalModel at function scope for error handling
    let finalModel = 'unknown';
    
    // Build runtime catalog from base catalog and providers
    const runtimeCatalog = {
        providers: {}
    };
    
    // Copy chat providers from base catalog and apply API keys from UI settings
    if (providerCatalog.chat?.providers) {
        Object.entries(providerCatalog.chat.providers).forEach(([providerType, providerInfo]) => {
            const userProvider = providers[providerType];
            if (userProvider && userProvider.apiKey) {
                runtimeCatalog.providers[providerType] = {
                    ...providerInfo,
                    apiKey: userProvider.apiKey,
                    enabled: true
                };
            }
        });
    }

    // Create messages for planning prompt
    const { generatePlanningPrompt } = require('../lambda_search_llm_handler');
    const planningPrompt = generatePlanningPrompt(query);
    
    const messages = [
        { 
            role: 'system', 
            content: 'You are a research strategist. Analyze queries and determine optimal research approaches and expert personas. You may provide detailed analysis if the query is complex. Always respond with valid JSON only.' 
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

        const requestBody = {
            model: finalModel,
            input: messages,
            tools: [],
            options: {
                apiKey,
                reasoningEffort: DEFAULT_REASONING_EFFORT,
                temperature: 0.2,
                max_tokens: MAX_TOKENS_PLANNING * 2,
                timeoutMs: 30000
            }
        };
        
        console.log('🔍 Planning: Making LLM request with model:', finalModel);
        
        // Send real-time event before LLM call
        if (eventCallback) {
            eventCallback('llm_request', {
                phase: 'planning',
                model: finalModel,
                provider: selectedModel.providerType,
                modelName: selectedModel.name || selectedModel.id,
                timestamp: new Date().toISOString(),
                status: 'requesting',
                message: `Making planning request to ${finalModel}...`,
                requestedModel: requestedModel,
                selectedViaLoadBalancing: !requestedModel
            });
        }
        
        const response = await llmResponsesWithTools(requestBody);
        console.log('🔍 Planning: LLM response received, length:', response?.text?.length || 0);
        console.log('🔍 Planning: Raw LLM response preview:', response?.text?.substring(0, 300) || 'null');
        
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
            
            // Generate fallback enhanced system prompt if missing or too short
            if (!enhancedSystemPrompt || enhancedSystemPrompt.length < 50) {
                enhancedSystemPrompt = `${persona || 'You are a research expert.'} Your task is to research and analyze "${query}" comprehensively.`;
                
                if (searchStrategies.length > 0) {
                    enhancedSystemPrompt += ` Search for information using these terms: ${searchStrategies.join(', ')}.`;
                }
                
                if (researchQuestions.length > 0) {
                    enhancedSystemPrompt += ` Focus on answering these key questions: ${researchQuestions.slice(0, 5).join(' ')} ${researchQuestions.length > 5 ? `and ${researchQuestions.length - 5} additional questions.` : ''}`;
                }
                
                if (suggestedSources.length > 0) {
                    const sourceTypes = suggestedSources.map(s => s.type).join(', ');
                    enhancedSystemPrompt += ` Consult diverse sources including: ${sourceTypes} sources.`;
                }
                
                if (methodology) {
                    enhancedSystemPrompt += ` Use a ${methodology} approach.`;
                }
                
                enhancedSystemPrompt += ` Aim to find ${estimatedSources} high-quality sources and provide detailed, well-sourced analysis with proper citations.`;
            }
            
            // Generate fallback enhanced user prompt if missing or too short  
            if (!enhancedUserPrompt || enhancedUserPrompt.length < 30) {
                enhancedUserPrompt = `Please research "${query}" comprehensively.`;
                
                if (searchStrategies.length > 0) {
                    enhancedUserPrompt += `\n\n**Search Terms:**\n${searchStrategies.map(s => `- "${s}"`).join('\n')}`;
                }
                
                if (researchQuestions.length > 0) {
                    enhancedUserPrompt += `\n\n**Research Questions:**\n${researchQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
                }
                
                if (suggestedSources.length > 0) {
                    enhancedUserPrompt += `\n\n**Suggested Source Types:**`;
                    suggestedSources.forEach(source => {
                        enhancedUserPrompt += `\n- **${source.type.charAt(0).toUpperCase() + source.type.slice(1)}**: ${source.examples ? source.examples.join(', ') : 'Various relevant sources'}`;
                    });
                }
                
                enhancedUserPrompt += `\n\nProvide comprehensive analysis with proper citations from diverse, authoritative sources. Address all research questions thoroughly.`;
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
            
            if (!enhancedSystemPrompt || enhancedSystemPrompt.length < 50) {
                enhancedSystemPrompt = `${persona || 'You are a research and writing expert.'} You will create a comprehensive document about "${query}".`;
                
                if (documentSections.length > 0) {
                    const sectionTitles = documentSections.map(s => s.title).join(', ');
                    enhancedSystemPrompt += ` The document should include these sections: ${sectionTitles}.`;
                    enhancedSystemPrompt += ` For each section, research using the specified keywords and answer the associated questions.`;
                }
                
                enhancedSystemPrompt += ` Follow a systematic approach to ensure comprehensive coverage.`;
            }
            
            if (!enhancedUserPrompt || enhancedUserPrompt.length < 30) {
                enhancedUserPrompt = `Create a comprehensive document about "${query}".`;
                
                if (snippetWorkflow) {
                    enhancedUserPrompt += `\n\n**Workflow:**\n${snippetWorkflow}`;
                }
                
                if (documentSections.length > 0) {
                    enhancedUserPrompt += `\n\n**Document Sections:**`;
                    documentSections.forEach((section, i) => {
                        enhancedUserPrompt += `\n\n${i + 1}. **${section.title}**`;
                        if (section.keywords && section.keywords.length > 0) {
                            enhancedUserPrompt += `\n   - Keywords: ${section.keywords.join(', ')}`;
                        }
                        if (section.questions && section.questions.length > 0) {
                            enhancedUserPrompt += `\n   - Questions: ${section.questions.join('; ')}`;
                        }
                    });
                }
                
                if (suggestedSources.length > 0) {
                    enhancedUserPrompt += `\n\n**Suggested Source Types:**`;
                    suggestedSources.forEach(source => {
                        enhancedUserPrompt += `\n- **${source.type.charAt(0).toUpperCase() + source.type.slice(1)}**: ${source.examples ? source.examples.join(', ') : 'Various relevant sources'}`;
                    });
                }
                
                enhancedUserPrompt += `\n\nResearch each section thoroughly using diverse sources and provide detailed, well-sourced content with proper citations.`;
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
            
            return {
                ...baseResult,
                clarificationQuestions,
                enhancedSystemPrompt,
                enhancedUserPrompt
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
        
        // Store googleToken for billing logging
        const googleToken = token;
        
        let verifiedUser = null;
        
        // Try to verify token if provided
        if (token) {
            verifiedUser = await verifyGoogleToken(token);
        }
        
        // Require authentication
        if (!verifiedUser) {
            sseWriter.writeEvent('error', {
                error: 'Authentication required. Please provide a valid JWT token in the Authorization header.',
                code: 'UNAUTHORIZED'
            });
            responseStream.end();
            return;
        }
        
        // Store user email for logging
        userEmail = verifiedUser.email || 'unknown';
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        providers = body.providers || {};
        requestedModel = body.model || null;
        
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
                error: 'At least one provider with API key is required. Please configure providers in UI settings.'
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
        });
        
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
        
        // Send result event
        sseWriter.writeEvent('result', clientPlan);
        
        // Send complete event
        sseWriter.writeEvent('complete', {
            success: true
        });
        
        // Log to Google Sheets (async, non-blocking)
        const durationMs = Date.now() - startTime;
        
        // Log the planning request with actual token counts and selected model
        const cost = calculateCost(selectedModel.name, tokenUsage.promptTokens, tokenUsage.completionTokens);
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
