/**
 * Tools registry and dispatcher for LLM tool-calling
 * Provides OpenAI-compatible function tool schemas and implementations
 */

const { DuckDuckGoSearcher } = require('./search');
const { SimpleHTMLParser } = require('./html-parser');
const { llmResponsesWithTools } = require('./llm_tools_adapter');
const vm = require('vm');

// Simple token estimation (rough approximation: 4 chars ≈ 1 token)
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

// Intelligent content extraction to minimize tokens while preserving key information
function extractKeyContent(content, originalQuery) {
  if (!content || content.length < 100) return content;
  
  // Convert to lowercase for analysis
  const queryTerms = originalQuery.toLowerCase().split(/\s+/).filter(term => term.length > 2);
  const lines = content.split(/[.\n!?]+/).filter(line => line.trim().length > 20);
  
  // Extract content patterns
  const patterns = {
    queryRelevant: [],  // High priority: contains query terms
    numerical: [],      // Facts, statistics, prices
    dates: [],         // Temporal relevance 
    headers: [],       // Structural importance
    contextual: []     // First/last content
  };
  
  lines.forEach((line, idx) => {
    const lineLower = line.toLowerCase();
    const trimmed = line.trim();
    
    // Query-relevant sentences (highest priority)
    if (queryTerms.some(term => lineLower.includes(term))) {
      patterns.queryRelevant.push(trimmed);
    }
    
    // Numerical data (facts, statistics, prices, percentages)
    if (/\d+[%$,.\d]*|\b\d{4}\b|\b\d+\.\d+\b|\d+\s*(percent|million|billion|thousand)/.test(trimmed)) {
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
      name: 'search_web',
      description: 'Search the web for results relevant to a query and return an LLM-generated summary that considers the initial query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'integer', minimum: 1, maximum: 3, default: 1 }, // Emergency rate limit: max 3 results, default 1
          timeout: { type: 'integer', minimum: 1, maximum: 60, default: 8 },
          load_content: { type: 'boolean', default: false, description: 'DISABLED by default - When true, fetch content (causes token overflow). Keep false for rate limits.'}
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
      description: 'Fetch and extract the readable content of a URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Fully qualified URL to fetch' },
          timeout: { type: 'integer', minimum: 1, maximum: 60, default: 15 }
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
      description: 'Execute JavaScript code in a secure sandbox environment. Perfect for mathematical calculations, data processing, algorithm implementation, and computational problems. For math questions, focus on providing direct numerical answers. Supports all standard JavaScript features including Math functions, array operations, loops, and object manipulation.',
      parameters: {
        type: 'object',
        properties: {
          code: { 
            type: 'string', 
            description: 'JavaScript code to execute. Should include a final expression or console.log to show the result. Example: "Math.sqrt(144)" or "const result = 5 * 7; console.log(result);"'
          },
          timeout: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Execution timeout in seconds' }
        },
        required: ['code'],
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
      const query = String(args.query || '').trim();
      if (!query) return JSON.stringify({ error: 'query required' });
      const limit = clampInt(args.limit, 1, 8, 2); // Further reduced default from 3 to 2
      const timeout = clampInt(args.timeout, 1, 60, 10); // Reduced timeout
      const loadContent = args.load_content === true; // default false to prevent token overflow
      const searcher = new DuckDuckGoSearcher();
      const out = await searcher.search(query, limit, loadContent, timeout);
      // Include content fields if fetched; otherwise, omit heavy fields
      // Apply aggressive content limiting to prevent rate limits
      const results = (out?.results || []).map(r => {
        if (loadContent) {
          // Apply intelligent content extraction instead of simple truncation
          if (r.content) {
            return {
              ...r,
              content: extractKeyContent(r.content, query),
              originalLength: r.content.length,
              intelligentlyExtracted: true
            };
          }
          return r;
        }
        const { content, contentLength, fetchTimeMs, truncated, originalLength, contentError, ...lite } = r;
        // Limit description field to prevent token overflow
        if (lite.description && lite.description.length > 150) {
          lite.description = lite.description.slice(0, 150) + '...';
        }
        return lite;
      });
      // Try to generate a comprehensive summary with enhanced citation and fact verification
      let summary = null;
      let summary_model = null;
      let summary_error = null;
      try {
        // Use the passed model and apiKey from context for consistency
        if (model && apiKey) {
          summary_model = model;
          // Enhance results with source credibility analysis
          const enhancedResults = analyzeSourceCredibility(results);
          const prompt = buildSummaryPrompt(query, enhancedResults, loadContent);
          
          const resp = await llmResponsesWithTools({
            model,
            input: [
              { role: 'system', content: process.env.SYSTEM_PROMPT_DIGEST_ANALYST || 'You are a thorough research analyst that extracts comprehensive information from search results. Capture all important details, facts, and insights that are relevant to the user\'s question. Be thorough and don\'t miss key information that could be valuable for the final answer.' },
              { role: 'user', content: prompt }
            ],
            tools: [],
            options: { apiKey, max_tokens: 60, temperature: 0.2 } // Emergency limit: 60 tokens max
          });
          summary = resp?.text || null;
        }
      } catch (e) {
        summary_error = String(e?.message || e);
      }
      
      // Token validation: ensure response doesn't exceed safe limits
      const response = { query, count: out?.returned || 0, results, load_content: !!loadContent, summary, summary_model, summary_error };
      const responseStr = JSON.stringify(response);
      const estimatedTokens = estimateTokens(responseStr);
      
      // Emergency token limiting - very aggressive
      if (estimatedTokens > 800) { // Much more aggressive limit
        const truncatedResults = results.slice(0, 1).map(r => ({
          ...r,
          description: (r.description || '').substring(0, 80), // Extreme truncation
          content: r.content ? r.content.substring(0, 100) : undefined
        }));
        console.warn(`🚨 EMERGENCY: Response too large (${estimatedTokens} tokens), truncating to 1 result`);
        return JSON.stringify({ 
          ...response, 
          results: truncatedResults, 
          count: 1,
          summary: summary ? summary.substring(0, 100) : null, // Truncate summary too
          emergency_truncated: true,
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
      // Reuse fetchUrl and parsing from search module
      const searcher = new DuckDuckGoSearcher();
      try {
        const raw = await searcher.fetchUrl(url, timeout * 1000);
        const parser = new SimpleHTMLParser(raw);
        const text = parser.convertToText(raw);
        return JSON.stringify({ url, content: text });
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
        
        return JSON.stringify({ 
          code, 
          result: output, 
          type: typeof result,
          executed_at: new Date().toISOString()
        });
      } catch (e) {
        return JSON.stringify({ 
          code, 
          error: String(e?.message || e),
          type: 'error'
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
