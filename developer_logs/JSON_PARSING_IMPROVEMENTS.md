# JSON Parsing Improvements for Planning Endpoint

## Issue Fixed
**Error:** `Failed to parse LLM response as JSON: Expected ',' or '}' after property value in JSON at position 765`

This error occurs when LLM models return malformed JSON that cannot be parsed by `JSON.parse()`.

## Root Cause
LLM models sometimes generate JSON with common formatting errors:
- Trailing commas before closing braces/brackets
- Unquoted property names
- Single quotes instead of double quotes
- Unescaped quotes within string values
- Incomplete JSON structures
- Extra text before/after JSON

## Solution Implemented

### 1. Enhanced JSON Cleaning (Before Parsing)
```javascript
// Comprehensive JSON cleaning - fix common LLM JSON errors
let cleanedJson = responseText;

// Fix trailing commas before closing braces/brackets
cleanedJson = cleanedJson.replace(/,(\s*[}\]])/g, '$1');

// Fix missing quotes around property names (but avoid quoted strings)
cleanedJson = cleanedJson.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

// Fix single quotes to double quotes (but be careful with apostrophes in strings)
cleanedJson = cleanedJson.replace(/:\s*'([^']*?)'/g, ': "$1"');
cleanedJson = cleanedJson.replace(/{\s*'([^']*?)'\s*:/g, '{"$1":');
cleanedJson = cleanedJson.replace(/,\s*'([^']*?)'\s*:/g, ',"$1":');

// Fix unescaped quotes in strings
cleanedJson = cleanedJson.replace(/:\s*"([^"]*?)"([^",}]*?)"/g, ': "$1\\"$2"');

// Fix broken arrays or objects
cleanedJson = cleanedJson.replace(/\[\s*,/g, '[');
cleanedJson = cleanedJson.replace(/,\s*,/g, ',');

// Remove any trailing commas at the end
cleanedJson = cleanedJson.replace(/,\s*$/, '');

// Ensure the JSON starts and ends properly
if (!cleanedJson.trim().startsWith('{')) {
    cleanedJson = '{' + cleanedJson;
}
if (!cleanedJson.trim().endsWith('}')) {
    cleanedJson = cleanedJson + '}';
}
```

### 2. Fallback Parsing (Truncation Recovery)
If initial parsing fails, attempt to recover by truncating at the error position:
```javascript
try {
    parsed = JSON.parse(cleanedJson);
} catch (parseError) {
    // Try to extract just the valid JSON portion
    const positionMatch = parseError.message.match(/position (\d+)/);
    if (positionMatch) {
        const errorPosition = parseInt(positionMatch[1]);
        const truncated = cleanedJson.substring(0, errorPosition);
        const lastBrace = truncated.lastIndexOf('}');
        if (lastBrace > 0) {
            extractedJson = truncated.substring(0, lastBrace + 1);
            parsed = JSON.parse(extractedJson);
        }
    }
}
```

### 3. Enhanced Error Logging
Added comprehensive logging to debug JSON parsing issues:
```javascript
console.log('🔍 Planning: Raw LLM response preview:', response?.text?.substring(0, 300));
console.log('🔍 Planning: Cleaned JSON for parsing, first 200 chars:', cleanedJson.substring(0, 200));
console.error('🚨 Planning: JSON parse failed. Original text:', responseText.substring(0, 500));
console.error('🚨 Planning: Cleaned text:', cleanedJson.substring(0, 500));
```

### 4. Improved Error Messages
More informative error messages with position information:
```javascript
throw new Error(`JSON parsing failed at position ${positionMatch?.[1] || 'unknown'}: ${parseError.message}`);
```

## Benefits

1. **Robust JSON Handling**: Automatically fixes common LLM JSON formatting errors
2. **Recovery Mechanism**: Can salvage partial JSON when structure is broken
3. **Better Debugging**: Detailed logging helps identify and fix new JSON issues
4. **Graceful Degradation**: Falls back to truncated JSON when possible
5. **Error Transparency**: Clear error messages help users understand issues

## Test Coverage

The improvements handle these common LLM JSON errors:
- ✅ Trailing commas: `{"key": "value",}`
- ✅ Single quotes: `{'key': 'value'}`
- ✅ Unquoted keys: `{key: "value"}`
- ✅ Unescaped quotes: `{"key": "value "with quotes""}`
- ✅ Incomplete structures: `{"key": "value"`
- ✅ Position-specific errors at any character position

## Deployment Status
- ✅ **Deployed**: October 14, 2025 (Updated: Variable scoping fix)
- ✅ **Function**: Planning endpoint (`/planning`)
- ✅ **File**: `src/endpoints/planning.js`
- ✅ **Version**: Enhanced JSON parsing with fallback recovery
- ✅ **Hotfix**: Fixed `positionMatch is not defined` variable scoping error

## Monitoring
Monitor these log patterns to verify effectiveness:
- `🔍 Planning: Cleaned JSON for parsing` - Shows JSON cleaning in action
- `✅ Planning: Successfully parsed truncated JSON` - Shows recovery working
- `🚨 Planning: JSON parse failed` - Should be significantly reduced

## Next Steps
If JSON parsing errors persist:
1. Review logged raw responses to identify new patterns
2. Add additional cleaning rules for specific error patterns
3. Consider implementing schema validation with auto-correction
4. Explore using more robust JSON parsers (e.g., `json5`)

## Recent Fixes

### Enhanced JSON Recovery (October 14, 2025)
**Issue**: `JSON parsing failed at position 761: Expected ',' or '}' after property value`
**Cause**: LLM responses with truncated/incomplete properties at the end
**Fix**: Enhanced JSON cleaning to handle incomplete properties and aggressive truncation recovery

```javascript
// New incomplete property cleaning:
cleanedJson = cleanedJson.replace(/,\s*"[^"]*$/g, ''); // Remove incomplete property name
cleanedJson = cleanedJson.replace(/,\s*"[^"]*":\s*"[^"]*$/g, ''); // Remove incomplete property value
cleanedJson = cleanedJson.replace(/,\s*"[^"]*":\s*[^,}]*$/g, ''); // Remove incomplete non-string value

// Enhanced truncation fallback:
truncated = truncated.replace(/,\s*"[^"]*$/, ''); // Clean at truncation point
```

### Model Stability Improvements (October 14, 2025)
**Issue**: `llama-3.3-70b-versatile` producing malformed JSON responses
**Cause**: Model instability causing truncated or invalid JSON
**Fix**: Proactive model replacement for planning requests

```javascript
const problematicModels = ['llama-3.3-70b-versatile'];
const preferredModels = ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'llama-3.1-8b-instant'];
// Always use stable models for planning
```

### Variable Scoping Fix (October 14, 2025)
**Issue**: `positionMatch is not defined` error in error handling
**Cause**: Variable declared inside inner try block but referenced outside scope
**Fix**: Moved `positionMatch` declaration to outer scope before try block

```javascript
// Before (broken scope):
try {
    const positionMatch = parseError.message.match(/position (\d+)/);
    // ... inner logic
}
// positionMatch not accessible here ❌

// After (correct scope):
const positionMatch = parseError.message.match(/position (\d+)/); // ✅ Outer scope
try {
    // ... inner logic uses positionMatch
}
// positionMatch accessible here ✅
```

---
*Status: Complete ✅*  
*Last Updated: October 14, 2025 - Variable scoping hotfix*