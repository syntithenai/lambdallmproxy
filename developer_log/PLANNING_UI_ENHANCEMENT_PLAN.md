# Planning UI Enhancement Plan

**Date**: October 14, 2025  
**Status**: Planning Phase  
**Priority**: High  
**Estimated Time**: 16-20 hours

---

## 📋 Overview

Enhance the planning UI to provide LLM transparency, comprehensive logging, intelligent query classification, and sharing capabilities. The planning system should intelligently adapt to different query types and provide appropriate guidance.

---

## 🎯 Goals

1. **Transparency**: Show LLM info (model, tokens, cost) for all planning requests
2. **Logging**: Track all planning requests in Google Sheets for analytics
3. **Intelligence**: Classify queries and adapt planning strategy accordingly
4. **Usability**: Add sharing links and QR codes for easy plan distribution
5. **Documentation**: Clear examples of each planning mode

---

## 📊 Current System Analysis

### Existing Implementation

**UI Component**: `ui-new/src/components/PlanningDialog.tsx`
- Text area for research query
- System prompt editor (synced with chat)
- Results display with transfer to chat
- Load/save cached plans
- ❌ No LLM transparency info button
- ❌ No share functionality

**Backend Endpoint**: `src/endpoints/planning.js`
- POST /planning with SSE streaming
- Uses `llmResponsesWithTools()` for planning
- ✅ Authentication with Google JWT
- ❌ Not logging to Google Sheets

**Planning Prompt**: `src/lambda_search_llm_handler.js` (lines 93-118)
- Analyzes query complexity
- Generates research questions
- Suggests optimal persona
- Returns: `research_questions`, `optimal_persona`, `reasoning`, `complexity_assessment`
- ❌ Doesn't classify query types
- ❌ Doesn't handle clarification needs
- ❌ No long-form document workflow

**Logging**: `src/services/google-sheets-logger.js`
- ✅ Already implemented for chat endpoint
- ❌ Not used for planning endpoint
- Logs: timestamp, user, provider, model, tokens, cost, duration

**LLM Transparency**: `ui-new/src/components/LlmInfoDialog.tsx`
- Shows model, provider, tokens, cost for chat messages
- Displays request/response details
- ✅ Can be reused for planning

---

## 🏗️ Implementation Plan

### Phase 1: LLM Transparency & Logging (4-5 hours)

#### Task 1.1: Add Info Button to Planning Results
**File**: `ui-new/src/components/PlanningDialog.tsx`

**Changes**:
1. Store `llm_response` event data when planning completes
2. Add state: `const [llmInfo, setLlmInfo] = useState<any>(null)`
3. Update SSE handler to capture llm_response event
4. Add info button (ℹ️) next to planning results
5. Show `LlmInfoDialog` when clicked

**Code Example**:
```tsx
// In handleSubmit, add case for llm_response
case 'llm_response':
  setLlmInfo(data);
  break;

// In results section
{result && !result.error && llmInfo && (
  <button
    onClick={() => setShowLlmInfo(true)}
    className="btn-secondary text-xs"
    title="View LLM transparency info"
  >
    💰 ${llmInfo.cost?.toFixed(4) || '0.0000'} • {llmInfo.calls || 1} calls ℹ️
  </button>
)}

<LlmInfoDialog
  isOpen={showLlmInfo}
  onClose={() => setShowLlmInfo(false)}
  calls={llmInfo ? [llmInfo] : []}
/>
```

**Testing**:
- Generate a plan and verify info button appears
- Click button and verify dialog shows model, tokens, cost

---

#### Task 1.2: Add Google Sheets Logging for Planning
**File**: `src/endpoints/planning.js`

**Changes**:
1. Import `logToGoogleSheets` from `../services/google-sheets-logger`
2. Track start time at beginning of handler
3. Extract token/cost info from LLM response
4. Call `logToGoogleSheets()` after successful plan generation

**Code Example**:
```javascript
const { logToGoogleSheets } = require('../services/google-sheets-logger');

async function handler(event, responseStream) {
  const startTime = Date.now();
  // ... existing setup ...
  
  try {
    // ... generate plan ...
    
    // Log to Google Sheets
    const durationMs = Date.now() - startTime;
    await logToGoogleSheets({
      timestamp: new Date().toISOString(),
      userEmail: decodedToken.email || 'unknown',
      provider: 'groq', // or extract from model
      model: model || 'groq:llama-3.3-70b-versatile',
      promptTokens: response.promptTokens || 0,
      completionTokens: response.completionTokens || 0,
      totalTokens: response.totalTokens || 0,
      durationMs: durationMs
    });
    
  } catch (error) {
    // ... existing error handling ...
  }
}
```

