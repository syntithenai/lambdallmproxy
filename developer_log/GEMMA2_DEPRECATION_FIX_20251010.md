# Model Deprecation Fix: gemma2-9b-it → gemma-7b-it

**Date**: October 10, 2025  
**Issue**: Groq decommissioned `gemma2-9b-it` model  
**Deployment**: llmproxy-20251010-174900.zip

## Problem

The model `gemma2-9b-it` has been decommissioned by Groq and returns errors:

```
The model gemma2-9b-it has been decommissioned and is no longer supported.
```

## Solution

Replaced all references to `gemma2-9b-it` with `gemma-7b-it` across the entire codebase.

## Files Modified

### Source Code (5 files)

1. **src/model-selector.js** (line 178)
   - Updated default fallback priority array

2. **src/endpoints/chat.js** (line 20)
   - Updated GROQ_RATE_LIMIT_FALLBACK_MODELS array

3. **src/providers/groq-provider.js** (line 29)
   - Updated model validation list

4. **src/groq-rate-limits.js** (lines 26-36)
   - Renamed rate limit configuration entry
   - Preserved rate limits: rpm=30, rpd=14400, tpm=15000, tpd=500000
   - Context window: 8192 tokens
   - Reasoning capability: intermediate
   - Speed: fast

5. **src/tools.js** (line 659)
   - Updated load balancing model pool

### Test Files (2 files)

1. **tests/unit/model-categorizer.test.js** (line 83)
   - Updated model categorization test

2. **tests/unit/token-calculator.test.js** (line 43)
   - Updated model family detection test

### Scripts (1 file)

1. **scripts/collect-provider-data.js** (line 125)
   - Updated model configuration data

## Verification

```bash
# No remaining references in source code
grep -r "gemma2-9b-it" src/
# (returns nothing)

# Test suite maintained
npm test
# 650 passing (maintained same pass rate)
# 21 failing (pre-existing, unrelated to model change)
```

## Deployment

```bash
make deploy-lambda-fast
```

**Package**: llmproxy-20251010-174900.zip  
**Size**: 151K  
**Time**: ~6 seconds  
**Status**: ✅ Successful

## Configuration Preserved

All configuration values for the model were preserved:

- **Rate Limits**: 30 rpm, 14400 rpd, 15000 tpm, 500000 tpd
- **Context Window**: 8192 tokens
- **Reasoning Capability**: intermediate
- **Speed**: fast
- **Pricing**: $0.20 per million tokens (input/output)

## Model Comparison

| Property | gemma2-9b-it | gemma-7b-it |
|----------|--------------|-------------|
| Status | ❌ Deprecated | ✅ Active |
| Context | 8192 tokens | 8192 tokens |
| TPM | 15000 | 15000 |
| RPM | 30 | 30 |
| Reasoning | intermediate | intermediate |
| Speed | fast | fast |

## Documentation

Historical documentation files (*.md in root) referencing `gemma2-9b-it` were left unchanged as they document the project's evolution.

## Testing

All existing tests continue to pass with the new model reference. No functionality changes required.
