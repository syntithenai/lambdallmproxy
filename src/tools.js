/**
 * Tools registry and dispatcher for LLM tool-calling
 * Provides OpenAI-compatible function tool schemas and implementations
 */

const { DuckDuckGoSearcher } = require('./search');
const { SimpleHTMLParser } = require('./html-parser');
const { extractContent } = require('./html-content-extractor');
const { llmResponsesWithTools } = require('./llm_tools_adapter');
const { transcribeUrl } = require('./tools/transcribe');
const { tavilySearch, tavilyExtract } = require('./tavily-search');
const vm = require('vm');

// Simple token estimation (rough approximation: 4 chars ≈ 1 token)
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Compress search results into minimal markdown format for LLM consumption
 * Format: Search query as H1, Links as H2, plain text content, media gallery at bottom
 * @param {string} query - The search query
 * @param {Array} results - Array of search result objects
 * @returns {string} Compressed markdown string
 */
function compressSearchResultsForLLM(query, results) {
  if (!results || results.length === 0) return '';
  
  const sections = [];
  
  // H1: Search query
  sections.push(`# ${query}\n`);
  
  // Process each result
  for (const result of results) {
    if (!result) continue;
    
    // H2: Link/URL as heading
    if (result.url) {
      const title = result.title || result.url;
      sections.push(`## [${title}](${result.url})`);
    }
    
    // Plain text content (strip all formatting)
    if (result.content) {
      const plainText = result.content
        .replace(/[#*_~`\[\]]/g, '') // Remove markdown symbols
        .replace(/\n+/g, ' ') // Collapse newlines to spaces
        .trim();
      sections.push(plainText + '\n');
    }
  }
  
  // Collect all URLs for explicit listing at the end
  const allUrls = [];
  for (const result of results) {
    if (result.url) {
      allUrls.push({
        title: result.title || result.url,
        url: result.url
      });
    }
  }
  
  // Collect all media from all results for gallery at bottom
  const allImages = [];
  const allYoutube = [];
  const allMedia = [];
  
  for (const result of results) {
    if (result.images) allImages.push(...result.images);
    if (result.youtube) allYoutube.push(...result.youtube);
    if (result.media) allMedia.push(...result.media);
  }
  
  // Add CRITICAL URLS section at the top (before media) - THIS IS MANDATORY FOR LLM TO SEE
  if (allUrls.length > 0) {
    sections.push('\n═══════════════════════════════════════════════════════════════════════════════');
    sections.push('🚨 CRITICAL: YOU MUST COPY THESE URLS INTO YOUR RESPONSE 🚨');
    sections.push('═══════════════════════════════════════════════════════════════════════════════');
    sections.push('The following URLs MUST be included in your response as clickable markdown links:');
    sections.push('');
    for (let i = 0; i < allUrls.length; i++) {
      const { title, url } = allUrls[i];
      sections.push(`${i + 1}. [${title}](${url})`);
    }
    sections.push('');
    sections.push('❌ FORBIDDEN: Mentioning these source names without their URLs');
    sections.push('✅ REQUIRED: Copy the markdown links above into your response');
    sections.push('═══════════════════════════════════════════════════════════════════════════════\n');
  }
  
  // Add media gallery section at bottom
  if (allImages.length > 0 || allYoutube.length > 0 || allMedia.length > 0) {
    sections.push('\n---\n');
    
    // Images in gallery format (triggers UI special rendering)
    if (allImages.length > 0) {
      sections.push('**Images:**\n```gallery');
      for (const img of allImages) {
        const caption = img.caption || img.alt || img.title || 'Image';
        sections.push(`![${caption}](${img.src})`);
      }
      sections.push('```\n');
    }
    
    // YouTube videos
    if (allYoutube.length > 0) {
      sections.push('**YouTube:**\n```youtube');
      for (const yt of allYoutube) {
        sections.push(`[${yt.text || 'Video'}](${yt.href})`);
      }
      sections.push('```\n');
    }
    
    // Other media
    if (allMedia.length > 0) {
      sections.push('**Media:**\n```media');
      for (const m of allMedia) {
        const label = m.caption || m.text || 'Media';
        sections.push(`[${label}](${m.href})`);
      }
      sections.push('```\n');
    }
  }
  
  return sections.join('\n');
}

// Intelligent content extraction to minimize tokens while preserving key information
function extractKeyContent(content, originalQuery) {
  if (!content || typeof content !== 'string') return '';
  
  const lines = content.split('\n').filter(Boolean);
  const queryWords = originalQuery ? originalQuery.toLowerCase().split(/\s+/) : [];
  
  // Categorize lines by importance
  const patterns = {
    queryRelevant: [],
    numerical: [],
    dates: [],
    headers: [],
    contextual: []
  };
  
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 10) return;
    
    // Query relevance (contains query terms)
    const lineWords = trimmed.toLowerCase();
    if (queryWords.some(word => word.length > 2 && lineWords.includes(word))) {
      patterns.queryRelevant.push(trimmed);
    }
    
    // Numerical data (numbers, percentages, measurements)
    if (/\d+[%$€£¥]|\d+[\.\,]\d+|\d+\s*(million|billion|thousand|percent|kg|lbs|miles|km|hours|days|years)/i.test(trimmed)) {
      patterns.numerical.push(trimmed);
    }
    
    // Date patterns (2023, 2024, 2025, months, recent)
    if (/\b20\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d+|\b(recent|latest|current|new)\b/i.test(trimmed)) {
      patterns.dates.push(trimmed);
    }
    
    // Headers/titles (short, capitalized, structural)
    if (trimmed.length < 80 && /^[A-Z][^.]*$/.test(trimmed) && !trimmed.includes(',')) {
      patterns.headers.push(trimmed);
    }
    
    // Contextual (first/last sentences for overview)
    if (idx < 2 || idx > lines.length - 3) {
      patterns.contextual.push(trimmed);
    }
  });
  
  // Build condensed content prioritizing relevance
  const condensed = [];
  
  // Add most relevant content with limits to control token usage
  condensed.push(...patterns.queryRelevant.slice(0, 2));   // Top 2 query-relevant
  condensed.push(...patterns.numerical.slice(0, 2));       // Top 2 with numbers/data
  condensed.push(...patterns.dates.slice(0, 1));           // Most recent date info
  condensed.push(...patterns.headers.slice(0, 1));         // 1 header for context
  condensed.push(...patterns.contextual.slice(0, 1));      // 1 contextual sentence
  
  // Deduplicate, join, and limit total length
  const unique = [...new Set(condensed.filter(Boolean))];
  const result = unique.join('. ').substring(0, 300); // Hard limit: 300 chars
  
  return result || content.substring(0, 150); // Fallback to simple truncation
}

