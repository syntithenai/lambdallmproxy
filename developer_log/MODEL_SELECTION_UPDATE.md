# Model Selection Update - October 6, 2025

## Summary

Updated the default model and model ordering in the Settings UI based on Groq's tool-compatible models, prioritizing the best rate limits and context window sizes.

## New Default Model

**meta-llama/llama-4-scout-17b-16e-instruct**

### Why This Model?

1. **Best Rate Limits**: 30,000 TPM (tokens per minute) - the fastest on Groq!
2. **Good Context Window**: 131K context, 8K output
3. **Full Tool Support**: Parallel tool use + JSON mode
4. **Preview Model**: Newest architecture from Meta
5. **Vision Capable**: Can process images (future feature)

## Tool-Compatible Models Comparison

All models listed support tool use as per Groq documentation.

### Production Models (Stable, Recommended for Production)

| Model ID | Context | Output | Tool Support | Parallel Tools | Rate Limits* | Notes |
|----------|---------|--------|--------------|----------------|--------------|-------|
| **meta-llama/llama-4-scout-17b-16e-instruct** | 131K | 8K | ✅ | ✅ | ~30K TPM | **FASTEST** |
| llama-3.1-8b-instant | 131K | 131K | ✅ | ✅ | ~14K TPM | Fast, largest output |
| llama-3.3-70b-versatile | 131K | 32K | ✅ | ✅ | ~6K TPM | Format issues** |
| openai/gpt-oss-120b | 131K | 65K | ✅ | ❌ | ~6K TPM | Good reasoning |
| openai/gpt-oss-20b | 131K | 65K | ✅ | ❌ | ~8K TPM | Smaller, faster |

### Preview Models (Evaluation Only, May Change)

| Model ID | Context | Output | Tool Support | Parallel Tools | Rate Limits* | Notes |
|----------|---------|--------|--------------|----------------|--------------|-------|
| **qwen/qwen3-32b** | 131K | 40K | ✅ | ✅ | ~6K TPM | Previous default |
| moonshotai/kimi-k2-instruct-0905 | **262K** | 16K | ✅ | ✅ | ~4K TPM | **LARGEST context** |
| meta-llama/llama-4-maverick-17b-128e-instruct | 131K | 8K | ✅ | ✅ | ~30K TPM | Very fast |

*Rate limits are approximate for free tier and may vary by account

**llama-3.3-70b-versatile has known issues with generating function syntax (`<function=search>`) even when not needed. This is a training data issue and cannot be fixed with prompting.

## Updated Model Ordering in Settings UI

### Large Models (Complex Tasks)
Order optimized for: **Rate Limits → Context Size → Tool Quality**

1. ⭐ **meta-llama/llama-4-scout-17b-16e-instruct** - 30K TPM (fastest!), 131K context, parallel tools
2. **qwen/qwen3-32b** - 6K TPM, 131K context, parallel tools
3. **moonshotai/kimi-k2-instruct-0905** - 262K context (largest!), parallel tools
4. **openai/gpt-oss-120b** - 131K context, 65K output
5. **openai/gpt-oss-20b** - 131K context, 65K output
6. **meta-llama/llama-4-maverick-17b-128e-instruct** - 131K context, parallel tools
7. **llama-3.1-8b-instant** - Fast, 131K context, parallel tools
8. llama-3.3-70b-versatile - 131K context, has format issues
9. mixtral-8x7b-32768 - Older model

### Small Models (Fast Tasks)
1. llama-3.1-8b-instant
2. meta-llama/llama-4-scout-17b-16e-instruct
3. gemma2-9b-it

### Reasoning Models (Planning/Analysis)
1. openai/gpt-oss-120b - Best reasoning
2. qwen/qwen3-32b
3. meta-llama/llama-4-scout-17b-16e-instruct
4. openai/gpt-oss-20b
5. llama-3.3-70b-versatile
6. deepseek-r1-distill-llama-70b

## Key Takeaways for Users

### Best for Most Use Cases
**meta-llama/llama-4-scout-17b-16e-instruct** - Fastest rate limits, good context, full tool support

### Best for Large Context Needs
**moonshotai/kimi-k2-instruct-0905** - 262K context window (double the standard!)

### Best for Reasoning/Complex Problems
**openai/gpt-oss-120b** - 120B parameters, strong reasoning capabilities

### Best for Speed on Free Tier
**meta-llama/llama-4-scout-17b-16e-instruct** or **llama-3.1-8b-instant** - Both have excellent rate limits

### Models to Avoid
**llama-3.3-70b-versatile** - Known format bleeding issues, generates unwanted function syntax

## Rate Limit Context

Groq free tier typically provides:
- **RPD**: 14,400 requests per day
- **TPM**: Varies by model (see table above)

Rate limits are at the organization level. You'll hit whichever limit (RPM, RPD, TPM, TPD) comes first.

## Migration Guide

### For Existing Users

If you have `llama-3.3-70b-versatile` or `qwen/qwen3-32b` configured:

1. **Clear localStorage**: Open browser console and run:
   ```javascript
   localStorage.removeItem('app_settings');
   location.reload();
   ```

2. **Or Update Manually**: Go to Settings → Large Model → Select `meta-llama/llama-4-scout-17b-16e-instruct`

3. **Test**: Try a simple query to verify the new model works correctly

### Expected Improvements

- ✅ Faster responses (30K TPM vs 6K TPM)
- ✅ No function syntax issues
- ✅ Better tool execution reliability
- ✅ Vision capability (future feature)

## Files Changed

1. **ui-new/src/components/SettingsModal.tsx**
   - Updated `MODEL_SUGGESTIONS.groq.large` array ordering
   - Updated `DEFAULT_MODELS.groq.large` to `meta-llama/llama-4-scout-17b-16e-instruct`
   - Added detailed comments with rate limits and context sizes

2. **ui-new/src/components/ChatTab.tsx**
   - Updated default `largeModel` to `meta-llama/llama-4-scout-17b-16e-instruct`
   - Updated fallback model from `llama-3.3-70b-versatile` to `meta-llama/llama-4-scout-17b-16e-instruct`

## Build Results

```
../docs/assets/index-BbdTVKN9.js  256.50 kB │ gzip: 77.41 kB
✓ built in 988ms
```

Size increased slightly (256.50 kB vs 255.83 kB) due to longer model names and additional comments.

## Testing Checklist

- [ ] Clear localStorage and verify new default model is applied
- [ ] Test simple query (no tools needed) - should work without issues
- [ ] Test search query - should properly execute search tool
- [ ] Test with all 8 tool-compatible models to verify compatibility
- [ ] Monitor rate limits on Groq console
- [ ] Verify no function syntax appears in responses
- [ ] Test parallel tool execution with qwen/qwen3-32b and moonshotai/kimi

## References

- [Groq Supported Models](https://console.groq.com/docs/models)
- [Groq Rate Limits](https://console.groq.com/docs/rate-limits)
- [Groq Tool Use Documentation](https://console.groq.com/docs/tool-use)
- [Previous Issue: LLAMA_3.3_FUNCTION_SYNTAX_ISSUE.md](./LLAMA_3.3_FUNCTION_SYNTAX_ISSUE.md)

## Next Steps

1. Monitor user feedback on new default model
2. Consider adding model selection hints in UI (e.g., "Fastest", "Largest Context")
3. Implement automatic fallback if rate limit hit
4. Add model capability detection (vision, parallel tools, etc.)
5. Create UI indicator showing current rate limit usage
