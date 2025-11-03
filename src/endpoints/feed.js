/**
 * Feed Endpoint
 * Generates personalized feed items using LLM analysis of user's Swag content
 * combined with web search results
 */

const { llmResponsesWithTools, getStructuredOutputCapabilities } = require('../llm_tools_adapter');
const { performDuckDuckGoSearch } = require('../tools/search_web');
const { searchImage, trackUnsplashDownload } = require('../tools/image-search');
const { authenticateRequest } = require('../auth');
const { buildProviderPool } = require('../credential-pool');
const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');
const feedRecommender = require('../services/feed-recommender');
const { buildModelRotationSequence, estimateTokenRequirements } = require('../model-selector-v2');
const feedService = require('../services/google-sheets-feed');
const { extractProjectId } = require('../services/user-isolation');
const { robustJsonParse, tryParseJson } = require('../utils/json-parser');

/**
 * Extract images from web search results
 * Priority 1: Use images from search metadata
 * Priority 2: Parse HTML content for img tags
 * 
 * @param {Array} searchResults - DuckDuckGo search results
 * @returns {Array} Array of image objects
 */
function extractImagesFromSearchResults(searchResults) {
    const images = [];
    
    for (const result of searchResults) {
        // Priority 1: Check if result has image metadata
        if (result.image && !isJunkImage(result.image)) {
            images.push({
                url: result.image,
                thumb: result.image,
                full: result.image,
                alt: result.title || 'Search result image',
                source: 'web_search',
                sourceUrl: result.url
            });
        }
        
        // Priority 2: Parse HTML content for images (if available)
        if (result.body) {
            const imgRegex = /<img[^>]+src=["']([^"'>]+)["']/gi;
            let match;
            
            while ((match = imgRegex.exec(result.body)) !== null) {
                const imgUrl = match[1];
                
                // Filter out common junk images
                if (!isJunkImage(imgUrl)) {
                    images.push({
                        url: imgUrl,
                        thumb: imgUrl,
                        full: imgUrl,
                        alt: result.title || 'Search result image',
                        source: 'web_search',
                        sourceUrl: result.url
                    });
                }
            }
        }
    }
    
    return images;
}

/**
 * Filter out common junk images (icons, tracking pixels, etc.)
 * 
 * @param {string} url - Image URL to check
 * @returns {boolean} True if image should be filtered out
 */
function isJunkImage(url) {
    if (!url || typeof url !== 'string') {
        return true;
    }
    
    const junkPatterns = [
        /favicon/i,
        /logo/i,
        /icon/i,
        /pixel/i,
        /tracker/i,
        /tracking/i,
        /1x1/i,
        /\.gif$/i,
        /\.svg$/i,
        /data:image/i,  // Skip inline base64 images
        /^\/\//,         // Skip protocol-relative URLs (harder to fetch)
    ];
    
    return junkPatterns.some(pattern => pattern.test(url));
}

/**
 * Generate feed items using LLM
 * @param {string[]} swagContent - User's saved snippet content
 * @param {string[]} searchTerms - Search queries to inject
 * @param {number} count - Number of items to generate
 * @param {object} preferences - User preferences
 * @param {object} providers - Available LLM providers
 * @param {function} eventCallback - SSE event callback
 * @returns {Promise<object[]>} Generated feed items
 */