// Export OpenAI-compatible function tool schemas
const toolFunctions = [
  {
    type: 'function',
    function: {
      name: 'search_youtube',
      description: '🎬 SEARCH/FIND YouTube videos (NOT for transcription). Use when user wants to FIND or SEARCH for videos. **DO NOT USE if user wants to transcribe, get transcript, or extract text from a specific YouTube URL** - use transcribe_url instead. Use search_youtube for: "find YouTube videos about X", "search YouTube for X", "show me videos about X". Returns video titles, descriptions, links, and caption availability. Results are automatically added to a playlist. **CRITICAL: You MUST include ALL video URLs in your response as a formatted markdown list with [Title](URL) format.**',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Search query for YouTube videos (e.g., "javascript tutorial", "bach cello suites", "machine learning course")'
          },
          limit: { 
            type: 'integer', 
            minimum: 1, 
            maximum: 50, 
            default: 10, 
            description: 'Maximum number of video results to return (default 10, max 50)'
          },
          order: {
            type: 'string',
            enum: ['relevance', 'date', 'viewCount', 'rating'],
            default: 'relevance',
            description: 'Sort order for results: relevance (default), date (newest first), viewCount (most viewed), rating (highest rated)'
          }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for articles, news, current events, and text-based content. Use for general information, research, news, facts, and documentation. **DO NOT USE for YouTube or video searches** - use search_youtube instead. Can accept either a single query string or an array of queries. Automatically fetches and extracts full page content from all search results, including images and links. Returns comprehensive search result fields including title, url, description, score, content, images, and links. **CRITICAL: You MUST include relevant URLs from search results in your response using markdown links [Title](URL) to cite sources and enable verification.**',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            oneOf: [
              { type: 'string', description: 'Single search query' },
              { type: 'array', items: { type: 'string' }, description: 'Array of search queries to execute in one call' }
            ],
            description: 'Search query (string) or multiple queries (array of strings)'
          },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Results per query (increased default for more comprehensive research)' },
          timeout: { type: 'integer', minimum: 1, maximum: 60, default: 15, description: 'Timeout in seconds for fetching each page' },
          generate_summary: { type: 'boolean', default: false, description: 'When true, generate an LLM summary of the search results'}
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scrape_web_content',
      description: 'Fetch and extract the full readable content from any URL (websites, GitHub repos, documentation, etc). Use this when the user asks to "scrape", "get content from", "read", "fetch", or "summarize" a specific URL/website. EXCELLENT for getting detailed information from educational resources, tutorials, documentation, course materials, or any specific webpage. Perfect for accessing comprehensive guides, detailed explanations, complete course curricula, or GitHub repository information. CRITICAL: When user provides a URL and asks about it, you MUST call this function - do NOT just describe what you would do.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Fully qualified URL to fetch (e.g., https://github.com/user/repo, https://docs.example.com/guide)' },
          timeout: { type: 'integer', minimum: 1, maximum: 60, default: 15, description: 'Optional timeout in seconds (default 15)' }
        },
        required: ['url'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_javascript',
      description: 'Execute JavaScript code in a secure sandbox environment. Use for calculations, demonstrations, and data processing. Call this tool with ONLY the code parameter - never include result, output, type, or executed_at fields as these are generated automatically by the tool execution.',
      parameters: {
        type: 'object',
        properties: {
          code: { 
            type: 'string', 
            description: 'JavaScript code to execute. Include console.log() statements to display results. Example: "const area = Math.PI * 5 * 5; console.log(`Area: ${area}`);". DO NOT include any result or execution metadata - only provide the code string.'
          },
          timeout: { 
            type: 'integer', 
            minimum: 1, 
            maximum: 10, 
            default: 5, 
            description: 'Maximum execution time in seconds' 
          }
        },
        required: ['code'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_url',
      description: '🎙️ **PRIMARY TOOL FOR GETTING VIDEO/AUDIO TEXT CONTENT**: Transcribe audio or video content from URLs using OpenAI Whisper. **MANDATORY USE** when user says: "transcribe", "transcript", "get text from", "what does the video say", "extract dialogue", "convert to text", OR provides a specific YouTube/video URL and asks about its content. **YOUTUBE SUPPORT**: Can transcribe directly from YouTube URLs (youtube.com, youtu.be, youtube.com/shorts). Also supports direct media URLs (.mp3, .mp4, .wav, .m4a, etc.). Automatically handles large files by chunking. Shows real-time progress with stop capability. Returns full transcription text. Use when user wants to: transcribe audio/video, get text from speech, analyze spoken content, extract dialogue, or convert voice to text.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'YouTube URL (youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...) or direct URL to audio/video file (e.g., https://example.com/audio.mp3). Supported formats: MP3, MP4, WAV, M4A, WebM, OGG, FLAC, YouTube videos'
          },
          language: {
            type: 'string',
            description: 'Optional: ISO-639-1 language code (e.g., "en", "es", "fr", "de", "ja", "zh"). If not specified, Whisper will auto-detect the language.',
            pattern: '^[a-z]{2}$'
          },
          prompt: {
            type: 'string',
            description: 'Optional: Text to guide the model\'s style or continue a previous segment. Can improve accuracy for specific terminology or context.'
          }
        },
        required: ['url'],
        additionalProperties: false
      }
    }
  }
];

function clampInt(v, min, max, def) {
  const n = Number.isFinite(Number(v)) ? Number(v) : def;
  return Math.max(min, Math.min(max, n));
}

