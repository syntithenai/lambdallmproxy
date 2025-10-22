# VirtueGuard Integration Complete ✅

## Summary
Successfully integrated Together AI's VirtueGuard content moderation model as a dedicated guardrail option alongside Llama Guard 4 for Groq.

## Changes Made

### 1. PROVIDER_CATALOG.json
Added VirtueGuard model to Together AI provider:
```json
"virtueguard-text-lite": {
  "id": "virtueguard-text-lite",
  "category": "guardrail",
  "guardrailModel": true,
  "description": "VirtueGuard Text Lite - Specialized content moderation model",
  "contextWindow": 8192,
  "maxOutput": 512,
  "pricing": {
    "input": 0.10,
    "output": 0.10,
    "unit": "per_million_tokens"
  },
  "supportsTools": false,
  "supportsVision": false,
  "supportsStreaming": true,
  "rateLimits": {
    "tokensPerMinute": 100000,
    "requestsPerMinute": 600
  }
}
```

### 2. src/guardrails/prompts.js
Added VirtueGuard-specific prompt handling:
- VirtueGuard uses simple direct prompting (just pass the content to moderate)
- No special formatting needed like Llama Guard's native format
- Supports both input and output validation

```javascript
// VirtueGuard uses simple direct prompting
if (modelId.includes('virtueguard')) {
  return userInput;  // or llmOutput for output validation
}
```

### 3. src/guardrails/guardrail-factory.js
Added VirtueGuard response parsing:
- Parses JSON response: `{"is_safe": true/false, "violation_categories": [...], "safety_score": 0.95}`
- Converts to standard format with violations and human-readable reasons
- Supports both input and output validation

```javascript
else if (config.inputModel.includes('virtueguard')) {
  const virtueResult = JSON.parse(jsonContent);
  result = {
    safe: virtueResult.is_safe !== false,
    violations: virtueResult.violation_categories || [],
    reason: virtueResult.is_safe ? '' : `Flagged: ${(virtueResult.violation_categories || []).join(', ')}`
  };
}
```

## Auto-Detection Priority

The guardrail auto-detection now follows this priority order:
1. **groq-free** → meta-llama/llama-guard-4-12b (free tier, Llama Guard native format)
2. **gemini-free** → gemini-1.5-flash (fallback, JSON format)
3. **groq** → meta-llama/llama-guard-4-12b (paid tier, Llama Guard native format)
4. **together** → virtueguard-text-lite (JSON format) ✨ NEW
5. **gemini** → gemini-1.5-flash (paid tier, JSON format)
6. Other providers as fallbacks

## Testing

Test results from `scripts/test-guardrails-auto-detect.js`:
```
✅ Test 1: No API keys → No guardrails (expected)
✅ Test 2: Groq API key → meta-llama/llama-guard-4-12b
✅ Test 3: Gemini API key → gemini-1.5-flash
✅ Test 4: Together AI API key → virtueguard-text-lite ✨
```

## Model Comparison

| Model | Provider | Format | Cost/M tokens | Best For |
|-------|----------|--------|---------------|----------|
| meta-llama/llama-guard-4-12b | Groq (free) | Native | Free | High accuracy, free tier |
| meta-llama/llama-guard-4-12b | Groq (paid) | Native | $0.20 | High accuracy, paid tier |
| virtueguard-text-lite | Together AI | JSON | $0.10 | Fast moderation, Together AI users |
| gemini-1.5-flash | Google | JSON | Varies | Fallback, general purpose |

## Usage

Guardrails will automatically select VirtueGuard when:
1. `ENABLE_GUARDRAILS=true` is set in environment
2. Together AI API key is available (`TOGETHER_API_KEY` or `LLAMDA_LLM_PROXY_PROVIDER_TYPE_N=together`)
3. No higher priority guardrail provider is available

Example:
```bash
# Enable guardrails with Together AI
export ENABLE_GUARDRAILS=true
export TOGETHER_API_KEY=your-key-here

# Guardrails will automatically use VirtueGuard
```

## Response Format

VirtueGuard returns JSON responses that are automatically parsed:
```json
{
  "is_safe": false,
  "violation_categories": ["hate", "harassment"],
  "safety_score": 0.15
}
```

This is converted to user-friendly messages:
```
❌ Content Moderation Alert
Flagged: hate, harassment
```

## Benefits

1. **Multi-provider support**: Users can choose their preferred provider
2. **Cost optimization**: Free tiers (Groq) prioritized over paid
3. **Format flexibility**: Supports both native (Llama Guard) and JSON (VirtueGuard, Gemini)
4. **Automatic fallback**: Falls back to general-purpose models if dedicated guardrails unavailable
5. **User-friendly messages**: All violations converted to human-readable labels

## Future Enhancements

Potential improvements:
- Add more guardrail models as they become available
- Fine-tune VirtueGuard categories mapping
- Add configurable strictness levels per provider
- Support custom category definitions

---

**Status**: ✅ Complete and tested
**Date**: 2025-10-21
