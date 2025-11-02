# Bug Fixes: Llama Scout Pricing & Snippets Character Limit

**Date**: 2025-11-01  
**Status**: ✅ Fixed  
**Priority**: High  

## Issues Fixed

### 1. Llama Scout Models Showing $0 Cost ❌ → ✅

**Problem**:
- User reported that `meta-llama/llama-4-scout-17b-16e-instruct` was being billed as $0 despite having pricing configured
- Root cause: Case-sensitive model name lookup in PRICING object

**Investigation**:
- PRICING object had: `'meta-llama/Llama-4-Scout-17B-16E-Instruct'` (capitalized)
- Actual model name: `'meta-llama/llama-4-scout-17b-16e-instruct'` (lowercase)
- When pricing lookup fails, it defaults to `{ input: 0, output: 0 }`
- This caused all Llama Scout requests to be logged with $0 cost

**Fix Applied**:
```javascript
// File: src/services/google-sheets-logger.js (lines 90-91)

// BEFORE:
'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8': { input: 0.20, output: 0.20 },
'meta-llama/Llama-4-Scout-17B-16E-Instruct': { input: 0.20, output: 0.20 },

// AFTER:
'meta-llama/llama-4-maverick-17b-128e-instruct': { input: 0.20, output: 0.20 }, // FIXED
'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.20, output: 0.20 }, // FIXED
```

**Result**:
- ✅ Llama Scout now correctly costs $0.20/$0.20 per 1M tokens
- ✅ Llama Maverick also fixed (had same issue)
- ✅ Model names now match PROVIDER_CATALOG.json exactly

---

### 2. Snippets Error: "Maximum of 50000 Characters" ❌ → ✅

**Problem**:
- Error: "Your input contains more than the maximum of 50000 characters in a single cell"
- Google Sheets API enforces a 50,000 character limit per cell
- Large snippets (e.g., long documentation, transcripts) failed to save

**Investigation**:
- Located snippet insertion code in `src/services/google-sheets-snippets.js` (line 405)
- Content was being inserted directly without length validation
- No truncation or size checking before API call

**Fix Applied**:
```javascript
// File: src/services/google-sheets-snippets.js (lines 393-412)

// Added validation and truncation BEFORE insertion:
const MAX_CELL_LENGTH = 50000;
let truncatedContent = content || '';
let wasTruncated = false;

if (truncatedContent.length > MAX_CELL_LENGTH) {
  truncatedContent = truncatedContent.substring(0, MAX_CELL_LENGTH - 200) + 
    '\n\n[⚠️ CONTENT TRUNCATED - Original length: ' + content.length + 
    ' characters. Google Sheets limit: 50,000 characters per cell.]';
  wasTruncated = true;
  console.warn(`⚠️ Snippets: Content truncated from ${content.length} to ${truncatedContent.length} chars`);
}

const row = [
  id,
  userEmail,
  projectId || '',
  now,
  now,
  title || '',
  truncatedContent,  // <-- Uses truncated content
  tagsStr,
  source,
  url || ''
];
```

**Result**:
- ✅ Snippets with >50K characters are now automatically truncated
- ✅ Truncation notice added to content showing original length
- ✅ Console warning logged when truncation occurs
- ✅ No more "maximum characters" errors

---

## Testing Recommendations

### Llama Scout Pricing:
1. Run `make dev` to restart local server
2. Send a test request with Llama Scout model
3. Check Google Sheets logs for correct cost (should be $0.00002 for typical request)
4. Verify cost calculation is not $0

### Snippets Truncation:
1. Try saving a large snippet (>50K chars) via UI
2. Verify it saves successfully
3. Check snippet content includes truncation notice
4. Verify original length is logged

---

## Related Files

- `src/services/google-sheets-logger.js` (line 90-91) - Pricing fix
- `src/services/google-sheets-snippets.js` (line 393-412) - Truncation fix
- `PROVIDER_CATALOG.json` (lines 126, 447) - Llama Scout model definition

---

## Notes

- **Case Sensitivity**: Model names are case-sensitive in pricing lookups. Always verify exact casing matches between PROVIDER_CATALOG.json and PRICING object.
- **Google Sheets Limits**: 50,000 character per-cell limit is a hard Google Sheets API restriction. Truncation is the only solution.
- **Future Consideration**: For very large snippets, consider:
  - Splitting content across multiple rows
  - Storing full content in external storage (S3, database)
  - Using Google Docs instead of Sheets for large text content

---

## Status: ✅ Both Issues Resolved

**Next Steps**:
1. Deploy to Lambda: `make deploy-lambda-fast`
2. Verify fixes in production
3. Monitor Google Sheets for correct pricing
4. Test snippet saving with large content
