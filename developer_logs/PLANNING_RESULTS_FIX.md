# Planning Endpoint Bug Fix: Missing Results Issue

## 🚨 **Root Causes Identified**

### Problem 1: JSON Schema Mismatch
**Issue**: The LLM was returning JSON in the old schema format, but the validation code was expecting the new schema format.

**LLM Response (actual)**:
```json
{
  "queryType": "overview",
  "complexity": "moderate", 
  "expertPersona": "healthcare professional...",
  "searchQueries": [...],
  "enhancedSystemPrompt": "...",
  "methodology": "..."
}
```

**Code Expected (wrong)**:
```javascript
if (!parsed.query_type || !parsed.optimal_persona) {
    throw new Error('Invalid plan response: missing required fields');
}
```

**Result**: JSON parsing succeeded, but validation failed → No plan returned

### Problem 2: Variable Scope Issue
**Issue**: `query` variable defined in try block but referenced in catch block

**Error**: `ReferenceError: query is not defined`

**Result**: Error handling failed → No error details sent to client

## ✅ **Solutions Applied**

### Fix 1: Flexible Schema Validation
Updated validation to handle both old and new schema formats:

```javascript
// Before: Rigid new schema validation
if (!parsed.query_type || !parsed.optimal_persona) {
    throw new Error('Invalid plan response: missing required fields');
}

// After: Flexible validation supporting both schemas
if (!parsed.queryType && !parsed.query_type) {
    throw new Error('Invalid plan response: missing queryType field');
}

// Normalize field names
const baseResult = {
    queryType: parsed.queryType || parsed.query_type,
    persona: parsed.expertPersona || parsed.optimal_persona || '',
    complexityAssessment: parsed.complexity || parsed.complexity_assessment || 'medium',
    // ...
};
```

### Fix 2: Variable Scope Correction
Moved variable declarations to function scope:

```javascript
// Before: Variables in try block only
try {
    const query = body.query || '';
    // ...
} catch (error) {
    // query not accessible here ❌
}

// After: Variables in function scope
let query = 'unknown';
let providers = {};
let requestedModel = null;

try {
    query = body.query || '';
    // ...
} catch (error) {
    // query accessible here ✅
}
```

### Fix 3: Schema Field Mapping
Added comprehensive field mapping for different response formats:

```javascript
// Handle multiple query types and field names
const queryType = parsed.queryType || parsed.query_type;

if (queryType === 'overview' || queryType === 'OVERVIEW') {
    return {
        searchStrategies: parsed.searchQueries || parsed.search_strategies || [],
        enhancedSystemPrompt: parsed.enhancedSystemPrompt || parsed.enhanced_system_prompt || '',
        methodology: parsed.methodology || '',
        estimatedSources: parsed.estimatedSources || 5
    };
}
```

## 🎯 **Expected Behavior Now**

1. **Planning Request Sent** → `llm_request` event (status: 'initializing')
2. **LLM Generates Plan** → Single API call to reasoning model  
3. **JSON Parsed Successfully** → Flexible validation accepts actual response format
4. **Plan Returned** → `result` event with complete research plan
5. **Transparency Events** → `llm_request` (completed) + `llm_response` (with tokens)

## 📋 **Plan Structure You Should Receive**

```javascript
{
  queryType: "overview",
  reasoning: "...",
  persona: "healthcare professional...",
  complexityAssessment: "moderate",
  searchStrategies: [
    "definition of chronic fatigue",
    "causes and symptoms of chronic fatigue syndrome",
    // ...
  ],
  enhancedSystemPrompt: "Provide detailed overview...",  
  methodology: "comprehensive review approach...",
  estimatedSources: 5
}
```

## ✅ **Status: FIXED & DEPLOYED**

The planning endpoint should now:
- ✅ **Accept LLM responses** in the actual format being returned
- ✅ **Handle errors gracefully** with proper variable scoping  
- ✅ **Return complete research plans** to the UI
- ✅ **Send transparency events** showing the planning process

**Your research plan should now appear!** 🎉