async function generateFeedItems(
    swagContent,
    searchTerms,
    count,
    preferences,
    providers,
    eventCallback,
    generationContext = {}
) {
    // Emit event about context being used
    eventCallback('context_prepared', {
        message: `Using ${swagContent.length} Swag items and ${searchTerms.length} search terms`,
        swagCount: swagContent.length,
        searchTermsCount: searchTerms.length,
        likedTopicsCount: preferences.likedTopics?.length || 0,
        dislikedTopicsCount: preferences.dislikedTopics?.length || 0
    });
    
    // Prepare context summaries
    const swagSummary = swagContent.slice(0, 20).join('\n\n').substring(0, 2000);
    const likedTopics = preferences.likedTopics.join(', ');
    const dislikedTopics = preferences.dislikedTopics.join(', ');
    
    // Perform web searches if search terms provided
    let searchSummary = '';
    const searchResults = [];
    
    if (searchTerms && searchTerms.length > 0) {
        eventCallback('search_starting', { 
            message: `Searching for: ${searchTerms.join(', ')}`,
            terms: searchTerms,
            termsCount: searchTerms.length
        });
        
        for (const term of searchTerms.slice(0, 3)) { // Limit to 3 search terms
            try {
                eventCallback('search_term', { 
                    message: `Searching for "${term}"...`,
                    term: term
                });
                
                const results = await performDuckDuckGoSearch(term, 5);
                searchResults.push(...results);
                
                eventCallback('search_term_complete', { 
                    message: `Found ${results.length} results for "${term}"`,
                    term: term,
                    resultsCount: results.length,
                    results: results.slice(0, 3).map(r => ({ title: r.title, url: r.url }))
                });
            } catch (error) {
                console.error(`Search failed for term "${term}":`, error);
                eventCallback('search_term_error', { 
                    message: `Search failed for "${term}": ${error.message}`,
                    term: term,
                    error: error.message
                });
            }
        }
        
        searchSummary = searchResults
            .slice(0, 10)
            .map(r => `${r.title}: ${r.snippet}`)
            .join('\n');
        
        eventCallback('search_complete', { 
            message: `Found ${searchResults.length} total results from ${searchTerms.length} search terms`,
            resultsCount: searchResults.length,
            terms: searchTerms,
            topResults: searchResults.slice(0, 5).map(r => ({ title: r.title, url: r.url, snippet: r.snippet?.substring(0, 100) }))
        });
    }
    
    // Build LLM prompt
    const systemPrompt = `You are a content curator generating in-depth educational content.

INPUT CONTEXT:
${swagSummary ? `User's saved content:\n${swagSummary}\n\n` : ''}
${searchSummary ? `Recent news/searches:\n${searchSummary}\n\n` : ''}
${likedTopics ? `✨ USER'S FAVORITE TOPICS (prioritize these): ${likedTopics}\n` : ''}
${dislikedTopics ? `🚫 USER DISLIKES (completely AVOID these): ${dislikedTopics}\n` : ''}

TASK: Generate ${count} high-quality educational items${searchSummary ? ' based on the search results provided above' : ''} mixing:
- "Did You Know" facts (70%) - surprising, educational facts${searchSummary ? ' drawn from the search results' : ''}
- Question & Answer pairs (30%) - thought-provoking Q&A${searchSummary ? ' based on search findings' : ''}

${searchSummary ? '⚠️ CRITICAL: You MUST base your content on the "Recent news/searches" section above. Use the titles, snippets, and information from those search results as your primary source material. Do NOT generate generic facts - use the specific information provided in the search results.\n\n' : ''}${likedTopics ? '✨ PRIORITIZE USER INTERESTS: The user is particularly interested in: ' + likedTopics + '. Make sure to include content related to these topics whenever possible, even when working with search results.\n\n' : ''}CRITICAL REQUIREMENTS:
1. Each item MUST have:
   - Short summary (2-3 sentences) in "content"${searchSummary ? ' that references information from the search results' : ''}
   - Expanded article (4-6 paragraphs) in "expandedContent" with AT LEAST 4 interesting facts${searchSummary ? ' drawn from the search results' : ''}
   - Creative mnemonic in "mnemonic" - use acronyms, rhymes, or surprising connections
   
2. Mnemonics should be MEMORABLE:
   - Acronyms: First letters spell a word (e.g., "HOMES" for Great Lakes)
   - Rhymes: Catchy phrases (e.g., "In 1492, Columbus sailed the ocean blue")
   - Connections: Link to pop culture, celebrities, or surprising parallels
   
3. Expanded content should:
   - Include specific numbers, dates, and measurements${searchSummary ? ' from the search results' : ''}
   - Feature surprising comparisons or contrasts
   - Cite historical context or modern relevance
   - Use vivid, memorable details

4. Connect to user's interests when possible
5. Avoid disliked topics completely
6. Include specific topics/keywords for image search${searchSummary ? '\n7. ⚠️ Base ALL content on the search results provided - do NOT make up generic facts' : ''}

Generate exactly ${count} items. Return valid JSON.`;

    // Define feed item tool for structured output
    // Note: Tool generates ALL items in a single call (returns array)
    const feedItemTool = {
        type: 'function',
        function: {
            name: 'generate_feed_items',
            description: `Generate exactly ${count} educational feed items. Return an array of all items.`,
            parameters: {
                type: 'object',
                properties: {
                    items: {
                        type: 'array',
                        description: `Array of exactly ${count} feed items`,
                        items: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['did-you-know', 'question-answer'],
                                    description: 'Type of feed item'
                                },
                                title: {
                                    type: 'string',
                                    description: 'Brief headline (max 80 characters)'
                                },
                                content: {
                                    type: 'string',
                                    description: 'Engaging 2-3 sentence summary for preview'
                                },
                                expandedContent: {
                                    type: 'string',
                                    description: '4-6 paragraphs with AT LEAST 4 fascinating facts. Include specific details, numbers, and memorable comparisons.'
                                },
                                mnemonic: {
                                    type: 'string',
                                    description: 'Creative memory aid - acronym, rhyme, or surprising connection'
                                },
                                topics: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Array of topic keywords'
                                },
                                imageSearchTerms: {
                                    type: 'string',
                                    description: 'Specific search query for finding relevant images'
                                }
                            },
                            required: ['type', 'title', 'content', 'expandedContent', 'mnemonic', 'topics', 'imageSearchTerms']
                        },
                        minItems: count,
                        maxItems: count
                    }
                },
                required: ['items']
            }
        }
    };

    eventCallback('status', { message: 'Generating feed items...' });
    
    // Build model rotation sequence using intelligent selector
    const estimatedTokens = estimateTokenRequirements(
        [{ role: 'user', content: systemPrompt }],
        true // tools needed for structured output
    );
    
    // providerPool is already in the correct array format
    const uiProviders = providers.map(p => ({
        type: p.type,
        apiKey: p.apiKey,
        enabled: true
    })).filter(p => p.type && p.apiKey);
    
    console.log(`🔍 Feed: Using ${uiProviders.length} providers for model selection`);
    
    const modelSequence = buildModelRotationSequence(uiProviders, {
        needsTools: true, // Prefer tool support for structured output
        needsVision: false,
        estimatedTokens,
        optimization: 'quality'
    });
    
    console.log(`🔍 Feed: Model sequence has ${modelSequence.length} models`);
    
    if (modelSequence.length === 0) {
        throw new Error('No available models for feed generation');
    }
    
    // Generate ALL items in a single LLM call, then stream results as we extract them
    let response = null;
    let lastError = null;
    let selectedModel = null;
    
    for (let modelIndex = 0; modelIndex < modelSequence.length; modelIndex++) {
        selectedModel = modelSequence[modelIndex];
        console.log(`🎯 Feed: Trying model ${modelIndex + 1}/${modelSequence.length}: ${selectedModel.model}`);
        
        // Check provider capabilities
        const capabilities = getStructuredOutputCapabilities(selectedModel.model);
        console.log(`🎯 Feed: Provider capabilities:`, capabilities);
        
        try {
            // Layer 1: Use tool definitions (preferred - LLM can make multiple tool calls)
            if (capabilities.supportsTools) {
                console.log(`🎯 Using tool definitions for structured output (${count} items)`);
                response = await llmResponsesWithTools({
                    model: selectedModel.model,
                    input: [{ role: 'user', content: systemPrompt }],
                    tools: [feedItemTool],
                    // Note: Don't force tool_choice - let LLM decide how many times to call the tool
                    options: {
                        apiKey: selectedModel.apiKey,
                        temperature: 0.8,
                        maxTokens: 4096,
                        stream: false
                    }
                });
                
                console.log(`✅ Feed: Successfully generated with ${selectedModel.model}`);
                break;
            }
            
            // Layer 2: Use JSON mode (if tools not available but JSON mode is)
            else if (capabilities.supportsJsonMode) {
                console.log(`🎯 Using JSON mode for structured output (${count} items)`);
                response = await llmResponsesWithTools({
                    model: selectedModel.model,
                    input: [{ role: 'user', content: systemPrompt }],
                    tools: [],
                    options: {
                        apiKey: selectedModel.apiKey,
                        temperature: 0.8,
                        maxTokens: 4096,
                        stream: false,
                        response_format: { type: 'json_object' }
                    }
                });
                
                console.log(`✅ Feed: Successfully generated with ${selectedModel.model}`);
                break;
            }
            
            // Layer 3: Plain text with prompt (last resort)
            else {
                console.log(`🎯 Using plain text with prompt (${count} items)`);
                response = await llmResponsesWithTools({
                    model: selectedModel.model,
                    input: [{ role: 'user', content: systemPrompt }],
                    tools: [],
                    options: {
                        apiKey: selectedModel.apiKey,
                        temperature: 0.8,
                        maxTokens: 4096,
                        stream: false
                    }
                });
                
                console.log(`✅ Feed: Successfully generated with ${selectedModel.model}`);
                break;
            }
            
        } catch (error) {
            lastError = error;
            const isRateLimitError = error.message?.includes('429') || 
                                    error.message?.includes('rate limit');
            const isDecommissionedError = error.message?.includes('decommissioned') ||
                                         error.message?.includes('400');
            
            console.error(`❌ Feed: Model ${selectedModel.model} failed:`, error.message?.substring(0, 200));
            
            if (modelIndex < modelSequence.length - 1) {
                if (isRateLimitError) {
                    console.log(`⏭️ Feed: Rate limit hit, trying next model...`);
                } else if (isDecommissionedError) {
                    console.log(`⏭️ Feed: Model decommissioned, trying next model...`);
                } else {
                    console.log(`⏭️ Feed: Error occurred, trying next model...`);
                }
                eventCallback('status', { 
                    message: `Model ${selectedModel.model.split(':')[1]} unavailable, trying alternative...` 
                });
                continue;
            }
        }
    }
    
    if (!response) {
        console.error(`❌ Feed: All ${modelSequence.length} models failed. Last error:`, lastError?.message);
        throw new Error(`All models failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }
    
    // Extract items from response and stream them as we find complete ones
    const items = [];
    let itemsData = [];
    
    // Try to extract from tool calls first (best case - structured output)
    // Note: normalizeFromChat returns tool calls in response.output, not response.tool_calls
    const toolCalls = response.output || response.tool_calls || [];
    if (toolCalls && toolCalls.length > 0) {
        console.log(`🎯 Feed: Found ${toolCalls.length} tool call(s)`);
        
        for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i];
            // Handle normalized format (name, arguments) and raw format (function.name, function.arguments)
            const toolName = toolCall.name || toolCall.function?.name;
            const toolArgs = toolCall.arguments || toolCall.function?.arguments;
            
            if (toolName === 'generate_feed_items') {
                try {
                    const parsedArgs = typeof toolArgs === 'string'
                        ? JSON.parse(toolArgs)
                        : toolArgs;
                    
                    // Extract items array from tool call arguments
                    const itemsArray = parsedArgs.items || [];
                    console.log(`✅ Extracted ${itemsArray.length} items from tool call`);
                    
                    // Process and stream each item
                    for (let j = 0; j < itemsArray.length; j++) {
                        const itemData = itemsArray[j];
                        itemsData.push(itemData);
                        
                        // Stream this item immediately
                        const processedItem = {
                            id: `feed-${Date.now()}-${j}`,
                            type: itemData.type || 'did-you-know',
                            title: itemData.title || `Fact ${j + 1}`,
                            content: itemData.content || '',
                            expandedContent: itemData.expandedContent || '',
                            mnemonic: itemData.mnemonic || '',
                            topics: itemData.topics || [],
                            searchTerms: searchTerms,
                            imageSearchTerms: itemData.imageSearchTerms || '',
                            sources: searchResults.map(r => r.url).slice(0, 3),
                            searchResults: searchResults
                        };
                        
                        items.push(processedItem);
                        
                        // Emit incremental progress event
                        eventCallback('item_generated', { 
                            item: processedItem,
                            progress: { current: j + 1, total: itemsArray.length }
                        });
                    }
                } catch (parseError) {
                    console.warn(`⚠️ Failed to parse tool call ${i + 1}:`, parseError.message);
                }
            }
        }
    }
    
    // If no tool calls or not enough items, try to parse JSON response
    if (itemsData.length === 0) {
        console.log('🎯 Feed: No tool calls found, trying JSON parsing');
        const content = response.text || response.content || '';
        
        console.log('🔍 Feed: Response content preview:', content.substring(0, 500));
        console.log('🔍 Feed: Response structure:', {
            hasText: !!response.text,
            hasContent: !!response.content,
            hasOutput: !!response.output,
            hasToolCalls: !!response.tool_calls,
            outputLength: response.output?.length || 0,
            toolCallsLength: response.tool_calls?.length || 0,
            keys: Object.keys(response)
        });
        
        // Try robust JSON parsing to get items array
        const parsedData = tryParseJson(content, { logAttempts: true });
        
        if (parsedData) {
            console.log('🔍 Feed: Parsed data structure:', {
                type: typeof parsedData,
                isArray: Array.isArray(parsedData),
                hasItems: !!parsedData.items,
                keys: typeof parsedData === 'object' ? Object.keys(parsedData) : []
            });
            
            if (parsedData.items && Array.isArray(parsedData.items)) {
                itemsData = parsedData.items;
                console.log(`✅ Parsed ${itemsData.length} items from JSON response`);
            } else if (Array.isArray(parsedData)) {
                itemsData = parsedData;
                console.log(`✅ Parsed ${itemsData.length} items from JSON array`);
            } else if (parsedData.type || parsedData.title || parsedData.content) {
                // Single item returned without wrapper
                itemsData = [parsedData];
                console.log(`✅ Parsed 1 item from JSON response`);
            } else {
                console.error('❌ Parsed data but no recognizable structure:', parsedData);
                throw new Error(`Failed to extract items from parsed data. Structure: ${JSON.stringify(Object.keys(parsedData))}`);
            }
            
            // Stream each parsed item
            for (let i = 0; i < itemsData.length; i++) {
                const itemData = itemsData[i];
                const processedItem = {
                    id: `feed-${Date.now()}-${i}`,
                    type: itemData.type || 'did-you-know',
                    title: itemData.title || `Fact ${i + 1}`,
                    content: itemData.content || '',
                    expandedContent: itemData.expandedContent || '',
                    mnemonic: itemData.mnemonic || '',
                    topics: itemData.topics || [],
                    searchTerms: searchTerms,
                    imageSearchTerms: itemData.imageSearchTerms || '',
                    sources: searchResults.map(r => r.url).slice(0, 3),
                    searchResults: searchResults
                };
                
                items.push(processedItem);
                
                // Don't emit here - wait for images to be added
                // Items will be emitted one-by-one as images complete (line ~779)
            }
        } else {
            console.error('❌ Feed: Failed to parse response content');
            console.error('Response content length:', content.length);
            console.error('Response content sample:', content.substring(0, 1000));
            throw new Error('Failed to parse any items from LLM response. Check logs for response content.');
        }
    }
    
    console.log(`✅ Feed: Extracted ${items.length} items total`);
    
    if (items.length === 0) {
        throw new Error('No items generated from LLM response');
    }
    
    // Fetch images for feed items (in parallel) and emit each item as it completes
    eventCallback('status', { message: 'Fetching images...' });
    
    // Determine which items should get AI-generated images (30% - 3 out of 10)
    const aiImageIndices = new Set();
    const aiImageCount = Math.max(1, Math.ceil(items.length * 0.3)); // 30% of items
    
    if (items.length > 0) {
        // Distribute AI images evenly across the feed
        // For 10 items: positions 0, 4, 8 (first, middle, near end)
        const spacing = Math.floor(items.length / aiImageCount);
        for (let i = 0; i < aiImageCount && i * spacing < items.length; i++) {
            const index = i === 0 ? 0 : Math.min(i * spacing, items.length - 1);
            aiImageIndices.add(index);
        }
        console.log(`🎨 Will generate ${aiImageIndices.size} AI images at positions: ${Array.from(aiImageIndices).join(', ')}`);
    }
    
    // Artistic styles for AI-generated images (variety to stand out from photos)
    const artisticStyles = [
        'watercolor painting style, soft edges, artistic',
        'digital illustration, vibrant colors, modern art style',
        'oil painting style, impressionist, rich textures',
        'minimalist geometric art, bold shapes, abstract',
        'vintage poster art, retro aesthetic, stylized',
        'paper cut art style, layered, dimensional',
        'ink wash painting, monochromatic, flowing lines',
        'pop art style, bright colors, bold outlines'
    ];
    
    const itemsWithImages = [];
    let completedCount = 0;
    let totalImageGenCost = 0; // Track AI image generation costs
    
    const imagePromises = items.map(async (item, idx) => {
        // PRIORITY 0: AI-generated images for selected items (if image generation available)
        if (aiImageIndices.has(idx)) {
            try {
                // Load PROVIDER_CATALOG and check availability
                const fs = require('fs');
                const path = require('path');
                const { checkMultipleProviders } = require('../utils/provider-health');
                
                const catalogPath = path.join(__dirname, '..', '..', 'PROVIDER_CATALOG.json');
                const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
                
                if (catalog.image && catalog.image.providers) {
                    const { generateImageDirect } = require('./generate-image');
                    
                    // Build creative prompt from feed item
                    const styleIndex = idx % artisticStyles.length;
                    const style = artisticStyles[styleIndex];
                    const basePrompt = item.title.substring(0, 100);
                    const topics = item.topics.slice(0, 3).join(', ');
                    const aiPrompt = `${basePrompt}. ${topics}. ${style}`;
                    
                    console.log(`🎨 Generating AI image ${Array.from(aiImageIndices).indexOf(idx) + 1}/${aiImageIndices.size} for: "${item.title.substring(0, 50)}..."`);
                    console.log(`🎨 Style: ${style.substring(0, 60)}...`);
                    
                    eventCallback('status', { 
                        message: `Generating AI image ${Array.from(aiImageIndices).indexOf(idx) + 1}/${aiImageIndices.size}...` 
                    });
                    
                    // Use load-balanced model selection for 'fast' quality tier
                    const qualityTier = 'fast'; // Lowest cost
                    const matchingModels = [];
                    
                    // Find all models matching the quality tier
                    for (const [providerName, providerData] of Object.entries(catalog.image.providers)) {
                        for (const [modelKey, modelData] of Object.entries(providerData.models || {})) {
                            if (modelData.qualityTier === qualityTier && modelData.available !== false) {
                                matchingModels.push({
                                    provider: providerName,
                                    modelKey,
                                    model: modelData.id || modelKey,
                                    qualityTier: modelData.qualityTier,
                                    pricing: modelData.pricing,
                                    fallbackPriority: modelData.fallbackPriority || 99
                                });
                            }
                        }
                    }
                    
                    if (matchingModels.length === 0) {
                        console.warn(`⚠️ No 'fast' tier image models available, skipping AI generation`);
                        // Fall through to web search
                    } else {
                        // Check provider availability
                        const uniqueProviders = [...new Set(matchingModels.map(m => m.provider))];
                        const availabilityResults = await checkMultipleProviders(uniqueProviders);
                        
                        // Filter to available providers
                        const availableModels = matchingModels.filter(m => {
                            const availability = availabilityResults[m.provider];
                            return availability && availability.available;
                        });
                        
                        if (availableModels.length === 0) {
                            console.warn(`⚠️ No available image providers, skipping AI generation`);
                            // Fall through to web search
                        } else {
                            // Sort by pricing (lowest cost first), then fallback priority
                            availableModels.sort((a, b) => {
                                const costA = parseFloat(a.pricing?.perImage || '999');
                                const costB = parseFloat(b.pricing?.perImage || '999');
                                if (costA !== costB) return costA - costB;
                                return a.fallbackPriority - b.fallbackPriority;
                            });
                            const selectedModel = availableModels[0];
                            const costPerImage = parseFloat(selectedModel.pricing?.perImage || '0');
                            
                            console.log(`🎯 Selected cheapest image model: ${selectedModel.provider}/${selectedModel.model} ($${costPerImage.toFixed(6)}/image, priority: ${selectedModel.fallbackPriority})`);
                            
                            // Generate image with selected model (includes automatic fallback)
                            const userEmailForImages = generationContext.userEmail || generationContext.email || generationContext.user;
                            const imageResult = await generateImageDirect({
                                prompt: aiPrompt,
                                provider: selectedModel.provider,
                                model: selectedModel.model,
                                modelKey: selectedModel.modelKey,
                                size: '800x600', // 4:3 aspect ratio for news feed thumbnails
                                quality: qualityTier,
                                style: 'natural',
                                context: {
                                    userEmail: userEmailForImages,
                                    email: userEmailForImages,
                                    user: userEmailForImages,
                                    providerPool: generationContext.providerPool || providers,
                                    requestId: generationContext.requestId,
                                    awsRequestId: generationContext.awsRequestId,
                                    memoryLimitInMB: generationContext.memoryLimitInMB
                                }
                            });
                            
                            if (imageResult.success && imageResult.base64) {
                                const imageUrl = `data:image/png;base64,${imageResult.base64}`;
                                const imageCost = imageResult.cost || 0;
                                totalImageGenCost += imageCost;
                                
                                console.log(`✅ Generated AI image for: "${item.title.substring(0, 50)}..." (cost: $${imageCost.toFixed(6)}, fallback: ${imageResult.fallbackUsed || false})`);
                                
                                return {
                                    ...item,
                                    image: imageUrl,
                                    imageThumb: imageUrl,
                                    imageSource: 'ai_generated',
                                    imageProvider: imageResult.provider,
                                    imageModel: imageResult.model,
                                    imageStyle: style,
                                    imageCost: imageCost,
                                    imageFallbackUsed: imageResult.fallbackUsed || false,
                                    imageAttribution: `AI-generated image (${style.split(',')[0]})`,
                                    imageAttributionHtml: `AI-generated image · <span style="opacity: 0.7">${style.split(',')[0]}</span>`
                                };
                            } else {
                                console.warn(`⚠️ AI image generation failed for item ${idx}: ${imageResult.error || 'Unknown error'}`);
                                // Fall through to web search
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`AI image generation failed for "${item.title}":`, error.message);
                // Fall through to web search
            }
        }
        
        // PRIORITY 1: Try to extract images from web search results
        if (item.searchResults && item.searchResults.length > 0) {
            try {
                const imagesFromSearch = extractImagesFromSearchResults(item.searchResults);
                
                if (imagesFromSearch.length > 0) {
                    const webImage = imagesFromSearch[0];
                    console.log(`✅ Using image from web search for: "${item.title}"`);
                    
                return {
                    ...item,
                    image: webImage.url,
                    imageThumb: webImage.thumb || webImage.url,
                    imageSource: 'web_search',
                    imageAttribution: `From search result: ${webImage.sourceUrl || 'web'}`,
                    imageAttributionHtml: webImage.sourceUrl 
                        ? `Image from <a href="${webImage.sourceUrl}" target="_blank" rel="noopener noreferrer">search result</a>`
                        : 'Image from web search'
                };
            }
        } catch (error) {
            console.error(`Failed to extract images from search for "${item.title}":`, error);
            // Fall through to API search
        }
    }
    
    // PRIORITY 2: Fallback to image search APIs if no web search images
    if (!item.imageSearchTerms) {
        return { ...item, image: null, imageAttribution: null };
    }
    
    try {
        const imageData = await searchImage(item.imageSearchTerms, { provider: 'auto' });
        
        if (imageData) {
            // Track Unsplash download if from Unsplash
            if (imageData.source === 'unsplash' && imageData.downloadUrl) {
                // Fire and forget - don't wait for tracking to complete
                trackUnsplashDownload(imageData.downloadUrl).catch(err => 
                    console.error('Failed to track Unsplash download:', err)
                );
            }
            
            console.log(`✅ Using ${imageData.source} API image for: "${item.title}"`);
            
            return {
                ...item,
                image: imageData.url,
                imageThumb: imageData.thumb,
                imageSource: imageData.source,
                imagePhotographer: imageData.photographer,
                imagePhotographerUrl: imageData.photographerUrl,
                imageAttribution: imageData.attribution,
                imageAttributionHtml: imageData.attributionHtml
            };
        }
    } catch (error) {
        console.error(`Image API search failed for "${item.imageSearchTerms}":`, error);
    }
    
    return { ...item, image: null, imageAttribution: null };
}).map(async (itemPromise, idx) => {
    // Wait for this item to complete
    const completedItem = await itemPromise;
    completedCount++;
    
    // Emit item_generated event immediately as each item completes
    eventCallback('item_generated', { item: completedItem });
    eventCallback('status', { message: `Completed ${completedCount} of ${items.length} items...` });
    
    return completedItem;
});

const completedItems = await Promise.all(imagePromises);
    
eventCallback('status', { 
    message: `Generated ${items.length} items`
});

// Log AI image generation summary
if (totalImageGenCost > 0) {
    console.log(`🎨 Total AI image generation cost: $${totalImageGenCost.toFixed(6)} for ${aiImageIndices.size} images`);
    eventCallback('status', { 
        message: `Generated ${aiImageIndices.size} AI images (cost: $${totalImageGenCost.toFixed(6)})`
    });
}

return { 
    items: completedItems, // Return completed items with images
    searchResults,
    usage: response.usage,
    model: response.model,
    provider: response.provider,
    imageGenCost: totalImageGenCost // Include image generation costs
};
}

/**
 * Handler for the feed generation endpoint (with SSE streaming)
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Lambda response stream
 * @returns {Promise<void>} Streams response via responseStream
 */
async function handler(event, responseStream, context) {
    const startTime = Date.now();
    const requestId = context?.requestId || 'unknown';
    
    // Set up SSE streaming response
    const metadata = {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    };
    
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
    
    // Create SSE writer
    const { createSSEStreamAdapter } = require('../streaming/sse-writer');
    const sseWriter = createSSEStreamAdapter(responseStream);
    
    let userEmail = 'unknown';
    
    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        
        const verifiedUser = await authenticateRequest(authHeader);
        if (!verifiedUser || !verifiedUser.email) {
            sseWriter.writeEvent('error', {
                error: 'Authentication required'
            });
            responseStream.end();
            return;
        }
        
        userEmail = verifiedUser.email;
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const swagContent = body.swagContent || [];
        const searchTerms = body.searchTerms || [];
        const count = body.count || 5; // Reduced from 10 to 5 for higher quality with expanded content
        const preferences = body.preferences || {
            searchTerms: [],
            likedTopics: [],
            dislikedTopics: [],
            lastGenerated: new Date().toISOString()
        };
        const userProviders = body.providers || {};
        
        // Personalization: Use feed recommender if interactions provided
        const interactions = body.interactions || [];
        const userPreferences = body.userPreferences || null;
        let personalizedSearchTerms = searchTerms;
        
        // PRIORITY: User-provided search terms take precedence over personalization
        if (searchTerms && searchTerms.length > 0) {
            console.log(`👤 Using ${searchTerms.length} user-provided search terms:`, searchTerms);
            personalizedSearchTerms = searchTerms;
        } else if (userPreferences && interactions.length > 0) {
            console.log(`🎯 Personalizing feed using ${interactions.length} interactions, ${userPreferences.quizEngagementCount} quiz engagements`);
            
            try {
                // Generate personalized search terms with trending topics fallback
                const trendingTopics = ['AI', 'climate', 'space', 'health', 'technology'];
                personalizedSearchTerms = feedRecommender.generateSearchTerms(
                    userPreferences,
                    trendingTopics
                );
                
                // Filter out disliked topics
                personalizedSearchTerms = feedRecommender.filterSearchTerms(
                    personalizedSearchTerms,
                    userPreferences.avoidTopics
                );
                
                console.log(`✨ Generated ${personalizedSearchTerms.length} personalized search terms:`, personalizedSearchTerms.slice(0, 5));
                
                // Send personalization event
                sseWriter.writeEvent('personalization', {
                    keywordsUsed: userPreferences.learnedKeywords.length,
                    topicsUsed: userPreferences.learnedTopics.length,
                    quizEngagementCount: userPreferences.quizEngagementCount,
                    searchTermsGenerated: personalizedSearchTerms.length
                });
            } catch (error) {
                console.error('Personalization failed, using default search terms:', error);
                // Fallback to provided search terms
            }
        } else {
            console.log(`📋 No search terms provided and no personalization data available`);
        }
        
        console.log(`📰 Feed generation request from ${userEmail}:`, {
            swagItemsCount: swagContent.length,
            searchTermsCount: personalizedSearchTerms.length,
            itemsRequested: count,
            personalized: interactions.length > 0
        });
        
        // Validate inputs
        if (count < 1 || count > 50) {
            sseWriter.writeEvent('error', {
                error: 'Count must be between 1 and 50'
            });
            responseStream.end();
            return;
        }
        
        // Build provider pool
        const providerPool = buildProviderPool(userProviders, true);
        if (providerPool.length === 0) {
            sseWriter.writeEvent('error', {
                error: 'No LLM providers available'
            });
            responseStream.end();
            return;
        }
        
        // Generate feed items (pass providerPool directly as it's already in correct format)
        const result = await generateFeedItems(
            swagContent,
            personalizedSearchTerms,
            count,
            preferences,
            providerPool, // Pass provider array directly
            (eventType, eventData) => {
                sseWriter.writeEvent(eventType, eventData);
            },
            {
                userEmail,
                accessToken: verifiedUser.accessToken,
                providerPool,
                requestId,
                awsRequestId: context?.awsRequestId,
                memoryLimitInMB: context?.memoryLimitInMB
            }
        );
        
        // Save generated feed items to Google Sheets (backend storage)
        const projectId = extractProjectId(event);
        try {
            sseWriter.writeEvent('status', { message: 'Saving feed items...' });
            
            // Prepare feed items for storage
            const feedItemsToSave = result.items.map(item => ({
                title: item.title,
                content: item.content,
                url: item.sources?.[0] || '',
                source: 'ai_generated',
                topics: item.topics
            }));
            
            // NOTE: Google Sheets saving is now handled by frontend FeedContext
            // after batch image fetching completes. This eliminates OAuth token
            // expiration issues and provides better error handling.
            // The frontend calls feedSyncService.fullSync() which uses the
            // user's fresh access token from localStorage.
            console.log(`✅ Generated ${feedItemsToSave.length} feed items (sync deferred to frontend)`);
            sseWriter.writeEvent('status', { message: `Generated ${feedItemsToSave.length} items` });
        } catch (saveError) {
            console.error('Failed to generate feed items:', saveError);
            sseWriter.writeEvent('error', { 
                message: 'Feed generation failed',
                error: saveError.message 
            });
        }
        
        // Items already sent via item_generated events in generateFeedItems
        // No need to send them again here
        
        // Calculate cost for the LLM call
        const usage = result.usage || {};
        console.log('📊 Usage data:', JSON.stringify(usage, null, 2));
        
        // Handle different usage field names from different providers
        const promptTokens = usage.prompt_tokens || usage.promptTokens || usage.input_tokens || 0;
        const completionTokens = usage.completion_tokens || usage.completionTokens || usage.output_tokens || 0;
        const totalTokens = usage.total_tokens || usage.totalTokens || (promptTokens + completionTokens);
        
        const modelUsed = result.model || providerPool[0]?.model || 'unknown';
        const providerUsed = result.provider || providerPool[0]?.type || 'unknown';
        
        console.log(`💰 Model: ${modelUsed}, Provider: ${providerUsed}, Tokens: ${promptTokens}+${completionTokens}=${totalTokens}`);
        
        // Determine if user provided their own key
        const isUserProvidedKey = providerPool.some(p => 
            p.type === providerUsed && p.apiKey && !p.apiKey.startsWith('sk-proj-')
        );
        
        const llmCost = calculateCost(
            modelUsed,
            promptTokens,
            completionTokens,
            null,
            isUserProvidedKey
        );
        
        // Include AI image generation costs
        const imageGenCost = result.imageGenCost || 0;
        const totalCost = llmCost + imageGenCost;
        
        console.log(`💵 Calculated cost: LLM=$${llmCost.toFixed(6)}, Images=$${imageGenCost.toFixed(6)}, Total=$${totalCost.toFixed(6)} (user key: ${isUserProvidedKey})`);
        
        // Log to Google Sheets
        try {
            await logToGoogleSheets({
                timestamp: new Date().toISOString(),
                userEmail,
                type: 'feed_generation',
                model: modelUsed,
                provider: providerUsed,
                promptTokens,
                completionTokens,
                totalTokens,
                cost: totalCost, // Include total cost with images
                requestId,
                metadata: {
                    itemsGenerated: result.items.length,
                    searchTermsCount: searchTerms.length,
                    swagItemsCount: swagContent.length,
                    llmCost: llmCost,
                    imageGenCost: imageGenCost,
                    aiImagesGenerated: imageGenCost > 0 ? 2 : 0
                }
            });
            console.log(`💰 Feed generation cost: LLM=$${llmCost.toFixed(6)}, Images=$${imageGenCost.toFixed(6)}, Total=$${totalCost.toFixed(6)}`);
        } catch (logError) {
            console.error('Failed to log feed generation:', logError);
        }
        
        // Send completion event
        sseWriter.writeEvent('complete', {
            success: true,
            itemsGenerated: result.items.length,
            duration: Date.now() - startTime,
            cost: totalCost,
            costBreakdown: {
                llm: llmCost,
                imageGeneration: imageGenCost
            }
        });
        
        console.log(`✅ Feed generation complete: ${result.items.length} items in ${Date.now() - startTime}ms, cost: $${totalCost.toFixed(6)} (LLM: $${llmCost.toFixed(6)}, Images: $${imageGenCost.toFixed(6)})`);
        
    } catch (error) {
        console.error('Feed generation error:', error);
        sseWriter.writeEvent('error', {
            error: error.message || 'Feed generation failed',
            details: error.stack
        });
    } finally {
        responseStream.end();
    }
}

/**
 * Get stored feed items for user
 * Supports multi-tenancy with X-Project-ID header
 */
async function getFeedItemsHandler(event) {
    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const verifiedUser = await authenticateRequest(authHeader);
        
        if (!verifiedUser || !verifiedUser.email) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }
        
        // Extract project ID from header
        const projectId = extractProjectId(event);
        
        // Get feed items (filtered by user and project)
        const items = await feedService.getFeedItems(
            verifiedUser.email,
            projectId,
            verifiedUser.accessToken
        );
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Project-ID'
            },
            body: JSON.stringify({
                items,
                projectId: projectId || null
            })
        };
    } catch (error) {
        console.error('Failed to get feed items:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to retrieve feed items',
                message: error.message
            })
        };
    }
}

