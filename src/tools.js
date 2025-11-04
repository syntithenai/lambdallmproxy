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
const { scrapeWithTierFallback } = require('./scrapers/tier-orchestrator');
console.log('🚀 [tools.js] Module loaded - scrapeWithTierFallback imported:', typeof scrapeWithTierFallback);
const vm = require('vm');

// AWS Lambda client for invoking Puppeteer Lambda
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Lazy-load Lambda client to avoid initialization during imports (especially in tests)
let lambdaClient = null;
function getLambdaClient() {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({ region: process.env.AWS_RGN || 'us-east-1' });
  }
  return lambdaClient;
}

// MCP (Model Context Protocol) support
const mcpClient = require('./mcp/client');
const mcpCache = require('./mcp/tool-cache');

// Cache system for search results, transcriptions, and scrapes
const { getCacheKey, getFromCache, saveToCache, initializeCache, getCachedOrFetch } = require('./utils/cache');

/**
 * Cached search wrapper - checks cache before calling search API
 * @param {string} query - Search query
 * @param {string} service - Search service ('tavily' or 'duckduckgo')
 * @param {number} maxResults - Maximum results
 * @param {Function} searchFunction - Async function that performs the search
 * @returns {Promise<Array>} Search results (from cache or API)
 */
async function cachedSearch(query, service, maxResults, searchFunction) {
  // Generate cache key
  const cacheKey = getCacheKey('search', {
    query: query,
    service: service,
    maxResults: maxResults
  });
  
  // Try to get from cache
  try {
    const cachedResults = await getFromCache('search', cacheKey);
    if (cachedResults) {
      console.log(`💾 Cache HIT for ${service} search: "${query}" (${cachedResults.length} results)`);
      return { results: cachedResults, fromCache: true };
    }
  } catch (error) {
    console.warn(`Cache read error for query "${query}":`, error.message);
  }
  
  // Cache miss - fetch from API
  console.log(`🔍 Cache MISS for ${service} search: "${query}" - fetching from API`);
  const results = await searchFunction();
  
  // Save to cache (non-blocking)
  if (results && Array.isArray(results) && results.length > 0) {
    saveToCache('search', cacheKey, results, 3600).catch(error => {
      console.warn(`Cache write error for query "${query}":`, error.message);
    });
  }
  
  return { results, fromCache: false };
}

