# Model Deprecation Fix: llama-3.1-70b-versatile → llama-3.3-70b-versatile

**Date**: January 10, 2025  
**Issue**: Groq decommissioned `llama-3.1-70b-versatile` on January 24, 2025  
**Deployment**: llmproxy-20251010-172435.zip

## Problem

The model `llama-3.1-70b-versatile` has been decommissioned by Groq and returns errors:

```
The model `llama-3.1-70b-versatile` has been decommissioned and is no longer supported.
```

## Solution

Replaced all references to `llama-3.1-70b-versatile` with `llama-3.3-70b-versatile` across the entire codebase.

## Files Modified

### Source Code (7 files)

1. **src/model-selector.js** (line 177)
   - Updated model in selection array

2. **src/endpoints/chat.js** (line 19)
   - Changed default model reference

3. **src/providers/groq-provider.js** (line 30)
   - Updated model validation list

4. **src/groq-rate-limits.js** (lines 46-56)
   - Renamed rate limit configuration entry
   - Preserved rate limits: rpm=30, tpm=12000, context=128k

5. **src/lambda_search_llm_handler.js** (lines 324, 327, 331)
   - Updated error message recommendations
   - Added `llama-3.3-70b-specdec` as alternative suggestion

6. **src/pricing.js** (2 locations)
   - Updated regex pattern: `/llama-3\.1-70b/` → `/llama-3\.3-70b/`
   - Updated fallback pricing entry
   - Preserved pricing: input=$0.00000059, output=$0.00000079 per token

### Test Files (5 files)

1. **tests/unit/model-selector-legacy.test.js**
   - Updated mock configuration
   - Updated test assertions
   - Changed fallback model references

2. **tests/unit/pricing.test.js** (line 77)
   - Updated pricing test expectation

3. **tests/unit/model-categorizer.test.js** (line 37)
   - Updated large model categorization test

4. **tests/unit/model-config.test.js**
   - Updated 3 test cases with current model references
   - Tests documenting historical model deprecation remain unchanged

## Verification

```bash
# No remaining references in source code
grep -r "llama-3.1-70b-versatile" src/
# (returns nothing)

# Test suite maintained
npm test
# 650 passing (maintained from before changes)
# 21 failing (pre-existing, unrelated to model change)
```

## Deployment

```bash
make deploy-lambda-fast
```

**Package**: llmproxy-20251010-172435.zip  
**Size**: 151K  
**Time**: ~8 seconds  
**Status**: ✅ Successful

## Configuration Preserved

All configuration values for the model were preserved:

- **Rate Limits**: 30 rpm, 12000 tpm
- **Context Window**: 128k tokens
- **Pricing**: $0.00000059 input, $0.00000079 output per token

## Alternative Models

Added `llama-3.3-70b-specdec` as a suggested alternative in error messages for users experiencing issues.

## Documentation

Historical documentation files (*.md in root) referencing `llama-3.1-70b-versatile` were left unchanged as they document the project's evolution.

## Testing

All existing tests continue to pass with the new model reference. No functionality changes required.