/**
 * Save a new feed item
 * Supports multi-tenancy with X-Project-ID header
 */
async function saveFeedItemHandler(event) {
    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const verifiedUser = await authenticateRequest(authHeader);
        
        if (!verifiedUser || !verifiedUser.email) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }
        
        // Extract project ID from header
        const projectId = extractProjectId(event);
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        
        // Insert feed item
        const createdItem = await feedService.insertFeedItem(
            body,
            verifiedUser.email,
            projectId,
            verifiedUser.accessToken
        );
        
        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Project-ID'
            },
            body: JSON.stringify(createdItem)
        };
    } catch (error) {
        console.error('Failed to save feed item:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to save feed item',
                message: error.message
            })
        };
    }
}

/**
 * Vote on a feed item (upvote/downvote)
 * Supports multi-tenancy with X-Project-ID header
 */
async function voteFeedItemHandler(event) {
    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const verifiedUser = await authenticateRequest(authHeader);
        
        if (!verifiedUser || !verifiedUser.email) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }
        
        // Extract project ID from header
        const projectId = extractProjectId(event);
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const itemId = body.itemId;
        const vote = body.vote; // 'up', 'down', or '' to clear
        
        if (!itemId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'itemId is required' })
            };
        }
        
        // Vote on item
        const updatedItem = await feedService.voteFeedItem(
            itemId,
            vote,
            verifiedUser.email,
            projectId,
            verifiedUser.accessToken
        );
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Project-ID'
            },
            body: JSON.stringify(updatedItem)
        };
    } catch (error) {
        console.error('Failed to vote on feed item:', error);
        
        const statusCode = error.message.includes('not found') ? 404 : 500;
        
        return {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to vote on feed item',
                message: error.message
            })
        };
    }
}

/**
 * Delete a feed item
 * Supports multi-tenancy with X-Project-ID header
 */
async function deleteFeedItemHandler(event) {
    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const verifiedUser = await authenticateRequest(authHeader);
        
        if (!verifiedUser || !verifiedUser.email) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }
        
        // Extract project ID from header
        const projectId = extractProjectId(event);
        
        // Extract item ID from path or query
        const itemId = event.pathParameters?.id || event.queryStringParameters?.id;
        
        if (!itemId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'itemId is required' })
            };
        }
        
        // Delete item
        await feedService.deleteFeedItem(
            itemId,
            verifiedUser.email,
            projectId,
            verifiedUser.accessToken
        );
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Project-ID'
            },
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        console.error('Failed to delete feed item:', error);
        
        const statusCode = error.message.includes('not found') ? 404 : 500;
        
        return {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to delete feed item',
                message: error.message
            })
        };
    }
}

module.exports = {
    handler,
    generateFeedItems,
    getFeedItemsHandler,
    saveFeedItemHandler,
    voteFeedItemHandler,
    deleteFeedItemHandler
};