**Testing**:
- Generate a plan
- Check Google Sheets for new log entry
- Verify all columns populated correctly

---

### Phase 2: Enhanced Planning Prompt (5-6 hours)

#### Task 2.1: Expand Planning Prompt with Query Classification
**File**: `src/lambda_search_llm_handler.js` (lines 93-118)

**New Prompt Structure**:
```javascript
const planningPrompt = `You are an expert research strategist. Analyze this user query and classify it into one of these categories:

1. SIMPLE: Straightforward question that doesn't need extensive planning
   - Single fact lookup, definition, simple calculation
   - Example: "What is the capital of France?"
   
2. OVERVIEW: User wants a comprehensive understanding of a topic
   - Broad exploration with multiple angles
   - Multiple search queries and sub-questions needed
   - Example: "Tell me about climate change"
   
3. LONG_FORM: User wants a detailed document with sections and images
   - Explicitly asks for "detailed report", "comprehensive guide", "full analysis"
   - Requires multi-stage document building with snippets
   - Example: "Create a comprehensive guide to starting a business"
   
4. NEEDS_CLARIFICATION: Query is too vague or ambiguous
   - Missing critical context or details
   - Multiple interpretations possible
   - Example: "Tell me about it" (what is "it"?)

Query: "${userQuery}"

Respond with JSON in this format:
{
  "query_type": "SIMPLE|OVERVIEW|LONG_FORM|NEEDS_CLARIFICATION",
  "reasoning": "Explain why you classified it this way and your analysis",
  
  // For SIMPLE queries
  "simple_instruction": "Brief note that normal chat flow is sufficient",
  
  // For OVERVIEW queries
  "search_strategies": [
    {"keywords": ["term 1", "term 2"], "purpose": "Why search this"},
    {"keywords": ["term 3"], "purpose": "What this will reveal"}
  ],
  "research_questions": ["Question 1?", "Question 2?", "Question 3?"],
  "enhanced_system_prompt": "System prompt additions for broad topic coverage",
  "enhanced_user_prompt": "User prompt additions/clarifications",
  
  // For LONG_FORM queries
  "document_sections": [
    {"title": "Introduction", "keywords": ["..."], "questions": ["..."]},
    {"title": "Section 2", "keywords": ["..."], "questions": ["..."]}
  ],
  "snippet_workflow": "Step-by-step workflow for building sections and combining",
  
  // For NEEDS_CLARIFICATION
  "clarification_questions": [
    "What specific aspect are you interested in?",
    "What is the context or use case?",
    "What level of detail do you need?"
  ],
  
  // Common fields
  "optimal_persona": "Expert role and expertise description",
  "complexity_assessment": "low|medium|high"
}

IMPORTANT: Only include fields relevant to the query_type. Be decisive in classification.`;
```

**Changes**:
1. Replace existing `planningPrompt` in `runToolLoop()` function
2. Update `max_tokens` to 800 for more detailed planning
3. Update parsing logic to handle new schema

---

#### Task 2.2: Update Planning Endpoint Response Schema
**File**: `src/endpoints/planning.js`

**Changes**:
1. Update `generatePlan()` to parse new response format
2. Validate different response structures based on `query_type`
3. Return appropriate fields for each query type

**Code Example**:
```javascript
// Parse and validate based on query_type
const parsed = JSON.parse(response.text.trim());

const baseResult = {
  queryType: parsed.query_type,
  reasoning: parsed.reasoning || '',
  persona: parsed.optimal_persona || '',
  complexityAssessment: parsed.complexity_assessment || 'medium'
};

switch (parsed.query_type) {
  case 'SIMPLE':
    return {
      ...baseResult,
      simpleInstruction: parsed.simple_instruction
    };
    
  case 'OVERVIEW':
    return {
      ...baseResult,
      searchStrategies: parsed.search_strategies || [],
      researchQuestions: parsed.research_questions || [],
      enhancedSystemPrompt: parsed.enhanced_system_prompt || '',
      enhancedUserPrompt: parsed.enhanced_user_prompt || ''
    };
    
  case 'LONG_FORM':
    return {
      ...baseResult,
      documentSections: parsed.document_sections || [],
      snippetWorkflow: parsed.snippet_workflow || ''
    };
    
  case 'NEEDS_CLARIFICATION':
    return {
      ...baseResult,
      clarificationQuestions: parsed.clarification_questions || []
    };
    
  default:
    throw new Error(`Unknown query type: ${parsed.query_type}`);
}
```

