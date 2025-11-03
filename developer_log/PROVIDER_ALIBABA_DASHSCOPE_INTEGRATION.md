# Alibaba Cloud (DashScope) Provider Integration

**Date**: November 3, 2025

## Summary

Added Alibaba Cloud DashScope as a new LLM provider, enabling access to Qwen models (Qwen Turbo, Qwen Plus, Qwen Max, Qwen VL).

---

## What Changed

### 1. LLM Adapter (`src/llm_tools_adapter.js`)

**Added Provider Detection**:
```javascript
function isAlibabaModel(model) { 
  return typeof model === 'string' && 
    (model.startsWith('alibaba:') || model.startsWith('dashscope:')); 
}
```

**Added API Integration**:
- Endpoint: `dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- Authentication: Bearer token (DashScope API Key)
- Format: OpenAI-compatible API
- Supports: Tools, streaming, JSON mode

### 2. Provider Catalog (`PROVIDER_CATALOG.json`)

**Added Provider Entry**:
```json
{
  "alibaba": {
    "name": "Alibaba Cloud (DashScope)",
    "type": "alibaba",
    "apiBase": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "supportsStreaming": true,
    "supportsTools": true,
    "freeTier": { "available": true }
  }
}
```

**Available Models**:

| Model | Category | Context | Pricing (per M tokens) | Features |
|-------|----------|---------|----------------------|----------|
| `qwen-turbo` | Small | 8K | $0.4 / $1.2 | Fast, cost-effective |
| `qwen-plus` | Medium | 32K | $2.0 / $6.0 | Enhanced performance |
| `qwen-max` | Large | 32K | $20.0 / $60.0 | Best for complex tasks |
| `qwen-vl-plus` | Medium | 32K | $4.0 / $12.0 | Vision-language |
| `qwen-vl-max` | Large | 32K | $20.0 / $60.0 | Advanced vision |

### 3. Environment Configuration (`.env`)

**Provider Setup**:
```bash
# Provider 8: Alibaba Cloud (DashScope)
LP_TYPE_8=alibaba
LP_KEY_8=sk-YOUR_DASHSCOPE_API_KEY_HERE
LP_CAPABILITIES_8=chat
```

---

## Getting Your API Key

### Step 1: Create Alibaba Cloud Account

1. Go to: https://dashscope.console.aliyun.com
2. Sign up or log in
3. Complete identity verification (if required)

### Step 2: Create API Key

1. Navigate to: https://dashscope.console.aliyun.com/apiKey
2. Click "Create API Key"
3. Copy the key (starts with `sk-`)
4. **Important**: Save it securely - it won't be shown again

### Step 3: Configure Environment

1. Edit `.env`:
   ```bash
   LP_KEY_8=sk-your-actual-api-key-here
   ```

2. Deploy environment variables:
   ```bash
   make deploy-env
   ```

---

## Usage

### Model Selection Format

Use either prefix:
- `alibaba:qwen-turbo`
- `alibaba:qwen-plus`
- `alibaba:qwen-max`
- `alibaba:qwen-vl-plus`
- `alibaba:qwen-vl-max`

Or:
- `dashscope:qwen-turbo`
- `dashscope:qwen-plus`
- etc.

### Example API Call

```javascript
const result = await llmResponsesWithTools({
  model: 'alibaba:qwen-turbo',
  input: [
    { role: 'user', content: 'What is artificial intelligence?' }
  ],
  tools: [],
  options: {
    apiKey: process.env.LP_KEY_8,
    temperature: 0.7,
    max_tokens: 2048
  }
});
```

### Via UI

1. Add provider in Settings
2. Provider Type: `alibaba`
3. API Key: Your DashScope key
4. Models will appear in model selector

---

## Features

### Supported Capabilities

- ✅ **Chat Completion**: All models
- ✅ **Tool Calling**: All models
- ✅ **Streaming**: All models
- ✅ **JSON Mode**: When no tools
- ✅ **Vision**: `qwen-vl-plus`, `qwen-vl-max`
- ❌ **Embeddings**: Not yet (requires different endpoint)
- ❌ **Image Generation**: Not supported

### Rate Limits

- **Tokens**: 60,000 TPM (all models)
- **Requests**: 60 RPM (all models)
- **Concurrent**: Based on account tier

### Pricing Comparison

Compared to other providers:

| Provider | Small Model | Large Model |
|----------|-------------|-------------|
| **Alibaba** | $0.4/$1.2 | $20/$60 |
| Groq (free) | $0/$0 | $0/$0 |
| OpenAI | $0.15/$0.6 | $5/$15 |
| Gemini | $0.075/$0.3 | $1.25/$5 |
| Cohere | $0.075/$0.3 | $2.5/$10 |

Alibaba is **mid-tier pricing** - not the cheapest, but competitive for Chinese language tasks.

---

## Authentication Notes

### API Key vs AccessKey

**DashScope API Key** (Correct ✅):
- Format: `sk-xxxxxxxxxxxxxxxxxxxxxxxx`
- Used with: OpenAI-compatible endpoint
- Get from: https://dashscope.console.aliyun.com/apiKey

**AccessKey ID/Secret** (Incorrect ❌):
- Format: `LTAI5tQyyrWXfZN77MvQgfgr` + secret
- Used with: Alibaba Cloud native SDK (not OpenAI-compatible)
- Not compatible with this implementation

**Important**: The credentials you provided appear to be AccessKey format. You need to:
1. Log into DashScope console
2. Generate a new API Key (starts with `sk-`)
3. Use that key instead

---

## Testing

### Local Testing

```bash
# Start dev server
make dev

