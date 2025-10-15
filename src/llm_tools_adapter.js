/**
 * LLM tools adapter: OpenAI Responses API + Groq chat.completions tool-calls
 */

const https = require('https');
const { PROVIDERS } = require('./providers');

function isOpenAIModel(model) { return typeof model === 'string' && model.startsWith('openai:'); }
function isGroqModel(model) { return typeof model === 'string' && (model.startsWith('groq:') || model.startsWith('groq-free:')); }
function isGeminiModel(model) { return typeof model === 'string' && (model.startsWith('gemini:') || model.startsWith('gemini-free:')); }

// Check if model name (without prefix) is a known model by provider
function isKnownOpenAIModel(modelName) {
  return PROVIDERS.openai.models.includes(modelName);
}
function isKnownGeminiModel(modelName) {
  return PROVIDERS.gemini.models.includes(modelName);
}

function openAISupportsReasoning(model) {
  const m = String(model || '').replace(/^openai:/, '');
  return /^gpt-5/i.test(m) || /\bo\d|\b4o\b|^gpt-4o/i.test(m);
}

function groqSupportsReasoning(model) {
  const m = String(model || '').replace(/^groq(-free)?:/, '');
  // Strict allowlist via env: GROQ_REASONING_MODELS="modelA,modelB"
  const list = (process.env.GROQ_REASONING_MODELS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (list.length === 0) return false; // default: disabled unless explicitly allowed
  return list.includes(m);
}

function geminiSupportsReasoning(model) {
  // Gemini 2.5 models support reasoning
  const m = String(model || '').replace(/^gemini(-free)?:/, '');
  return m.startsWith('gemini-2.5');
}

function mapReasoningForOpenAI(model, options) {
  if (!openAISupportsReasoning(model)) return {};
  const effort = options?.reasoningEffort || process.env.REASONING_EFFORT || 'low';
  return { reasoning: { effort } };
}

function mapReasoningForGroq(model, options) {
  if (!groqSupportsReasoning(model)) return {};
  const effort = options?.reasoningEffort || process.env.REASONING_EFFORT || 'low';
  return { include_reasoning: true, reasoning_effort: effort, reasoning_format: 'raw' };
}

function mapReasoningForGemini(model, options) {
  // Gemini's OpenAI-compatible endpoint doesn't support reasoning_effort parameter
  // The native Gemini API uses thinking_config, but we're using the OpenAI-compatible endpoint
  // which doesn't expose this parameter. For now, return empty object.
  // TODO: Consider switching to native Gemini API for reasoning models
  return {};
}

function httpsRequestJson({ hostname, path, method = 'POST', headers = {}, bodyObj, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    // Log full request details
    console.log('🤖 LLM REQUEST:', {
      url: `https://${hostname}${path}`,
      method,
      headers: { ...headers, Authorization: headers.Authorization ? '[REDACTED]' : undefined },
      body: JSON.stringify(bodyObj, null, 2)
    });
    
    const req = https.request({ hostname, path, method, headers, timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const status = res.statusCode || 0;
        const responseHeaders = res.headers;
        
        // Log full response details
        console.log('🤖 LLM RESPONSE:', {
          status,
          headers: responseHeaders,
          body: data
        });
        
        if (status < 200 || status >= 300) {
          // Enhanced error with full context for debugging
          const errorContext = {
            httpStatus: status,
            httpHeaders: responseHeaders,
            responseBody: data,
            requestUrl: `https://${hostname}${path}`,
            requestMethod: method
          };
          
          console.error('🚨 LLM HTTP Error Context:', errorContext);
          
          // Create enhanced error with context
          const error = new Error(`HTTP ${status}: ${data?.slice?.(0, 1000)}`);
          error.httpStatus = status;
          error.httpHeaders = responseHeaders;
          error.responseBody = data;
          error.requestUrl = `https://${hostname}${path}`;
          
          return reject(error);
        }
        try {
          const json = JSON.parse(data);
          // Include HTTP headers in the response
          resolve({ data: json, headers: responseHeaders, status });
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    try { req.write(JSON.stringify(bodyObj || {})); } catch {}
    req.end();
  });
}

// Normalize OpenAI Responses API response
function normalizeFromResponsesAPI(data) {
  const output = [];
  let text = '';
  const blocks = data?.output || [];
  for (const b of blocks) {
    if (b?.type === 'message' && b?.role === 'assistant' && typeof b.content === 'string') {
      text += b.content;
    } else if (b?.type === 'function_call') {
      output.push({ id: b.id || null, call_id: b.call_id || b.id || null, type: 'function_call', name: b.name, arguments: b.arguments || '{}' });
    } else if (b?.type === 'tool_call' && b?.tool_type === 'function') {
      output.push({ id: b.id || null, call_id: b.call_id || b.id || null, type: 'function_call', name: b.name, arguments: b.arguments || '{}' });
    }
  }
  return { output, text };
}

// Normalize OpenAI-compatible chat.completions tool_calls
function normalizeFromChat(responseWithHeaders) {
  // Handle both old format (just data) and new format (data + headers)
  const data = responseWithHeaders?.data || responseWithHeaders;
  const httpHeaders = responseWithHeaders?.headers || {};
  const httpStatus = responseWithHeaders?.status;
  
  const choice = data?.choices?.[0];
  const toolCalls = choice?.message?.tool_calls || [];
  const out = [];
  for (const tc of toolCalls) {
    out.push({ id: tc.id || null, call_id: tc.id || null, type: 'function_call', name: tc.function?.name, arguments: tc.function?.arguments || '{}' });
  }
  return { 
    output: out, 
    text: choice?.message?.content || '',
    rawResponse: data,  // Include the full raw JSON response with all metadata
    httpHeaders,        // Include HTTP response headers
    httpStatus          // Include HTTP status code
  };
}

async function llmResponsesWithTools({ model, input, tools, options }) {
  const toolsConfigured = Array.isArray(tools) && tools.length > 0;
  const defaultToolChoice = toolsConfigured ? 'required' : 'auto';
  const defaultResponseFormat = toolsConfigured ? { type: 'json_object' } : undefined;

  // Default parameters optimized for comprehensive, detailed, verbose responses
  const temperature = options?.temperature ?? 0.8;
  const max_tokens = options?.max_tokens ?? 4096;
  const top_p = options?.top_p ?? 0.95;
  const frequency_penalty = options?.frequency_penalty ?? 0.3;
  const presence_penalty = options?.presence_penalty ?? 0.4;

  // Auto-detect and add provider prefix if missing
  let normalizedModel = model;
  if (!isOpenAIModel(model) && !isGroqModel(model) && !isGeminiModel(model)) {
    // Check if it's a known model name from any provider
    if (isKnownOpenAIModel(model)) {
      console.log(`⚠️ Model "${model}" is an OpenAI model, adding openai: prefix`);
      normalizedModel = `openai:${model}`;
    } else if (isKnownGeminiModel(model)) {
      console.log(`⚠️ Model "${model}" is a Gemini model, adding gemini: prefix`);
      normalizedModel = `gemini:${model}`;
    } else {
      // If no prefix and not a known model, assume groq
      console.log(`⚠️ Model "${model}" missing provider prefix, assuming groq:${model}`);
      normalizedModel = `groq:${model}`;
    }
  }

  if (isOpenAIModel(normalizedModel)) {
    const hostname = process.env.OPENAI_API_BASE?.replace('https://', '') || 'api.openai.com';
    const path = '/v1/chat/completions';
    const messages = (input || []).map(block => {
      if (block.type === 'function_call_output') {
        return { role: 'tool', content: block.output, tool_call_id: block.call_id };
      }
      if (block.role) {
        const message = { role: block.role, content: block.content };
        // Preserve tool_calls for assistant messages
        if (block.tool_calls) {
          message.tool_calls = block.tool_calls;
        }
        return message;
      }
      return null;
    }).filter(Boolean);
    
    const payload = {
      model: normalizedModel.replace(/^openai:/, ''),
      messages,
      tools,
      tool_choice: options?.tool_choice ?? defaultToolChoice,
      // CRITICAL: Cannot set response_format when using tools/function calling
      // Only include response_format if NO tools are provided
      ...((!tools || tools.length === 0) && { response_format: options?.response_format ?? defaultResponseFormat }),
      temperature,
      max_tokens,
      top_p,
      frequency_penalty,
      presence_penalty
    };
    if (options?.parallel_tool_calls !== undefined) {
      payload.parallel_tool_calls = options.parallel_tool_calls;
    }
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options?.apiKey}`
    };
    try {
      const data = await httpsRequestJson({ hostname, path, method: 'POST', headers, bodyObj: payload, timeoutMs: options?.timeoutMs || 30000 });
      const result = normalizeFromChat(data);
      // Add provider context to successful response
      result.provider = 'openai';
      result.model = normalizedModel;
      return result;
    } catch (error) {
      // Enhance error with provider context
      error.provider = 'openai';
      error.model = normalizedModel;
      error.endpoint = `https://${hostname}${path}`;
      throw error;
    }
  }

  if (isGroqModel(normalizedModel)) {
    // Groq OpenAI-compatible chat.completions
    const hostname = 'api.groq.com';
    const path = '/openai/v1/chat/completions';
    const messages = (input || []).map(block => {
      if (block.type === 'function_call_output') {
        return { role: 'tool', content: block.output, tool_call_id: block.call_id };
      }
      if (block.role) {
        const message = { role: block.role, content: block.content };
        // Preserve tool_calls for assistant messages (required for proper conversation flow)
        if (block.tool_calls) {
          message.tool_calls = block.tool_calls;
        }
        return message;
      }
      return null;
    }).filter(Boolean);

    const payload = {
      model: normalizedModel.replace(/^groq(-free)?:/, ''),
      messages,
      tools,
      tool_choice: options?.tool_choice ?? defaultToolChoice,
      // CRITICAL: Cannot set response_format when using tools/function calling
      // Only include response_format if NO tools are provided
      ...((!tools || tools.length === 0) && { response_format: options?.response_format ?? defaultResponseFormat }),
      temperature,
      max_tokens,
      top_p,
      frequency_penalty,
      presence_penalty,
      ...mapReasoningForGroq(normalizedModel, options)
    };
    if (options?.parallel_tool_calls !== undefined) {
      payload.parallel_tool_calls = options.parallel_tool_calls;
    }
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options?.apiKey}`
    };
    try {
      const data = await httpsRequestJson({ hostname, path, method: 'POST', headers, bodyObj: payload, timeoutMs: options?.timeoutMs || 30000 });
      const result = normalizeFromChat(data);
      // Add provider context to successful response
      result.provider = 'groq';
      result.model = normalizedModel;
      return result;
    } catch (error) {
      // Enhance error with provider context
      error.provider = 'groq';
      error.model = normalizedModel;
      error.endpoint = `https://${hostname}${path}`;
      throw error;
    }
  }

  if (isGeminiModel(normalizedModel)) {
    // Gemini Native API (AI Studio keys only work with native API, not OpenAI-compatible)
    const hostname = PROVIDERS.gemini.hostname;
    let modelName = normalizedModel.replace(/^gemini(-free)?:/, '');
    
    // Gemini API uses exact model names without modification
    // Available models as of Oct 2025: gemini-1.5-pro, gemini-1.5-flash, gemini-1.5-pro-002, etc.
    const path = `/v1beta/models/${modelName}:generateContent`;
    
    console.log(`🔍 Gemini API: Using model "${modelName}", path: ${path}`);
    
    // Convert OpenAI-style messages to Gemini format
    const contents = [];
    for (const block of input || []) {
      if (block.role === 'system') {
        // System messages go in systemInstruction (separate from contents)
        continue;
      }
      if (block.type === 'function_call_output') {
        contents.push({
          role: 'function',
          parts: [{ functionResponse: { name: block.call_id, response: { content: block.output } } }]
        });
      } else if (block.role) {
        const role = block.role === 'assistant' ? 'model' : 'user';
        const parts = [];
        
        if (typeof block.content === 'string') {
          parts.push({ text: block.content });
        }
        
        // Handle tool calls
        if (block.tool_calls) {
          for (const tc of block.tool_calls) {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
              }
            });
          }
        }
        
        if (parts.length > 0) {
          contents.push({ role, parts });
        }
      }
    }
    
    // Extract system instruction
    const systemMessage = (input || []).find(b => b.role === 'system');
    
    // Build payload for Gemini native API
    const payload = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: max_tokens || 8192,  // Default to 8192 if not specified
        topP: top_p
      }
    };
    
    if (systemMessage) {
      payload.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }
    
    // Add tools if provided
    if (tools && tools.length > 0) {
      payload.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }))
      }];
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': options?.apiKey
    };
    
    try {
      const data = await httpsRequestJson({ hostname, path, method: 'POST', headers, bodyObj: payload, timeoutMs: options?.timeoutMs || 60000 });
      
      // Convert Gemini response to OpenAI format
      const geminiResponse = data.data;
      console.log('🔍 Full Gemini response:', JSON.stringify(geminiResponse, null, 2));
      
      const candidate = geminiResponse.candidates?.[0];
      const content = candidate?.content;
      
      if (!content) {
        console.error('❌ No content in Gemini response. Candidate:', JSON.stringify(candidate, null, 2));
        console.error('❌ Prompt feedback:', JSON.stringify(geminiResponse.promptFeedback, null, 2));
        throw new Error('No content in Gemini response');
      }
      
      // Extract text and function calls from parts
      let textContent = '';
      const toolCalls = [];
      
      // Handle missing or empty parts array
      const parts = content.parts || [];
      
      if (parts.length === 0) {
        // Check if response was truncated
        const finishReason = candidate?.finishReason;
        const usageMetadata = geminiResponse.usageMetadata;
        
        console.error('❌ Gemini response has no parts:', {
          finishReason,
          thoughtsTokenCount: usageMetadata?.thoughtsTokenCount,
          totalTokenCount: usageMetadata?.totalTokenCount,
          promptTokenCount: usageMetadata?.promptTokenCount
        });
        
        // Provide helpful error message
        if (finishReason === 'MAX_TOKENS') {
          throw new Error(`Response truncated (MAX_TOKENS). Used ${usageMetadata?.thoughtsTokenCount || 0} thinking tokens. Try increasing maxOutputTokens or using a model without extensive reasoning.`);
        }
        
        throw new Error(`Gemini returned empty response. Finish reason: ${finishReason || 'unknown'}`);
      }
      
      for (const part of parts) {
        if (part.text) {
          textContent += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${toolCalls.length}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args)
            }
          });
        }
      }
      
      const result = {
        role: 'assistant',
        content: textContent || null,
        text: textContent || '',  // Match normalizeFromChat format
        output: toolCalls,         // Match normalizeFromChat format for tool calls
        provider: 'gemini',
        model: normalizedModel,
        rawResponse: geminiResponse  // Include full response for debugging
      };
      
      if (toolCalls.length > 0) {
        result.tool_calls = toolCalls;
      }
      
      return result;
    } catch (error) {
      // Enhance error with provider context
      error.provider = 'gemini';
      error.model = normalizedModel;
      error.endpoint = `https://${hostname}${path}`;
      throw error;
    }
  }

  throw new Error(`Unsupported model for tool calls: ${model} (normalized: ${normalizedModel})`);
}

module.exports = {
  llmResponsesWithTools
};