// Puppeteer invocation helper with local development support
async function invokePuppeteerLambda(url, options = {}) {
  const puppeteerLambdaArn = process.env.PPT_ARN;
  const isLocalDev = process.env.ENV === 'development' || !puppeteerLambdaArn;
  
  // Get proxy configuration from environment
  const proxyUsername = process.env.PXY_USER;
  const proxyPassword = process.env.PXY_PASS;
  const proxyEnabled = proxyUsername && proxyPassword;
  
  // LOCAL DEVELOPMENT: Use local Puppeteer scraper
  if (isLocalDev) {
    console.log('🏠 [Puppeteer Local] Running locally (development mode)');
    console.log(`   URL: ${url}`);
    console.log(`   Proxy: ${proxyEnabled ? 'enabled' : 'disabled'}`);
    console.log(`   Options:`, JSON.stringify(options, null, 2));
    
    try {
      const localScraper = require('./scrapers/puppeteer-local');
      
      // Configure proxy if available
      let proxyServer = null;
      if (proxyEnabled) {
        // Use HTTP proxy format for Puppeteer
        proxyServer = 'http://p.webshare.io:80';
      }
      
      // Pass through progress callback if provided
      const result = await localScraper.scrapePage(url, {
        ...options,
        onProgress: options.onProgress || null,
        proxyServer,
        proxyUsername,
        proxyPassword
      });
      
      // Add proxy info to result
      if (result) {
        result.proxyUsed = proxyEnabled;
      }
      
      return result;
    } catch (error) {
      console.error('❌ [Puppeteer Local] Failed:', error.message);
      
      // If local Puppeteer fails and we have Lambda ARN, fall back to Lambda
      if (puppeteerLambdaArn) {
        console.log('⚠️ [Puppeteer] Falling back to Lambda after local failure');
      } else {
        throw error;
      }
    }
  }
  
  // PRODUCTION: Invoke remote Lambda function
  const payload = {
    url,
    timeout: options.timeout || 30000,
    waitForNetworkIdle: options.waitForNetworkIdle !== false,
    extractLinks: options.extractLinks !== false,
    extractImages: options.extractImages !== false,
    screenshot: options.screenshot || false,
    proxyEnabled  // Pass proxy status to Lambda
  };
  
  console.log(`🚀 [Puppeteer Lambda] Invoking function: ${puppeteerLambdaArn}`);
  console.log(`   Proxy: ${proxyEnabled ? 'enabled' : 'disabled'}`);
  
  // Report progress if callback provided
  if (options.onProgress) {
    options.onProgress({ stage: 'invoking_lambda', url });
  }
  
  const command = new InvokeCommand({
    FunctionName: puppeteerLambdaArn,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify(payload)
  });
  
  const response = await getLambdaClient().send(command);
  const responsePayload = JSON.parse(new TextDecoder().decode(response.Payload));
  
  if (responsePayload.statusCode !== 200) {
    const body = JSON.parse(responsePayload.body);
    throw new Error(body.error || 'Puppeteer Lambda invocation failed');
  }
  
  const body = JSON.parse(responsePayload.body);
  
  if (!body.success) {
    throw new Error(body.error || 'Puppeteer Lambda returned failure');
  }
  
  if (options.onProgress) {
    options.onProgress({ stage: 'complete', result: body.data });
  }
  
  return body.data;
}

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
  // CRITICAL: Use page_content for complete media (not truncated like result.images)
  const allImages = [];
  const allYoutube = [];
  const allMedia = [];
  
  for (const result of results) {
    // Prefer page_content (untruncated) over result.images (truncated to 1)
    if (result.page_content?.images) {
      allImages.push(...result.page_content.images);
    } else if (result.images) {
      allImages.push(...result.images);
    }
    
    // Same for videos and media
    if (result.page_content?.videos) {
      allYoutube.push(...result.page_content.videos);
    } else if (result.youtube) {
      allYoutube.push(...result.youtube);
    }
    
    if (result.page_content?.media) {
      allMedia.push(...result.page_content.media);
    } else if (result.media) {
      allMedia.push(...result.media);
    }
  }
  
  // Add CRITICAL URLS section at the top (before media) - THIS IS MANDATORY FOR LLM TO SEE
  if (allUrls.length > 0) {
    sections.push('\n═══════════════════════════════════════════════════════════════════════════════');
    sections.push('🚨 IMPORTANT: REVIEW THESE URLS BEFORE RESPONDING 🚨');
    sections.push('═══════════════════════════════════════════════════════════════════════════════');
    sections.push('Helpful URLs you can cite as clickable markdown links:');
    sections.push('');
    for (let i = 0; i < allUrls.length; i++) {
      const { title, url } = allUrls[i];
      sections.push(`${i + 1}. [${title}](${url})`);
    }
    sections.push('');
    sections.push('✅ Suggested: Include these markdown links when summarizing sources');
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
      description: '🎬 SEARCH/FIND YouTube videos (NOT for transcription). Use when user wants to FIND or SEARCH for videos. **DO NOT USE if user wants to transcribe, get transcript, or extract text from a specific YouTube URL** - use transcribe_url or get_youtube_transcript instead. Use search_youtube for: "find YouTube videos about X", "search YouTube for X", "show me videos about X". Returns video titles, descriptions, links, and caption availability. Results are automatically added to a playlist. **CRITICAL: You MUST include ALL video URLs in your response as a formatted markdown list with [Title](URL) format.**',
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
          },
          generate_summary: {
            type: 'boolean',
            description: 'When true, generate a single LLM summary of all video transcripts (batch processing). Useful for comparing or synthesizing information across multiple videos.',
            default: false
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
      name: 'get_youtube_transcript',
      description: '📝 Get detailed YouTube video transcript with timestamps and metadata. **USE THIS when user wants timestamps, segments, or detailed transcript info** (e.g., "get transcript with timestamps", "show me the captions at 1:30", "what language is the video in"). For simple text transcription without timestamps, use transcribe_url instead. **REQUIRES: YouTube OAuth authentication** (user must be logged in and have YouTube enabled in settings). Returns structured data with: full text, timed segments, language info, duration, and whether captions are auto-generated.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'YouTube video URL (youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...)'
          },
          include_timestamps: {
            type: 'boolean',
            default: true,
            description: 'Include detailed timestamps for each segment (default: true)'
          },
          language: {
            type: 'string',
            default: 'en',
            description: 'Preferred language code (e.g., "en", "es", "fr", "de"). Falls back to English if not available.'
          },
          generate_summary: {
            type: 'boolean',
            description: 'When true, generate an LLM summary of the transcript to reduce content size. Useful for long transcripts.',
            default: false
          }
        },
        required: ['url'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: '🌐 **AUTOMATICALLY USE FOR**: (1) Current events, news, recent information, or anything after your knowledge cutoff, (2) Facts that need verification or citations, (3) Up-to-date statistics, prices, or data, (4) Recent developments in any field, (5) Any query mentioning "search", "look up", "find", "research", or "current". **MANDATORY**: Always provide references and cite sources with URLs in your response using markdown links [Title](URL). Use for general information, research, news, facts, and documentation. **DO NOT USE for YouTube or video searches** - use search_youtube instead. Can accept either a single query string or an array of queries. Automatically fetches and extracts full page content from all search results, including images and links. Returns comprehensive search result fields including title, url, description, score, content, images, and links.',
      strict: true,
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
      strict: true,
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
      description: `🧮 Execute JavaScript code in a secure sandbox environment with async/await support.

⚠️ **ONLY USE THIS TOOL WHEN**:
1. User explicitly asks to "run code", "execute JavaScript", or "test this code"
2. Problem requires COMPUTATION or DATA PROCESSING (calculate factorial, sort array, compute statistics, parse data)
3. Demonstrating CODE BEHAVIOR or showing how code works with examples
4. Mathematical CALCULATIONS that require variables or complex formulas

❌ **ABSOLUTELY DO NOT USE FOR**:
- General knowledge questions that can be answered with text
- Creative writing, stories, articles, or prose content (NEVER use this to generate text content)
- Comparisons of frameworks/technologies (React vs Vue, Python vs JavaScript)
- Explaining concepts (how async/await works, what is a closure)
- Performance benchmarks or theoretical comparisons (unless user provides specific benchmark code to run)
- Questions that don't involve executing code
- Generating or storing text strings as variables (if you're just creating string variables, YOU DON'T NEED THIS TOOL)
- Any task where you're just assigning text to variables and logging them

🚫 **CREATIVE CONTENT PROHIBITION**: This tool is for COMPUTATION ONLY. If you find yourself writing code that just creates string variables with prose/stories/articles and logs them, STOP. You can write that content directly in your response. This tool is NOT a text editor or content management system.

**EXAMPLES OF WHEN TO USE**:
✅ "Calculate compound interest for $10000 at 7% over 15 years"
✅ "Run this code and tell me the output: console.log([1,2,3].map(x => x*2))"
✅ "Sort this array of objects by price: [{name: 'A', price: 50}, {name: 'B', price: 30}]"
✅ "Execute a quicksort algorithm on [5,2,8,1,9]"
✅ "Calculate factorial of 10"

**EXAMPLES OF WHEN NOT TO USE**:
❌ "Compare React, Vue, and Angular" → Just explain the differences
❌ "What is the performance of different sorting algorithms?" → Explain theoretically
❌ "How does async/await work?" → Provide educational explanation
❌ "Which framework is better for my use case?" → Give recommendations
❌ "Write an introduction for my story" → JUST WRITE THE TEXT, don't wrap it in JavaScript!
❌ "Generate content for my blog post" → WRITE THE CONTENT DIRECTLY, this is not a text editor!

**TECHNICAL DETAILS**:
Returns console output and execution result. Use console.log() to display results. Supports async/await, Promises, setTimeout/clearTimeout. Example: "const principal = 10000; const rate = 0.07; const time = 15; const amount = principal * Math.pow(1 + rate, time); console.log(\`Final amount: $\${amount.toFixed(2)}\`);"

Call this tool with ONLY the code parameter - never include result, output, type, or executed_at fields as these are generated automatically.`,
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          code: { 
            type: 'string', 
            description: 'JavaScript code to execute. Can use async/await, Promises, and setTimeout. Include console.log() statements to display results. Example: "const area = Math.PI * 5 * 5; console.log(`Area: ${area}`);". Async example: "await new Promise(resolve => setTimeout(resolve, 1000)); console.log(\'Done\');". DO NOT include any result or execution metadata - only provide the code string.'
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
      description: '🎙️ **PRIMARY TOOL FOR GETTING VIDEO/AUDIO TEXT CONTENT**: Transcribe audio or video content from URLs using Groq Whisper (FREE) or OpenAI Whisper. **PREFERS GROQ** (free transcription) over OpenAI (paid). **MANDATORY USE** when user says: "transcribe", "transcript", "get text from", "what does the video say", "extract dialogue", "convert to text", OR provides a specific YouTube/video URL and asks about its content. **YOUTUBE SUPPORT**: Can transcribe directly from YouTube URLs (youtube.com, youtu.be, youtube.com/shorts). Also supports direct media URLs (.mp3, .mp4, .wav, .m4a, etc.). Automatically handles large files by chunking. Shows real-time progress with stop capability. Returns full transcription text. Use when user wants to: transcribe audio/video, get text from speech, analyze spoken content, extract dialogue, or convert voice to text.',
      strict: true,
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
          },
          generate_summary: {
            type: 'boolean',
            description: 'When true, generate an LLM summary of the transcript to reduce content size. Useful for long transcripts.',
            default: false
          }
        },
        required: ['url'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: '🎨 Generate images using AI and display them IMMEDIATELY in the UI. **IMPORTANT: ONLY call this tool ONCE per image request - the image will appear automatically in the conversation, DO NOT call it multiple times for the same request.** Automatically selects the best provider and model, generates the image, and injects it directly into the UI. **Defaults to fast/draft quality (<$0.001) for cost efficiency** - only uses higher quality when explicitly requested. **Supports reference images** - can use images from user messages as context/reference for style transfer or compositional guidance. Supports quality tiers: ultra (photorealistic, $0.08-0.12), high (detailed/artistic, $0.02-0.04), standard (illustrations, $0.001-0.002), fast (quick drafts, <$0.001 - DEFAULT). Multi-provider support: OpenAI DALL-E, Together AI Stable Diffusion, Replicate models. Automatically handles provider failures with intelligent fallback.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed image description. Be specific about subject, style, lighting, composition, mood. Examples: "A serene mountain landscape at sunset with golden light", "Photorealistic portrait of a smiling woman in professional attire", "Cartoon-style illustration of a friendly robot"'
          },
          quality: {
            type: 'string',
            enum: ['ultra', 'high', 'standard', 'fast'],
            description: 'Quality tier: ultra (photorealistic, 4k, professional), high (detailed, artistic), standard (normal, illustration), fast (quick, draft, sketch - DEFAULT). Defaults to fast unless explicitly specified or detected from prompt keywords like "photorealistic", "high quality", "detailed".'
          },
          size: {
            type: 'string',
            enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
            description: 'Image dimensions. Square: 256x256, 512x512, 1024x1024. Landscape: 1792x1024. Portrait: 1024x1792. Default: 1024x1024'
          },
          style: {
            type: 'string',
            enum: ['natural', 'vivid'],
            description: 'DALL-E 3 only: natural (more realistic) or vivid (hyper-real, dramatic). Default: natural'
          },
          reference_images: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Optional: Array of base64-encoded images or data URLs to use as reference/context. Extract from user messages with image attachments. Format: ["data:image/png;base64,iVBORw0KG...", "data:image/jpeg;base64,/9j/4AAQ..."]. Used for image-to-image, style transfer, or compositional reference.'
          }
        },
        required: ['prompt'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_chart',
      description: '📊 **PRIMARY TOOL FOR ALL DIAGRAMS, CHARTS, AND VISUALIZATIONS**: Generate professional Mermaid diagrams automatically rendered as interactive SVG in the UI. **MANDATORY USE** when user requests: flowcharts, sequence diagrams, class diagrams, state diagrams, ER diagrams, Gantt charts, pie charts, mindmaps, git graphs, or ANY visual diagram/chart/visualization. **DO NOT use execute_javascript to generate charts - ALWAYS use this tool instead.** This tool generates beautiful, interactive diagrams that render directly in the UI. Simply call this tool and the system will handle the Mermaid code generation automatically. **Keywords that require this tool**: diagram, chart, flowchart, visualization, graph, workflow, process flow, data flow, architecture diagram, UML, ERD, timeline, mindmap.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Clear description of what the chart should visualize. Examples: "software development lifecycle from planning to deployment", "user authentication flow with JWT tokens", "database schema for e-commerce site with orders and customers", "project timeline for website launch", "state machine for order processing"'
          },
          chart_type: {
            type: 'string',
            enum: ['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'git', 'mindmap'],
            default: 'flowchart',
            description: 'Type of diagram: flowchart (processes/workflows/decisions), sequence (interactions/API calls/message flows), class (OOP structure/relationships), state (state machines/transitions), er (database schema/relationships), gantt (project timeline/schedule), pie (proportions/percentages), git (version control branches), mindmap (hierarchical concepts/brainstorming)'
          }
        },
        required: ['description'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: '📚 **SEARCH INTERNAL KNOWLEDGE BASE**: Perform vector similarity search against the ingested documentation and knowledge base. **USE THIS when user asks about**: project documentation, API references, implementation guides, architecture, deployment procedures, RAG system, embedding models, or any topics covered in the knowledge base. **EXCELLENT for**: finding specific code examples, configuration details, API endpoints, best practices, and technical documentation. Returns relevant text chunks with source file names and similarity scores. **Always use this BEFORE search_web when the question might be answered by internal documentation.**',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query. Be specific and include key terms. Examples: "How do I configure OpenAI embeddings?", "What is the RAG implementation?", "How to deploy Lambda functions?"'
          },
          top_k: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            default: 5,
            description: 'Number of most relevant results to return (default: 5, max: 20)'
          },
          threshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            default: 0.3,
            description: 'Minimum similarity score threshold (0-1). Higher values = more strict matching. Default: 0.3 (relaxed for better recall)'
          },
          source_type: {
            type: 'string',
            enum: ['file', 'url', 'text'],
            description: 'Optional: Filter results by source type (file, url, or text)'
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
      name: 'manage_todos',
      description: '✅ **MANAGE BACKEND TODO QUEUE**: Add or delete actionable steps for multi-step tasks. The backend maintains a server-side todo queue that tracks progress through complex workflows. When todos exist, they auto-progress after each successful completion (assessor "OK"). **USE THIS when**: user requests a multi-step plan, breaking down complex tasks, tracking implementation progress, or managing sequential workflows. **DO NOT use for simple single-step tasks.** After adding todos, the system will automatically advance through them, appending each next step as it completes. **Keywords**: plan, steps, todo list, break down task, multi-step workflow, implementation phases.',
      parameters: {
        type: 'object',
        properties: {
          add: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of todo descriptions to add to the queue. Descriptions should be clear, actionable steps in order. Example: ["Install dependencies", "Configure environment", "Run tests", "Deploy application"]'
          },
          delete: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string', description: 'Exact todo description to delete' },
                { type: 'number', description: 'Todo ID to delete' }
              ]
            },
            description: 'Array of todo IDs (numbers) or exact descriptions (strings) to remove from the queue'
          }
        },
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_snippets',
      description: '📝 **MANAGE KNOWLEDGE SNIPPETS**: Insert, retrieve, search, or delete knowledge snippets stored in your personal Google Sheet ("Research Agent/Research Agent Swag"). Use this to save important information, code examples, procedures, references, or any content you want to preserve and search later. **USE THIS when**: user wants to save/capture content, create a knowledge base, store code snippets, bookmark important info, or search previous saved content. Each snippet can have a title, content, tags for organization, and source tracking (chat/url/file/manual). **Keywords**: save this, remember this, add to knowledge base, store snippet, save for later, search my snippets, find my notes. **IMPORTANT**: Always provide both "action" and "payload" parameters in the function call.',
      parameters: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['insert', 'capture', 'get', 'search', 'delete'],
            description: 'REQUIRED: Operation to perform. Use "insert" to add new snippet with full details, "capture" for quick save from conversation, "get" to retrieve specific snippet, "search" to find snippets, "delete" to remove snippet.'
          },
          payload: {
            type: 'object',
            description: 'Action-specific parameters. For insert/capture: provide title, content, tags. For get/delete: provide id or title. For search: provide query or tags.',
            properties: {
              // Insert/Capture fields
              title: { type: 'string', description: 'Snippet title (REQUIRED for insert/capture actions)' },
              content: { type: 'string', description: 'Snippet content/body (REQUIRED for insert action, optional for capture)' },
              tags: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Array of tags for categorization. Example: ["javascript", "async", "tutorial"]'
              },
              source: { 
                type: 'string',
                enum: ['chat', 'url', 'file', 'manual'],
                description: 'Source type. Defaults to "chat" for capture, "manual" for insert'
              },
              url: { type: 'string', description: 'Source URL if source="url"' },
              
              // Get/Delete fields
              id: { type: 'number', description: 'Snippet ID (for get/delete actions)' },
              
              // Search fields
              query: { type: 'string', description: 'Text search query - searches both title and content' }
            }
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_llm',
      description: '🤖 **RECURSIVE LLM AGENT**: Spawn a sub-agent conversation with full tool access to handle complex queries. ⚠️ **WARNING: HIGH TOKEN USAGE** - This tool creates a complete recursive conversation with all available tools (search, scrape, transcribe, execute_js, etc.) and will iterate multiple times to fully answer the query. Use ONLY when: (1) Query requires multiple steps with different tools, (2) Need deep research combining searches + scraping, (3) Complex analysis requiring calculations + data gathering, (4) User explicitly requests thorough multi-step investigation. **AVOID** for simple queries that can be answered directly or with a single tool call. The sub-agent has access to all tools EXCEPT ask_llm itself (prevents infinite recursion). Limited to 5 conversation iterations with token budget safeguards. Returns the final comprehensive answer. **COST IMPACT**: Can consume 5-10x more tokens than direct responses. **ASSESSOR OVERRIDE**: This tool is ALWAYS available to the assessor tool for query reformulation, regardless of user settings.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The question or task to pass to the sub-agent. Should be clear and complete. Example: "Search for recent quantum computing breakthroughs, scrape the top 3 results, and compare their approaches with code examples"'
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
      name: 'generate_reasoning_chain',
      description: '🧠 **DEEP REASONING CHAIN GENERATOR**: ⚠️ **EXTREME TOKEN USAGE WARNING** - This tool uses advanced reasoning models (o1-preview, DeepSeek-R1) with MAXIMUM reasoning depth to generate comprehensive step-by-step reasoning chains. **CRITICAL WARNINGS**: (1) Can consume 10-50x MORE tokens than normal responses due to extended thinking process, (2) May trigger PARALLEL ASYNCHRONOUS TOOL CALLS during reasoning, causing rapid token consumption, (3) Reasoning models charge for both reasoning tokens AND output tokens. **USE ONLY FOR**: Complex problems requiring deep logical analysis, multi-step proofs, mathematical derivations, strategic planning, or when explicit reasoning transparency is essential. **AVOID FOR**: Simple queries, factual lookups, or cost-sensitive applications. The tool takes user queries and LLM responses as context, generates a detailed reasoning chain with the model\'s thinking process exposed, and can autonomously call other tools (search, execute_js, scrape, etc.) during reasoning. All embedded tool results are injected into the final reasoning chain output. Reasoning depth is set to MAXIMUM for thoroughness.',
      parameters: {
        type: 'object',
        properties: {
          user_query: {
            type: 'string',
            description: 'The original user query or question that requires deep reasoning analysis'
          },
          llm_responses: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of previous LLM responses in the conversation to provide context for reasoning'
          },
          reasoning_goal: {
            type: 'string',
            description: 'Optional: Specific reasoning objective (e.g., "verify mathematical correctness", "identify logical fallacies", "generate step-by-step proof"). If omitted, generates general comprehensive reasoning chain.'
          }
        },
        required: ['user_query'],
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
  
  console.log(`🎯🎯🎯 [callFunction] CALLED with name='${name}', args=`, JSON.stringify(args).substring(0, 200));
  
  // DEBUG: Log context.writeEvent availability
  console.log(`🔧 TOOLS: callFunction('${name}') - context.writeEvent exists:`, typeof context.writeEvent === 'function');
  
  switch (name) {
    case 'search_web': {
      // DEBUG: Confirm writeEvent is available for search_web
      console.log('� NODEMON HOT RELOAD WORKING! search_web case entered �');
      console.log('🔧 TOOLS: search_web starting - writeEvent:', typeof context.writeEvent);
      
      // Handle both single query (string) and multiple queries (array)
      const queryInput = args.query;
      const queries = Array.isArray(queryInput) 
        ? queryInput.map(q => String(q || '').trim()).filter(Boolean)
        : [String(queryInput || '').trim()].filter(Boolean);
      
      if (queries.length === 0) return JSON.stringify({ error: 'query required' });
      
      // STEP 11: Dynamic result count based on model capacity
      const { getOptimalSearchResultCount, getOptimalContentLength } = require('./utils/content-optimizer');
      const optimalResultCount = getOptimalSearchResultCount({
        model: context.selectedModel,
        inputTokens: context.inputTokens || 1000,
        optimization: context.optimization || 'cheap'
      });
      
      const limit = clampInt(args.limit, 1, 50, optimalResultCount);
      const timeout = clampInt(args.timeout, 1, 60, 15);
      const loadContent = true; // Always load content from search results
      const generateSummary = args.generate_summary === true;
      
      // STEP 11: Dynamic content truncation based on model capacity
      const maxContentChars = getOptimalContentLength({
        model: context.selectedModel,
        inputTokens: context.inputTokens || 1000,
        optimization: context.optimization || 'cheap',
        contentType: 'webpage'
      });
      
      console.log(`📊 Content optimization: ${limit} results, ${maxContentChars} chars per page (model: ${context.selectedModel?.name || 'unknown'}, optimization: ${context.optimization || 'cheap'})`);
      
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
              
              // STEP 11: Dynamic content limit based on model capacity
              if (r.content && r.content.length > maxContentChars) {
                console.log(`✂️ Truncating Tavily result: ${r.content.length} → ${maxContentChars} chars`);
                r.content = r.content.substring(0, maxContentChars) + '\n\n[Content truncated to fit model limits]';
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
          // Fall back to DuckDuckGo on error (no proxy - direct connection)
          const searcher = new DuckDuckGoSearcher(null, null); // No proxy credentials
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
        // NOTE: Proxy disabled to reduce costs - only YouTube transcripts use proxy
        const searcher = new DuckDuckGoSearcher(null, null); // No proxy credentials
        
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
            console.log('🔍 SEARCH PROGRESS CALLBACK CALLED:', data.phase);
            if (context?.writeEvent) {
              console.log('🔍 Emitting search_progress event:', data.phase);
              context.writeEvent('search_progress', {
                tool: 'search_web',
                query: query,
                ...data,
                timestamp: new Date().toISOString()
              });
            } else {
              console.warn('⚠️ context.writeEvent is undefined, cannot emit progress');
            }
          };
          
          console.log('🔍 Creating progressCallback, context.writeEvent exists:', !!context?.writeEvent);
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
              page_content: r.page_content,
              // CRITICAL: Preserve content processing pipeline tracking fields
              rawHtml: r.rawHtml,
              rawText: r.rawText,
              afterSmartExtraction: r.afterSmartExtraction,
              beforeSummarization: r.beforeSummarization,
              afterSummarization: r.afterSummarization,
              beforeFinalTruncation: r.beforeFinalTruncation,
              sentToLLM: r.sentToLLM,
              // Preserve tier scraping metadata
              tier: r.tier,
              scrapeService: r.scrapeService,
              scrapeMethod: r.scrapeMethod,
              responseTime: r.responseTime
            };
            
            // Process loaded content
            if (r.content) {
              result.content = extractKeyContent(r.content, query);
              result.originalLength = r.content.length;
              result.intelligentlyExtracted = true;
              if (r.truncated) result.truncated = r.truncated;
              
              // STEP 11: Dynamic content limit based on model capacity
              if (result.content && result.content.length > maxContentChars) {
                console.log(`✂️ Truncating search result content: ${result.content.length} → ${maxContentChars} chars`);
                result.content = result.content.substring(0, maxContentChars) + '\n\n[Content truncated to fit model limits]';
                result.truncated = true;
              }
              
              // Extract images and links from raw HTML if available with relevance scoring
              if (r.rawHtml) {
                try {
                  const parser = new SimpleHTMLParser(r.rawHtml, query, r.url);
                  
                  // Extract top 20 most relevant images with captions
                  const images = parser.extractImages(20);
                  
                  // Extract top 30 most relevant links (reduced from unlimited)
                  const allLinks = parser.extractLinks(30);
                  
                  // Categorize links by media type
                  const categorized = parser.categorizeLinks(allLinks);
                  
                  // Initialize page_content if it doesn't exist
                  if (!result.page_content) {
                    result.page_content = {};
                  }
                  
                  // Add to page_content for frontend consumption (chat.js expects this structure)
                  if (images.length > 0) result.page_content.images = images;
                  if (categorized.youtube.length > 0) result.page_content.youtube = categorized.youtube;
                  if (categorized.video.length > 0 || categorized.audio.length > 0 || categorized.media.length > 0) {
                    result.page_content.media = [
                      ...categorized.video,
                      ...categorized.audio,
                      ...categorized.media
                    ];
                  }
                  if (categorized.regular.length > 0) result.page_content.links = categorized.regular;
                  
                  console.log(`🖼️ Extracted ${images.length} images, ${categorized.youtube.length} YouTube, ${result.page_content.media?.length || 0} media, ${categorized.regular.length} links from ${r.url}`);
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
            // INTELLIGENT MODEL SELECTION: Use 70B for text compression (summaries)
            // This is a text compression task, so use the faster 70B model
            const { getOptimalModel } = require('./utils/query-complexity');
            const originalModel = model;
            summary_model = getOptimalModel(query, { 
              isCompression: true, 
              context: context,
              provider: model.includes('together:') ? 'together' : 
                        model.includes('openai:') ? 'openai' : 
                        model.includes('groq:') ? 'groq' : 'together'
            });
            
            // If model doesn't have provider prefix and we selected a together model, add prefix
            if (!summary_model.includes(':') && summary_model.includes('meta-llama')) {
              summary_model = 'together:' + summary_model;
            }
            
            console.log(`📊 Summary generation: ${originalModel} → ${summary_model} (text compression: 70B)`);
            
            // Use summary_model for actual API call
            model = summary_model;
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
                    timeoutMs: 30000,
                    providerConfig: context?.providerConfig // Pass provider config for model filtering
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

                const synthesisStartTime = Date.now();
                const directSynthesisResp = await llmResponsesWithTools(directSynthesisRequestBody);
                const synthesisEndTime = Date.now();
                
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
                
                // Log to Google Sheets
                try {
                  const { logToGoogleSheets } = require('./services/google-sheets-logger');
                  const os = require('os');
                  const usage = directSynthesisResp?.rawResponse?.usage || {};
                  const [provider, modelName] = model.split(':');
                  
                  // Extract request ID and Lambda metrics from context
                  const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                  const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 0;
                  const memoryUsedMB = memoryLimitMB > 0 ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
                  
                  logToGoogleSheets({
                    userEmail: context?.userEmail || 'anonymous',
                    provider,
                    model: modelName || model,
                    type: 'search_summary',
                    promptTokens: usage.prompt_tokens || usage.input_tokens || 0,
                    completionTokens: usage.completion_tokens || usage.output_tokens || 0,
                    totalTokens: usage.total_tokens || 0,
                    durationMs: synthesisEndTime - synthesisStartTime,
                    timestamp: new Date().toISOString(),
                    requestId,
                    memoryLimitMB,
                    memoryUsedMB,
                    hostname: os.hostname(),
                    metadata: { query, phase: 'direct_synthesis' }
                  }).catch(err => {
                    console.error('Failed to log search summary to Google Sheets:', err.message);
                  });
                } catch (err) {
                  console.error('Google Sheets logging error (search summary):', err.message);
                }
                
                summary = directSynthesisResp?.text || directSynthesisResp?.finalText || 'Unable to generate synthesis';
                
                console.log(`✅ LOW-TPM direct synthesis complete (1 LLM call vs ${extractedInfo.length + 1} calls)`);
                console.log(`✅ Estimated token usage: ~500 tokens/call × 3 calls = ~1500 tokens (well under 30k TPM)`);
                
              } else {
                // STANDARD STRATEGY: Individual page summaries + synthesis
                // LOAD BALANCING: Rotate through multiple models to distribute TPM load
                
                // Define model pool for summarization (fast, cost-effective models)
                const provider = model.includes('openai:') ? 'openai' : 
                                model.includes('together:') ? 'together' :
                                'groq';
                const modelPool = provider === 'openai' 
                  ? ['openai:gpt-4o-mini', 'openai:gpt-3.5-turbo'] 
                  : provider === 'together'
                  ? [
                      'together:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',  // Primary: 70B for text compression
                      'together:meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',   // Fallback: 8B for simple summaries
                    ]
                  : [
                      'groq:llama-3.3-70b-versatile',      // 64k TPM
                      'groq:llama-3.1-8b-instant',         // 120k TPM
                      'groq:mixtral-8x7b-32768',           // 60k TPM
                      'groq:llama-3.2-11b-vision-preview'  // 60k TPM
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
                      timeoutMs: 20000,
                      providerConfig: context?.providerConfig // Pass provider config for model filtering
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
                  
                  const pageStartTime = Date.now();
                  const pageResp = await llmResponsesWithTools(pageSummaryRequestBody);
                  const pageEndTime = Date.now();
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
                  
                  // Log page summary to Google Sheets
                  try {
                    const { logToGoogleSheets } = require('./services/google-sheets-logger');
                    const os = require('os');
                    const usage = pageResp?.rawResponse?.usage || {};
                    const [provider, modelName] = summaryModel.split(':');
                    
                    // Extract request ID and Lambda metrics from context
                    const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 0;
                    const memoryUsedMB = memoryLimitMB > 0 ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
                    
                    logToGoogleSheets({
                      userEmail: context?.userEmail || 'anonymous',
                      provider,
                      model: modelName || summaryModel,
                      type: 'search_page_summary',
                      promptTokens: usage.prompt_tokens || usage.input_tokens || 0,
                      completionTokens: usage.completion_tokens || usage.output_tokens || 0,
                      totalTokens: usage.total_tokens || 0,
                      durationMs: pageEndTime - pageStartTime,
                      timestamp: new Date().toISOString(),
                      requestId,
                      memoryLimitMB,
                      memoryUsedMB,
                      hostname: os.hostname(),
                      metadata: { query, url: result.url, page_index: i }
                    }).catch(err => {
                      console.error('Failed to log page summary to Google Sheets:', err.message);
                    });
                  } catch (err) {
                    console.error('Google Sheets logging error (page summary):', err.message);
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
              // INTELLIGENT MODEL SELECTION: Use 70B for synthesis (text compression)
              const synthesisModel = provider === 'openai' 
                ? 'openai:gpt-4o-mini'
                : provider === 'together'
                ? 'together:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo' // Use 70B for text compression
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
                  timeoutMs: 30000,
                  providerConfig: context?.providerConfig // Pass provider config for model filtering
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
              
              const finalSynthesisStartTime = Date.now();
              const synthesisResp = await llmResponsesWithTools(synthesisRequestBody);
              const finalSynthesisEndTime = Date.now();
              
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
              
              // Log final synthesis to Google Sheets
              try {
                const { logToGoogleSheets } = require('./services/google-sheets-logger');
                const os = require('os');
                const usage = synthesisResp?.rawResponse?.usage || {};
                const [provider, modelName] = synthesisModel.split(':');
                
                // Extract request ID and Lambda metrics from context
                const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 0;
                const memoryUsedMB = memoryLimitMB > 0 ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
                
                logToGoogleSheets({
                  userEmail: context?.userEmail || 'anonymous',
                  provider,
                  model: modelName || synthesisModel,
                  type: 'search_final_synthesis',
                  promptTokens: usage.prompt_tokens || usage.input_tokens || 0,
                  completionTokens: usage.completion_tokens || usage.output_tokens || 0,
                  totalTokens: usage.total_tokens || 0,
                  durationMs: finalSynthesisEndTime - finalSynthesisStartTime,
                  timestamp: new Date().toISOString(),
                  requestId,
                  memoryLimitMB,
                  memoryUsedMB,
                  hostname: os.hostname(),
                  metadata: { query, page_count: pageSummaries.length }
                }).catch(err => {
                  console.error('Failed to log final synthesis to Google Sheets:', err.message);
                });
              } catch (err) {
                console.error('Google Sheets logging error (final synthesis):', err.message);
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
                { role: 'system', content: process.env.SYS_DIGEST || 'You are a thorough research analyst. Provide concise, accurate summaries based on search results.' },
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
                  timeoutMs: 30000,
                  providerConfig: context?.providerConfig // Pass provider config for model filtering
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
        
        // Intelligent truncation: use extractKeyContent for better preservation
        // IMPORTANT: Keep ALL results for links section (just compress content intelligently)
        const truncatedResults = allResults.map(r => ({
          ...r,
          description: r.description ? extractKeyContent(r.description, r.query) : r.description,
          content: r.content ? extractKeyContent(r.content, r.query) : r.content, // Smart extraction instead of substring
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
      console.log(`🎯 [scrape_web_content] Tool called with URL: ${args.url}`);
      const url = String(args.url || '').trim();
      if (!url) return JSON.stringify({ error: 'url required' });
      const timeout = clampInt(args.timeout, 1, 60, 15);
      
      // Check cache first
      let cachedResult = null;
      try {
        const cacheKey = getCacheKey('scrapes', { url });
        cachedResult = await getFromCache('scrapes', cacheKey);
        
        if (cachedResult) {
          console.log(`💾 Cache HIT for scrape: ${url} (${cachedResult.content?.length || 0} chars)`);
          // Add cache indicator to response
          const response = { ...cachedResult, cached: true };
          return JSON.stringify(response);
        }
      } catch (error) {
        console.warn(`Cache read error for scrape:`, error.message);
      }
      
      console.log(`🔍 Cache MISS for scrape: ${url} - fetching content with tier orchestrator`);
      
      try {
        // Use the tier orchestrator which handles:
        // - Site-specific tier selection (e.g., Quora starts at Tier 3)
        // - Automatic tier escalation on bot detection
        // - Environment-aware tier constraints (Lambda vs local)
        const result = await scrapeWithTierFallback(url, {
          timeout: timeout * 1000,
          useSiteConfig: true,  // Enable site-specific configuration
          onProgress: context?.onProgress ? (progress) => {
            // Map tier orchestrator progress to tool progress events
            if (context.onProgress) {
              context.onProgress({
                type: 'scrape_progress',
                phase: progress.phase || progress.tier,
                tier: progress.tier,
                url: url,
                message: progress.message,
                ...progress
              });
            }
          } : undefined
        });
        
        // Format response for consistency with cache format
        const response = {
          scrapeService: result.tier || 'tier_orchestrator',
          tier: result.tier,
          url: result.url || url,
          title: result.title,
          content: result.content || result.text,
          format: 'text',
          originalLength: (result.content || result.text || '').length,
          extractedLength: (result.content || result.text || '').length,
          compressionRatio: 1.0,
          images: result.images && result.images.length > 0 ? result.images.slice(0, 3) : undefined,
          allImages: result.images,
          links: result.links,
          meta: result.meta,
          stats: result.stats
        };
        
        console.log(`✅ [Tier ${result.tier}] Scraping complete: ${response.content.length} chars`);
        
        // Save to cache
        try {
          const cacheKey = getCacheKey('scrapes', { url });
          saveToCache('scrapes', cacheKey, response, 3600).catch(err => 
            console.warn(`Cache write error:`, err.message)
          );
        } catch (error) {
          console.warn(`Cache error:`, error.message);
        }
        
        return JSON.stringify(response);
      } catch (tierError) {
        console.error(`❌ [Tier Orchestrator] Failed:`, tierError.message);
        return JSON.stringify({ 
          error: `Scraping failed: ${tierError.message}`,
          url: url 
        });
      }
    }
    case 'search_knowledge_base': {
      const query = String(args.query || '').trim();
      if (!query) return JSON.stringify({ error: 'query required' });
      
      const topK = clampInt(args.top_k, 1, 20, 5);
      // Lower default threshold from 0.5 to 0.3 for more relaxed matching
      // 0.5 is too strict and filters out semantically similar but differently worded queries
      const threshold = typeof args.threshold === 'number' 
        ? Math.max(0, Math.min(1, args.threshold)) 
        : 0.3;
      const sourceType = args.source_type || null;
      
      console.log(`📚 RAG Search: query="${query}", topK=${topK}, threshold=${threshold}, sourceType=${sourceType || 'all'}`);
      
      // Emit search start event
      if (context?.writeEvent) {
        context.writeEvent('search_progress', {
          tool: 'search_knowledge_base',
          phase: 'searching',
          query: query,
          topK: topK,
          threshold: threshold,
          timestamp: new Date().toISOString()
        });
      }
      
      try {
        // Set environment for libSQL
        if (!process.env.DB_URL) {
          process.env.DB_URL = 'file:///' + require('path').resolve('./rag-kb.db');
        }
        
        // Import RAG modules
        const search = require('./rag/search');
        const embeddings = require('./rag/embeddings');
        
        // Check for embedding API key
        const embeddingApiKey = process.env.OPENAI_KEY || context.apiKey;
        if (!embeddingApiKey) {
          return JSON.stringify({
            error: 'OpenAI API key required for knowledge base search',
            message: 'Set OPENAI_KEY environment variable or provide API key in context'
          });
        }
        
        // Check if OpenAI provider has embedding capability enabled
        if (context.providers && Array.isArray(context.providers)) {
          const openaiProvider = context.providers.find(p => p.type === 'openai');
          if (openaiProvider && openaiProvider.capabilities && openaiProvider.capabilities.embedding === false) {
            return JSON.stringify({
              error: 'OpenAI provider has embedding capability disabled. Please enable embedding capability in Settings to use knowledge base search.',
              hint: 'Go to Settings → Providers → Edit OpenAI → Enable "🔗 Embeddings" capability.'
            });
          }
        }
        
        // Use cache for query results (includes both embedding and search)
        const cachedResults = await getCachedOrFetch(
          'rag_queries',
          { query, topK, threshold, sourceType },
          async () => {
            // Generate embedding for query (with separate embedding cache)
            console.log('📚 Generating query embedding...');
            
            const embeddingModel = process.env.RAG_MDL || 'text-embedding-3-small';
            
            // Cache embeddings separately for reuse across different search parameters
            const embeddingResult = await getCachedOrFetch(
              'rag_embeddings',
              { text: query, model: embeddingModel },
              async () => {
                const embeddingProvider = process.env.RAG_PROV || 'openai';
                
                // Try to find provider config from context for model filtering
                let providerConfig = null;
                if (context?.providers && Array.isArray(context.providers)) {
                  providerConfig = context.providers.find(p => p.type === embeddingProvider);
                }
                
                const result = await embeddings.generateEmbedding(
                  query,
                  embeddingModel,
                  embeddingProvider,
                  embeddingApiKey,
                  { providerConfig } // Pass provider config for model filtering
                );
                // Convert Float32Array to regular array for JSON serialization
                return { 
                  embedding: Array.from(result.embedding),
                  dimensions: result.dimensions,
                  model: embeddingModel
                };
              }
            );
            
            // Convert back to Float32Array if needed
            let embeddingArray;
            if (embeddingResult.embedding instanceof Float32Array) {
              embeddingArray = embeddingResult.embedding;
            } else if (Array.isArray(embeddingResult.embedding)) {
              embeddingArray = new Float32Array(embeddingResult.embedding);
            } else if (embeddingResult.embedding && typeof embeddingResult.embedding === 'object') {
              // Handle case where it's been JSON-parsed into a plain object
              embeddingArray = new Float32Array(Object.values(embeddingResult.embedding));
            } else {
              throw new Error('Invalid embedding format in cache');
            }
            
            // Emit embedding phase
            if (context?.writeEvent) {
              context.writeEvent('search_progress', {
                tool: 'search_knowledge_base',
                phase: 'generating_embedding',
                cached: embeddingResult._cached,
                timestamp: new Date().toISOString()
              });
            }
            
            // Create generateEmbedding wrapper that returns cached embedding
            const generateEmbedding = async (text) => {
              return { embedding: embeddingArray };
            };
            
            // Search knowledge base
            console.log('📚 Searching knowledge base...');
            const results = await search.searchWithText(
              query,
              generateEmbedding,
              {
                topK: topK,
                threshold: threshold,
                source_type: sourceType,
              }
            );
            
            return results;
          }
        );
        
        // Extract results from cache wrapper
        // Note: getCachedOrFetch spreads the result, so arrays become objects with numeric keys
        const wasCached = cachedResults._cached || false;
        let results;
        if (Array.isArray(cachedResults)) {
          results = cachedResults;
        } else if (cachedResults && typeof cachedResults === 'object') {
          // Convert back to array if it was spread
          const keys = Object.keys(cachedResults).filter(k => k !== '_cached' && k !== '_cacheKey' && !isNaN(k));
          if (keys.length > 0) {
            results = keys.sort((a, b) => parseInt(a) - parseInt(b)).map(k => cachedResults[k]);
          } else {
            results = [];
          }
        } else {
          results = [];
        }
        
        // Emit results phase
        if (context?.writeEvent) {
          context.writeEvent('search_progress', {
            tool: 'search_knowledge_base',
            phase: 'complete',
            resultCount: Array.isArray(results) ? results.length : 0,
            cached: wasCached,
            timestamp: new Date().toISOString()
          });
        }
        
        console.log(`📚 Found ${Array.isArray(results) ? results.length : 0} results${wasCached ? ' (cached)' : ''}`);
        
        if (!Array.isArray(results) || results.length === 0) {
          return JSON.stringify({
            success: true,
            query: query,
            results: [],
            message: 'No relevant results found in knowledge base. Try a different query or use search_web for external information.'
          });
        }
        
        // Format results for LLM consumption
        const formattedResults = results.map((result, index) => {
          const source = result.source_file_name || result.source_url || 'Unknown';
          const sourceType = result.source_type || 'unknown';
          const similarity = result.similarity.toFixed(4);
          
          return {
            rank: index + 1,
            similarity_score: similarity,
            source: source,
            source_type: sourceType,
            source_path: result.source_file_path || null,
            source_url: result.source_url || null,
            snippet_id: result.snippet_id || null,
            text: result.chunk_text,
            // Add markdown formatted version for easy display
            markdown: `### ${index + 1}. ${source} (Score: ${similarity})\n\n${result.chunk_text}`
          };
        });
        
        // Create a summary markdown for the LLM
        const summaryMarkdown = `# Knowledge Base Search Results\n\n` +
          `**Query:** "${query}"\n` +
          `**Results:** ${results.length} relevant documents found\n\n` +
          `---\n\n` +
          formattedResults.map(r => r.markdown).join('\n\n---\n\n');
        
        return JSON.stringify({
          success: true,
          query: query,
          result_count: results.length,
          results: formattedResults,
          summary_markdown: summaryMarkdown,
          cached: wasCached,
          message: `Found ${results.length} relevant chunks from knowledge base with similarity scores ${formattedResults[0].similarity_score} to ${formattedResults[formattedResults.length-1].similarity_score}${wasCached ? ' (from cache)' : ''}`
        });
        
      } catch (error) {
        console.error('❌ RAG search error:', error);
        return JSON.stringify({
          error: 'Knowledge base search failed',
          message: error.message,
          details: error.stack
        });
      }
    }
    
    case 'manage_todos': {
      const { TodosManager } = require('./utils/todos-manager');
      
      // Initialize TodosManager if not already in context
      if (!context.__todosManager) {
        // Create with writeEvent callback from context
        context.__todosManager = new TodosManager((type, data) => {
          if (context.writeEvent && typeof context.writeEvent === 'function') {
            context.writeEvent(type, data);
          }
        });
        console.log('✅ TodosManager initialized in callFunction context');
      }
      
      const mgr = context.__todosManager;
      let state = mgr.getState();
      
      // Process add operations
      if (Array.isArray(args.add) && args.add.length > 0) {
        console.log(`📝 manage_todos: Adding ${args.add.length} todos`);
        state = mgr.add(args.add);
      }
      
      // Process delete operations
      if (Array.isArray(args.delete) && args.delete.length > 0) {
        console.log(`🗑️  manage_todos: Deleting ${args.delete.length} todos`);
        state = mgr.delete(args.delete);
      }
      
      // Emit updated state via writeEvent
      if (context.writeEvent && typeof context.writeEvent === 'function') {
        context.writeEvent('todos_updated', state);
      }
      
      return JSON.stringify({
        success: true,
        state: state,
        message: `Todos updated: ${state.total} total, ${state.remaining} remaining${state.current ? `, current: "${state.current.description}"` : ''}`
      });
    }
    
    case 'manage_snippets': {
      const snippetsService = require('./services/google-sheets-snippets');
      const { extractProjectId } = require('./services/user-isolation');
      
      // Debug: Log incoming arguments
      console.log('🔍 manage_snippets called with args:', JSON.stringify(args, null, 2));
      
      // Handle both nested payload structure and flat structure
      // Some LLMs might pass { action: "insert", payload: {...} }
      // Others might pass { action: "insert", title: "...", content: "..." }
      let action = args.action;
      let payload = args.payload || {};
      
      // If payload is empty but we have other properties, use them as payload
      if (Object.keys(payload).length === 0 && Object.keys(args).length > 1) {
        // Extract all args except 'action' as payload
        const { action: _, ...rest } = args;
        payload = rest;
        console.log('🔄 manage_snippets: Converted flat args to nested structure');
        console.log('   Payload:', JSON.stringify(payload, null, 2));
      }
      
      // Try to infer action from payload if missing
      if (!action) {
        if (payload.title && payload.content) {
          action = 'insert';
          console.log('💡 manage_snippets: Inferred action "insert" from payload with title and content');
        } else if (payload.query) {
          action = 'search';
          console.log('💡 manage_snippets: Inferred action "search" from payload with query');
        } else if (payload.id) {
          action = 'get';
          console.log('💡 manage_snippets: Inferred action "get" from payload with id');
        }
      }
      
      // Validate action parameter
      if (!action) {
        console.error('❌ manage_snippets: Missing action parameter and could not infer from payload');
        console.error('   Received args:', JSON.stringify(args, null, 2));
        return JSON.stringify({
          success: false,
          error: 'Missing action parameter',
          message: 'The "action" parameter is required. Please specify one of: insert, capture, get, search, delete',
          hint: 'Example: { "action": "insert", "payload": { "title": "...", "content": "..." } }',
          receivedArgs: args
        });
      }
      
      // Extract user's Google Sheets OAuth token from context
      // Note: driveAccessToken is the Google OAuth token with Sheets API permissions
      // googleToken is the Firebase ID token (not sufficient for Sheets API)
      let accessToken = context.driveAccessToken || context.googleToken || context.accessToken;
      const refreshToken = context.googleRefreshToken || context.driveRefreshToken;
      const userEmail = context.userEmail;
      
      console.log('🔍 manage_snippets token check:', {
        hasDriveAccessToken: !!context.driveAccessToken,
        hasGoogleToken: !!context.googleToken,
        hasAccessToken: !!context.accessToken,
        hasRefreshToken: !!refreshToken,
        finalToken: !!accessToken,
        userEmail: userEmail,
        contextKeys: Object.keys(context)
      });
      
      if (!accessToken) {
        console.error('❌ manage_snippets: No OAuth token available');
        console.error('   Available context keys:', Object.keys(context));
        return JSON.stringify({
          success: false,
          error: 'Authentication required',
          message: 'Google Drive connection required. Please go to Settings → Cloud Sync and click "Connect to Google Drive" to enable snippet management.'
        });
      }
      
      if (!userEmail) {
        console.error('❌ manage_snippets: No user email available');
        return JSON.stringify({
          success: false,
          error: 'User identification required',
          message: 'Could not identify user'
        });
      }
      
      // Import token refresh utility
      const { executeWithTokenRefresh } = require('./utils/google-oauth-refresh');
      
      try {
        switch (action) {
          case 'insert': {
            if (!payload.title || !payload.content) {
              return JSON.stringify({
                success: false,
                error: 'Missing required fields',
                message: 'Both title and content are required for insert action'
              });
            }
            
            // Extract project ID from context/event headers
            const projectId = context.event ? extractProjectId(context.event) : null;
            
            const snippet = await snippetsService.insertSnippet(
              {
                title: payload.title,
                content: payload.content,
                tags: payload.tags || [],
                source: payload.source || 'manual',
                url: payload.url || ''
              },
              userEmail,
              projectId,
              accessToken
            );
            
            // Emit SSE event
            if (context.writeEvent && typeof context.writeEvent === 'function') {
              context.writeEvent('snippet_inserted', {
                id: snippet.id,
                title: snippet.title,
                tags: snippet.tags
              });
            }
            
            return JSON.stringify({
              success: true,
              action: 'insert',
              data: snippet,
              message: `Successfully saved snippet "${snippet.title}" with ID ${snippet.id}`
            });
          }
          
          case 'capture': {
            // Capture is like insert but with automatic source tracking
            if (!payload.title) {
              return JSON.stringify({
                success: false,
                error: 'Missing title',
                message: 'Title is required for capture action'
              });
            }
            
            // Extract project ID from context/event headers
            const projectId = context.event ? extractProjectId(context.event) : null;
            
            const snippet = await snippetsService.insertSnippet(
              {
                title: payload.title,
                content: payload.content || '',
                tags: payload.tags || [],
                source: payload.source || 'chat',
                url: payload.url || ''
              },
              userEmail,
              projectId,
              accessToken
            );
            
            // Emit SSE event
            if (context.writeEvent && typeof context.writeEvent === 'function') {
              context.writeEvent('snippet_inserted', {
                id: snippet.id,
                title: snippet.title,
                tags: snippet.tags
              });
            }
            
            return JSON.stringify({
              success: true,
              action: 'capture',
              data: snippet,
              message: `Successfully captured snippet "${snippet.title}" with ID ${snippet.id}`
            });
          }
          
          case 'get': {
            if (!payload.id && !payload.title) {
              return JSON.stringify({
                success: false,
                error: 'Missing identifier',
                message: 'Either id or title is required for get action'
              });
            }
            
            const projectId = extractProjectId(context.event);
            
            const snippet = await snippetsService.getSnippet(
              {
                id: payload.id,
                title: payload.title
              },
              userEmail,
              projectId,
              accessToken
            );
            
            if (!snippet) {
              return JSON.stringify({
                success: false,
                error: 'Not found',
                message: `Snippet not found${payload.id ? ` with ID ${payload.id}` : ` with title "${payload.title}"`}`
              });
            }
            
            return JSON.stringify({
              success: true,
              action: 'get',
              data: snippet,
              message: `Retrieved snippet "${snippet.title}"`
            });
          }
          
          case 'search': {
            const projectId = extractProjectId(context.event);
            
            console.log('🔍 manage_snippets SEARCH:', {
              query: payload.query,
              tags: payload.tags,
              userEmail: userEmail,
              projectId: projectId,
              hasAccessToken: !!accessToken,
              hasRefreshToken: !!refreshToken
            });
            
            // Execute with automatic token refresh on auth failure
            const { result: results, newAccessToken } = await executeWithTokenRefresh(
              async (token) => {
                return await snippetsService.searchSnippets(
                  {
                    query: payload.query || '',
                    tags: payload.tags || []
                  },
                  userEmail,
                  projectId,
                  token
                );
              },
              accessToken,
              refreshToken
            );
            
            // Update context with new token if refreshed
            if (newAccessToken) {
              console.log('🔄 Token was refreshed during search operation');
              context.driveAccessToken = newAccessToken;
              accessToken = newAccessToken;
              
              // Emit event to update UI token
              if (context.writeEvent && typeof context.writeEvent === 'function') {
                context.writeEvent('token_refreshed', {
                  accessToken: newAccessToken,
                  timestamp: new Date().toISOString()
                });
              }
            }
            
            console.log(`📊 manage_snippets SEARCH RESULTS: Found ${results.length} snippets`);
            if (results.length > 0) {
              console.log('   First result:', {
                title: results[0].title,
                tags: results[0].tags,
                content: results[0].content?.substring(0, 100)
              });
            }
            
            return JSON.stringify({
              success: true,
              action: 'search',
              data: results,
              count: results.length,
              message: `Found ${results.length} snippet${results.length !== 1 ? 's' : ''}${payload.query ? ` matching "${payload.query}"` : ''}${payload.tags && payload.tags.length > 0 ? ` with tags [${payload.tags.join(', ')}]` : ''}`,
              tokenRefreshed: !!newAccessToken
            });
          }
          
          case 'delete': {
            if (!payload.id && !payload.title) {
              return JSON.stringify({
                success: false,
                error: 'Missing identifier',
                message: 'Either id or title is required for delete action'
              });
            }
            
            const projectId = extractProjectId(context.event);
            
            const deleted = await snippetsService.removeSnippet(
              {
                id: payload.id,
                title: payload.title
              },
              userEmail,
              projectId,
              accessToken
            );
            
            // Emit SSE event
            if (context.writeEvent && typeof context.writeEvent === 'function') {
              context.writeEvent('snippet_deleted', {
                id: deleted.id,
                title: deleted.title
              });
            }
            
            return JSON.stringify({
              success: true,
              action: 'delete',
              data: deleted,
              message: `Successfully deleted snippet "${deleted.title}" (ID: ${deleted.id})`
            });
          }
          
          default:
            return JSON.stringify({
              success: false,
              error: 'Invalid action',
              message: `Unknown action: "${action}". Supported actions: insert, capture, get, search, delete`
            });
        }
      } catch (error) {
        console.error(`❌ manage_snippets (${action}) error:`, error.message);
        
        // Check if this is a Google OAuth authentication error
        const isAuthError = error.message && (
          error.message.includes('Expected OAuth 2 access token') ||
          error.message.includes('invalid authentication credentials') ||
          error.message.includes('Request had invalid authentication credentials') ||
          error.message.includes('login cookie or other valid authentication credential')
        );
        
        if (isAuthError) {
          return JSON.stringify({
            success: false,
            error: 'cloud_sync_not_enabled',
            action: action,
            message: 'TELL USER: Snippets require Google Drive connection. Go to Settings → Cloud Sync and click "Connect to Google Drive".'
          });
        }
        
        return JSON.stringify({
          success: false,
          error: error.message,
          action: action,
          message: `Snippets operation failed: ${error.message}`
        });
      }
    }
    
    case 'execute_javascript': {
      const code = String(args.code || '').trim();
      if (!code) return JSON.stringify({ error: 'code required' });
      const timeout = clampInt(args.timeout, 1, 10, 5) * 1000; // Convert to milliseconds
      
      // ENHANCEMENT: Emit initial progress event
      if (context.writeEvent) {
        context.writeEvent('javascript_execution_progress', {
          tool: 'execute_javascript',
          phase: 'starting',
          code_length: code.length,
          timeout_ms: timeout,
          timestamp: new Date().toISOString()
        });
      }
      
      try {
        // Create a secure context with limited built-in objects
        const vmContext = {
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
          Promise, // Enable Promise support for async/await
          setTimeout: (fn, delay) => { // Add setTimeout support
            return setTimeout(fn, delay);
          },
          clearTimeout: (id) => { // Add clearTimeout support
            return clearTimeout(id);
          },
          console: {
            log: (...args) => { 
              const line = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
              ).join(' ');
              
              // NEW: Stream each console.log in real-time (limit to prevent flooding)
              if (context.writeEvent && vmContext._outputs.length < 100) {
                context.writeEvent('javascript_execution_progress', {
                  tool: 'execute_javascript',
                  phase: 'console_output',
                  output: line,
                  output_number: vmContext._outputs.length + 1,
                  timestamp: new Date().toISOString()
                });
              }
              
              // Accumulate all console.log outputs
              vmContext._outputs.push(line);
            }
          },
          _outputs: []
        };
        
        // NEW: Emit execution phase
        if (context.writeEvent) {
          context.writeEvent('javascript_execution_progress', {
            tool: 'execute_javascript',
            phase: 'executing',
            timestamp: new Date().toISOString()
          });
        }
        
        // Create VM context
        const vmContextSecure = vm.createContext(vmContext);
        
        // Wrap code in async function to support await
        // Try to detect if code is an expression or statement
        // Simple heuristic: if it contains certain keywords, treat as statement
        const trimmedCode = code.trim();
        const isStatement = /^(const|let|var|function|class|if|for|while|do|switch|return|throw|try)[\s(]/i.test(trimmedCode) || 
                           (code.includes(';') && !trimmedCode.endsWith(';'));
        
        // For expressions that end with semicolon, strip it so they can be returned
        let codeToWrap = code;
        if (!isStatement && trimmedCode.endsWith(';')) {
          codeToWrap = trimmedCode.slice(0, -1);
        }
        
        const wrappedCode = isStatement 
          ? `(async () => { ${codeToWrap} })()` 
          : `(async () => { return (${codeToWrap}) })()`;
        
        // Execute code with timeout - use runInNewContext for better async support
        let result;
        const scriptResult = vm.runInContext(wrappedCode, vmContextSecure, { 
          timeout,
          displayErrors: true 
        });
        
        // Handle Promise results (from async execution)
        if (scriptResult && typeof scriptResult.then === 'function') {
          // Wait for promise to resolve (with additional timeout protection)
          // Ensure timeout is cleared to avoid open handles
          let timeoutId;
          try {
            result = await Promise.race([
              scriptResult,
              new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(`Async execution timeout after ${timeout}ms`)), timeout + 1000);
                if (typeof timeoutId?.unref === 'function') {
                  timeoutId.unref();
                }
              })
            ]);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        } else {
          result = scriptResult;
        }
        
        // Return console output if available (all lines joined), otherwise the result
        const output = vmContext._outputs.length > 0 
          ? vmContext._outputs.join('\n') 
          : result;
        
        // NEW: Emit completion phase
        if (context.writeEvent) {
          context.writeEvent('javascript_execution_progress', {
            tool: 'execute_javascript',
            phase: 'completed',
            output_lines: vmContext._outputs.length,
            has_result: result !== undefined,
            timestamp: new Date().toISOString()
          });
        }
        
        // Return clean result without metadata that might confuse LLM
        return JSON.stringify({ 
          result: output
        });
      } catch (e) {
        // NEW: Emit error phase
        if (context.writeEvent) {
          context.writeEvent('javascript_execution_progress', {
            tool: 'execute_javascript',
            phase: 'error',
            error: String(e?.message || e),
            timestamp: new Date().toISOString()
          });
        }
        
        return JSON.stringify({ 
          error: String(e?.message || e)
        });
      }
    }

    case 'transcribe_url': {
      const url = String(args.url || '').trim();
      if (!url) return JSON.stringify({ error: 'url required' });

      try {
        // Check if YouTube URL and if OAuth token is available
        const isYouTubeUrl = /youtube\.com|youtu\.be|youtube\.com\/shorts/.test(url);
        const youtubeAccessToken = context.youtubeAccessToken || null;

        // Check if Whisper transcription is disabled via environment variable
        // NOTE: This only disables WHISPER for YouTube, not YouTube API transcripts
        const disableYouTubeWhisper = process.env.NO_YT_TRANS === 'true';

        // Prioritize YouTube Transcript API if token available
        // YouTube API transcripts work regardless of DISABLE_YOUTUBE_TRANSCRIPTION flag
        if (isYouTubeUrl && youtubeAccessToken) {
          console.log('Using YouTube Transcript API (OAuth authenticated)');
          try {
            const { getYouTubeTranscript } = require('./youtube-api');
            const transcript = await getYouTubeTranscript(url, youtubeAccessToken);
            
            return JSON.stringify({
              text: transcript,
              source: 'youtube_api',
              url,
              language: 'auto-detected'
            });
          } catch (ytError) {
            console.warn('YouTube API failed:', ytError.message);
            
            // Check if Whisper fallback is allowed for YouTube
            if (isYouTubeUrl && disableYouTubeWhisper) {
              return JSON.stringify({
                error: 'YouTube API transcript unavailable and Whisper transcription is disabled for YouTube URLs. Please enable YouTube API captions or set DISABLE_YOUTUBE_TRANSCRIPTION=false to use Whisper.',
                url,
                youtubeApiError: ytError.message,
                whisperDisabled: true
              });
            }
            console.log('Falling back to Whisper transcription');
            // Fall through to Whisper transcription
          }
        }

        // Check if this is a YouTube URL without OAuth and Whisper is disabled
        if (isYouTubeUrl && !youtubeAccessToken && disableYouTubeWhisper) {
          return JSON.stringify({
            error: 'YouTube transcription via Whisper is disabled. Please authenticate with YouTube OAuth to use YouTube API transcripts, or set DISABLE_YOUTUBE_TRANSCRIPTION=false.',
            url,
            whisperDisabled: true,
            needsOAuth: true
          });
        }

        // Fallback: Whisper transcription (for non-YouTube or when enabled)
        console.log('Using Whisper API for transcription');
        const onProgress = context.onProgress || null;
        const toolCallId = context.toolCallId || null;

        // Helper function to select API key from provider pool
        // Prioritizes: groq-free (FREE) > groq > openai
        const selectWhisperProvider = (providerPool) => {
          if (!providerPool || !Array.isArray(providerPool)) {
            return { provider: null, apiKey: null };
          }

          // Helper to check voice capability
          const hasVoiceCapability = (provider) => {
            if (!provider.capabilities) return true; // No capabilities = assume enabled
            return provider.capabilities.voice !== false;
          };

          // Filter to providers with voice capability and valid API keys
          const eligibleProviders = providerPool.filter(p => 
            p.apiKey && hasVoiceCapability(p) &&
            (p.type === 'groq-free' || p.type === 'groq' || p.type === 'openai')
          );

          if (eligibleProviders.length === 0) {
            return { provider: null, apiKey: null };
          }

          // Priority order: groq-free > groq > openai
          const priorityOrder = ['groq-free', 'groq', 'openai'];
          for (const type of priorityOrder) {
            const provider = eligibleProviders.find(p => p.type === type);
            if (provider) {
              console.log(`🎤 Selected ${type} from provider pool for transcription (${type.includes('free') ? 'FREE' : 'PAID'})`);
              return { 
                provider: type === 'groq-free' ? 'groq' : type, // Normalize groq-free to groq
                apiKey: provider.apiKey 
              };
            }
          }

          // Fallback to first eligible
          console.log(`🎤 Selected ${eligibleProviders[0].type} from provider pool (fallback)`);
          return { 
            provider: eligibleProviders[0].type === 'groq-free' ? 'groq' : eligibleProviders[0].type,
            apiKey: eligibleProviders[0].apiKey 
          };
        };

        // Select provider from pool (new method)
        let provider = null;
        let apiKey = null;

        if (context.providerPool) {
          const selected = selectWhisperProvider(context.providerPool);
          provider = selected.provider;
          apiKey = selected.apiKey;
        }

        // Fallback to legacy context properties if provider pool not available
        if (!apiKey) {
          // Check if the API key is actually a Gemini key (which doesn't support Whisper) FIRST
          if (context.apiKey?.startsWith('AIza')) {
            return JSON.stringify({
              error: 'Audio transcription requires OpenAI or Groq API credentials. Gemini does not support Whisper transcription. Please configure LP_TYPE_N=openai or groq-free with the corresponding API key to enable transcription.',
              url,
              source: 'whisper',
              hint: 'Add an OpenAI provider (for Whisper-1) or Groq provider (for Whisper-large-v3-turbo) to your environment configuration.'
            });
          }
          
          // Helper function to check if provider has voice capability enabled (legacy)
          const hasVoiceCapability = (providerType) => {
            if (!context.providers || !Array.isArray(context.providers)) return true;
            const providerConfig = context.providers.find(p => p.type === providerType || p.type === `${providerType}-free`);
            if (!providerConfig) return true;
            if (!providerConfig.capabilities) return true;
            return providerConfig.capabilities.voice !== false;
          };
          
          // Check for Groq keys first - prioritize if voice capability enabled
          if (context.apiKey?.startsWith('gsk_')) {
            const providerType = 'groq';
            if (hasVoiceCapability(providerType)) {
              provider = providerType;
              apiKey = context.apiKey;
              console.log('🎤 Using Groq Whisper (legacy main API key) - FREE transcription');
            }
          } else if (context.groqApiKey && hasVoiceCapability('groq')) {
            provider = 'groq';
            apiKey = context.groqApiKey;
            console.log('🎤 Using Groq Whisper (legacy groqApiKey) - FREE transcription');
          }
          
          // Fallback to OpenAI if Groq not available
          if (!provider && context.openaiApiKey && hasVoiceCapability('openai')) {
            provider = 'openai';
            apiKey = context.openaiApiKey;
            console.log('🎤 Using OpenAI Whisper (legacy openaiApiKey) - PAID transcription');
          } else if (!provider && context.apiKey?.startsWith('sk-') && hasVoiceCapability('openai')) {
            provider = 'openai';
            apiKey = context.apiKey;
            console.log('🎤 Using OpenAI Whisper (legacy main API key) - PAID transcription');
          }
        }

        // Validate that we have a suitable API key
        if (!apiKey) {
          // Check provider pool for disabled voice capability
          if (context.providerPool && Array.isArray(context.providerPool)) {
            const whisperProviders = context.providerPool.filter(p => 
              p.type === 'groq' || p.type === 'groq-free' || p.type === 'openai'
            );
            const hasVoiceDisabledProviders = whisperProviders.some(p => 
              p.capabilities && p.capabilities.voice === false
            );
            
            if (hasVoiceDisabledProviders && whisperProviders.length > 0) {
              return JSON.stringify({
                error: 'No providers are enabled for voice transcription. All Whisper-compatible providers (OpenAI, Groq) have voice capability disabled. Please enable voice capability for at least one provider in Settings.',
                url,
                source: 'whisper',
                hint: 'Go to Settings → Providers → Edit a provider → Enable "🎤 Voice / Transcription" capability.'
              });
            }
          }
          
          // Legacy check for backward compatibility
          const hasProviders = context.providers && Array.isArray(context.providers) && context.providers.length > 0;
          const hasVoiceDisabledProviders = hasProviders && context.providers.some(p => 
            (p.type === 'groq' || p.type === 'groq-free' || p.type === 'openai') && 
            p.capabilities && p.capabilities.voice === false
          );
          
          if (hasVoiceDisabledProviders) {
            return JSON.stringify({
              error: 'No providers are enabled for voice transcription. All Whisper-compatible providers (OpenAI, Groq) have voice capability disabled. Please enable voice capability for at least one provider in Settings.',
              url,
              source: 'whisper',
              hint: 'Go to Settings → Providers → Edit a provider → Enable "🎤 Voice / Transcription" capability.'
            });
          }
          
          return JSON.stringify({
            error: 'No Whisper-compatible API key found. Audio transcription requires OpenAI or Groq credentials.',
            url,
            source: 'whisper',
            hint: 'Configure LP_TYPE_N with openai or groq-free and provide the corresponding API key.'
          });
        }

        // Use provider-specific model name
        const model = provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';

        // Check for local Whisper settings (passed from frontend)
        const useLocalWhisper = args.useLocalWhisper === true || context.useLocalWhisper === true;
        const localWhisperUrl = args.localWhisperUrl || context.localWhisperUrl || 'http://localhost:8000';

        const result = await transcribeUrl({
          url,
          apiKey,
          provider,
          language: args.language,
          prompt: args.prompt,
          model,
          onProgress,
          toolCallId,
          useLocalWhisper,
          localWhisperUrl
        });

        // Emit transcript extraction event with metadata
        if (context?.writeEvent && result.text) {
          context.writeEvent('transcript_extracted', {
            tool: 'transcribe_url',
            phase: 'content_extracted',
            url,
            provider,
            model,
            language: result.language || args.language || 'unknown',
            duration: result.duration,
            textLength: result.text.length,
            wordCount: result.text.split(/\s+/).length,
            timestamp: new Date().toISOString()
          });
        }

        // Generate summary if requested
        const generateSummary = args.generate_summary === true;
        let summary = null;
        
        if (generateSummary && result.text) {
          try {
            console.log('🔄 Generating LLM summary of transcript...');
            
            const summaryPrompt = `Summarize this transcript concisely (2-3 paragraphs):

${result.text}

Summary:`;

            const summaryInput = [
              { role: 'system', content: 'You are a professional content summarizer. Extract key points and main ideas concisely.' },
              { role: 'user', content: summaryPrompt }
            ];

            const summaryRequestBody = {
              model: context.model || 'groq:llama-3.3-70b-versatile',
              input: summaryInput,
              tools: [],
              options: {
                apiKey: context.apiKey,
                temperature: 0.3,
                max_tokens: 500,
                timeoutMs: 30000,
                providerConfig: context?.providerConfig // Pass provider config for model filtering
              }
            };

            // Emit LLM request event
            if (context?.writeEvent) {
              context.writeEvent('llm_request', {
                phase: 'transcript_summary',
                tool: 'transcribe_url',
                model: context.model || 'groq:llama-3.3-70b-versatile',
                url,
                request: summaryRequestBody,
                timestamp: new Date().toISOString()
              });
            }

            const summaryStartTime = Date.now();
            const summaryResp = await llmResponsesWithTools(summaryRequestBody);
            const summaryEndTime = Date.now();
            
            summary = summaryResp?.text || summaryResp?.finalText || 'Unable to generate summary';
            
            // Emit LLM response event
            if (context?.writeEvent) {
              context.writeEvent('llm_response', {
                phase: 'transcript_summary',
                tool: 'transcribe_url',
                model: context.model || 'groq:llama-3.3-70b-versatile',
                url,
                response: summaryResp,
                timestamp: new Date().toISOString()
              });
            }
            
            // Log to Google Sheets
            try {
              const { logToGoogleSheets } = require('./services/google-sheets-logger');
              const os = require('os');
              const usage = summaryResp?.rawResponse?.usage || {};
              const [summaryProvider, summaryModel] = (context.model || 'groq:llama-3.3-70b-versatile').split(':');
              
              // Extract request ID and Lambda metrics from context
              const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 0;
              const memoryUsedMB = memoryLimitMB > 0 ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
              
              logToGoogleSheets({
                userEmail: context?.userEmail || 'anonymous',
                provider: summaryProvider,
                model: summaryModel || context.model,
                type: 'transcript_summary',
                promptTokens: usage.prompt_tokens || usage.input_tokens || 0,
                completionTokens: usage.completion_tokens || usage.output_tokens || 0,
                totalTokens: usage.total_tokens || 0,
                durationMs: summaryEndTime - summaryStartTime,
                timestamp: new Date().toISOString(),
                requestId,
                memoryLimitMB,
                memoryUsedMB,
                hostname: os.hostname(),
                metadata: { url, transcriptLength: result.text.length }
              }).catch(err => {
                console.error('Failed to log transcript summary to Google Sheets:', err.message);
              });
            } catch (err) {
              console.error('Google Sheets logging error (transcript summary):', err.message);
            }
            
            console.log('✅ Transcript summary generated');
          } catch (summaryError) {
            console.error('Failed to generate transcript summary:', summaryError.message);
            summary = `Error generating summary: ${summaryError.message}`;
          }
        }

        return JSON.stringify({
          ...result,
          source: 'whisper',
          summary: summary || undefined
        });
      } catch (error) {
        console.error('Transcribe tool error:', error);
        return JSON.stringify({ 
          error: `Transcription failed: ${error.message}`,
          url 
        });
      }
    }
    
    case 'generate_image': {
      const prompt = String(args.prompt || '').trim();
      if (!prompt) return JSON.stringify({ error: 'prompt required' });
      
      try {
        // Emit starting phase
        if (context.writeEvent) {
          context.writeEvent('image_generation_progress', {
            tool: 'generate_image',
            phase: 'analyzing_prompt',
            prompt: prompt.substring(0, 100)
          });
        }
        
        // Extract reference images from args or conversation context
        let referenceImages = args.reference_images || [];
        
        // If no reference images provided in args, check conversation context for images
        if (referenceImages.length === 0 && context.messages && Array.isArray(context.messages)) {
          console.log('🔍 Scanning conversation for reference images...');
          for (const msg of context.messages) {
            if (msg.role === 'user' && Array.isArray(msg.content)) {
              // Extract image parts from multimodal content
              const imageParts = msg.content.filter(part => 
                part.type === 'image_url' || part.type === 'image'
              );
              
              for (const imagePart of imageParts) {
                if (imagePart.image_url?.url) {
                  referenceImages.push(imagePart.image_url.url);
                } else if (imagePart.url) {
                  referenceImages.push(imagePart.url);
                } else if (imagePart.data) {
                  // Handle base64 data directly
                  referenceImages.push(imagePart.data);
                }
              }
            }
          }
          
          if (referenceImages.length > 0) {
            console.log(`✅ Found ${referenceImages.length} reference image(s) in conversation context`);
          }
        }
        
        // Import image generation handler directly
        const generateImageModule = require('./endpoints/generate-image');
        const { generateImageDirect } = generateImageModule;
        
        // Load PROVIDER_CATALOG and provider health module
        const fs = require('fs');
        const path = require('path');
        const { checkMultipleProviders } = require('./utils/provider-health');
        
        // In Lambda, __dirname is /var/task/src, so we need to go up one level
        // Try multiple possible locations
        let catalogPath = path.join(__dirname, '..', 'PROVIDER_CATALOG.json');
        if (!fs.existsSync(catalogPath)) {
          // Fallback: try /var/task/PROVIDER_CATALOG.json directly
          catalogPath = '/var/task/PROVIDER_CATALOG.json';
          if (!fs.existsSync(catalogPath)) {
            // Fallback: try same directory as tools.js
            catalogPath = path.join(__dirname, 'PROVIDER_CATALOG.json');
          }
        }
        
        console.log(`📂 Loading PROVIDER_CATALOG from: ${catalogPath}`);
        const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        
        if (!catalog.image || !catalog.image.providers) {
          return JSON.stringify({ 
            error: 'Image generation not configured in PROVIDER_CATALOG',
            available: false
          });
        }
        
        const { providers, qualityTiers } = catalog.image;
        
        // 1. Determine quality tier from args or analyze prompt
        let qualityTier = args.quality;
        if (!qualityTier) {
          // Analyze prompt for quality keywords - only upgrade from fast if explicitly mentioned
          const promptLower = prompt.toLowerCase();
          
          // Check for high-quality indicators first (most expensive)
          if (qualityTiers.ultra && qualityTiers.ultra.keywords.some(keyword => promptLower.includes(keyword.toLowerCase()))) {
            qualityTier = 'ultra';
          } else if (qualityTiers.high && qualityTiers.high.keywords.some(keyword => promptLower.includes(keyword.toLowerCase()))) {
            qualityTier = 'high';
          } else if (qualityTiers.standard && qualityTiers.standard.keywords.some(keyword => promptLower.includes(keyword.toLowerCase()))) {
            qualityTier = 'standard';
          } else {
            // Default to fast (cheapest) unless explicitly requested otherwise
            qualityTier = 'fast';
          }
        }
        
        console.log(`🎨 Image generation: quality=${qualityTier}, prompt="${prompt.substring(0, 50)}..."`);
        
        // Emit quality selected phase
        if (context.writeEvent) {
          context.writeEvent('image_generation_progress', {
            tool: 'generate_image',
            phase: 'quality_selected',
            quality: qualityTier,
            prompt: prompt.substring(0, 100)
          });
        }
        
        // 2. Find all models matching the quality tier
        const matchingModels = [];
        for (const [providerName, providerData] of Object.entries(providers)) {
          for (const [modelKey, modelData] of Object.entries(providerData.models || {})) {
            if (modelData.qualityTier === qualityTier) {
              matchingModels.push({
                provider: providerName,
                modelKey,
                model: modelData.id || modelKey,
                qualityTier: modelData.qualityTier,
                pricing: modelData.pricing,
                supportedSizes: modelData.supportedSizes || ['1024x1024'],
                capabilities: modelData.capabilities || [],
                fallbackPriority: modelData.fallbackPriority || 99
              });
            }
          }
        }
        
        // 2.5. Apply provider-specific restrictions from context
        console.log(`🔒 Checking provider restrictions from ${context.providers?.length || 0} provider configs`);
        console.log(`🔍 Provider configs:`, context.providers?.map(p => ({ 
          type: p.type, 
          allowedModels: p.allowedModels, 
          maxImageQuality: p.maxImageQuality 
        })));
        console.log(`🔍 Matching models BEFORE filtering:`, matchingModels.map(m => ({ provider: m.provider, model: m.model, qualityTier: m.qualityTier })));
        
        const restrictedModels = matchingModels.filter(m => {
          // Find provider config for this model's provider
          if (!context.providers) {
            console.log(`   ✅ ${m.model}: No provider configs, allowing`);
            return true; // No restrictions if no provider configs
          }
          
          const providerConfig = context.providers.find(p => p.type === m.provider);
          if (!providerConfig) {
            console.log(`   ✅ ${m.model}: No config for provider ${m.provider}, allowing`);
            return true; // No config = no restrictions
          }
          
          // Check if provider has model restrictions (applies to ALL LLM calls)
          // null or undefined or empty array = allow all models
          // non-empty array = only allow exact matches
          if (providerConfig.allowedModels && Array.isArray(providerConfig.allowedModels) && providerConfig.allowedModels.length > 0) {
            const isAllowed = providerConfig.allowedModels.includes(m.model);
            if (!isAllowed) {
              console.log(`   ⛔ ${m.model} not in allowed list for ${m.provider}: ${providerConfig.allowedModels.join(', ')}`);
            } else {
              console.log(`   ✅ ${m.model} in allowed list for ${m.provider}`);
            }
            return isAllowed;
          }
          
          // No allowed models list = all models allowed
          console.log(`   ✅ ${m.model}: No allowedModels restriction for ${m.provider}, allowing`);
          return true;
        });
        
        console.log(`🔍 Restricted models AFTER filtering:`, restrictedModels.map(m => ({ provider: m.provider, model: m.model, qualityTier: m.qualityTier })));
        
        // 2.6. Check if quality tier is restricted by provider config
        let effectiveQualityTier = qualityTier;
        const qualityTierOrder = ['fast', 'standard', 'high', 'ultra'];
        
        if (context.providers) {
          for (const providerConfig of context.providers) {
            if (providerConfig.maxImageQuality) {
              const maxQualityIndex = qualityTierOrder.indexOf(providerConfig.maxImageQuality);
              const requestedQualityIndex = qualityTierOrder.indexOf(qualityTier);
              
              if (requestedQualityIndex > maxQualityIndex) {
                console.log(`⬇️ Quality downgraded from ${qualityTier} to ${providerConfig.maxImageQuality} due to provider ${providerConfig.type} restrictions`);
                effectiveQualityTier = providerConfig.maxImageQuality;
                
                // Re-filter models for the new quality tier
                const downgradedModels = [];
                for (const [providerName, providerData] of Object.entries(providers)) {
                  for (const [modelKey, modelData] of Object.entries(providerData.models || {})) {
                    if (modelData.qualityTier === effectiveQualityTier) {
                      downgradedModels.push({
                        provider: providerName,
                        modelKey,
                        model: modelData.id || modelKey,
                        qualityTier: modelData.qualityTier,
                        pricing: modelData.pricing,
                        supportedSizes: modelData.supportedSizes || ['1024x1024'],
                        capabilities: modelData.capabilities || [],
                        fallbackPriority: modelData.fallbackPriority || 99
                      });
                    }
                  }
                }
                
                // Apply same allowed models filter to downgraded models
                const filteredDowngradedModels = downgradedModels.filter(m => {
                  const pc = context.providers.find(p => p.type === m.provider);
                  if (!pc || !pc.allowedModels || !Array.isArray(pc.allowedModels) || pc.allowedModels.length === 0) return true;
                  return pc.allowedModels.includes(m.model);
                });
                
                if (filteredDowngradedModels.length > 0) {
                  console.log(`✅ Found ${filteredDowngradedModels.length} models for downgraded quality tier ${effectiveQualityTier}`);
                  // Replace matchingModels AND restrictedModels with downgraded filtered models
                  matchingModels.length = 0;
                  matchingModels.push(...filteredDowngradedModels);
                  restrictedModels.length = 0;
                  restrictedModels.push(...filteredDowngradedModels);
                }
                
                break; // Use first provider's restriction
              }
            }
          }
        }
        
        // FIX: After quality downgrade, use matchingModels (which was updated), not restrictedModels (which is stale)
        const finalMatchingModels = matchingModels;
        
        if (finalMatchingModels.length === 0) {
          return JSON.stringify({
            error: `No allowed models available for quality tier: ${effectiveQualityTier}. Check provider image restrictions (allowedImageModels, maxImageQuality).`,
            qualityTier: effectiveQualityTier,
            originalQuality: qualityTier,
            availableTiers: Object.keys(qualityTiers),
            ready: false,
            hint: 'Provider may have allowedImageModels or maxImageQuality restrictions configured'
          });
        }
        
        // 3. Check provider availability for all matching models
        const uniqueProviders = [...new Set(finalMatchingModels.map(m => m.provider))];
        const availabilityResults = await checkMultipleProviders(uniqueProviders, context);
        
        console.log('🔍 Provider availability:', JSON.stringify(availabilityResults, null, 2));
        
        // 4. Filter to only available providers AND check image capability
        const availableModels = finalMatchingModels.filter(m => {
          const availability = availabilityResults[m.provider];
          if (!availability || !availability.available) return false;
          
          // Check if this provider has image generation capability enabled
          // If context has provider configs, check capabilities
          if (context && context.providers) {
            const providerConfig = context.providers.find(p => p.type === m.provider);
            if (providerConfig) {
              // If capabilities not defined, assume enabled (backward compatibility)
              if (!providerConfig.capabilities) return true;
              // Check if image capability is explicitly enabled
              if (providerConfig.capabilities.image === false) {
                console.log(`⚠️ Provider ${m.provider} has image capability disabled`);
                return false;
              }
            }
          }
          
          return true;
        });
        
        if (availableModels.length === 0) {
          // No providers available - return helpful error with alternatives
          const unavailableReasons = finalMatchingModels.map(m => {
            const availability = availabilityResults[m.provider];
            return {
              provider: m.provider,
              model: m.model,
              reason: availability?.reason || 'Unknown'
            };
          });
          
          return JSON.stringify({
            error: 'No image generation providers currently available',
            qualityTier: effectiveQualityTier,
            originalQuality: qualityTier,
            requestedModels: unavailableReasons,
            ready: false,
            hint: 'Check provider configuration: API keys, feature flags (ENABLE_IMAGE_GENERATION_*), circuit breaker status, and provider image restrictions'
          });
        }
        
        // 5. Sort by fallback priority (lower = preferred)
        availableModels.sort((a, b) => a.fallbackPriority - b.fallbackPriority);
        
        // 6. Select best model
        const selectedModel = availableModels[0];
        
        // 7. Estimate cost based on size
        const size = args.size || '1024x1024';
        let estimatedCost = 0;
        
        if (selectedModel.pricing) {
          // Try to find exact size pricing
          const pricingKey = Object.keys(selectedModel.pricing).find(key => 
            key.includes(size.replace('x', '')) || key === 'default'
          );
          estimatedCost = selectedModel.pricing[pricingKey || 'default'] || qualityTiers[qualityTier]?.typicalCost || 0;
        } else {
          estimatedCost = qualityTiers[qualityTier]?.typicalCost || 0;
        }
        
        // 8. Validate size compatibility
        let finalSize = size;
        if (!selectedModel.supportedSizes.includes(size)) {
          // Find closest supported size
          finalSize = selectedModel.supportedSizes.includes('1024x1024') 
            ? '1024x1024' 
            : selectedModel.supportedSizes[0];
          console.log(`⚠️ Size ${size} not supported by ${selectedModel.model}, using ${finalSize}`);
        }
        
        // 9. Actually generate the image immediately (no UI confirmation needed)
        console.log(`🎨 Generating image using ${selectedModel.provider} ${selectedModel.model}...`);
        if (referenceImages.length > 0) {
          console.log(`📎 Using ${referenceImages.length} reference image(s)`);
        }
        
        // Emit provider selected phase
        if (context.writeEvent) {
          context.writeEvent('image_generation_progress', {
            tool: 'generate_image',
            phase: 'selecting_provider',
            provider: selectedModel.provider,
            model: selectedModel.model,
            quality: qualityTier,
            size: finalSize,
            estimated_cost: estimatedCost
          });
        }
        
        // Helper function to estimate generation time based on provider and quality
        const getEstimatedGenerationTime = (provider, quality) => {
          const estimates = {
            'openai': { fast: 8, standard: 15, high: 25, ultra: 40 },
            'replicate': { fast: 12, standard: 20, high: 35, ultra: 60 },
            'together': { fast: 10, standard: 18, high: 30, ultra: 50 },
            'default': { fast: 10, standard: 20, high: 30, ultra: 45 }
          };
          const providerEstimates = estimates[provider] || estimates.default;
          return providerEstimates[quality] || 15;
        };
        
        const estimatedSeconds = getEstimatedGenerationTime(selectedModel.provider, qualityTier);
        
        // Emit generating phase with countdown
        if (context.writeEvent) {
          context.writeEvent('image_generation_progress', {
            tool: 'generate_image',
            phase: 'generating',
            provider: selectedModel.provider,
            model: selectedModel.model,
            quality: qualityTier,
            size: finalSize,
            estimated_seconds: estimatedSeconds,
            prompt: prompt.substring(0, 100)
          });
        }
        
        // Call the image generation function directly
        console.log(`🎨 Calling generateImageDirect with quality=${qualityTier}, provider=${selectedModel.provider}, model=${selectedModel.model}`);
        let imageResult;
        try {
          imageResult = await generateImageDirect({
            prompt,
            provider: selectedModel.provider,
            model: selectedModel.model,
            modelKey: selectedModel.modelKey,
            size: finalSize,
            quality: qualityTier,
            style: args.style || 'natural',
            referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
            context // Pass context for auth if needed
          });
          console.log(`🎨 generateImageDirect completed: success=${imageResult.success}, hasBase64=${!!imageResult.base64}, hasUrl=${!!imageResult.url}`);
        } catch (genError) {
          console.error(`❌ generateImageDirect threw error:`, genError);
          // Emit error phase
          if (context.writeEvent) {
            context.writeEvent('image_generation_progress', {
              tool: 'generate_image',
              phase: 'error',
              error: genError.message || 'Image generation threw exception',
              provider: selectedModel.provider,
              model: selectedModel.model,
              stack: genError.stack
            });
          }
          
          return JSON.stringify({
            error: genError.message || 'Image generation threw exception',
            provider: selectedModel.provider,
            model: selectedModel.model,
            prompt: prompt.substring(0, 100),
            stack: genError.stack
          });
        }
        
        if (!imageResult.success) {
          console.log(`❌ Image generation failed: ${imageResult.error}`);
          // Emit error phase
          if (context.writeEvent) {
            context.writeEvent('image_generation_progress', {
              tool: 'generate_image',
              phase: 'error',
              error: imageResult.error || 'Image generation failed',
              provider: selectedModel.provider,
              model: selectedModel.model
            });
          }
          
          return JSON.stringify({
            error: imageResult.error || 'Image generation failed',
            provider: selectedModel.provider,
            model: selectedModel.model,
            prompt: prompt.substring(0, 100)
          });
        }
        
        console.log(`✅ Image generated successfully: ${imageResult.url || 'base64 data'}`);
        
        // Emit completed phase with actual image data for UI display
        // The base64 data is sent HERE via event stream, NOT in tool response
        if (context.writeEvent) {
          // Send completion event with metadata only
          context.writeEvent('image_generation_progress', {
            tool: 'generate_image',
            phase: 'completed',
            provider: selectedModel.provider,
            model: selectedModel.model,
            quality: effectiveQualityTier,
            originalQuality: qualityTier,
            size: finalSize,
            cost: estimatedCost,
            url: imageResult.url ? 'generated' : 'base64'
          });
          
          // Send separate event with IMAGE URL ONLY for UI rendering
          // UI will download and convert to base64 client-side to avoid Lambda timeout
          // This is streamed directly to UI and NOT added to messages array
          context.writeEvent('image_complete', {
            id: context.tool_call_id, // Use tool call ID for matching with message_complete
            tool: 'generate_image',
            provider: selectedModel.provider,
            model: selectedModel.model,
            qualityTier,
            prompt,
            size: finalSize,
            style: args.style || 'natural',
            cost: estimatedCost,
            url: imageResult.url, // ✅ URL only - UI will download and convert to base64
            // base64: imageResult.base64, // ❌ REMOVED - causes Lambda timeout for high-quality images
            revisedPrompt: imageResult.revisedPrompt || prompt,
            llmApiCall: imageResult.llmApiCall
          });
        }
        
        // Return the generated image information with URL only
        // IMPORTANT: Do NOT include base64 data in tool response for two reasons:
        // 1. Gets added to messages and sent to LLM, causing massive token usage (70K+ tokens)
        // 2. High-quality image generation takes 30+ seconds, causing Lambda timeout
        // The UI will download the image from URL and convert to base64 client-side.
        return JSON.stringify({
          success: true,
          message: 'Image generated successfully and will be displayed to the user automatically. DO NOT call generate_image again.',
          url: imageResult.url, // ✅ URL only - UI will fetch and convert to base64
          // base64: imageResult.base64, // ❌ REMOVED - causes Lambda timeout + token bloat
          provider: selectedModel.provider,
          model: selectedModel.model,
          qualityTier: effectiveQualityTier,
          originalQualityRequested: qualityTier,
          prompt,
          size: finalSize,
          style: args.style || 'natural',
          cost: estimatedCost,
          revisedPrompt: imageResult.revisedPrompt || prompt,
          generated: true, // Flag to indicate image was actually generated
          llmApiCall: imageResult.llmApiCall // Include for LLM transparency tracking
        });
        
      } catch (error) {
        console.error('Generate image tool error:', error);
        
        // Emit error phase
        if (context.writeEvent) {
          context.writeEvent('image_generation_progress', {
            tool: 'generate_image',
            phase: 'error',
            error: error.message,
            stack: error.stack
          });
        }
        
        return JSON.stringify({ 
          error: `Image generation setup failed: ${error.message}`,
          ready: false,
          stack: error.stack
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
        
        // NOTE: Proxy disabled for YouTube search to reduce costs
        // Only YouTube transcripts use proxy (see youtube-api.js)
        console.log(`🔧 YouTube API search - Proxy: DISABLED (direct connection)`);
        
        // Use YouTube Data API v3 with API key from environment
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
          return JSON.stringify({ 
            error: 'YouTube API key not configured. Please set YOUTUBE_API_KEY environment variable.',
            code: 'YOUTUBE_API_KEY_MISSING'
          });
        }
        
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?${querystring.stringify({
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults: limit,
          order: apiOrder,
          key: apiKey
        })}`;
        
        const requestOptions = {
          headers: {
            'Accept': 'application/json',
            'Referer': 'https://lambdallmproxy.pages.dev/'
          }
          // No proxy agent - direct connection only
        };
        
        // Fetch YouTube API with direct connection (no proxy)
        const apiResponse = await new Promise((resolve, reject) => {
          https.get(apiUrl, requestOptions, (res) => {
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
        
        // Emit search start event
        if (context?.writeEvent) {
          context.writeEvent('youtube_search_progress', {
            tool: 'search_youtube',
            phase: 'searching',
            query: query,
            timestamp: new Date().toISOString()
          });
        }
        
        // DISABLED: Transcript fetching to improve performance
        // Transcripts are expensive and slow down searches significantly
        // Users can use transcribe_url or get_youtube_transcript for specific videos
        console.log(`🎬 YouTube search: ${videoIds.length} videos found (transcript fetching disabled)`);
        
        // Emit results found event
        if (context?.writeEvent) {
          context.writeEvent('youtube_search_progress', {
            tool: 'search_youtube',
            phase: 'results_found',
            query: query,
            totalVideos: videoIds.length,
            timestamp: new Date().toISOString()
          });
        }
        
        // Skip transcript fetching - just return basic video info
        const videos = (apiData.items || []).map(item => {
          const videoId = item.id.videoId;
          
          // Safely extract and truncate description to prevent huge payloads
          let description = item.snippet.description || '';
          if (description.length > 500) {
            description = description.substring(0, 500) + '...';
          }
          
          return {
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: item.snippet.title || 'Untitled',
            description,
            channel: item.snippet.channelTitle || 'Unknown',
            thumbnail: item.snippet.thumbnails?.default?.url || item.snippet.thumbnails?.medium?.url || '',
            hasCaptions: null, // Not checked to save API calls
            transcriptNote: 'Use transcribe_url or get_youtube_transcript to fetch transcript for specific videos'
          };
        });
        
        // Batch summary not supported when transcript fetching is disabled
        const generateSummary = args.generate_summary === true;
        let batchSummary = null;
        
        if (generateSummary) {
          console.log(`⚠️ Batch summary requested but transcript fetching is disabled. Use transcribe_url for individual videos.`);
          batchSummary = 'Batch summary is not available because transcript fetching has been disabled for search_youtube. To get transcripts and summaries, use the transcribe_url or get_youtube_transcript tools on individual video URLs.';
        }
        
        // Build result object, only include batchSummary if it exists
        const resultObj = {
          query,
          count: videos.length,
          order,
          videos
        };
        
        if (batchSummary) {
          resultObj.batchSummary = batchSummary;
        }
        
        // Emit completion event
        if (context?.writeEvent) {
          context.writeEvent('youtube_search_progress', {
            tool: 'search_youtube',
            phase: 'complete',
            query: query,
            totalVideos: videos.length,
            timestamp: new Date().toISOString()
          });
        }
        
        // Safely stringify with error handling
        try {
          return JSON.stringify(resultObj);
        } catch (stringifyError) {
          console.error('JSON.stringify error for YouTube search result:', stringifyError.message);
          // Return minimal safe result
          return JSON.stringify({
            query,
            count: videos.length,
            order,
            error: 'Result too large or contains invalid data',
            videos: videos.slice(0, 5).map(v => ({
              videoId: v.videoId,
              url: v.url,
              title: v.title,
              hasCaptions: v.hasCaptions
            }))
          });
        }
        
      } catch (error) {
        console.error('YouTube search error:', error);
        return JSON.stringify({ 
          error: `YouTube search failed: ${error.message}`,
          query 
        });
      }
    }
    
    case 'get_youtube_transcript': {
      const url = String(args.url || '').trim();
      if (!url) return JSON.stringify({ error: 'url required' });
      
      const includeTimestamps = args.include_timestamps !== false; // Default true
      const language = args.language || 'en';
      
      // Function to create model-aware transcript summary
      function summarizeTranscriptForLLM(transcript, model) {
        const contextWindow = model?.context_window || 32000;
        const fullText = typeof transcript === 'string' ? transcript : 
                        (transcript.snippets ? transcript.snippets.map(s => s.text).join(' ') : '');
        
        // Extract key content based on model capacity
        let maxChars;
        if (contextWindow > 100000) {
          // Large context: Include substantial detail
          maxChars = 2000; // ~500 tokens
        } else if (contextWindow > 16000) {
          // Medium context: Key segments
          maxChars = 1000; // ~250 tokens
        } else {
          // Small context: Brief summary only
          maxChars = 400; // ~100 tokens
        }
        
        // Use extractKeyContent to intelligently compress
        return extractKeyContent(fullText, null, maxChars);
      }
      
      // Function to extract key quotes from transcript
      function extractKeyQuotes(transcript, count = 5) {
        const fullText = typeof transcript === 'string' ? transcript : 
                        (transcript.snippets ? transcript.snippets.map(s => s.text).join(' ') : '');
        
        // Split into sentences
        const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        // Simple heuristic: look for sentences with important keywords
        const importantKeywords = ['important', 'key', 'main', 'critical', 'essential', 'significant', 
                                  'note', 'remember', 'conclusion', 'summary', 'first', 'finally'];
        
        const scoredSentences = sentences.map(s => ({
          text: s.trim(),
          score: importantKeywords.filter(k => s.toLowerCase().includes(k)).length
        }));
        
        return scoredSentences
          .sort((a, b) => b.score - a.score)
          .slice(0, count)
          .map(s => s.text);
      }
      
      try {
        const { getYouTubeTranscriptViaInnerTube, getYouTubeTranscript, getYouTubeTranscriptViaSelenium, extractYouTubeVideoId } = require('./youtube-api');
        
        // Validate YouTube URL
        const videoId = extractYouTubeVideoId(url);
        if (!videoId) {
          return JSON.stringify({
            error: 'Invalid YouTube URL',
            url,
            message: 'Could not extract video ID from URL. Supported formats: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...'
          });
        }
        
        console.log(`📝 Fetching detailed transcript for ${videoId} (timestamps: ${includeTimestamps}, language: ${language})`);
        
        let result;
        let source = 'innertube';
        
        // Get proxy credentials from context (posted from UI) or environment variables
        // NOTE: Proxy is ONLY used for YouTube transcripts to avoid Google blocking
        // All other tools (search_youtube, search_web) use direct connections
        const proxyUsername = context.proxyUsername || process.env.PXY_USER;
        const proxyPassword = context.proxyPassword || process.env.PXY_PASS;
        console.log(`🔧 YouTube transcript - Proxy: ${proxyUsername && proxyPassword ? 'ENABLED' : 'DISABLED'}`);
        
        // Try InnerTube API first (works for all public videos)
        try {
          console.log('🔄 Attempting InnerTube API for detailed transcript...');
          result = await getYouTubeTranscriptViaInnerTube(videoId, {
            language,
            includeTimestamps,
            proxyUsername,
            proxyPassword
          });
          console.log(`✅ InnerTube API succeeded`);
        } catch (innerTubeError) {
          console.log(`⚠️ InnerTube API failed: ${innerTubeError.message}`);
          
          // Fall back to OAuth API if user is authenticated
          const youtubeToken = context?.youtubeAccessToken;
          if (youtubeToken) {
            console.log('🔄 Falling back to OAuth API...');
            try {
              result = await getYouTubeTranscript(url, youtubeToken, {
                includeTimestamps,
                language
              });
              source = 'oauth';
              console.log(`✅ OAuth API succeeded`);
            } catch (oauthError) {
              console.log(`❌ OAuth API also failed: ${oauthError.message}`);
              
              // Final fallback: Selenium (local only)
              const IS_LAMBDA = !!process.env.AWS_FN;
              if (!IS_LAMBDA) {
                console.log('🔄 Falling back to Selenium caption scraper (local only)...');
                try {
                  result = await getYouTubeTranscriptViaSelenium(videoId, {
                    includeTimestamps,
                    language,
                    interactive: false
                  });
                  source = 'selenium';
                  console.log(`✅ Selenium scraper succeeded`);
                } catch (seleniumError) {
                  console.log(`❌ Selenium scraper also failed: ${seleniumError.message}`);
                  throw innerTubeError; // Throw original error
                }
              } else {
                throw oauthError;
              }
            }
          } else {
            // No OAuth token, try Selenium fallback (local only)
            const IS_LAMBDA = !!process.env.AWS_FN;
            if (!IS_LAMBDA) {
              console.log('🔄 Falling back to Selenium caption scraper (local only)...');
              try {
                result = await getYouTubeTranscriptViaSelenium(videoId, {
                  includeTimestamps,
                  language,
                  interactive: false
                });
                source = 'selenium';
                console.log(`✅ Selenium scraper succeeded`);
              } catch (seleniumError) {
                console.log(`❌ Selenium scraper also failed: ${seleniumError.message}`);
                throw innerTubeError; // Throw original error
              }
            } else {
              throw innerTubeError;
            }
          }
        }
        
        // If timestamps were requested and result is an object with snippets
        if (includeTimestamps && result && typeof result === 'object' && result.snippets) {
          const fullText = result.snippets.map(s => s.text).join(' ');
          console.log(`✅ Fetched transcript with ${result.snippets.length} snippets (${fullText.length} chars) via ${source}`);
          
          // Generate summary if requested
          const generateSummary = args.generate_summary === true;
          let summary = null;
          
          if (generateSummary) {
            try {
              console.log('🔄 Generating LLM summary of YouTube transcript...');
              
              const summaryPrompt = `Summarize this YouTube video transcript concisely (2-3 paragraphs):

${fullText}

Summary:`;

              const summaryInput = [
                { role: 'system', content: 'You are a professional content summarizer. Extract key points and main ideas concisely.' },
                { role: 'user', content: summaryPrompt }
              ];

              const summaryRequestBody = {
                model: context.model || 'groq:llama-3.3-70b-versatile',
                input: summaryInput,
                tools: [],
                options: {
                  apiKey: context.apiKey,
                  temperature: 0.3,
                  max_tokens: 500,
                  timeoutMs: 30000,
                  providerConfig: context?.providerConfig // Pass provider config for model filtering
                }
              };

              // Emit LLM request event
              if (context?.writeEvent) {
                context.writeEvent('llm_request', {
                  phase: 'youtube_transcript_summary',
                  tool: 'get_youtube_transcript',
                  model: context.model || 'groq:llama-3.3-70b-versatile',
                  url,
                  request: summaryRequestBody,
                  timestamp: new Date().toISOString()
                });
              }

              const summaryStartTime = Date.now();
              const summaryResp = await llmResponsesWithTools(summaryRequestBody);
              const summaryEndTime = Date.now();
              
              summary = summaryResp?.text || summaryResp?.finalText || 'Unable to generate summary';
              
              // Emit LLM response event
              if (context?.writeEvent) {
                context.writeEvent('llm_response', {
                  phase: 'youtube_transcript_summary',
                  tool: 'get_youtube_transcript',
                  model: context.model || 'groq:llama-3.3-70b-versatile',
                  url,
                  response: summaryResp,
                  timestamp: new Date().toISOString()
                });
              }
              
              // Log to Google Sheets
              try {
                const { logToGoogleSheets } = require('./services/google-sheets-logger');
                const os = require('os');
                const usage = summaryResp?.rawResponse?.usage || {};
                const [summaryProvider, summaryModel] = (context.model || 'groq:llama-3.3-70b-versatile').split(':');
                
                // Extract request ID and Lambda metrics from context
                const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 0;
                const memoryUsedMB = memoryLimitMB > 0 ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
                
                logToGoogleSheets({
                  userEmail: context?.userEmail || 'anonymous',
                  provider: summaryProvider,
                  model: summaryModel || context.model,
                  type: 'youtube_transcript_summary',
                  promptTokens: usage.prompt_tokens || usage.input_tokens || 0,
                  completionTokens: usage.completion_tokens || usage.output_tokens || 0,
                  totalTokens: usage.total_tokens || 0,
                  durationMs: summaryEndTime - summaryStartTime,
                  timestamp: new Date().toISOString(),
                  requestId,
                  memoryLimitMB,
                  memoryUsedMB,
                  hostname: os.hostname(),
                  metadata: { url, transcriptLength: fullText.length }
                }).catch(err => {
                  console.error('Failed to log YouTube transcript summary to Google Sheets:', err.message);
                });
              } catch (err) {
                console.error('Google Sheets logging error (YouTube transcript summary):', err.message);
              }
              
              console.log('✅ YouTube transcript summary generated');
            } catch (summaryError) {
              console.error('Failed to generate YouTube transcript summary:', summaryError.message);
              summary = `Error generating summary: ${summaryError.message}`;
            }
          }
          
          // Create model-aware LLM summary
          const llmSummary = summarizeTranscriptForLLM(fullText, context.selectedModel);
          const keyQuotes = extractKeyQuotes(fullText, 5);
          
          console.log(`📊 Created LLM summary: ${llmSummary.length} chars (model: ${context.selectedModel?.name || 'unknown'})`);
          
          // Return object with dual-path data
          const responseData = {
            success: true,
            url,
            videoId: result.videoId,
            video_id: result.videoId,
            videoUrl: url,
            video_url: url,
            title: result.title || 'YouTube Video',
            
            // Full data for UI (via extractedContent)
            transcript: fullText,
            text: fullText,
            segments: result.snippets,
            snippets: result.snippets,
            
            // Compressed data for LLM
            llmSummary: llmSummary,
            keyQuotes: keyQuotes,
            
            // Optional generated summary
            summary: summary || undefined,
            
            // Metadata
            duration: result.duration || 0,
            thumbnail: result.videoId ? `https://img.youtube.com/vi/${result.videoId}/maxresdefault.jpg` : null,
            language: result.language,
            languageCode: result.languageCode,
            isAutoGenerated: result.isGenerated,
            is_auto_generated: result.isGenerated,
            
            metadata: {
              totalCharacters: fullText.length,
              snippetCount: result.snippets.length,
              language: result.language,
              languageCode: result.languageCode,
              isGenerated: result.isGenerated,
              source,
              format: 'timestamped'
            },
            
            note: 'Full transcript available in UI. LLM receives compressed summary.'
          };
          
          return JSON.stringify(responseData);
        }
        
        // If result is plain text
        if (typeof result === 'string') {
          console.log(`✅ Fetched plain text transcript (${result.length} chars) via ${source}`);
          
          // Generate summary if requested
          const generateSummary = args.generate_summary === true;
          let summary = null;
          
          if (generateSummary) {
            try {
              console.log('🔄 Generating LLM summary of YouTube transcript (plain text)...');
              
              const summaryPrompt = `Summarize this YouTube video transcript concisely (2-3 paragraphs):

${result}

Summary:`;

              const summaryInput = [
                { role: 'system', content: 'You are a professional content summarizer. Extract key points and main ideas concisely.' },
                { role: 'user', content: summaryPrompt }
              ];

              const summaryRequestBody = {
                model: context.model || 'groq:llama-3.3-70b-versatile',
                input: summaryInput,
                tools: [],
                options: {
                  apiKey: context.apiKey,
                  temperature: 0.3,
                  max_tokens: 500,
                  timeoutMs: 30000,
                  providerConfig: context?.providerConfig // Pass provider config for model filtering
                }
              };

              // Emit LLM request event
              if (context?.writeEvent) {
                context.writeEvent('llm_request', {
                  phase: 'youtube_transcript_summary',
                  tool: 'get_youtube_transcript',
                  model: context.model || 'groq:llama-3.3-70b-versatile',
                  url,
                  request: summaryRequestBody,
                  timestamp: new Date().toISOString()
                });
              }

              const summaryStartTime = Date.now();
              const summaryResp = await llmResponsesWithTools(summaryRequestBody);
              const summaryEndTime = Date.now();
              
              summary = summaryResp?.text || summaryResp?.finalText || 'Unable to generate summary';
              
              // Emit LLM response event
              if (context?.writeEvent) {
                context.writeEvent('llm_response', {
                  phase: 'youtube_transcript_summary',
                  tool: 'get_youtube_transcript',
                  model: context.model || 'groq:llama-3.3-70b-versatile',
                  url,
                  response: summaryResp,
                  timestamp: new Date().toISOString()
                });
              }
              
              // Log to Google Sheets
              try {
                const { logToGoogleSheets } = require('./services/google-sheets-logger');
                const os = require('os');
                const usage = summaryResp?.rawResponse?.usage || {};
                const [summaryProvider, summaryModel] = (context.model || 'groq:llama-3.3-70b-versatile').split(':');
                
                // Extract request ID and Lambda metrics from context
                const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 0;
                const memoryUsedMB = memoryLimitMB > 0 ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
                
                logToGoogleSheets({
                  userEmail: context?.userEmail || 'anonymous',
                  provider: summaryProvider,
                  model: summaryModel || context.model,
                  type: 'youtube_transcript_summary',
                  promptTokens: usage.prompt_tokens || usage.input_tokens || 0,
                  completionTokens: usage.completion_tokens || usage.output_tokens || 0,
                  totalTokens: usage.total_tokens || 0,
                  durationMs: summaryEndTime - summaryStartTime,
                  timestamp: new Date().toISOString(),
                  requestId,
                  memoryLimitMB,
                  memoryUsedMB,
                  hostname: os.hostname(),
                  metadata: { url, transcriptLength: result.length }
                }).catch(err => {
                  console.error('Failed to log YouTube transcript summary to Google Sheets:', err.message);
                });
              } catch (err) {
                console.error('Google Sheets logging error (YouTube transcript summary):', err.message);
              }
              
              console.log('✅ YouTube transcript summary generated');
            } catch (summaryError) {
              console.error('Failed to generate YouTube transcript summary:', summaryError.message);
              summary = `Error generating summary: ${summaryError.message}`;
            }
          }
          
          // Check if transcript is very long
          const YOUTUBE_SUMMARY_THRESHOLD = 200000;
          
          if (result.length > YOUTUBE_SUMMARY_THRESHOLD) {
            console.log(`⚠️ YouTube transcript is very long (${result.length} chars > ${YOUTUBE_SUMMARY_THRESHOLD}), will include note about summarization`);
            
            return JSON.stringify({
              success: true,
              url,
              videoId,
              text: result,
              summary: summary || undefined,
              metadata: {
                totalCharacters: result.length,
                format: 'plain_text',
                source,
                lengthWarning: `This transcript is very long (${Math.floor(result.length / 1000)}k characters, ~${Math.floor(result.length / 4 / 1000)}k tokens). Consider focusing on specific sections or asking for a summary of key points.`
              },
              note: 'Full plain text transcript. Note: This is a very long transcript - you may want to summarize key points or focus on specific sections relevant to the user\'s query.'
            });
          }
          
          return JSON.stringify({
            success: true,
            url,
            videoId,
            text: result,
            summary: summary || undefined,
            metadata: {
              totalCharacters: result.length,
              format: 'plain_text',
              source
            }
          });
        }
        
        // Unexpected format
        throw new Error('Unexpected transcript format returned');
        
      } catch (error) {
        console.error('❌ get_youtube_transcript error:', error);
        
        // Provide helpful error messages
        let errorMessage = error.message || 'Unknown error';
        let suggestion = 'Try using transcribe_url tool as an alternative (uses Whisper API)';
        
        if (errorMessage.includes('No captions available')) {
          errorMessage = 'This video does not have captions/subtitles available.';
          suggestion = 'Use transcribe_url tool to transcribe the video audio with Whisper API.';
        } else if (errorMessage.includes('ytInitialPlayerResponse')) {
          errorMessage = 'Could not extract caption data from YouTube page. The video may be private or restricted.';
          suggestion = 'Use transcribe_url tool to transcribe the video audio with Whisper API.';
        }
        
        return JSON.stringify({
          error: errorMessage,
          url,
          suggestion
        });
      }
    }
    
    case 'generate_chart': {
      // This is a prompt-only tool - it doesn't actually execute anything
      // It tells the LLM to generate Mermaid charts inline in the response
      const chart_type = args.chart_type || 'flowchart';
      const description = args.description || '';
      
      console.log(`📊 Chart generation requested: ${chart_type} - ${description}`);
      
      // Emit chart generation progress
      if (context.writeEvent) {
        context.writeEvent('chart_generation_progress', {
          tool: 'generate_chart',
          phase: 'preparing',
          chart_type,
          description: description.substring(0, 100)
        });
      }
      
      // Emit completion
      if (context.writeEvent) {
        context.writeEvent('chart_generation_progress', {
          tool: 'generate_chart',
          phase: 'completed',
          chart_type,
          description: description.substring(0, 100)
        });
      }
      
      // Return instructions for the LLM to follow
      return JSON.stringify({
        success: true,
        chart_type,
        description,
        instructions: `Generate a Mermaid ${chart_type} diagram that visualizes: ${description}

IMPORTANT: You MUST include the Mermaid chart in your response using the following format:

\`\`\`mermaid
[Your Mermaid diagram code here]
\`\`\`

Guidelines for ${chart_type} diagrams:
${chart_type === 'flowchart' ? `- Start with: flowchart TD or flowchart LR
- Use simple node IDs (letters/numbers/underscores only)
- Define nodes: A[Label] or A(Label) or A{Decision?}
- Connect with: A --> B or A -->|label| B
- Avoid special characters in node IDs` : ''}
${chart_type === 'sequence' ? `- Start with: sequenceDiagram
- Define participants: participant A as Name
- Show interactions: A->>B: message
- Add notes: Note right of A: text` : ''}
${chart_type === 'class' ? `- Start with: classDiagram
- Define classes: class ClassName
- Add attributes: ClassName : +attribute
- Add methods: ClassName : +method()
- Show relationships: ClassA --|> ClassB` : ''}
${chart_type === 'gantt' ? `- Start with: gantt
- Set date format: dateFormat YYYY-MM-DD
- Define sections: section Name
- Add tasks: Task : start, end` : ''}
${chart_type === 'pie' ? `- Start with: pie title "Title"
- Define slices: "Label" : value` : ''}

After generating the chart, continue with any explanation or additional information.`
      });
    }
    
    case 'ask_llm': {
      console.log('🤖 ask_llm: Starting recursive LLM agent call');
      
      const query = String(args.query || '').trim();
      if (!query) {
        return JSON.stringify({ 
          error: 'query required',
          message: 'The ask_llm tool requires a query parameter with the question or task for the sub-agent'
        });
      }
      
      // Emit progress event
      if (context.writeEvent) {
        context.writeEvent('ask_llm_progress', {
          tool: 'ask_llm',
          phase: 'starting',
          query: query.substring(0, 100),
          timestamp: new Date().toISOString()
        });
      }
      
      try {
        // Import the chat endpoint handler
        const { handler: chatHandler } = require('./endpoints/chat');
        
        // Prepare a synthetic event for the chat endpoint
        // Remove ask_llm from available tools to prevent infinite recursion
        const enabledTools = context.enabledTools || [];
        const toolsWithoutAskLLM = enabledTools.filter(t => t !== 'ask_llm');
        
        // Build the messages array with the query
        const messages = [
          {
            role: 'user',
            content: query
          }
        ];
        
        // Create a buffer to capture the SSE stream
        let streamBuffer = [];
        let finalResponse = '';
        let totalIterations = 0;
        const MAX_ITERATIONS = 5;
        
        // Create a mock response stream that captures events
        const mockResponseStream = {
          write: (chunk) => {
            streamBuffer.push(chunk);
            // Parse SSE events to extract assistant messages
            const chunkStr = chunk.toString();
            const lines = chunkStr.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.type === 'content' && data.content) {
                    finalResponse += data.content;
                  } else if (data.type === 'done' && data.finalMessage) {
                    finalResponse = data.finalMessage.content || finalResponse;
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          },
          end: () => {},
          on: () => {},
          once: () => {},
          emit: () => {}
        };
        
        // Create the synthetic event
        const subEvent = {
          body: JSON.stringify({
            messages,
            model: context.model || 'groq:llama-3.3-70b-versatile',
            stream: true,
            tools: true,
            enabledTools: toolsWithoutAskLLM,
            max_iterations: MAX_ITERATIONS,
            // Pass through other context
            optimization: context.optimization,
            modelStrategy: context.modelStrategy,
            google_api_key: context.google_api_key,
            google_search_cx: context.google_search_cx
          }),
          headers: {
            'authorization': context.googleToken ? `Bearer ${context.googleToken}` : undefined,
            'x-google-token': context.googleToken,
            'x-user-email': context.userEmail
          },
          requestContext: {
            requestId: `ask_llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }
        };
        
        // Emit iteration start event
        if (context.writeEvent) {
          context.writeEvent('ask_llm_progress', {
            tool: 'ask_llm',
            phase: 'executing',
            query: query.substring(0, 100),
            max_iterations: MAX_ITERATIONS,
            timestamp: new Date().toISOString()
          });
        }
        
        // Execute the chat handler
        console.log('🤖 ask_llm: Calling chat handler with query:', query.substring(0, 100));
        await chatHandler(subEvent, mockResponseStream, context);
        
        totalIterations = 1; // The chat handler manages its own iterations internally
        
        // Emit completion event
        if (context.writeEvent) {
          context.writeEvent('ask_llm_progress', {
            tool: 'ask_llm',
            phase: 'completed',
            query: query.substring(0, 100),
            iterations: totalIterations,
            response_length: finalResponse.length,
            timestamp: new Date().toISOString()
          });
        }
        
        console.log(`🤖 ask_llm: Completed after ${totalIterations} iteration(s), response length: ${finalResponse.length}`);
        
        // Return the final response
        return JSON.stringify({
          success: true,
          query,
          response: finalResponse,
          iterations: totalIterations,
          message: `Successfully completed recursive LLM agent call in ${totalIterations} iteration(s)`
        });
        
      } catch (error) {
        console.error('❌ ask_llm error:', error.message);
        
        if (context.writeEvent) {
          context.writeEvent('ask_llm_progress', {
            tool: 'ask_llm',
            phase: 'error',
            query: query.substring(0, 100),
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
        
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Recursive LLM agent call failed: ${error.message}`
        });
      }
    }
    
    case 'generate_reasoning_chain': {
      console.log('🧠 generate_reasoning_chain: Starting deep reasoning chain generation');
      
      const userQuery = String(args.user_query || '').trim();
      if (!userQuery) {
        return JSON.stringify({ 
          error: 'user_query required',
          message: 'The generate_reasoning_chain tool requires a user_query parameter'
        });
      }
      
      const llmResponses = Array.isArray(args.llm_responses) ? args.llm_responses : [];
      const reasoningGoal = args.reasoning_goal || 'Generate a comprehensive step-by-step reasoning chain';
      
      // Emit progress event
      if (context.writeEvent) {
        context.writeEvent('reasoning_chain_progress', {
          tool: 'generate_reasoning_chain',
          phase: 'starting',
          query: userQuery.substring(0, 100),
          timestamp: new Date().toISOString()
        });
      }
      
      try {
        // Select a reasoning-capable model (prefer DeepSeek-R1 or o1-preview)
        const reasoningModel = context.model && context.model.includes('o1') 
          ? context.model 
          : 'openrouter:deepseek-ai/DeepSeek-R1'; // Default to DeepSeek-R1 via OpenRouter
        
        console.log(`🧠 Using reasoning model: ${reasoningModel}`);
        
        // Build the reasoning prompt with context
        const contextSection = llmResponses.length > 0 
          ? `\n\nPrevious conversation context:\n${llmResponses.map((r, i) => `Response ${i + 1}: ${r}`).join('\n\n')}`
          : '';
        
        const reasoningPrompt = `You are a deep reasoning assistant. Your task is to generate a comprehensive, transparent reasoning chain for the following query.

**User Query**: ${userQuery}

**Reasoning Goal**: ${reasoningGoal}${contextSection}

**Instructions**:
1. Think step-by-step through the problem
2. Show your reasoning process explicitly
3. If you need additional information, you can call tools like search_web, execute_javascript, scrape_web_content, etc.
4. Identify assumptions and uncertainties
5. Consider alternative approaches
6. Arrive at a well-reasoned conclusion

Generate your detailed reasoning chain now:`;
        
        // Prepare messages for LLM
        const messages = [
          { role: 'user', content: reasoningPrompt }
        ];
        
        // Emit LLM request event
        if (context.writeEvent) {
          context.writeEvent('reasoning_chain_progress', {
            tool: 'generate_reasoning_chain',
            phase: 'reasoning',
            model: reasoningModel,
            timestamp: new Date().toISOString()
          });
        }
        
        // Get all available tools for the reasoning model to use
        const { mergeTools } = require('./tools');
        const allTools = await mergeTools(context);
        
        // Filter out generate_reasoning_chain itself to prevent recursion
        const toolsForReasoning = allTools.filter(t => 
          t.function && t.function.name !== 'generate_reasoning_chain'
        );
        
        console.log(`🧠 Reasoning model has access to ${toolsForReasoning.length} tools`);
        
        // Call LLM with MAXIMUM reasoning depth
        const reasoningResponse = await llmResponsesWithTools({
          model: reasoningModel,
          input: messages,
          tools: toolsForReasoning,
          options: {
            reasoningEffort: 'high', // MAXIMUM reasoning depth
            max_tokens: 8192, // Allow longer reasoning chains
            temperature: 0.7,
            ...context.providerConfig
          }
        });
        
        console.log(`🧠 Reasoning response:`, {
          hasText: !!reasoningResponse.text,
          hasToolCalls: !!reasoningResponse.toolCalls,
          toolCallCount: reasoningResponse.toolCalls?.length || 0
        });
        
        let reasoningChain = reasoningResponse.text || reasoningResponse.finalText || '';
        const embeddedToolResults = [];
        
        // If reasoning generated tool calls, execute them immediately
        if (reasoningResponse.toolCalls && reasoningResponse.toolCalls.length > 0) {
          console.log(`🧠 Reasoning chain generated ${reasoningResponse.toolCalls.length} embedded tool calls - executing asynchronously...`);
          
          if (context.writeEvent) {
            context.writeEvent('reasoning_chain_progress', {
              tool: 'generate_reasoning_chain',
              phase: 'executing_embedded_tools',
              tool_count: reasoningResponse.toolCalls.length,
              timestamp: new Date().toISOString()
            });
          }
          
          // Execute tool calls in parallel for maximum speed (but also maximum token consumption!)
          const toolPromises = reasoningResponse.toolCalls.map(async (toolCall) => {
            const toolName = toolCall.name || toolCall.function?.name;
            const toolArgs = typeof toolCall.arguments === 'string' 
              ? JSON.parse(toolCall.arguments) 
              : (toolCall.arguments || toolCall.function?.arguments || {});
            
            console.log(`🧠 Executing embedded tool: ${toolName}`);
            
            try {
              const toolResult = await callFunction(toolName, toolArgs, context);
              return {
                tool: toolName,
                arguments: toolArgs,
                result: toolResult,
                success: true
              };
            } catch (error) {
              console.error(`❌ Embedded tool ${toolName} failed:`, error.message);
              return {
                tool: toolName,
                arguments: toolArgs,
                error: error.message,
                success: false
              };
            }
          });
          
          // Wait for all tools to complete
          const toolResults = await Promise.all(toolPromises);
          embeddedToolResults.push(...toolResults);
          
          console.log(`🧠 Completed ${embeddedToolResults.length} embedded tool executions`);
        }
        
        // Emit completion event
        if (context.writeEvent) {
          context.writeEvent('reasoning_chain_progress', {
            tool: 'generate_reasoning_chain',
            phase: 'completed',
            query: userQuery.substring(0, 100),
            reasoning_length: reasoningChain.length,
            embedded_tools: embeddedToolResults.length,
            timestamp: new Date().toISOString()
          });
        }
        
        console.log(`🧠 generate_reasoning_chain: Completed with ${reasoningChain.length} chars reasoning, ${embeddedToolResults.length} embedded tools`);
        
        // Return the complete reasoning chain with embedded tool results
        return JSON.stringify({
          success: true,
          user_query: userQuery,
          reasoning_goal: reasoningGoal,
          reasoning_chain: reasoningChain,
          embedded_tool_results: embeddedToolResults,
          model: reasoningModel,
          message: `Generated reasoning chain with ${embeddedToolResults.length} embedded tool execution(s)`
        });
        
      } catch (error) {
        console.error('❌ generate_reasoning_chain error:', error.message);
        
        if (context.writeEvent) {
          context.writeEvent('reasoning_chain_progress', {
            tool: 'generate_reasoning_chain',
            phase: 'error',
            query: userQuery.substring(0, 100),
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
        
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `Reasoning chain generation failed: ${error.message}`
        });
      }
    }
    
    case 'generate_quiz': {
      // This is a structured output tool - don't execute, just return the arguments
      // The LLM uses this to generate structured quiz data via function calling
      return JSON.stringify(args);
    }
    
    default: {
      // Check if this is an MCP tool (format: serverName__toolName)
      if (name.includes('__')) {
        return await executeMCPTool(name, args, context);
      }
      return JSON.stringify({ error: `unknown function ${name}` });
    }
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

/**
 * Get tool functions with dynamic descriptions based on environment
 * Modifies tool availability based on configuration
 */
function getToolFunctions() {
  const tools = [...toolFunctions]; // Clone array
  
  // If YouTube Whisper transcription is disabled, update the transcribe_url description
  // NOTE: This only affects Whisper transcription, not YouTube API transcripts (OAuth)
  const disableYouTubeWhisper = process.env.NO_YT_TRANS === 'true';
  console.log(`🎬 getToolFunctions: DISABLE_YOUTUBE_TRANSCRIPTION=${process.env.NO_YT_TRANS}, whisperDisabled=${disableYouTubeWhisper}`);
  
  if (disableYouTubeWhisper) {
    const transcribeToolIndex = tools.findIndex(t => t.function.name === 'transcribe_url');
    console.log(`🎬 Found transcribe_url tool at index: ${transcribeToolIndex}`);
    if (transcribeToolIndex >= 0) {
      const newDescription = '🎙️ Transcribe audio or video content from URLs. **YOUTUBE WHISPER DISABLED**: For YouTube videos, requires OAuth authentication to use YouTube API transcripts (Whisper method disabled). For other media types (.mp3, .mp4, .wav, .m4a, etc.), uses OpenAI Whisper transcription. Automatically handles large files by chunking. Shows real-time progress with stop capability.';
      tools[transcribeToolIndex] = {
        ...tools[transcribeToolIndex],
        function: {
          ...tools[transcribeToolIndex].function,
          description: newDescription
        }
      };
      console.log(`🎬 Updated transcribe_url description: YouTube requires OAuth (Whisper disabled)`);
    }
  } else {
    console.log(`🎬 YouTube Whisper transcription is ENABLED`);
  }
  
  return tools;
}

/**
 * Merge built-in tools with tools from MCP servers
 * 
 * MCP tools are namespaced as: <server_name>__<tool_name>
 * to avoid conflicts with built-in tools.
 * 
 * @param {Array} builtInTools - Array of built-in tool definitions
 * @param {Array} mcpServers - Array of MCP server configurations: [{name, url}]
 * @returns {Promise<Array>} Merged array of tool definitions
 */
async function mergeTools(builtInTools = [], mcpServers = []) {
  if (!mcpServers || mcpServers.length === 0) {
    return builtInTools;
  }
  
  const mergedTools = [...builtInTools];
  
  // Fetch tools from each MCP server
  for (const server of mcpServers) {
    try {
      // Validate server configuration
      if (!server.name || !server.url) {
        console.warn(`[MCP] Skipping invalid server config:`, server);
        continue;
      }
      
      // Validate URL
      try {
        mcpClient.validateServerUrl(server.url);
      } catch (error) {
        console.warn(`[MCP] Invalid server URL ${server.url}:`, error.message);
        continue;
      }
      
      // Get tools from cache or discover
      const tools = await mcpCache.getTools(server.url);
      
      // Convert MCP tools to OpenAI function format with namespacing
      for (const tool of tools) {
        mergedTools.push({
          type: 'function',
          function: {
            name: `${server.name}__${tool.name}`, // Namespace: server__tool
            description: `[MCP: ${server.name}] ${tool.description}`,
            parameters: tool.inputSchema || {
              type: 'object',
              properties: {},
              required: []
            }
          }
        });
      }
      
      console.log(`[MCP] Merged ${tools.length} tools from ${server.name} (${server.url})`);
    } catch (error) {
      console.error(`[MCP] Failed to load tools from ${server.name} (${server.url}):`, error.message);
      // Continue with other servers even if one fails
    }
  }
  
  return mergedTools;
}

/**
 * Execute an MCP tool
 * 
 * Parses the namespaced tool name to extract server and tool,
 * looks up the server URL, and executes the tool via MCP client.
 * 
 * @param {string} namespacedName - Tool name in format: serverName__toolName
 * @param {Object} args - Tool arguments
 * @param {Object} context - Execution context (must include mcpServers array)
 * @returns {Promise<string>} JSON-stringified tool result
 */
async function executeMCPTool(namespacedName, args = {}, context = {}) {
  try {
    // Parse namespaced tool name
    const parts = namespacedName.split('__');
    if (parts.length !== 2) {
      return JSON.stringify({ 
        error: `Invalid MCP tool name format: ${namespacedName}. Expected: serverName__toolName` 
      });
    }
    
    const [serverName, toolName] = parts;
    
    // Emit start event
    if (context?.writeEvent) {
      context.writeEvent('mcp_tool_start', {
        tool: namespacedName,
        server: serverName,
        toolName: toolName,
        arguments: args,
        timestamp: new Date().toISOString()
      });
    }
    
    // Find server URL from context
    const mcpServers = context.mcpServers || [];
    const server = mcpServers.find(s => s.name === serverName);
    
    if (!server) {
      return JSON.stringify({ 
        error: `MCP server not found: ${serverName}. Available servers: ${mcpServers.map(s => s.name).join(', ')}` 
      });
    }
    
    // Validate server URL
    try {
      mcpClient.validateServerUrl(server.url);
    } catch (error) {
      return JSON.stringify({ 
        error: `Invalid MCP server URL: ${error.message}` 
      });
    }
    
    // Emit progress event
    if (context?.writeEvent) {
      context.writeEvent('mcp_tool_progress', {
        tool: namespacedName,
        phase: 'executing',
        server: serverName,
        url: server.url,
        timestamp: new Date().toISOString()
      });
    }
    
    // Execute the tool
    console.log(`[MCP] Executing ${toolName} on ${serverName} (${server.url})`);
    const result = await mcpClient.executeTool(server.url, toolName, args);
    
    // Emit processing event
    if (context?.writeEvent) {
      context.writeEvent('mcp_tool_progress', {
        tool: namespacedName,
        phase: 'processing',
        contentItems: result.length,
        timestamp: new Date().toISOString()
      });
    }
    
    // MCP returns content array, we need to format it
    // For now, concatenate all text content
    const textContent = result
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n\n');
    
    // Include non-text content in metadata
    const otherContent = result.filter(item => item.type !== 'text');
    
    let finalResult;
    if (otherContent.length > 0) {
      finalResult = JSON.stringify({
        text: textContent,
        metadata: {
          server: serverName,
          tool: toolName,
          otherContent: otherContent
        }
      });
    } else {
      finalResult = textContent;
    }
    
    // Emit completion event
    if (context?.writeEvent) {
      context.writeEvent('mcp_tool_complete', {
        tool: namespacedName,
        server: serverName,
        toolName: toolName,
        contentLength: finalResult.length,
        hasMetadata: otherContent.length > 0,
        timestamp: new Date().toISOString()
      });
    }
    
    return finalResult;
  } catch (error) {
    console.error(`[MCP] Tool execution failed:`, error.message);
    
    // Emit error event
    if (context?.writeEvent) {
      context.writeEvent('mcp_tool_error', {
        tool: namespacedName,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    return JSON.stringify({ 
      error: `MCP tool execution failed: ${error.message}` 
    });
  }
}

module.exports = {
  toolFunctions,
  getToolFunctions,
  callFunction,
  compressSearchResultsForLLM,
  mergeTools,
  executeMCPTool
};
