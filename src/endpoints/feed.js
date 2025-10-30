/**
 * Feed Endpoint
 * Generates personalized feed items using LLM analysis of user's Swag content
 * combined with web search results
 */

const { llmResponsesWithTools } = require('../llm_tools_adapter');
const { performDuckDuckGoSearch } = require('../tools/search_web');
const { searchImage, trackUnsplashDownload } = require('../tools/image-search');
const { authenticateRequest } = require('../auth');
const { buildProviderPool } = require('../credential-pool');
const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');
const feedRecommender = require('../services/feed-recommender');
const { buildModelRotationSequence, estimateTokenRequirements } = require('../model-selector-v2');

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
async function generateFeedItems(swagContent, searchTerms, count, preferences, providers, eventCallback) {
    // Prepare context summaries
    const swagSummary = swagContent.slice(0, 20).join('\n\n').substring(0, 2000);
    const likedTopics = preferences.likedTopics.join(', ');
    const dislikedTopics = preferences.dislikedTopics.join(', ');
    
    // Perform web searches if search terms provided
    let searchSummary = '';
    const searchResults = [];
    
    if (searchTerms && searchTerms.length > 0) {
        eventCallback('status', { message: 'Searching the web...' });
        
        for (const term of searchTerms.slice(0, 3)) { // Limit to 3 search terms
            try {
                const results = await performDuckDuckGoSearch(term, 5);
                searchResults.push(...results);
            } catch (error) {
                console.error(`Search failed for term "${term}":`, error);
            }
        }
        
        searchSummary = searchResults
            .slice(0, 10)
            .map(r => `${r.title}: ${r.snippet}`)
            .join('\n');
        
        eventCallback('search_complete', { 
            resultsCount: searchResults.length,
            terms: searchTerms
        });
    }
    
    // Build LLM prompt
    const systemPrompt = `You are a content curator generating in-depth educational content.

INPUT CONTEXT:
${swagSummary ? `User's saved content:\n${swagSummary}\n\n` : ''}
${searchSummary ? `Recent news/searches:\n${searchSummary}\n\n` : ''}
${likedTopics ? `User liked topics: ${likedTopics}\n` : ''}
${dislikedTopics ? `User disliked topics (AVOID): ${dislikedTopics}\n` : ''}

TASK: Generate ${count} high-quality educational items mixing:
- "Did You Know" facts (70%) - surprising, educational facts
- Question & Answer pairs (30%) - thought-provoking Q&A

CRITICAL REQUIREMENTS:
1. Each item MUST have:
   - Short summary (2-3 sentences) in "content"
   - Expanded article (4-6 paragraphs) in "expandedContent" with AT LEAST 4 interesting facts
   - Creative mnemonic in "mnemonic" - use acronyms, rhymes, or surprising connections
   
2. Mnemonics should be MEMORABLE:
   - Acronyms: First letters spell a word (e.g., "HOMES" for Great Lakes)
   - Rhymes: Catchy phrases (e.g., "In 1492, Columbus sailed the ocean blue")
   - Connections: Link to pop culture, celebrities, or surprising parallels
   
3. Expanded content should:
   - Include specific numbers, dates, and measurements
   - Feature surprising comparisons or contrasts
   - Cite historical context or modern relevance
   - Use vivid, memorable details

4. Connect to user's interests when possible
5. Avoid disliked topics completely
6. Include specific topics/keywords for image search

OUTPUT FORMAT (JSON):
{
  "items": [
    {
      "type": "did-you-know",
      "title": "Brief headline (max 80 chars)",
      "content": "Engaging 2-3 sentence summary for preview",
      "expandedContent": "4-6 paragraphs with AT LEAST 4 fascinating facts. Include specific details, numbers, and memorable comparisons. Make it educational and surprising.",
      "mnemonic": "Creative memory aid - acronym, rhyme, or surprising connection to help remember the key fact",
      "topics": ["topic1", "topic2", "topic3"],
      "imageSearchTerms": "specific search query for image"
    }
  ]
}

IMPORTANT: Since generating detailed content takes more tokens, you're generating ${count} items.
Focus on QUALITY over quantity. Each item should be fascinating and memorable.

Generate exactly ${count} items. Return ONLY valid JSON.`;

    eventCallback('status', { message: 'Generating feed items...' });
    
    // Build model rotation sequence using intelligent selector
    const estimatedTokens = estimateTokenRequirements(
        [{ role: 'user', content: systemPrompt }],
        false // no tools needed
    );
    
    // providerPool is already in the correct array format
    // Each item has: {type, apiKey, model, endpoint, ...}
    const uiProviders = providers.map(p => ({
        type: p.type,
        apiKey: p.apiKey,
        enabled: true
    })).filter(p => p.type && p.apiKey);
    
    console.log(`🔍 Feed: Using ${uiProviders.length} providers for model selection (${providers.length} total in pool)`);
    
    const modelSequence = buildModelRotationSequence(uiProviders, {
        needsTools: false,
        needsVision: false,
        estimatedTokens,
        optimization: 'quality' // Use best models for feed generation
    });
    
    console.log(`🔍 Feed: Model sequence has ${modelSequence.length} models`);
    
    if (modelSequence.length === 0) {
        throw new Error('No available models for feed generation');
    }
    
    // Try models in sequence until one succeeds (automatic failover)
    let response = null;
    let lastError = null;
    
    for (let i = 0; i < modelSequence.length; i++) {
        const selectedModel = modelSequence[i];
        console.log(`🎯 Feed: Trying model ${i + 1}/${modelSequence.length}: ${selectedModel.model}`);
        
        try {
            // Call LLM with new signature
            response = await llmResponsesWithTools({
                model: selectedModel.model,
                input: [
                    { role: 'user', content: systemPrompt }
                ],
                tools: [], // No tools needed for feed generation
                options: {
                    apiKey: selectedModel.apiKey,
                    temperature: 0.8,
                    maxTokens: 4096,
                    stream: false
                }
            });
            
            // Success! Break out of retry loop
            console.log(`✅ Feed: Successfully generated with ${selectedModel.model}`);
            break;
            
        } catch (error) {
            lastError = error;
            const isRateLimitError = error.message?.includes('429') || 
                                    error.message?.includes('rate limit') ||
                                    error.message?.includes('quota exceeded');
            const isDecommissionedError = error.message?.includes('decommissioned') ||
                                         error.message?.includes('400');
            
            console.error(`❌ Feed: Model ${selectedModel.model} failed:`, error.message?.substring(0, 200));
            
            // If not the last model, try next one
            if (i < modelSequence.length - 1) {
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
    
    // If all models failed, throw the last error
    if (!response) {
        console.error(`❌ Feed: All ${modelSequence.length} models failed. Last error:`, lastError?.message);
        throw new Error(`All models failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }
    
    // Parse response
    let parsedData;
    try {
        // Extract JSON from response
        const content = response.content || response.message?.content || '';
        
        // Try to extract JSON from markdown code blocks first
        let jsonText = null;
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
            jsonText = codeBlockMatch[1];
        } else {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }
        }
        
        if (!jsonText) {
            console.error('No JSON found in response. Content length:', content.length);
            console.error('Content preview:', content.substring(0, 500));
            throw new Error('No JSON found in response');
        }
        
        parsedData = JSON.parse(jsonText);
    } catch (error) {
        console.error('Failed to parse LLM response:', error);
        console.error('Response type:', typeof response);
        console.error('Response keys:', Object.keys(response));
        throw new Error('Failed to parse LLM response');
    }
    
    if (!parsedData.items || !Array.isArray(parsedData.items)) {
        throw new Error('Invalid response format: missing items array');
    }
    
    // Process items and add metadata including search results
    const items = parsedData.items.map((itemData, idx) => ({
        id: `feed-${Date.now()}-${idx}`, // Add unique ID
        type: itemData.type || 'did-you-know',
        title: itemData.title || `Fact ${idx + 1}`,
        content: itemData.content || '',
        expandedContent: itemData.expandedContent || '', // Detailed article
        mnemonic: itemData.mnemonic || '', // Memory aid
        topics: itemData.topics || [],
        searchTerms: searchTerms, // Pass original search terms
        imageSearchTerms: itemData.imageSearchTerms || '',
        sources: searchResults.map(r => r.url).slice(0, 3),
        searchResults: searchResults // Pass search results for image extraction
    }));
    
    // Fetch images for feed items (in parallel) and emit each item as it completes
    eventCallback('status', { message: 'Fetching images...' });
    
    const itemsWithImages = [];
    let completedCount = 0;
    
    const imagePromises = items.map(async (item, idx) => {
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

await Promise.all(imagePromises);
    
eventCallback('status', { 
    message: `Generated ${items.length} items`
});

return { 
    items, // Items already emitted via item_generated events
    searchResults,
    usage: response.usage,
    model: response.model,
    provider: response.provider
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
        
        if (userPreferences && interactions.length > 0) {
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
            console.log(`📋 Using ${searchTerms.length} default search terms (no personalization data)`);
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
            }
        );
        
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
        
        const cost = calculateCost(
            modelUsed,
            promptTokens,
            completionTokens,
            null,
            isUserProvidedKey
        );
        
        console.log(`💵 Calculated cost: $${cost.toFixed(6)} (user key: ${isUserProvidedKey})`);
        
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
                cost,
                requestId,
                metadata: {
                    itemsGenerated: result.items.length,
                    searchTermsCount: searchTerms.length,
                    swagItemsCount: swagContent.length
                }
            });
            console.log(`💰 Feed generation cost: $${cost.toFixed(6)} for ${promptTokens + completionTokens} tokens`);
        } catch (logError) {
            console.error('Failed to log feed generation:', logError);
        }
        
        // Send completion event
        sseWriter.writeEvent('complete', {
            success: true,
            itemsGenerated: result.items.length,
            duration: Date.now() - startTime,
            cost
        });
        
        console.log(`✅ Feed generation complete: ${result.items.length} items in ${Date.now() - startTime}ms, cost: $${cost.toFixed(6)}`);
        
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

module.exports = {
    handler,
    generateFeedItems
};