---

### Phase 3: UI Updates for New Planning Modes (4-5 hours)

#### Task 3.1: Update PlanningDialog for Different Query Types
**File**: `ui-new/src/components/PlanningDialog.tsx`

**Changes**:
1. Add UI for each query type
2. Display clarification questions with input field
3. Show document sections for long-form
4. Display search strategies for overview

**UI Components**:

```tsx
{/* SIMPLE Query Display */}
{result?.queryType === 'SIMPLE' && (
  <div className="card p-4 bg-blue-50 dark:bg-blue-900/20">
    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
      Simple Query Detected
    </h3>
    <p className="text-sm text-gray-700 dark:text-gray-300">
      {result.simpleInstruction}
    </p>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
      This query can be answered directly without extensive planning.
    </p>
  </div>
)}

{/* OVERVIEW Query Display */}
{result?.queryType === 'OVERVIEW' && (
  <div className="card p-4 space-y-4">
    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
      📚 Comprehensive Research Plan
    </h3>
    
    {/* Search Strategies */}
    {result.searchStrategies?.length > 0 && (
      <div>
        <h4 className="text-sm font-medium mb-2">🔍 Search Strategies:</h4>
        {result.searchStrategies.map((strategy: any, idx: number) => (
          <div key={idx} className="ml-4 mb-2 text-sm">
            <div className="font-medium text-blue-600 dark:text-blue-400">
              {strategy.keywords.join(', ')}
            </div>
            <div className="text-gray-600 dark:text-gray-400 text-xs">
              Purpose: {strategy.purpose}
            </div>
          </div>
        ))}
      </div>
    )}
    
    {/* Research Questions */}
    {result.researchQuestions?.length > 0 && (
      <div>
        <h4 className="text-sm font-medium mb-2">📋 Research TODOs:</h4>
        <ul className="list-disc list-inside space-y-1 text-sm ml-4">
          {result.researchQuestions.map((q: string, idx: number) => (
            <li key={idx} className="text-gray-700 dark:text-gray-300">{q}</li>
          ))}
        </ul>
      </div>
    )}
    
    {/* Enhanced Prompts */}
    {result.enhancedSystemPrompt && (
      <div>
        <h4 className="text-sm font-medium mb-2">🎭 Enhanced System Prompt:</h4>
        <div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded">
          {result.enhancedSystemPrompt}
        </div>
      </div>
    )}
  </div>
)}

{/* LONG_FORM Query Display */}
{result?.queryType === 'LONG_FORM' && (
  <div className="card p-4 space-y-4">
    <h3 className="font-semibold text-purple-900 dark:text-purple-100">
      📝 Long-Form Document Plan
    </h3>
    
    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded text-sm">
      <strong>Note:</strong> This will be built in stages using snippets. Each section
      will be researched and written separately, then combined into a final document.
    </div>
    
    {/* Document Sections */}
    {result.documentSections?.length > 0 && (
      <div>
        <h4 className="text-sm font-medium mb-2">📑 Document Structure:</h4>
        {result.documentSections.map((section: any, idx: number) => (
          <div key={idx} className="ml-4 mb-3 p-2 bg-gray-50 dark:bg-gray-900 rounded">
            <div className="font-medium text-purple-600 dark:text-purple-400">
              {idx + 1}. {section.title}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Keywords: {section.keywords.join(', ')}
            </div>
            {section.questions?.length > 0 && (
              <ul className="text-xs mt-1 ml-4 list-disc list-inside">
                {section.questions.map((q: string, qIdx: number) => (
                  <li key={qIdx}>{q}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    )}
    
    {/* Workflow */}
    {result.snippetWorkflow && (
      <div>
        <h4 className="text-sm font-medium mb-2">⚙️ Workflow:</h4>
        <div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap">
          {result.snippetWorkflow}
        </div>
      </div>
    )}
  </div>
)}

{/* NEEDS_CLARIFICATION Display */}
{result?.queryType === 'NEEDS_CLARIFICATION' && (
  <div className="card p-4 space-y-4 bg-orange-50 dark:bg-orange-900/20">
    <h3 className="font-semibold text-orange-900 dark:text-orange-100">
      ❓ Need More Information
    </h3>
    
    <p className="text-sm text-gray-700 dark:text-gray-300">
      {result.reasoning}
    </p>
    
    {result.clarificationQuestions?.length > 0 && (
      <div>
        <h4 className="text-sm font-medium mb-2">Please clarify:</h4>
        <ul className="list-disc list-inside space-y-1 text-sm ml-4">
          {result.clarificationQuestions.map((q: string, idx: number) => (
            <li key={idx} className="text-gray-700 dark:text-gray-300">{q}</li>
          ))}
        </ul>
      </div>
    )}
    
    <div className="mt-4">
      <label className="block text-sm font-medium mb-2">
        Update your query with more details:
      </label>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="input-field"
        rows={4}
        placeholder="Provide more specific details..."
      />
      <button
        onClick={handleSubmit}
        className="btn-primary mt-2 w-full"
      >
        Regenerate Plan with Clarifications
      </button>
    </div>
  </div>
)}
```

