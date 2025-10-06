/**
 * LLM tools adapter: OpenAI Responses API + Groq chat.completions tool-calls
 */

const https = require('https');

function isOpenAIModel(model) { return typeof model === 'string' && model.startsWith('openai:'); }
function isGroqModel(model) { return typeof model === 'string' && model.startsWith('groq:'); }

function openAISupportsReasoning(model) {
  const m = String(model || '').replace(/^openai:/, '');
  return /^gpt-5/i.test(m) || /\bo\d|\b4o\b|^gpt-4o/i.test(m);
}

function groqSupportsReasoning(model) {
  const m = String(model || '').replace(/^groq:/, '');
  // Strict allowlist via env: GROQ_REASONING_MODELS="modelA,modelB"
  const list = (process.env.GROQ_REASONING_MODELS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (list.length === 0) return false; // default: disabled unless explicitly allowed
  return list.includes(m);
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
        
        // Log full response details
        console.log('🤖 LLM RESPONSE:', {
          status,
          headers: res.headers,
          body: data
        });
        
        if (status < 200 || status >= 300) {
          return reject(new Error(`HTTP ${status}: ${data?.slice?.(0, 1000)}`));
        }
        try {
          const json = JSON.parse(data);
          resolve(json);
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
function normalizeFromChat(data) {
  const choice = data?.choices?.[0];
  const toolCalls = choice?.message?.tool_calls || [];
  const out = [];
  for (const tc of toolCalls) {
    out.push({ id: tc.id || null, call_id: tc.id || null, type: 'function_call', name: tc.function?.name, arguments: tc.function?.arguments || '{}' });
  }
  return { output: out, text: choice?.message?.content || '' };
}

async function llmResponsesWithTools({ model, input, tools, options }) {
  // Default parameters optimized for comprehensive, detailed, verbose responses
  const temperature = options?.temperature ?? 0.8;
  const max_tokens = options?.max_tokens ?? 4096;
  const top_p = options?.top_p ?? 0.95;
  const frequency_penalty = options?.frequency_penalty ?? 0.3;
  const presence_penalty = options?.presence_penalty ?? 0.4;

  // Auto-detect and add provider prefix if missing
  let normalizedModel = model;
  if (!isOpenAIModel(model) && !isGroqModel(model)) {
    // If no prefix, assume groq (most common for tool calls)
    console.log(`⚠️ Model "${model}" missing provider prefix, assuming groq:${model}`);
    normalizedModel = `groq:${model}`;
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
      tool_choice: 'auto',
      temperature,
      max_tokens,
      top_p,
      frequency_penalty,
      presence_penalty
    };
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options?.apiKey || process.env.OPENAI_API_KEY}`
    };
    const data = await httpsRequestJson({ hostname, path, method: 'POST', headers, bodyObj: payload, timeoutMs: options?.timeoutMs || 30000 });
    return normalizeFromChat(data);
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
      model: normalizedModel.replace(/^groq:/, ''),
      messages,
      tools,
      tool_choice: 'auto',
      temperature,
      max_tokens,
      top_p,
      frequency_penalty,
      presence_penalty,
      ...mapReasoningForGroq(normalizedModel, options)
    };
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options?.apiKey || process.env.GROQ_API_KEY}`
    };
    const data = await httpsRequestJson({ hostname, path, method: 'POST', headers, bodyObj: payload, timeoutMs: options?.timeoutMs || 30000 });
    return normalizeFromChat(data);
  }

  throw new Error(`Unsupported model for tool calls: ${model} (normalized: ${normalizedModel})`);
}

module.exports = {
  llmResponsesWithTools
};
