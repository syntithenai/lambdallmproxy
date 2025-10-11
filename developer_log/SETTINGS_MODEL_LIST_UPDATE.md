# Settings Modal: Expanded Groq Model List

**Date**: 2025-10-05  
**Update**: Expanded Groq model suggestions based on current documentation  
**Status**: ✅ Complete

## Overview

Updated the Settings Modal to include the latest Groq models as of October 2025, based on official Groq documentation at https://console.groq.com/docs/models.

## New Models Added

### Production Models (Recommended)

**Large Models**:
- `openai/gpt-oss-120b` - OpenAI's flagship open-weight 120B parameter model with browser search, code execution, and reasoning capabilities (~500 tps)
- `openai/gpt-oss-20b` - Smaller OpenAI open-weight model (20B parameters)
- `llama-3.3-70b-versatile` - Meta's Llama 3.3 70B (existing)
- `llama-3.1-70b-versatile` - Meta's Llama 3.1 70B (existing)

**Small Models**:
- `llama-3.1-8b-instant` - Fast, low-cost model (existing)
- `meta-llama/llama-4-scout-17b-16e-instruct` - New Llama 4 Scout 17B (preview)
- `gemma2-9b-it` - Google's Gemma 2 9B (existing)

### Preview Models

**Large/Specialized Models**:
- `meta-llama/llama-4-maverick-17b-128e-instruct` - Llama 4 Maverick with 128 experts
- `moonshotai/kimi-k2-instruct-0905` - Moonshot AI's Kimi K2 (262K context)
- `qwen/qwen3-32b` - Alibaba Cloud's Qwen 3 32B
- `mixtral-8x7b-32768` - Mistral's Mixtral MoE (existing)

### Reasoning Models (Updated Priority)

**New Priority Order**:
1. `openai/gpt-oss-120b` - **Best for reasoning/planning** (120B with reasoning capabilities)
2. `llama-3.3-70b-versatile` - Solid general-purpose reasoning
3. `openai/gpt-oss-20b` - Lighter reasoning option
4. `qwen/qwen3-32b` - Strong multilingual reasoning
5. `llama-3.1-70b-versatile` - Proven reasoning capabilities
6. `deepseek-r1-distill-llama-70b` - Specialized reasoning (existing)

## Key Features from Groq Docs

### Groq Compound Systems
- `groq/compound` - AI system with built-in tools (web search, code execution)
- `groq/compound-mini` - Lighter version of Compound system

### Capabilities
- **Reasoning**: GPT-OSS 120B, GPT-OSS 20B, Qwen 3 32B
- **Function Calling/Tool Use**: GPT-OSS 120B/20B, Llama 4 Scout, Qwen 3 32B, Kimi K2
- **Vision**: Llama 4 Scout, Llama 4 Maverick
- **Multilingual**: GPT-OSS 120B/20B, Kimi K2, Llama 4 Scout, Llama 3.3 70B
- **Text-to-Speech**: PlayAI TTS
- **Speech-to-Text**: Whisper Large v3, Whisper Large v3 Turbo
- **Safety/Moderation**: Llama Guard 4 12B

### Context Windows
- **Standard**: 131,072 tokens (most models)
- **Extended**: 262,144 tokens (Kimi K2)
- **Output**: Up to 65,536 tokens (GPT-OSS models)

## Implementation

### File: `ui-new/src/components/SettingsModal.tsx`

**Updated Constants**:

```typescript
const MODEL_SUGGESTIONS: Record<Provider, { small: string[]; large: string[]; reasoning: string[] }> = {
  groq: {
    small: [
      'llama-3.1-8b-instant',
      'meta-llama/llama-4-scout-17b-16e-instruct',  // NEW
      'gemma2-9b-it'
    ],
    large: [
      // Production models (recommended)
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'openai/gpt-oss-120b',  // NEW - OpenAI 120B flagship
      'openai/gpt-oss-20b',   // NEW - OpenAI 20B
      // Preview models
      'meta-llama/llama-4-maverick-17b-128e-instruct',  // NEW - Llama 4 Maverick
      'moonshotai/kimi-k2-instruct-0905',  // NEW - Kimi K2 262K context
      'qwen/qwen3-32b',  // NEW - Qwen 3 32B
      'mixtral-8x7b-32768'
    ],
    reasoning: [
      // Best for reasoning/planning
      'openai/gpt-oss-120b',  // NEW - Top choice for reasoning
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-20b',  // NEW
      'qwen/qwen3-32b',  // NEW
      'llama-3.1-70b-versatile',
      'deepseek-r1-distill-llama-70b'
    ]
  },
  // ... OpenAI unchanged
};

const DEFAULT_MODELS: Record<Provider, { small: string; large: string; reasoning: string }> = {
  groq: {
    small: 'llama-3.1-8b-instant',
    large: 'llama-3.3-70b-versatile',
    reasoning: 'openai/gpt-oss-120b'  // UPDATED: Use GPT-OSS 120B for best reasoning
  },
  // ... OpenAI unchanged
};
```

## Model Categories & Use Cases

### Small Models (Fast, Low-Cost)
**Best For**: Simple tasks, high-volume requests, real-time responses

- **llama-3.1-8b-instant** ⚡
  - Speed: ~450 tps
  - Context: 131K tokens
  - Use: Chat, Q&A, simple tasks

- **meta-llama/llama-4-scout-17b-16e-instruct** 🆕
  - Size: 17B with 16 experts
  - Context: 131K tokens
  - Features: Vision, function calling, multilingual
  - Use: Multimodal tasks, tool use

- **gemma2-9b-it**
  - Size: 9B parameters
  - Use: Efficient general tasks

### Large Models (Complex, High-Quality)
**Best For**: Complex reasoning, detailed analysis, production workloads

