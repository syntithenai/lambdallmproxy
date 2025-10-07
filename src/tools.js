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
      description: 'Search the web for articles, news, current events, and text-based content. Use for general information, research, news, facts, and documentation. **DO NOT USE for YouTube or video searches** - use search_youtube instead. Can accept either a single query string or an array of queries. Returns search result fields including title, url, description, score, and content when requested. **CRITICAL: You MUST include relevant URLs from search results in your response using markdown links [Title](URL) to cite sources and enable verification.**',
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
          timeout: { type: 'integer', minimum: 1, maximum: 60, default: 15 },
          load_content: { type: 'boolean', default: false, description: 'When true, fetch full page content for each result'},
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
  
  switch (name) {
    case 'search_web': {
      // Handle both single query (string) and multiple queries (array)
      const queryInput = args.query;
      const queries = Array.isArray(queryInput) 
        ? queryInput.map(q => String(q || '').trim()).filter(Boolean)
        : [String(queryInput || '').trim()].filter(Boolean);
      
      if (queries.length === 0) return JSON.stringify({ error: 'query required' });
      
      const limit = clampInt(args.limit, 1, 50, 3);
      const timeout = clampInt(args.timeout, 1, 60, 15);
      const loadContent = args.load_content === true;
      const generateSummary = args.generate_summary === true;
      
      // Check if Tavily API key is available
      const tavilyApiKey = context.tavilyApiKey;
      const useTavily = tavilyApiKey && tavilyApiKey.trim().length > 0;
      
      console.log(`🔍 Search using: ${useTavily ? 'Tavily API' : 'DuckDuckGo'}`);
      
      const allResults = [];
      let searchService = 'duckduckgo'; // Track which service was actually used
      
      if (useTavily) {
        // Use Tavily API for search
        try {
          const tavilyResults = await tavilySearch(queries, {
            apiKey: tavilyApiKey,
            maxResults: limit,
            includeAnswer: false,
            includeRawContent: loadContent, // This ensures content is loaded when requested
            searchDepth: 'basic'
          });
          
          allResults.push(...tavilyResults);
          searchService = 'tavily';
          console.log(`✅ Tavily search completed: ${tavilyResults.length} results`);
        } catch (error) {
          console.error('Tavily search failed, falling back to DuckDuckGo:', error.message);
          // Fall back to DuckDuckGo on error
          const searcher = new DuckDuckGoSearcher();
          for (const query of queries) {
            const out = await searcher.search(query, limit, loadContent, timeout);
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
              content: loadContent && r.content ? extractKeyContent(r.content, query) : null
            }));
            allResults.push(...results);
          }
        }
      } else {
        // Use DuckDuckGo search
        const searcher = new DuckDuckGoSearcher();
        
        // Execute searches for all queries
        for (const query of queries) {
          const out = await searcher.search(query, limit, loadContent, timeout);
        // Include all fields from raw search response, applying content extraction when loaded
        const results = (out?.results || []).map(r => {
          // Always include all core fields: title, url, description, score, duckduckgoScore, state
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
            content: null // Always include content field, default to null
          };
          
          if (loadContent && r.content) {
            // Apply intelligent content extraction for loaded content
            result.content = extractKeyContent(r.content, query);
            result.originalLength = r.content.length;
            result.intelligentlyExtracted = true;
            if (r.truncated) result.truncated = r.truncated;
            if (r.contentError) result.contentError = r.contentError;
          } else if (loadContent) {
            // Include content-related fields even if content wasn't loaded
            result.content = r.content || null;
            if (r.contentError) result.contentError = r.contentError;
          }
          
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
              console.log(`📄 Generating individual summaries for ${results.length} loaded pages...`);
              
              const pageSummaries = [];
              
              // Step 1: Generate one summary per loaded page
              for (let i = 0; i < results.length; i++) {
                const result = results[i];
                
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
                  const pagePrompt = `Summarize the key information from this webpage that is relevant to the query: "${query}"

Page: ${result.title}
URL: ${result.url}
Content:
${result.content.substring(0, 2000)}

Provide a concise 2-3 sentence summary focusing on information relevant to the query.`;

                  const pageSummaryInput = [
                    { role: 'system', content: 'You are a research analyst. Extract and summarize key information from web content.' },
                    { role: 'user', content: pagePrompt }
                  ];
                  
                  const pageSummaryRequestBody = {
                    model,
                    input: pageSummaryInput,
                    tools: [],
                    options: {
                      apiKey,
                      temperature: 0.2,
                      max_tokens: 200,
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
                      model,
                      timestamp: new Date().toISOString()
                    });
                  }
                  
                  const pageResp = await llmResponsesWithTools(pageSummaryRequestBody);
                  const pageSummaryText = pageResp?.text || pageResp?.finalText || 'Unable to generate summary';
                  
                  // Emit LLM response event
                  if (context?.writeEvent) {
                    context.writeEvent('llm_response', {
                      phase: 'page_summary',
                      tool: 'search_web',
                      page_index: i,
                      url: result.url,
                      model,
                      summary: pageSummaryText,
                      timestamp: new Date().toISOString()
                    });
                  }
                  
                  pageSummaries.push({
                    url: result.url,
                    title: result.title,
                    summary: pageSummaryText
                  });
                  
                  console.log(`✅ Generated summary for page ${i + 1}/${results.length}: ${result.url}`);
                  
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
              
              const synthesisPrompt = `Based on the following page summaries, provide a comprehensive answer to the query: "${query}"

Page Summaries:
${pageSummaries.map((ps, i) => `${i + 1}. ${ps.title} (${ps.url})
   ${ps.summary}`).join('\n\n')}

Provide a comprehensive 3-5 sentence synthesis that integrates information from all sources. Cite URLs when mentioning specific facts.`;

              const synthesisInput = [
                { role: 'system', content: 'You are a research analyst. Synthesize information from multiple sources into a comprehensive answer.' },
                { role: 'user', content: synthesisPrompt }
              ];
              
              const synthesisRequestBody = {
                model,
                input: synthesisInput,
                tools: [],
                options: {
                  apiKey,
                  temperature: 0.2,
                  max_tokens: 300,
                  timeoutMs: 30000
                }
              };
              
              // Emit LLM request event
              if (context?.writeEvent) {
                context.writeEvent('llm_request', {
                  phase: 'synthesis_summary',
                  tool: 'search_web',
                  model,
                  page_count: pageSummaries.length,
                  timestamp: new Date().toISOString()
                });
              }
              
              const synthesisResp = await llmResponsesWithTools(synthesisRequestBody);
              
              // Emit LLM response event
              if (context?.writeEvent) {
                context.writeEvent('llm_response', {
                  phase: 'synthesis_summary',
                  tool: 'search_web',
                  model,
                  response: synthesisResp,
                  timestamp: new Date().toISOString()
                });
              }
              
              summary = synthesisResp?.text || synthesisResp?.finalText || null;
              console.log(`✅ Generated comprehensive synthesis from ${pageSummaries.length} pages`);
              
            } else {
              // STRATEGY 2: Content not loaded - summarize URLs and descriptions only
              console.log(`🔍 Generating summary from ${results.length} search result descriptions...`);
              
              const enhancedResults = analyzeSourceCredibility(results);
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
              
              // Emit LLM response event
              if (context?.writeEvent) {
                context.writeEvent('llm_response', {
                  phase: 'description_summary',
                  tool: 'search_web',
                  model,
                  response: resp,
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
      
      // Build complete response with all raw search fields
      const response = {
        searchService: searchService, // Indicate which service was used: 'tavily' or 'duckduckgo'
        queries: queries, // Include all queries that were executed
        multiQuery: queries.length > 1,
        totalResults: allResults.length,
        resultsByQuery: resultsByQuery,
        limit: limit,
        fetchContent: loadContent,
        timeout: timeout,
        timestamp: new Date().toISOString(),
        results: allResults, // All results combined
        // Summary fields (only included if summary generation was attempted)
        ...(generateSummary && { 
          generate_summary: generateSummary,
          summary, 
          summary_model, 
          summary_error,
          // Include individual page summaries when content was loaded
          ...(loadContent && individual_summaries && { individual_summaries })
        })
      };
      
      const responseStr = JSON.stringify(response);
      const estimatedTokens = estimateTokens(responseStr);
      
      // Token limiting with more reasonable thresholds
      if (estimatedTokens > 4000) {
        const truncatedResults = results.slice(0, Math.ceil(results.length / 2)).map(r => ({
          ...r,
          description: (r.description || '').substring(0, 200),
          content: r.content ? r.content.substring(0, 500) : r.content
        }));
        console.warn(`⚠️ Response too large (${estimatedTokens} tokens), truncating results`);
        return JSON.stringify({ 
          ...response, 
          results: truncatedResults, 
          count: truncatedResults.length,
          summary: summary ? (summary.length > 200 ? summary.substring(0, 200) + '...' : summary) : summary,
          truncated: true,
          original_count: results.length,
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
        
        const response = {
          scrapeService: scrapeService, // Indicate which service was used: 'tavily' or 'duckduckgo'
          url,
          content,
          format,
          originalLength,
          extractedLength,
          compressionRatio
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
              context._output = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
              ).join(' '); 
            }
          },
          _output: null
        };
        
        // Create VM context
        const vmContext = vm.createContext(context);
        
        // Execute code with timeout
        const result = vm.runInContext(code, vmContext, { 
          timeout,
          displayErrors: true 
        });
        
        // Return console output if available, otherwise the result
        const output = context._output !== null ? context._output : result;
        
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
  callFunction
};