async function callFunction(name, args = {}, context = {}) {
  // Extract model and apiKey from context for consistent LLM usage
  const { model, apiKey } = context;
  
  // DEBUG: Log context.writeEvent availability
  console.log(`🔧 TOOLS: callFunction('${name}') - context.writeEvent exists:`, typeof context.writeEvent === 'function');
  
  switch (name) {
    case 'search_web': {
      // DEBUG: Confirm writeEvent is available for search_web
      console.log('🔧 TOOLS: search_web starting - writeEvent:', typeof context.writeEvent);
      
      // Handle both single query (string) and multiple queries (array)
      const queryInput = args.query;
      const queries = Array.isArray(queryInput) 
        ? queryInput.map(q => String(q || '').trim()).filter(Boolean)
        : [String(queryInput || '').trim()].filter(Boolean);
      
      if (queries.length === 0) return JSON.stringify({ error: 'query required' });
      
      const limit = clampInt(args.limit, 1, 50, 3);
      const timeout = clampInt(args.timeout, 1, 60, 15);
      const loadContent = true; // Always load content from search results
      const generateSummary = args.generate_summary === true;
      
      // Check if Tavily API key is available
      const tavilyApiKey = context.tavilyApiKey;
      const useTavily = tavilyApiKey && tavilyApiKey.trim().length > 0;
      
      console.log(`🔍 Search using: ${useTavily ? 'Tavily API' : 'DuckDuckGo'} (always loading page content)`);
      
      // Emit search start event
      if (context?.writeEvent) {
        context.writeEvent('search_progress', {
          tool: 'search_web',
          phase: 'searching',
          queries: queries,
          service: useTavily ? 'tavily' : 'duckduckgo',
          timestamp: new Date().toISOString()
        });
      }
      
      const allResults = [];
      let searchService = 'duckduckgo'; // Track which service was actually used
      
      if (useTavily) {
        // Use Tavily API for search
        try {
          const tavilyResults = await tavilySearch(queries, {
            apiKey: tavilyApiKey,
            maxResults: limit,
            includeAnswer: false,
            includeRawContent: true, // Always load content
            searchDepth: 'basic'
          });
          
          // Apply same compression to Tavily results as DuckDuckGo
          const compressedResults = tavilyResults.map(r => {
            if (r.content) {
              const originalLength = r.content.length;
              // Apply intelligent extraction
              r.content = extractKeyContent(r.content, r.query);
              r.originalLength = originalLength;
              r.intelligentlyExtracted = true;
              
              // HARD LIMIT: 5000 chars per result (same as DuckDuckGo)
              const MAX_SEARCH_RESULT_CHARS = 5000;
              if (r.content && r.content.length > MAX_SEARCH_RESULT_CHARS) {
                console.log(`✂️ Truncating Tavily result: ${r.content.length} → ${MAX_SEARCH_RESULT_CHARS} chars`);
                r.content = r.content.substring(0, MAX_SEARCH_RESULT_CHARS) + '\n\n[Content truncated to fit model limits]';
                r.truncated = true;
              }
            }
            return r;
          });
          
          allResults.push(...compressedResults);
          searchService = 'tavily';
          console.log(`✅ Tavily search completed: ${tavilyResults.length} results with compressed content`);
        } catch (error) {
          console.error('Tavily search failed, falling back to DuckDuckGo:', error.message);
          // Fall back to DuckDuckGo on error
          const searcher = new DuckDuckGoSearcher();
          for (const query of queries) {
            const out = await searcher.search(query, limit, true, timeout);
            const results = (out?.results || []).map(r => ({
              query: query,
              title: r.title,
              url: r.url,
              description: r.description,
              score: r.score,
              duckduckgoScore: r.duckduckgoScore,
              state: r.state,
              contentLength: r.contentLength || 0,
              fetchTimeMs: r.fetchTimeMs || 0,
              content: r.content ? extractKeyContent(r.content, query) : null
            }));
            allResults.push(...results);
          }
        }
      } else {
        // Use DuckDuckGo search - always load content
        const searcher = new DuckDuckGoSearcher();
        
        // Execute searches for all queries
        for (const query of queries) {
          // Emit search results found event
          if (context?.writeEvent) {
            context.writeEvent('search_progress', {
              tool: 'search_web',
              phase: 'results_found',
              query: query,
              timestamp: new Date().toISOString()
            });
          }
          
          // Create progress callback to emit per-result progress
          const progressCallback = (data) => {
            if (context?.writeEvent) {
              context.writeEvent('search_progress', {
                tool: 'search_web',
                query: query,
                ...data,
                timestamp: new Date().toISOString()
              });
            }
          };
          
          const out = await searcher.search(query, limit, true, timeout, progressCallback); // Always pass true for loadContent
          
          // Emit content loading event
          if (context?.writeEvent && out?.results?.length > 0) {
            context.writeEvent('search_progress', {
              tool: 'search_web',
              phase: 'loading_content',
              query: query,
              result_count: out.results.length,
              timestamp: new Date().toISOString()
            });
          }
          
          // Include all fields from raw search response, extracting images and links
          const results = (out?.results || []).map(r => {
            const result = {
              query: query, // Include which query this result is for
              title: r.title,
              url: r.url,
              description: r.description,
              score: r.score,
              duckduckgoScore: r.duckduckgoScore,
              state: r.state,
              contentLength: r.contentLength || 0,
              fetchTimeMs: r.fetchTimeMs || 0,
              content: null,
              // CRITICAL: Preserve page_content from search.js extraction
              page_content: r.page_content
            };
            
            // Process loaded content
            if (r.content) {
              result.content = extractKeyContent(r.content, query);
              result.originalLength = r.content.length;
              result.intelligentlyExtracted = true;
              if (r.truncated) result.truncated = r.truncated;
              
              // HARD LIMIT: Ensure content never exceeds 5000 chars per result
              // This prevents massive tool responses that exceed model context
              const MAX_SEARCH_RESULT_CHARS = 5000;
              if (result.content && result.content.length > MAX_SEARCH_RESULT_CHARS) {
                console.log(`✂️ Truncating search result content: ${result.content.length} → ${MAX_SEARCH_RESULT_CHARS} chars`);
                result.content = result.content.substring(0, MAX_SEARCH_RESULT_CHARS) + '\n\n[Content truncated to fit model limits]';
                result.truncated = true;
              }
              
              // Extract images and links from raw HTML if available with relevance scoring
              if (r.rawHtml) {
                try {
                  const parser = new SimpleHTMLParser(r.rawHtml, query);
                  
                  // Extract top 3 most relevant images with captions
                  const images = parser.extractImages(3);
                  
                  // Extract all links with relevance scores
                  const allLinks = parser.extractLinks();
                  
                  // Categorize links by media type
                  const categorized = parser.categorizeLinks(allLinks);
                  
                  // Add to result with separate keys for each media type
                  if (images.length > 0) result.images = images;
                  if (categorized.youtube.length > 0) result.youtube = categorized.youtube;
                  if (categorized.video.length > 0 || categorized.audio.length > 0 || categorized.media.length > 0) {
                    result.media = [
                      ...categorized.video,
                      ...categorized.audio,
                      ...categorized.media
                    ];
                  }
                  if (categorized.regular.length > 0) result.links = categorized.regular;
                  
                  console.log(`🖼️ Extracted ${images.length} images, ${categorized.youtube.length} YouTube, ${result.media?.length || 0} media, ${categorized.regular.length} links from ${r.url}`);
                } catch (parseError) {
                  console.error(`Failed to parse HTML for ${r.url}:`, parseError.message);
                }
              }
            }
            
            if (r.contentError) result.contentError = r.contentError;
            
            return result;
          });
        
          allResults.push(...results);
        }
      }
      
      // Group results by query for better organization
      const resultsByQuery = {};
      for (const result of allResults) {
        const q = result.query;
        if (!resultsByQuery[q]) {
          resultsByQuery[q] = [];
        }
        resultsByQuery[q].push(result);
      }
      // Generate summary only if requested and context is available
      let summary = null;
      let summary_model = null;
      let summary_error = null;
      let individual_summaries = null;
      
      if (generateSummary) {
        try {
          if (model && apiKey) {
            summary_model = model;
            const { llmResponsesWithTools } = require('./llm_tools_adapter');
            
            if (loadContent) {
              // STRATEGY 1: Content loaded - summarize each page individually, then synthesize
              // OPTIMIZATION: Limit pages to summarize to reduce token usage
              // CRITICAL: For low-TPM models, use extractive strategy to avoid multiple LLM calls
              
              // Detect model capabilities from model name
              const modelName = model.replace(/^(openai:|groq:)/, '');
              const isLowTPMModel = modelName.includes('llama-4-scout') || 
                                    modelName.includes('llama-4-maverick');
              
              // For low-TPM models: Skip individual page summaries, use extracted content directly
              // This reduces LLM calls from (N pages + 1 synthesis) to just 1 synthesis
              if (isLowTPMModel) {
                console.log(`📄 LOW-TPM MODE: Using extractive strategy (no per-page LLM summaries) for ${allResults.length} pages...`);
                console.log(`⚠️ CRITICAL: 30k TPM limit requires ultra-aggressive content reduction`);
                
                // Use extracted content directly instead of LLM summaries
                // CRITICAL: Reduce to just 2 results with 100 chars each to minimize token usage
                // TPM accounting: ~400 chars total = ~100 tokens for content + query + response = ~500 tokens/call
                const extractedInfo = allResults
                  .slice(0, 2) // Only top 2 for low-TPM (was 3, now 2)
                  .filter(r => r.content)
                  .map((r, i) => ({
                    url: r.url,
                    title: r.title,
                    summary: `${r.title}: ${r.content.substring(0, 100)}` // Reduced from 200 to 100 chars
                  }));
                
                individual_summaries = extractedInfo;
                
                // Create an ultra-compact synthesis from extracted content (one LLM call instead of N+1)
                const directSynthesisPrompt = `Q: "${query}"

${extractedInfo.map((info, i) => `${i + 1}. ${info.summary}`).join('\n')}

Brief answer with URLs:`;

                const directSynthesisInput = [
                  { role: 'system', content: 'Answer concisely.' },
                  { role: 'user', content: directSynthesisPrompt }
                ];

                const directSynthesisRequestBody = {
                  model,
                  input: directSynthesisInput,
                  tools: [],
                  options: {
                    apiKey,
                    temperature: 0.2,
                    max_tokens: 80,  // Reduced from 100 to 80 for ultra-compact response
                    timeoutMs: 30000
                  }
                };

                // Emit LLM request event
                if (context?.writeEvent) {
                  context.writeEvent('llm_request', {
                    phase: 'direct_synthesis',
                    tool: 'search_web',
                    model,
                    request: directSynthesisRequestBody,
                    timestamp: new Date().toISOString()
                  });
                }

                const directSynthesisResp = await llmResponsesWithTools(directSynthesisRequestBody);
                
                // Emit LLM response event
                if (context?.writeEvent) {
                  context.writeEvent('llm_response', {
                    phase: 'direct_synthesis',
                    tool: 'search_web',
                    model,
                    response: directSynthesisResp,
                    timestamp: new Date().toISOString()
                  });
                }
                
                summary = directSynthesisResp?.text || directSynthesisResp?.finalText || 'Unable to generate synthesis';
                
                console.log(`✅ LOW-TPM direct synthesis complete (1 LLM call vs ${extractedInfo.length + 1} calls)`);
                console.log(`✅ Estimated token usage: ~500 tokens/call × 3 calls = ~1500 tokens (well under 30k TPM)`);
                
              } else {
                // STANDARD STRATEGY: Individual page summaries + synthesis
                // LOAD BALANCING: Rotate through multiple models to distribute TPM load
                
                // Define model pool for summarization (fast, cost-effective models)
                const provider = model.includes('openai:') ? 'openai' : 'groq';
                const modelPool = provider === 'openai' 
                  ? ['openai:gpt-4o-mini', 'openai:gpt-3.5-turbo'] 
                  : [
                      'groq:llama-3.3-70b-versatile',      // 64k TPM
                      'groq:llama-3.1-8b-instant',         // 120k TPM
                      'groq:mixtral-8x7b-32768',           // 60k TPM
                      'groq:llama-3.2-11b-vision-preview', // 60k TPM
                      'groq:gemma2-9b-it'                  // 60k TPM
                    ];
                
                console.log(`🔄 Model pool for load balancing: ${modelPool.join(', ')}`);
                
                const MAX_PAGES_TO_SUMMARIZE = 5;
                const resultsToSummarize = allResults.slice(0, MAX_PAGES_TO_SUMMARIZE);
                
                console.log(`📄 Generating individual summaries for ${resultsToSummarize.length} of ${allResults.length} loaded pages (standard mode with load balancing)...`);
              
              const pageSummaries = [];
              
              // Step 1: Generate one summary per loaded page (limited to top results)
              for (let i = 0; i < resultsToSummarize.length; i++) {
                const result = resultsToSummarize[i];
                
                // Rotate through model pool to distribute TPM load
                const summaryModel = modelPool[i % modelPool.length];
                console.log(`📝 Page ${i + 1} summary using: ${summaryModel}`);
                
                if (!result.content) {
                  // Skip pages without content
                  pageSummaries.push({
                    url: result.url,
                    title: result.title,
                    summary: `No content loaded. Description: ${result.description || 'N/A'}`,
                    error: result.contentError || null
                  });
                  continue;
                }
                
                try {
                  // OPTIMIZATION: Adjust content length based on model capabilities
                  // Reduce content size to minimize token usage for all models
                  const maxContentChars = isLowTPMModel ? 300 : 500; // Reduced from 500/800
                  
                  const pagePrompt = `Summarize: "${query}"

${result.title}
${result.content.substring(0, maxContentChars)}

1-2 sentences:`;

                  const pageSummaryInput = [
                    { role: 'system', content: 'You are a research analyst. Extract key information concisely.' },
                    { role: 'user', content: pagePrompt }
                  ];
                  
                  const pageSummaryRequestBody = {
                    model: summaryModel, // Use rotated model instead of main model
                    input: pageSummaryInput,
                    tools: [],
                    options: {
                      apiKey,
                      temperature: 0.2,
                      max_tokens: 150, // Standard size since we're using capable models
                      timeoutMs: 20000
                    }
                  };
                  
                  // Emit LLM request event
                  if (context?.writeEvent) {
                    context.writeEvent('llm_request', {
                      phase: 'page_summary',
                      tool: 'search_web',
                      page_index: i,
                      url: result.url,
                      model: summaryModel,
                      timestamp: new Date().toISOString()
                    });
                  }
                  
                  const pageResp = await llmResponsesWithTools(pageSummaryRequestBody);
                  const pageSummaryText = pageResp?.text || pageResp?.finalText || 'Unable to generate summary';
                  
                  // No delay needed - different models have separate TPM limits
                  
                  // Emit LLM response event with usage data
                  if (context?.writeEvent) {
                    context.writeEvent('llm_response', {
                      phase: 'page_summary',
                      tool: 'search_web',
                      page_index: i,
                      url: result.url,
                      model: summaryModel,
                      summary: pageSummaryText,
                      response: {
                        content: pageSummaryText,
                        usage: pageResp?.rawResponse?.usage || {}
                      },
                      timestamp: new Date().toISOString()
                    });
                  }
                  
                  pageSummaries.push({
                    url: result.url,
                    title: result.title,
                    summary: pageSummaryText
                  });
                  
                  console.log(`✅ Generated summary for page ${i + 1}/${allResults.length}: ${result.url}`);
                  
                } catch (pageError) {
                  console.error(`❌ Failed to summarize page ${result.url}:`, pageError.message);
                  pageSummaries.push({
                    url: result.url,
                    title: result.title,
                    summary: `Error generating summary: ${pageError.message}`,
                    error: pageError.message
                  });
                }
              }
              
              individual_summaries = pageSummaries;
              
              // Step 2: Synthesize all individual summaries into one comprehensive summary
              console.log(`🔄 Synthesizing ${pageSummaries.length} individual summaries...`);
              
              // OPTIMIZATION: Ultra-compact synthesis prompt to minimize tokens
              const synthesisPrompt = `Q: "${query}"

${pageSummaries.map((ps, i) => `${i + 1}. ${ps.summary}`).join('\n')}

Brief answer with URLs:`;

              const synthesisInput = [
                { role: 'system', content: 'Answer concisely.' },
                { role: 'user', content: synthesisPrompt }
              ];
              
              // Use a different model for synthesis to further distribute TPM load
              // Pick a high-capacity model that wasn't used much in summaries
              const synthesisModel = provider === 'openai' 
                ? 'openai:gpt-4o-mini'
                : 'groq:llama-3.3-70b-versatile'; // High-capacity model for synthesis
              
              console.log(`🔄 Synthesis using: ${synthesisModel}`);
              
              const synthesisRequestBody = {
                model: synthesisModel, // Use different model for synthesis
                input: synthesisInput,
                tools: [],
                options: {
                  apiKey,
                  temperature: 0.2,
                  max_tokens: 150, // Reduced from 250 to minimize token usage
                  timeoutMs: 30000
                }
              };
              
              // Emit LLM request event
              if (context?.writeEvent) {
                context.writeEvent('llm_request', {
                  phase: 'synthesis_summary',
                  tool: 'search_web',
                  model: synthesisModel,
                  page_count: pageSummaries.length,
                  timestamp: new Date().toISOString()
                });
              }
              
              const synthesisResp = await llmResponsesWithTools(synthesisRequestBody);
              
              // Emit LLM response event with usage data
              if (context?.writeEvent) {
                context.writeEvent('llm_response', {
                  phase: 'synthesis_summary',
                  tool: 'search_web',
                  model: synthesisModel,
                  response: {
                    content: synthesisResp?.text || synthesisResp?.finalText || '',
                    usage: synthesisResp?.rawResponse?.usage || {}
                  },
                  timestamp: new Date().toISOString()
                });
              }
              
              summary = synthesisResp?.text || synthesisResp?.finalText || null;
              console.log(`✅ Generated comprehensive synthesis from ${pageSummaries.length} pages`);
              
              } // End of standard strategy (else block from isLowTPMModel check)
              
            } else {
              // STRATEGY 2: Content not loaded - summarize URLs and descriptions only
              console.log(`🔍 Generating summary from ${allResults.length} search result descriptions...`);
              
              const enhancedResults = analyzeSourceCredibility(allResults);
              const prompt = buildSummaryPrompt(query, enhancedResults, loadContent);
              
              const summaryInput = [
                { role: 'system', content: process.env.SYSTEM_PROMPT_DIGEST_ANALYST || 'You are a thorough research analyst. Provide concise, accurate summaries based on search results.' },
                { role: 'user', content: prompt }
              ];
              
              const summaryRequestBody = {
                model,
                input: summaryInput,
                tools: [],
                options: {
                  apiKey,
                  temperature: 0.2,
                  max_tokens: 150,
                  timeoutMs: 30000
                }
              };
              
              // Emit LLM request event
              if (context?.writeEvent) {
                context.writeEvent('llm_request', {
                  phase: 'description_summary',
                  tool: 'search_web',
                  model,
                  request: summaryRequestBody,
                  timestamp: new Date().toISOString()
                });
              }
              
              const resp = await llmResponsesWithTools(summaryRequestBody);
              
              // Emit LLM response event with usage data
              if (context?.writeEvent) {
                context.writeEvent('llm_response', {
                  phase: 'description_summary',
                  tool: 'search_web',
                  model,
                  response: {
                    content: resp?.text || resp?.finalText || '',
                    usage: resp?.rawResponse?.usage || {}
                  },
                  timestamp: new Date().toISOString()
                });
              }
              
              summary = resp?.text || resp?.finalText || null;
              console.log(`✅ Generated summary from search descriptions`);
            }
          } else {
            summary_error = "Summary generation requires model and apiKey in context";
          }
        } catch (e) {
          console.error('🚨 LLM summary generation error:', e);
          summary_error = String(e?.message || e);
        }
      }
      
      // Extract all unique links from search results
      const allLinks = allResults.map(r => ({
        url: r.url,
        title: r.title,
        description: r.description || ''
      })).filter(link => link.url && link.title);
      
      // DEBUG: Check if page_content exists in allResults
      console.log(`🔍 DEBUG tools.js: allResults (${allResults.length}) page_content status:`);
      allResults.forEach((r, i) => {
        console.log(`  Result ${i}: page_content=${!!r.page_content}, keys=${Object.keys(r).join(',')}`);
      });
      
      // Build complete response with all raw search fields
      const response = {
        searchService: searchService, // Indicate which service was used: 'tavily' or 'duckduckgo'
        queries: queries, // Include all queries that were executed
        multiQuery: queries.length > 1,
        totalResults: allResults.length,
        resultsByQuery: resultsByQuery,
        limit: limit,
        contentFetched: true, // Always true now - content is always fetched
        timeout: timeout,
        timestamp: new Date().toISOString(),
        results: allResults, // All results combined with full content, images, and links
        links: allLinks, // All links from search results for easy access
        // Summary fields (only included if summary generation was attempted)
        ...(generateSummary && { 
          generate_summary: generateSummary,
          summary, 
          summary_model, 
          summary_error,
          // Include individual page summaries (content is always loaded now)
          ...(individual_summaries && { individual_summaries })
        })
      };
      
      const responseStr = JSON.stringify(response);
      const responseCharCount = responseStr.length;
      const estimatedTokens = estimateTokens(responseStr);
      
      // CRITICAL: Hard character limit to prevent context overflow
      // Each search result should be ~5K chars max, but JSON structure adds overhead
      const MAX_TOTAL_RESPONSE_CHARS = 50000; // ~12.5K tokens with JSON overhead
      
      if (responseCharCount > MAX_TOTAL_RESPONSE_CHARS || estimatedTokens > 4000) {
        console.warn(`⚠️ Response too large (${responseCharCount} chars, ${estimatedTokens} tokens), aggressively truncating`);
        
        // DEBUG: Check if page_content exists in results before truncation
        console.log(`🔍 DEBUG: Results before truncation (${allResults.length} results):`);
        allResults.forEach((r, i) => {
          console.log(`  Result ${i}: page_content=${!!r.page_content}, images=${r.page_content?.images?.length || 0}, videos=${r.page_content?.videos?.length || 0}`);
        });
        
        // More aggressive truncation: fewer results, shorter content
        // IMPORTANT: Keep ALL results for links section (just remove only 3 for content)
        const truncatedResults = allResults.map(r => ({
          ...r,
          description: (r.description || '').substring(0, 150),
          content: r.content ? r.content.substring(0, 300) : r.content, // Reduced from 500 to 300
          images: r.images ? r.images.slice(0, 1) : undefined, // Max 1 image
          links: r.links ? r.links.slice(0, 5) : undefined, // Max 5 links
          youtube: r.youtube ? r.youtube.slice(0, 2) : undefined, // Max 2 YouTube
          media: undefined, // Drop media to save space
          // CRITICAL: Keep page_content for UI extraction (images, videos, media)
          page_content: r.page_content
        }));
        
        return JSON.stringify({ 
          ...response, 
          results: truncatedResults, 
          count: truncatedResults.length,
          summary: summary ? (summary.length > 200 ? summary.substring(0, 200) + '...' : summary) : summary,
          truncated: true,
          original_count: allResults.length,
          original_chars: responseCharCount,
          original_tokens: estimatedTokens
        });
      }
      
      return responseStr;
    }
    case 'scrape_web_content': {
      const url = String(args.url || '').trim();
      if (!url) return JSON.stringify({ error: 'url required' });
      const timeout = clampInt(args.timeout, 1, 60, 15);
      
      // Check if Tavily API key is available
      const tavilyApiKey = context.tavilyApiKey;
      const useTavily = tavilyApiKey && tavilyApiKey.trim().length > 0;
      
      console.log(`📄 Scraping ${url} using: ${useTavily ? 'Tavily API' : 'DuckDuckGo'}`);
      
      try {
        let content, format, originalLength, extractedLength, compressionRatio, warning, extractionError;
        let scrapeService = 'duckduckgo'; // Track which service was actually used
        
        if (useTavily) {
          // Use Tavily Extract API
          try {
            const tavilyResult = await tavilyExtract(url, tavilyApiKey);
            
            if (tavilyResult.error) {
              throw new Error(tavilyResult.error);
            }
            
            content = tavilyResult.raw_content;
            format = 'text';
            originalLength = content.length;
            extractedLength = content.length;
            compressionRatio = 1.0;
            scrapeService = 'tavily';
            
            console.log(`✅ Tavily extract completed: ${extractedLength} chars`);
          } catch (tavilyError) {
            console.error('Tavily extract failed, falling back to DuckDuckGo:', tavilyError.message);
            // Fall back to DuckDuckGo on error
            const searcher = new DuckDuckGoSearcher();
            const raw = await searcher.fetchUrl(url, timeout * 1000);
            const extracted = extractContent(raw);
            
            content = extracted.content;
            format = extracted.format;
            originalLength = extracted.originalLength;
            extractedLength = extracted.extractedLength;
            compressionRatio = extracted.compressionRatio;
            warning = extracted.warning;
            extractionError = extracted.error;
            scrapeService = 'duckduckgo'; // Fallback was used
          }
        } else {
          // Use DuckDuckGo fetcher
          const searcher = new DuckDuckGoSearcher();
          const raw = await searcher.fetchUrl(url, timeout * 1000);
          const extracted = extractContent(raw);
          
          content = extracted.content;
          format = extracted.format;
          originalLength = extracted.originalLength;
          extractedLength = extracted.extractedLength;
          compressionRatio = extracted.compressionRatio;
          warning = extracted.warning;
          extractionError = extracted.error;
        }
        
        console.log(`🌐 Scraped ${url}: ${originalLength} → ${extractedLength} chars (${format} format, ${compressionRatio}x compression)`);
        
        // Extract images and links from raw HTML before processing with relevance
        let images = [];
        let youtube = [];
        let media = [];
        let links = [];
        
        if (scrapeService === 'duckduckgo') {
          // For DuckDuckGo, we have access to raw HTML
          const searcher = new DuckDuckGoSearcher();
          const rawHtml = await searcher.fetchUrl(url, timeout * 1000);
          
          // Use URL as query context for relevance (extract domain/path keywords)
          const urlQuery = url.split('/').pop()?.replace(/[-_]/g, ' ') || '';
          const parser = new SimpleHTMLParser(rawHtml, urlQuery);
          
          // Extract top 3 most relevant images
          images = parser.extractImages(3);
          
          // Extract and categorize links
          const allLinks = parser.extractLinks();
          const categorized = parser.categorizeLinks(allLinks);
          
          youtube = categorized.youtube;
          media = [
            ...categorized.video,
            ...categorized.audio,
            ...categorized.media
          ];
          links = categorized.regular;
          
          console.log(`🖼️ Extracted ${images.length} images, ${youtube.length} YouTube, ${media.length} media, ${links.length} links from ${url}`);
        }
        // Note: Tavily doesn't provide raw HTML, so we can't extract images/links when using Tavily
        
        // Token-aware truncation to prevent context overflow
        // Limit scraped content to ~20k tokens (~80k chars) to leave room for conversation history
        const MAX_SCRAPE_CHARS = 80000;
        const MAX_SCRAPE_TOKENS = 20000;
        let truncatedContent = content;
        let wasTruncated = false;
        
        if (content.length > MAX_SCRAPE_CHARS) {
          wasTruncated = true;
          const estimatedTokens = Math.ceil(content.length / 4);
          
          // Truncate at sentence boundaries when possible
          truncatedContent = content.substring(0, MAX_SCRAPE_CHARS);
          const lastPeriod = truncatedContent.lastIndexOf('.');
          const lastNewline = truncatedContent.lastIndexOf('\n');
          const breakPoint = Math.max(lastPeriod, lastNewline);
          
          if (breakPoint > MAX_SCRAPE_CHARS * 0.8) {
            // Use sentence/paragraph boundary if within 80% of limit
            truncatedContent = truncatedContent.substring(0, breakPoint + 1);
          }
          
          truncatedContent += `\n\n[Content truncated: ${content.length} → ${truncatedContent.length} chars (~${estimatedTokens} → ~${Math.ceil(truncatedContent.length / 4)} tokens) to fit model limits. Original had ${originalLength} chars before markdown conversion.]`;
          
          console.log(`✂️ Truncated scrape content: ${content.length} → ${truncatedContent.length} chars (~${estimatedTokens} → ~${Math.ceil(truncatedContent.length / 4)} tokens)`);
        }
        
        const response = {
          scrapeService: scrapeService, // Indicate which service was used: 'tavily' or 'duckduckgo'
          url,
          content: truncatedContent,
          format,
          originalLength,
          extractedLength,
          compressionRatio,
          wasTruncated: wasTruncated || undefined, // Only include if truncated
          images: images.length > 0 ? images : undefined, // Include top 3 relevant images
          youtube: youtube.length > 0 ? youtube : undefined, // Include YouTube links
          media: media.length > 0 ? media : undefined, // Include other media links
          links: links.length > 0 ? links : undefined      // Include regular links
        };
        
        if (warning) {
          response.warning = warning;
        }
        
        if (extractionError) {
          response.extractionError = extractionError;
        }
        
        return JSON.stringify(response);
      } catch (e) {
        return JSON.stringify({ url, error: String(e?.message || e) });
      }
    }
    case 'execute_javascript': {
      const code = String(args.code || '').trim();
      if (!code) return JSON.stringify({ error: 'code required' });
      const timeout = clampInt(args.timeout, 1, 10, 5) * 1000; // Convert to milliseconds
      
      try {
        // Create a secure context with limited built-in objects
        const context = {
          Math, 
          Date, 
          JSON, 
          Array, 
          Object, 
          String, 
          Number, 
          Boolean,
          parseInt, 
          parseFloat, 
          isNaN, 
          isFinite,
          console: {
            log: (...args) => { 
              const line = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
              ).join(' ');
              // Accumulate all console.log outputs instead of overwriting
              if (context._outputs.length > 0) {
                context._outputs.push(line);
              } else {
                context._outputs = [line];
              }
            }
          },
          _outputs: []
        };
        
        // Create VM context
        const vmContext = vm.createContext(context);
        
        // Execute code with timeout
        const result = vm.runInContext(code, vmContext, { 
          timeout,
          displayErrors: true 
        });
        
        // Return console output if available (all lines joined), otherwise the result
        const output = context._outputs.length > 0 
          ? context._outputs.join('\n') 
          : result;
        
        // Return clean result without metadata that might confuse LLM
        return JSON.stringify({ 
          result: output
        });
      } catch (e) {
        return JSON.stringify({ 
          error: String(e?.message || e)
        });
      }
    }

    case 'transcribe_url': {
      const url = String(args.url || '').trim();
      if (!url) return JSON.stringify({ error: 'url required' });

      try {
        // Extract onProgress callback and toolCallId from context if available
        const onProgress = context.onProgress || null;
        const toolCallId = context.toolCallId || null;

        // Determine provider from context (set in Lambda handler based on request)
        // Priority: explicit provider > detect from API key
        const provider = context.provider || (context.apiKey?.startsWith('gsk_') ? 'groq' : 'openai');
        
        // Use the API key that matches the provider
        // If Groq provider, use main API key; otherwise try OpenAI key first
        const apiKey = provider === 'groq' 
          ? context.apiKey 
          : (context.openaiApiKey || context.apiKey);

        // Use provider-specific model name
        const model = provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';

        const result = await transcribeUrl({
          url,
          apiKey,
          provider,
          language: args.language,
          prompt: args.prompt,
          model,
          onProgress,
          toolCallId
        });

        return JSON.stringify(result);
      } catch (error) {
        console.error('Transcribe tool error:', error);
        return JSON.stringify({ 
          error: `Transcription failed: ${error.message}`,
          url 
        });
      }
    }
    
    case 'search_youtube': {
      const query = String(args.query || '').trim();
      if (!query) return JSON.stringify({ error: 'query required' });
      
      const limit = clampInt(args.limit, 1, 50, 10);
      const order = args.order || 'relevance';
      
      try {
        const https = require('https');
        const querystring = require('querystring');
        
        // Map order parameter to YouTube API order values
        const orderMap = {
          'relevance': 'relevance',
          'date': 'date',
          'viewCount': 'viewCount',
          'rating': 'rating'
        };
        const apiOrder = orderMap[order] || 'relevance';
        
        // Use YouTube Data API v3 with API key
        const apiKey = 'AIzaSyDFLprO5B-qKsoHprb8BooVmVTT0B5Mnus';
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?${querystring.stringify({
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults: limit,
          order: apiOrder,
          key: apiKey
        })}`;
        
        const apiResponse = await new Promise((resolve, reject) => {
          https.get(apiUrl, {
            headers: {
              'Accept': 'application/json',
              'Referer': 'https://lambdallmproxy.pages.dev/'
            }
          }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              if (res.statusCode === 200) {
                resolve(data);
              } else {
                reject(new Error(`YouTube API returned status ${res.statusCode}: ${data}`));
              }
            });
          }).on('error', reject);
        });
        
        const apiData = JSON.parse(apiResponse);
        const videoIds = (apiData.items || []).map(item => item.id.videoId);
        
        // Fetch captions information and transcripts for all videos
        const captionsInfoPromises = videoIds.map(async (videoId) => {
          try {
            // First, check for caption availability using the API
            const captionsUrl = `https://www.googleapis.com/youtube/v3/captions?${querystring.stringify({
              part: 'snippet',
              videoId: videoId,
              key: apiKey
            })}`;
            
            const captionsData = await new Promise((resolve, reject) => {
              https.get(captionsUrl, {
                headers: {
                  'Accept': 'application/json',
                  'Referer': 'https://lambdallmproxy.pages.dev/'
                }
              }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                  if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                  } else {
                    resolve(null);
                  }
                });
              }).on('error', () => resolve(null));
            });
            
            if (captionsData && captionsData.items && captionsData.items.length > 0) {
              // Find English caption track
              const enCaption = captionsData.items.find(c => 
                c.snippet.language === 'en' || c.snippet.language.startsWith('en')
              ) || captionsData.items[0];
              
              // Note: YouTube's timedtext API for fetching transcripts is restricted
              // and requires OAuth authentication which is not feasible in serverless context.
              // We can only detect caption availability, not fetch content.
              
              return { 
                videoId, 
                hasCaptions: true, 
                captionId: enCaption.id, 
                language: enCaption.snippet.language,
                trackKind: enCaption.snippet.trackKind // 'standard' or 'asr'
              };
            }
            return { videoId, hasCaptions: false, transcript: null };
          } catch (err) {
            return { videoId, hasCaptions: false, transcript: null };
          }
        });
        
        const captionsInfo = await Promise.all(captionsInfoPromises);
        const captionsMap = {};
        captionsInfo.forEach(info => {
          captionsMap[info.videoId] = info;
        });
        
        const videos = (apiData.items || []).map(item => {
          const videoId = item.id.videoId;
          const captionInfo = captionsMap[videoId] || {};
          
          const videoData = {
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: item.snippet.title,
            description: item.snippet.description,
            channel: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails?.default?.url || item.snippet.thumbnails?.medium?.url || '',
            hasCaptions: captionInfo.hasCaptions || false
          };
          
          // Include caption details if available
          if (captionInfo.hasCaptions) {
            videoData.captionLanguage = captionInfo.language;
            videoData.captionType = captionInfo.trackKind === 'asr' ? 'auto-generated' : 'manual';
            videoData.captionsNote = `${videoData.captionType === 'auto-generated' ? 'Auto-generated' : 'Manual'} captions available in ${captionInfo.language}. View on YouTube to access full captions.`;
          }
          
          return videoData;
        });
        
        return JSON.stringify({
          query,
          count: videos.length,
          order,
          videos
        });
        
      } catch (error) {
        console.error('YouTube search error:', error);
        return JSON.stringify({ 
          error: `YouTube search failed: ${error.message}`,
          query 
        });
      }
    }
    
    default:
      return JSON.stringify({ error: `unknown function ${name}` });
  }
}

// Analyze source credibility and identify corroborating information
function analyzeSourceCredibility(results) {
  // Define authoritative domain patterns
  const authoritativeDomains = [
    'gov', 'edu', 'org', 'wikipedia.org', 'britannica.com', 'reuters.com', 
    'bbc.com', 'cnn.com', 'nytimes.com', 'wsj.com', 'nature.com', 'science.org'
  ];
  
  // Score sources based on domain authority and content quality
  const scoredResults = results.map(result => {
    let credibilityScore = 1;
    const url = result.url || '';
    const domain = url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    
    // Boost score for authoritative domains
    if (authoritativeDomains.some(authDomain => domain.includes(authDomain))) {
      credibilityScore += 2;
    }
    
    // Boost score for HTTPS
    if (url.startsWith('https://')) {
      credibilityScore += 0.5;
    }
    
    // Boost score for longer, more detailed descriptions
    if (result.description && result.description.length > 100) {
      credibilityScore += 0.5;
    }
    
    // Boost score if content is available
    if (result.content && result.content.length > 200) {
      credibilityScore += 1;
    }
    
    return { ...result, credibilityScore };
  });
  
  // Sort by credibility score (highest first) but maintain some diversity
  return scoredResults.sort((a, b) => b.credibilityScore - a.credibilityScore);
}

// Pick an available model and API key for summarization
function selectSummaryModel() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  
  // Prefer Groq for summaries since it's working and has good rate limits
  if (groqKey) {
    const m = process.env.GROQ_MODEL ? `groq:${process.env.GROQ_MODEL}` : 'groq:llama-3.1-8b-instant';
    return { model: m, apiKey: groqKey };
  }
  if (openaiKey) {
    const m = process.env.OPENAI_MODEL ? `openai:${process.env.OPENAI_MODEL}` : 'openai:gpt-4o-mini';
    return { model: m, apiKey: openaiKey };
  }
  return { model: null, apiKey: null };
}

// Build a concise prompt for summaries with essential citations only
function buildSummaryPrompt(query, results, hasContent) {
  const maxItems = Math.min(results.length, 2); // Emergency limit: max 2 sources
  
  // Build minimal source information to save tokens
  const items = results.slice(0, maxItems).map((r, i) => {
    const desc = String(r.description || '').slice(0, 120); // Drastically reduced from 400
    const content = hasContent && r.content ? extractKeyContent(String(r.content), query) : ''; // Using intelligent extraction
    
    const parts = [
      `${r.title || ''}`, // Removed "Title:" prefix to save tokens
      `${r.url || ''}`,   // Removed "URL:" prefix
      desc || ''
    ];
    if (content) parts.push(content);
    return `${i + 1}. ${parts.filter(Boolean).join(' | ')}`;
  }).join('\n');

  return `Concisely summarize key facts for: ${query}

Sources:
${items}

Requirements: Cite URLs, prioritize facts from multiple sources, 2-3 sentences max.`;
}

module.exports = {
  toolFunctions,
  callFunction,
  compressSearchResultsForLLM
};
