/**
 * Groq model rate limits data structure
 * Free plan limits for all available models (excluding grok-compound and whisper models)
 */
const GROQ_RATE_LIMITS = {
  "allam-2-7b": {
    rpm: 30,        // Requests per minute
    rpd: 7000,      // Requests per day
    tpm: 6000,      // Tokens per minute
    tpd: 500000,    // Tokens per day
    context_window: 32768,  // Context window in tokens
    reasoning_capability: "intermediate",  // basic, intermediate, advanced
    speed: "moderate",    // fast, moderate, slow
    vision_capable: false
  },
  "deepseek-r1-distill-llama-70b": {
    rpm: 30,
    rpd: 1000,
    tpm: 6000,
    tpd: 100000,
    context_window: 128000,
    reasoning_capability: "advanced",
    speed: "moderate",
    vision_capable: false
  },
  "gemma2-9b-it": {
    rpm: 30,
    rpd: 14400,
    tpm: 15000,
    tpd: 500000,
    context_window: 8192,
    reasoning_capability: "intermediate",
    speed: "fast",
    vision_capable: false
  },
  "llama-3.1-8b-instant": {
    rpm: 30,
    rpd: 14400,
    tpm: 6000,
    tpd: 500000,
    context_window: 128000,
    reasoning_capability: "basic",
    speed: "fast",
    vision_capable: false
  },
  "llama-3.3-70b-versatile": {
    rpm: 30,
    rpd: 1000,
    tpm: 12000,
    tpd: 100000,
    context_window: 128000,
    reasoning_capability: "advanced",
    speed: "moderate",
    vision_capable: false
  },
  "meta-llama/llama-4-maverick-17b-128e-instruct": {
    rpm: 30,
    rpd: 1000,
    tpm: 6000,
    tpd: 500000,
    context_window: 128000,
    reasoning_capability: "advanced",
    speed: "moderate",
    vision_capable: true
  },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    rpm: 30,
    rpd: 1000,
    tpm: 30000,
    tpd: 500000,
    context_window: 128000,
    reasoning_capability: "intermediate",
    speed: "fast",
    vision_capable: true
  },
  "meta-llama/llama-guard-4-12b": {
    rpm: 30,
    rpd: 14400,
    tpm: 15000,
    tpd: 500000,
    context_window: 128000,
    reasoning_capability: "intermediate",
    speed: "moderate",
    vision_capable: false
  },
  "meta-llama/llama-prompt-guard-2-22m": {
    rpm: 30,
    rpd: 14400,
    tpm: 15000,
    tpd: 500000,
    context_window: 512,
    reasoning_capability: "basic",
    speed: "fast",
    vision_capable: false
  },
  "meta-llama/llama-prompt-guard-2-86m": {
    rpm: 30,
    rpd: 14400,
    tpm: 15000,
    tpd: 500000,
    context_window: 512,
    reasoning_capability: "basic",
    speed: "fast",
    vision_capable: false
  },
  "moonshotai/kimi-k2-instruct": {
    rpm: 60,
    rpd: 1000,
    tpm: 10000,
    tpd: 300000,
    context_window: 262144,
    reasoning_capability: "advanced",
    speed: "moderate",
    vision_capable: false
  },
  "moonshotai/kimi-k2-instruct-0905": {
    rpm: 60,
    rpd: 1000,
    tpm: 10000,
    tpd: 300000,
    context_window: 262144,
    reasoning_capability: "advanced",
    speed: "moderate",
    vision_capable: false
  },
  "openai/gpt-oss-120b": {
    rpm: 30,
    rpd: 1000,
    tpm: 8000,
    tpd: 200000,
    context_window: 131072,
    reasoning_capability: "advanced",
    speed: "moderate",
    vision_capable: false
  },
  "openai/gpt-oss-20b": {
    rpm: 30,
    rpd: 1000,
    tpm: 8000,
    tpd: 200000,
    context_window: 131072,
    reasoning_capability: "advanced",
    speed: "moderate",
    vision_capable: false
  },
  "playai-tts": {
    rpm: 10,
    rpd: 100,
    tpm: 1200,
    tpd: 3600,
    context_window: 8192,
    reasoning_capability: "basic",
    speed: "fast",
    vision_capable: false
  },
  "playai-tts-arabic": {
    rpm: 10,
    rpd: 100,
    tpm: 1200,
    tpd: 3600,
    context_window: 8192,
    reasoning_capability: "basic",
    speed: "fast",
    vision_capable: false
  },
  "qwen/qwen3-32b": {
    rpm: 60,
    rpd: 1000,
    tpm: 6000,
    tpd: 500000,
    context_window: 131072,
    reasoning_capability: "advanced",
    speed: "moderate",
    vision_capable: false
  }
};

module.exports = { GROQ_RATE_LIMITS };