# Test Alibaba provider
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "model": "alibaba:qwen-turbo",
    "messages": [{"role": "user", "content": "Hello in Chinese"}],
    "providers": [{
      "type": "alibaba",
      "apiKey": "sk-your-key",
      "enabled": true
    }]
  }'
```

### Expected Response

```json
{
  "role": "assistant",
  "content": "你好！(Nǐ hǎo!) - Hello in Chinese!",
  "provider": "alibaba",
  "model": "alibaba:qwen-turbo"
}
```

---

## Troubleshooting

### Error: "Invalid API Key"

**Cause**: Using AccessKey instead of API Key

**Solution**:
1. Get DashScope API Key from console
2. Key must start with `sk-`
3. Update `.env` with correct key

### Error: "Model not found"

**Cause**: Wrong model name or unsupported model

**Solution**:
- Use exact model names: `qwen-turbo`, `qwen-plus`, `qwen-max`
- Check https://dashscope.aliyun.com for latest models
- Update `PROVIDER_CATALOG.json` if new models added

### Error: "Rate limit exceeded"

**Cause**: Exceeded 60 TPM or 60 RPM

**Solution**:
- Wait 60 seconds for limits to reset
- Upgrade account tier for higher limits
- Use model rotation with other providers

---

## Deployment

```bash
# Update environment variables
make deploy-env

# Deploy code changes
make deploy-lambda-fast

# Full deployment (if dependencies changed)
make deploy-lambda
```

---

## Future Enhancements

### Potential Additions

1. **Embeddings Support**:
   - Endpoint: `/services/embeddings/text-embedding/text-embedding`
   - Models: `text-embedding-v1`, `text-embedding-v2`
   
2. **Image Generation**:
   - Endpoint: `/services/aigc/text2image/image-synthesis`
   - Models: `wanx-v1`, `wanx-sketch-to-image-v1`

3. **Speech Services**:
   - TTS: `/services/audio/tts`
   - ASR: `/services/audio/asr`

4. **More Models**:
   - `qwen-long`: Ultra-long context (1M tokens)
   - `qwen-coder`: Code generation
   - `qwen-audio`: Audio understanding

---

## References

- **DashScope Docs**: https://help.aliyun.com/zh/dashscope/
- **API Console**: https://dashscope.console.aliyun.com
- **Pricing**: https://help.aliyun.com/zh/dashscope/developer-reference/tongyi-qianwen-metering-and-billing
- **OpenAI Compatibility**: https://help.aliyun.com/zh/dashscope/developer-reference/compatibility-of-openai-with-dashscope

---

## Conclusion

✅ **Alibaba Cloud DashScope integrated**  
✅ **5 Qwen models available**  
✅ **OpenAI-compatible API**  
⚠️ **Requires DashScope API Key** (not AccessKey)  
⚠️ **User must generate API key from console**  

Ready to use once proper API key is configured!
