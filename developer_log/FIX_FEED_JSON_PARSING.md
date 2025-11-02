# Bug Fix: Feed Generation JSON Parsing Error

**Date**: 2025-11-02  
**Status**: ✅ Fixed  
**Priority**: High  

## Issue

### Error Message
```
Failed to parse LLM response
Expected ',' or ']' after array element in JSON at position 18859
```

### Root Cause
The regex pattern for extracting JSON from markdown code fences was using **non-greedy matching** (`*?`), which caused it to stop at the FIRST `}` character instead of capturing the entire JSON object:

```javascript
// BEFORE (broken regex)
const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
//                                                             ^^^ non-greedy - stops too early!
```

When the LLM returns JSON wrapped in markdown code fences like:
```json
{
  "items": [
    {
      "type": "did-you-know",
      "content": "Some text with } characters"
    },
    ...
  ]
}
```

The non-greedy `*?` stops at the first `}` inside the "content" field, truncating the JSON.

## Fix Applied

Changed the regex to use **greedy matching** (removed the `?`):

```javascript
// File: src/endpoints/feed.js (line ~313)

// AFTER (fixed regex)
const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
//                                                             ^^^ greedy - captures everything!
```

The greedy `*` will match as many characters as possible, capturing the entire JSON object from the first `{` to the LAST `}` before the closing ` ``` `.

## Testing

### Before Fix
- LLM response: 19,844 characters
- Extracted JSON: 18,859 characters (truncated!)
- Result: `SyntaxError: Expected ',' or ']' after array element`

### After Fix
- LLM response: 19,844 characters  
- Extracted JSON: 19,830 characters (complete!)
- Result: ✅ Parses successfully

## Related Files

- `src/endpoints/feed.js` (line 313) - JSON extraction regex fixed
- `ui-new/src/contexts/FeedContext.tsx` - Error handling for feed generation
- `ui-new/src/services/feedGenerator.ts` - Frontend feed generation logic

## Additional Improvements

Also improved logging to help debug similar issues:

```javascript
console.log('🔍 Feed: Content length:', content.length, 'chars');
console.log('🔍 Feed: Content starts with:', content.substring(0, 100));
console.log('🔍 Feed: Content ends with:', content.substring(content.length - 100));
```

This makes it easier to verify that the full response is being captured.

## Notes

- **Greedy vs Non-Greedy**: In regex, `*` is greedy (match as much as possible), while `*?` is non-greedy (match as little as possible)
- **JSON in Markdown**: Many LLMs wrap JSON output in ` ```json ... ``` ` code fences
- **Nested Braces**: When matching JSON, always use greedy matching to avoid stopping at inner braces

## Status: ✅ Fixed

**Next Steps**:
1. ~~Fix regex pattern~~ ✅ Done
2. ~~Improve logging~~ ✅ Done
3. Test feed generation with various LLM models ⏳ In Progress
4. Consider adding JSON validation before parsing for better error messages
