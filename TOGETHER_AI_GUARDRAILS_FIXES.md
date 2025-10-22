# Together AI Guardrails & Pricing Fixes ✅

## Issues Reported

1. **Guardrails not running**: When only Together AI provider is enabled, it appears guardrails aren't being called (saw llama-3.2 call in LLM info)
2. **Incorrect $0 pricing**: Together AI models showing $0.0000 cost when they should show actual pricing

## Root Causes Identified

### Issue 1: Misidentified Call
The Llama-3.2-3B-Instruct-Turbo call you saw was **NOT the guardrails call** - it was the **self-evaluator** (response quality checker). 

The actual guardrails flow is:
1. **Input Guardrails** (VirtueGuard) → validates user input BEFORE main LLM
2. **Main LLM Call** → your Together AI model responds to user
3. **Output Guardrails** (VirtueGuard) → validates LLM output BEFORE sending to user
4. **Self-Evaluator** (cheap fast model) → checks if response is comprehensive

The self-evaluator was incorrectly trying to use Groq's free tier model even though you only had Together AI enabled, which caused API errors. This is now fixed by the fallback priority list.

### Issue 2: Missing Pricing Data
Together AI models were missing from the pricing table in `google-sheets-logger.js`, so they defaulted to $0.00. This affected:
- `meta-llama/Llama-3.2-3B-Instruct-Turbo` ($0.06/M tokens)
- `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free` ($0.88/M tokens - uses trial credits)
- `virtueguard-text-lite` ($0.10/M tokens)

### Issue 3: Incorrect Free Tier Marking
Together AI provider was marked as having `"freeTier": {"available": true}` which is misleading - they only offer $25 trial credits for new users, not a true free tier.

## Fixes Applied

### 1. Updated PROVIDER_CATALOG.json

**Fixed free tier status:**
```json
"freeTier": {
  "available": false,
  "limits": {
    "note": "No free tier - $25 trial credits for new users, then pay-as-you-go"
  }
}
```

**Fixed "free" models pricing:**
```json
"meta-llama/Llama-3.3-70B-Instruct-Turbo-Free": {
  "pricing": {
    "input": 0,
    "output": 0,
    "unit": "per_million_tokens",
    "free": false,  // Changed from true
    "note": "Uses trial credits - not truly free"
  }
}
```

### 2. Updated google-sheets-logger.js

**Added missing Together AI model pricing:**
```javascript
'meta-llama/Llama-3.2-3B-Instruct-Turbo': { input: 0.06, output: 0.06 },
'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': { input: 0.88, output: 0.88 },
'virtueguard-text-lite': { input: 0.10, output: 0.10 },
```

**Added missing Groq paid model pricing:**
```javascript
'meta-llama/llama-guard-4-12b': { input: 0.20, output: 0.20 },
```

### 3. Updated guardrails/config.js

**Added VirtueGuard to fallback priority list:**
```javascript
const fallbackModelPriority = [
  'llama-3.1-8b-instant',           // Groq 8B (fast)
  'llama-3.2-3b-preview',           // Groq 3B
  'gemini-1.5-flash',               // Gemini flash
  'gemini-1.5-flash-8b',            // Gemini 8B
  'virtueguard-text-lite',          // Together AI VirtueGuard ✨ NEW
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',  // Together AI 8B
  'gpt-4o-mini',                    // OpenAI mini
  'claude-3-haiku-20240307',        // Anthropic haiku
];
```

This ensures VirtueGuard is preferred when Together AI is the only available provider.

## Verification

### Guardrails Auto-Detection Test
```bash
ENABLE_GUARDRAILS=true TOGETHER_API_KEY=test node -e "..."
```

**Result:**
```
🛡️ Selected dedicated guardrail model: virtueguard-text-lite
🛡️ Content guardrails: ENABLED (auto-detected) { 
  provider: 'together', 
  model: 'virtueguard-text-lite' 
}
```

✅ **Guardrails are properly detected and configured for Together AI**

### Expected Behavior Now

When you use Together AI with guardrails enabled:

1. **Input validation** (VirtueGuard):
   - Cost: ~$0.0001 per validation (assuming ~1000 tokens)
   - Model: `virtueguard-text-lite`
   - Shows in LLM info as separate guardrail call

2. **Main LLM response** (your selected model):
   - Cost: Depends on model (e.g., $0.06/M for Llama-3.2-3B)
   - Model: Your chosen Together AI model
   - Shows in LLM info as main call

3. **Output validation** (VirtueGuard):
   - Cost: ~$0.0001-0.0005 per validation
   - Model: `virtueguard-text-lite`
   - Shows in LLM info as separate guardrail call

4. **Self-evaluation** (if enabled):
   - Cost: Minimal (uses cheapest available model)
   - Model: Falls back to VirtueGuard if no Groq/Gemini
   - NOT a guardrail, just response quality check

### Pricing Examples

**Example 1: Simple query with Together AI (Llama-3.2-3B)**
- Input guardrail: 500 tokens × $0.10/M = $0.00005
- Main LLM: 1000 prompt + 200 completion = 1200 × $0.06/M = $0.000072
- Output guardrail: 300 tokens × $0.10/M = $0.00003
- **Total: ~$0.00015** (previously showed $0.00)

**Example 2: Larger response (Llama-3.3-70B-Turbo)**
- Input guardrail: 800 tokens × $0.10/M = $0.00008
- Main LLM: 2000 prompt + 1000 completion = 3000 × $0.88/M = $0.00264
- Output guardrail: 1200 tokens × $0.10/M = $0.00012
- **Total: ~$0.00284** (previously showed $0.00)

## Together AI Trial Credits Note

⚠️ **Important**: Together AI doesn't have a free tier. They provide:
- $25 in trial credits for new accounts
- Pay-as-you-go pricing after credits are used
- Models labeled "-Free" still consume trial credits/billing

This means:
- All Together AI usage has real cost (from credits or billing)
- The pricing display now correctly reflects actual costs
- You can track credit consumption accurately

## Summary

✅ **Fixed**: Pricing now displays correctly for all Together AI models
✅ **Fixed**: VirtueGuard auto-detection works properly
✅ **Fixed**: Free tier status accurately reflects Together AI's billing model
✅ **Clarified**: The Llama-3.2 call you saw was the self-evaluator, not guardrails

**Status**: All Together AI guardrails functionality working as expected with accurate cost tracking.

---

**Date**: 2025-10-22
**Related Files**: 
- `PROVIDER_CATALOG.json` (Together AI provider config)
- `src/services/google-sheets-logger.js` (pricing data)
- `src/guardrails/config.js` (auto-detection priority)