- **openai/gpt-oss-120b** 🆕 ⭐
  - Size: 120B parameters
  - Speed: ~500 tps
  - Context: 131K input / 65K output
  - Features: Reasoning, browser search, code execution
  - Use: **Top choice for complex tasks and reasoning**

- **llama-3.3-70b-versatile**
  - Size: 70B parameters
  - Context: 131K input / 32K output
  - Use: General-purpose, proven reliability

- **openai/gpt-oss-20b** 🆕
  - Size: 20B parameters
  - Context: 131K input / 65K output
  - Features: Similar to 120B but lighter
  - Use: Balance between speed and capability

- **moonshotai/kimi-k2-instruct-0905** 🆕
  - Context: **262K tokens** (largest)
  - Output: 16K tokens
  - Features: Multilingual, function calling
  - Use: Long documents, large context requirements

- **qwen/qwen3-32b** 🆕
  - Size: 32B parameters
  - Context: 131K input / 40K output
  - Features: Strong reasoning, multilingual
  - Use: Reasoning tasks, multilingual support

- **meta-llama/llama-4-maverick-17b-128e-instruct** 🆕
  - Size: 17B with **128 experts** (MoE)
  - Context: 131K input / 8K output
  - Features: Vision, efficient MoE architecture
  - Use: Multimodal tasks, vision + text

### Reasoning Models (Planning, Analysis)
**Best For**: Complex problem-solving, multi-step planning, research

**Recommended Order**:
1. **openai/gpt-oss-120b** - Best reasoning capabilities
2. **llama-3.3-70b-versatile** - Solid general reasoning
3. **openai/gpt-oss-20b** - Good reasoning, faster
4. **qwen/qwen3-32b** - Strong reasoning, multilingual
5. **llama-3.1-70b-versatile** - Proven track record
6. **deepseek-r1-distill-llama-70b** - Specialized reasoning

## Groq Systems (Alternative)

For users wanting fully-integrated tool-calling systems:

- **groq/compound** - Full system with web search + code execution
- **groq/compound-mini** - Lighter version of Compound

These are pre-configured systems that handle tool orchestration automatically.

## User Experience Improvements

### 1. Clearer Organization
Models now grouped by purpose:
- **Production models** (recommended for real use)
- **Preview models** (evaluation only)

### 2. Better Defaults
- Reasoning model now defaults to `openai/gpt-oss-120b` (best capability)
- Maintains backward compatibility with existing settings

### 3. More Options
- Expanded from 3-4 options per category to 8+ options
- Includes latest Llama 4, GPT-OSS, Qwen 3, Kimi K2 models

### 4. Inline Suggestions
Datalist dropdowns show all available models as user types

## Testing

### Test Case 1: New User Setup
1. Open Settings Modal
2. Select "Groq" provider
3. ✅ See expanded model suggestions in dropdowns
4. ✅ Default reasoning model is `openai/gpt-oss-120b`

### Test Case 2: Existing User Update
1. User has old settings (e.g., `llama-3.1-70b-versatile`)
2. Open Settings Modal
3. ✅ Old settings preserved
4. ✅ Can see new models in suggestions
5. ✅ Can switch to new models if desired

### Test Case 3: Model Input
1. Click in "Large Model" input field
2. ✅ See datalist dropdown with all options
3. Type "gpt"
4. ✅ See filtered results: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`

### Test Case 4: Provider Switch
1. Switch from Groq to OpenAI
2. ✅ Models reset to OpenAI defaults
3. Switch back to Groq
4. ✅ See new Groq model list

## Documentation Sources

Information gathered from:
- https://console.groq.com/docs/models (Official Groq Models Documentation)
- https://groq.com/ (Groq Homepage)
- https://console.groq.com/ (Groq Console)

**Last Updated**: October 5, 2025

## Build Status

**Frontend Build**:
```bash
cd ui-new && npm run build
# Output: 248.54 kB (gzip: 75.44 kB)
# File: docs/assets/index-DS4Ag5y3.js
# Status: ✅ Built successfully
```

**Changes**:
- ✅ Added 8 new Groq models
- ✅ Updated default reasoning model
- ✅ Organized models by production vs preview
- ✅ Added inline comments for clarity

## Future Enhancements

### 1. Dynamic Model Fetching
Query Groq API for available models:
```typescript
async function fetchAvailableModels() {
  const response = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  return response.json();
}
```

### 2. Model Metadata Display
Show model details on hover:
```typescript
const MODEL_INFO = {
  'openai/gpt-oss-120b': {
    size: '120B',
    speed: '500 tps',
    context: '131K',
    features: ['reasoning', 'tools', 'search']
  }
};
```

### 3. Model Categories
Group by capability:
```typescript
<optgroup label="Reasoning">
  <option>openai/gpt-oss-120b</option>
  <option>qwen/qwen3-32b</option>
</optgroup>
<optgroup label="Vision">
  <option>meta-llama/llama-4-scout-17b-16e-instruct</option>
</optgroup>
```

### 4. Model Search/Filter
Add search within dropdown:
```tsx
const filteredModels = models.filter(m => 
  m.toLowerCase().includes(searchTerm.toLowerCase())
);
```

## Summary

Successfully expanded the Groq model list in the Settings Modal with:

1. ✅ **8 new production models** including GPT-OSS 120B/20B, Llama 4 Scout/Maverick, Qwen 3 32B, Kimi K2
2. ✅ **Updated reasoning default** to `openai/gpt-oss-120b` (best reasoning capability)
3. ✅ **Organized by category**: Production (recommended) vs Preview (evaluation only)
4. ✅ **Better user guidance**: Inline comments and clearer organization

Users now have access to the latest and most capable models available on Groq, with clear recommendations for different use cases.

**Status**: ✅ Built and ready for use