---

---

## 📁 Files to Modify

### UI Files
1. **ui-new/src/components/PlanningDialog.tsx** (Major changes)
   - Add LLM info display
   - Handle new response types

### Backend Files
3. **src/endpoints/planning.js** (Moderate changes)
   - Add Google Sheets logging
   - Update response schema
   - Handle new query types

4. **src/lambda_search_llm_handler.js** (Major changes)
   - Replace planning prompt
   - Update response parsing
   - Handle classification logic

### Documentation
5. **developer_log/PLANNING_UI_ENHANCEMENT_COMPLETE.md** (New)
   - Implementation details
   - Examples of each mode
   - Testing results

---

## 🧪 Testing Strategy

### Unit Tests
- Test planning prompt classification for each query type
- Test response schema validation
- Test share link encoding/decoding

### Integration Tests
1. **SIMPLE Query Test**
   - Query: "What is the capital of France?"
   - Expected: Simple instruction, minimal planning

2. **OVERVIEW Query Test**
   - Query: "Explain climate change"
   - Expected: Multiple search strategies, research questions

3. **LONG_FORM Query Test**
   - Query: "Create a comprehensive guide to machine learning"
   - Expected: Document sections, snippet workflow

4. **CLARIFICATION Query Test**
   - Query: "Tell me about it"
   - Expected: Clarification questions

5. **Logging Test**
   - Generate any plan
   - Verify Google Sheets has new entry
   - Check all fields populated

6. **Share Test**
   - Generate plan
   - Click share button
   - Verify QR code displays
   - Copy link and open in new tab
   - Verify plan loads correctly

---

## 📊 Success Metrics

✅ All planning requests show info button with cost/tokens  
✅ All planning requests logged to Google Sheets  
✅ Planning prompt correctly classifies >90% of test queries  
✅ Each query type displays appropriate UI  
✅ Share links work across devices  
✅ QR codes scannable and functional  
✅ No performance degradation (<2s for planning)  
✅ Documentation includes examples of each mode  

---

## 🚀 Deployment

1. Update dependencies: `cd ui-new && npm install`
2. Build UI: `npm run build`
3. Deploy Lambda: `./deploy.sh`
4. Test in production
5. Update user documentation

---

## 📚 Documentation Updates

### User Guide
- Add section on planning modes
- Include examples of each query type
- Show how to share plans
- Explain QR code usage

### API Documentation
- Document new planning response schema
- Explain query classification logic
- List supported query types

---

## 🔮 Future Enhancements

1. **Automatic Planning Mode**: Auto-trigger planning before every query
2. **TODO Integration**: Convert research questions into trackable TODOs
3. **Snippet Integration**: Actually implement long-form document building with snippets
4. **Persona Library**: Save and reuse optimal personas
5. **Planning History**: Timeline view of past planning sessions
6. **Collaborative Plans**: Share plans with edit access
7. **Planning Templates**: Pre-defined templates for common research patterns

---

## 📝 Notes

- Keep planning fast (<3 seconds typical)
- Don't over-classify; be decisive
- LONG_FORM mode should be rare - only when explicitly requested
- Share links should expire after 30 days (future enhancement)
- Google Sheets logging is async and non-blocking
- LLM transparency info helps users understand costs

---

**Estimated Total Time**: 13-16 hours
- Phase 1: 4-5 hours
- Phase 2: 5-6 hours  
- Phase 3: 4-5 hours

**Priority Tasks** (implement first):
1. LLM transparency info button (Task 1.1)
2. Google Sheets logging (Task 1.2)
3. Enhanced planning prompt (Task 2.1)
4. Updated UI for query types (Task 3.1)

**Note**: Share links and QR codes feature has been removed from this implementation.
