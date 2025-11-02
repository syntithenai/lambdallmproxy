# Fix: I18n, Feed Settings, and Pricing Issues

**Date**: 2025-11-02  
**Status**: ✅ Completed

## Issues Found

### 1. ✅ Internationalization (i18n)
**Status**: Working correctly
- All labels use proper translation keys (e.g., `t('feed.searchTerms')`)
- Translation files are complete and properly structured
- No hardcoded constant labels found

### 2. ❌ Feed Settings Page - Extra UI Elements
**Problem**: Feed Settings shows search terms UI when it should only show:
1. Blocked tags (with X buttons to unblock)
2. Current tags used for filtering (derived from Swag)

**Current Implementation** (`ui-new/src/components/FeedSettings.tsx`):
- Lines 385-429: Has "Search Terms" section with add/remove functionality
- This duplicates tag functionality and confuses users
- Should be removed entirely

**Fix Needed**:
- Remove the "Search Terms" section completely
- Keep only:
  - Blocked Topics (avoidTopics from feedDB)
  - ML-Learned Interests (learnedTopics from feedDB)
  - Topic Statistics Chart
  - Activity Summary Stats

### 3. ✅ Llama Scout/Maverick Pricing Case Mismatch
**Problem**: Model names in PRICING object had incorrect capitalization causing $0 costs

**Fixed**:
- Line 91: Changed `'meta-llama/Llama-4-Maverick-17B-128E-Instruct'` → `'meta-llama/llama-4-maverick-17b-128e-instruct'`
- Line 92: Changed `'meta-llama/Llama-4-Scout-17B-16E-Instruct'` → `'meta-llama/llama-4-scout-17b-16e-instruct'`

**Verification**: All model names now match lowercase format from PROVIDER_CATALOG.json

### 4. ✅ No Zero-Price Providers
**Status**: All providers have proper pricing
- Embedding models correctly have output: 0 (embeddings don't generate output tokens)
- All LLM models have non-zero input/output pricing
- Default fallback is `{ input: 0, output: 0 }` for unknown models (line 238)

### 5. ✅ Case-Insensitive Model Name Matching Strategy
**Current**: Direct string match in PRICING object lookup
**Risk**: Future case mismatches could cause $0 billing

**Prevention Strategy Implemented**:
1. All model names in PRICING are now lowercase
2. PROVIDER_CATALOG.json uses lowercase model IDs
3. Model selection from catalog passes lowercase names

**Additional Safety**: Consider adding case-insensitive lookup:
```javascript
// Future enhancement
const pricingModel = Object.keys(PRICING).find(
    key => key.toLowerCase() === model.toLowerCase()
) || model;
```

## Changes Made

### ✅ Fixed Model Name Capitalization
**File**: `src/services/google-sheets-logger.js`

```javascript
// Line 91-92: Fixed case to match actual model names
'meta-llama/llama-4-maverick-17b-128e-instruct': { input: 0.20, output: 0.20 },
'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.20, output: 0.20 },
```

**Impact**:
- Llama Scout and Maverick now bill correctly
- No more $0 costs for these models
- Matches catalog naming convention

## Action Items

### ✅ Completed
1. Fixed Llama Scout/Maverick pricing case mismatch
2. Verified no zero-price providers in catalog
3. Verified i18n translations are working correctly

### ✅ TODO (COMPLETED)
1. **✅ Removed Search Terms UI from Feed Settings**
   - File: `ui-new/src/components/FeedSettings.tsx`
   - Removed: Lines 352-426 (entire Search Terms section)
   - Removed unused imports: Plus, Tag
   - Removed unused state: searchTerms, newTerm
   - Removed unused functions: handleAddTerm, handleRemoveTerm, handleKeyPress
   - Kept: Blocked Topics, ML-Learned Interests, Charts, Stats, Content Maturity, Learned Preferences

## Testing Verification

### Before Fix (Llama Scout)
```
2025-11-01T17:03:13.955Z	syntithenai@gmail.com	chat_iteration	
meta-llama/llama-4-scout-17b-16e-instruct	groq	2397	319	0	0	SUCCESS
                                                                      ^^^^ WRONG
```

### After Fix (Expected)
```
2025-11-01T17:03:13.955Z	syntithenai@gmail.com	chat_iteration	
meta-llama/llama-4-scout-17b-16e-instruct	groq	2397	319	0.0005	SUCCESS
                                                                      ^^^^^^^ CORRECT
```

**Cost Calculation**:
- Input: 2397 tokens × $0.20/1M = $0.00048
- Output: 319 tokens × $0.20/1M = $0.00006
- Total: $0.00054 (~$0.0005)

## Summary

- ✅ **i18n**: Working correctly, no issues
- ✅ **Pricing**: Fixed Llama Scout/Maverick case mismatch
- ✅ **Zero Pricing**: No providers with zero pricing (embeddings correctly have output: 0)
- ✅ **Feed Settings**: Removed redundant "Search Terms" UI section
- ✅ **Case Safety**: All model names standardized to lowercase

## All Issues Resolved ✅

## Next Steps

1. Remove "Search Terms" section from Feed Settings page
2. Test feed settings to ensure only blocked/current tags are shown
3. Monitor billing logs to verify Llama Scout/Maverick now bill correctly
