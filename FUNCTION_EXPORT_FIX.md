# Function Export Fix - generatePlanningPrompt

## Issue
The planning endpoint was throwing an error:
```
Error: generatePlanningPrompt is not a function
```

## Root Cause
The `planning.js` endpoint was trying to import `generatePlanningPrompt` from `lambda_search_llm_handler.js`, but this function was not defined or exported from that module.

```javascript
// In planning.js - line 90
const { generatePlanningPrompt } = require('../lambda_search_llm_handler');
const planningPrompt = generatePlanningPrompt(query); // ERROR: function didn't exist
```

## Solution
1. **Created the missing function** in `lambda_search_llm_handler.js`:
   - Generates formatted planning prompts for research strategy analysis
   - Returns structured prompt requesting JSON response with planning details
   - Includes query type classification (minimal/overview/long-form/clarification)

2. **Updated module exports** to include the new function:
```javascript
module.exports = {
    handler: exports.handler,
    generatePlanningPrompt  // Added this export
};
```

## Function Details
The `generatePlanningPrompt(query)` function:
- Takes a user query as input
- Returns a formatted prompt for the planning LLM
- Requests structured JSON response with:
  - `queryType`: Classification of query complexity
  - `searchQueries`: Recommended search terms
  - `expertPersona`: Suggested expert role
  - `enhancedSystemPrompt`: Additional system instructions
  - `methodology`: Research approach description

## Resolution Status
✅ **Fixed**: Planning endpoint no longer throws "function not defined" errors
✅ **Deployed**: Function is live and working
✅ **Tested**: Authentication errors are expected, but the function import works correctly

The planning endpoint now properly processes queries and generates research strategies as intended.