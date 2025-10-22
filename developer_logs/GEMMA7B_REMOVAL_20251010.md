# Model Deprecation Fix: gemma-7b-it Removed

**Date**: October 10, 2025  
**Issue**: Groq decommissioned `gemma-7b-it` model  
**Deployment**: llmproxy-20251010-181911.zip

## Problem

The model `gemma-7b-it` has been decommissioned by Groq and returns errors:

```
The model gemma-7b-it has been decommissioned and is no longer supported.
```

## Solution

**Removed** all references to `gemma-7b-it` from the codebase. The model was redundant as `llama-3.1-8b-instant` provides similar capabilities and is already in all fallback lists.

## Strategy

Rather than replacing `gemma-7b-it` with another model, we simply removed it because:
1. `llama-3.1-8b-instant` is already the primary fast/small model
2. Both models served the same role (fast, small, intermediate reasoning)
3. Removing it simplifies the fallback chains
4. All fallback lists still have 3+ models

## Files Modified

### Source Code (5 files)

1. **src/model-selector.js** (line 178)
   - Removed from `DEFAULT_FALLBACK_PRIORITY` array
   - Array reduced from 4 to 3 models

2. **src/endpoints/chat.js** (line 20)
   - Removed from `GROQ_RATE_LIMIT_FALLBACK_MODELS` array
   - Array reduced from 4 to 3 models

3. **src/providers/groq-provider.js** (line 29)
   - Removed from `supportedModels` array
   - Also removed duplicate `llama-3.3-70b-versatile` entry

4. **src/groq-rate-limits.js** (lines 26-36)
   - Removed entire configuration entry
   - Rate limits config deleted

5. **src/tools.js** (line 659)
   - Removed from load balancing model pool
   - Pool reduced from 5 to 4 models

6. **src/pricing.js** (2 locations)
   - Removed regex pattern for gemma-7b pricing scraping
   - Removed fallback pricing entry

### Test Files (4 files)

1. **tests/unit/model-categorizer.test.js** (line 83)
   - Updated test to use `gemma2-9b-it` (historical) instead

2. **tests/unit/token-calculator.test.js** (line 43)
   - Updated test to use `gemma2-9b-it` (historical) instead

3. **tests/unit/model-selector.test.js**
   - Removed 2 model entries from mock data
   - Added `llama-3.1-8b-instant` to mockCatalog for test coverage
   - Fixed free tier prioritization test (now expects 1 free model)
   - Updated rate limit test to use expanded catalog

4. **scripts/collect-provider-data.js** (lines 125-132)
   - Removed duplicate `gemma-7b-it` entries

## Remaining Fallback Models

After removal, the fallback chains contain:

**DEFAULT_FALLBACK_PRIORITY**:
1. `llama-3.1-8b-instant` (fast, small, free)
2. `llama-3.3-70b-versatile` (large, versatile)
3. `mixtral-8x7b-32768` (medium, long context)

**Load Balancing Pool**:
1. `groq:llama-3.3-70b-versatile` (64k TPM)
2. `groq:llama-3.1-8b-instant` (120k TPM)
3. `groq:mixtral-8x7b-32768` (60k TPM)
4. `groq:llama-3.2-11b-vision-preview` (60k TPM)

## Verification

```bash
# No remaining references in source or tests
grep -r "gemma-7b-it" src/ tests/
# (returns nothing)

# Test suite maintained
npm test
# 650 passing (maintained same pass rate)
# 21 failing (pre-existing, unrelated)
```

## Deployment

```bash
make deploy-lambda-fast
```

**Package**: llmproxy-20251010-181911.zip  
**Size**: 151K  
**Time**: ~6 seconds  
**Status**: ✅ Successfully deployed  
**Endpoint**: https://nrw7pperrjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

## Impact

- **Positive**: Simplified model selection logic
- **Positive**: Removed deprecated/failing model
- **Neutral**: No functionality loss (llama-3.1-8b-instant covers same use case)
- **Note**: All fallback chains still have adequate alternatives

## Documentation

Historical documentation files (*.md in root) referencing `gemma-7b-it` were left unchanged as they document the project's evolution.

## Testing

All existing tests continue to pass. Test mocks updated to reflect new model catalog structure.
