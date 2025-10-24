# Feature: ask_llm Recursive Tool Implementation

## Overview
Implemented a powerful recursive `ask_llm` tool that allows the LLM to spawn sub-agent conversations with full tool access. This enables complex multi-step queries to be handled autonomously with iterative refinement.

## Implementation Date
2025-01-XX (Current Session)

## Components Modified

### Backend Implementation

#### 1. Tool Definition (`src/tools.js` line ~710-732)
Added OpenAI function schema for `ask_llm` tool:
- **Tool Name**: `ask_llm`
- **Description**: Comprehensive warning about high token usage and recursive nature
- **Parameters**: Single `query` string parameter
- **Safeguards**: 
  - Clear warnings about 5-10x token consumption
  - Limited to 5 conversation iterations
  - Token budget tracking
  - Always available to assessor (documented for future use)

```javascript
{
  type: 'function',
  function: {
    name: 'ask_llm',
    description: '🤖 **RECURSIVE LLM AGENT**: Spawn a sub-agent conversation with full tool access...',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The question or task to pass to the sub-agent...'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  }
}
```

#### 2. Tool Execution Handler (`src/tools.js` line ~3778-3912)
Added `case 'ask_llm'` switch case with full implementation:
- **Recursive Chat Call**: Imports and calls chat endpoint handler internally
- **Tool Filtering**: Removes `ask_llm` from available tools to prevent infinite recursion
- **Context Preservation**: Passes through authentication, model selection, optimization settings
- **Event Streaming**: Emits SSE progress events (starting, executing, completed, error)
- **Response Capture**: Buffers SSE stream and extracts final response
- **Error Handling**: Comprehensive try-catch with detailed error messages

Key implementation details:
```javascript
case 'ask_llm': {
  // Remove ask_llm from available tools to prevent infinite recursion
  const toolsWithoutAskLLM = enabledTools.filter(t => t !== 'ask_llm');
  
  // Create synthetic event for chat endpoint
  const subEvent = {
    body: JSON.stringify({
      messages: [{ role: 'user', content: query }],
      model: context.model || 'groq:llama-3.3-70b-versatile',
      stream: true,
      tools: true,
      enabledTools: toolsWithoutAskLLM,
      max_iterations: MAX_ITERATIONS
    }),
    headers: { /* auth headers */ }
  };
  
  // Execute chat handler and capture response
  await chatHandler(subEvent, mockResponseStream, context);
}
```

### Frontend Implementation

#### 3. Settings Modal UI (`ui-new/src/components/SettingsModal.tsx`)
Added checkbox with prominent warning styling:
- **Location**: After `manage_snippets` tool checkbox
- **Default State**: `false` (disabled by default)
- **Visual Design**: 
  - Amber border and background highlighting
  - "⚠️ HIGH TOKEN USAGE" badge
  - Detailed warning box explaining 5-10x token consumption
  - Clear use case guidance
- **Warning Text**: 
  > "This tool creates complete recursive conversations with all available tools and multiple iterations. Can consume 5-10x more tokens than direct responses. Use ONLY for complex queries requiring multiple steps with different tools."

#### 4. EnabledTools Interface Updates
Updated TypeScript interfaces in multiple files:
- `ui-new/src/components/SettingsModal.tsx` (line 12)
- `ui-new/src/components/ChatTab.tsx` (line 52)
- `ui-new/src/App.tsx` (line 44)

Added `ask_llm: boolean` field to all `EnabledTools` interfaces.

#### 5. Default Settings (`ui-new/src/App.tsx` line 44-67)
Set default value to `false` with explanatory comment:
```typescript
ask_llm: false // Recursive LLM agent - DISABLED by default due to high token usage
```

## Architecture

### Recursive Flow
```
User → LLM detects need for complex query
     → Calls ask_llm tool with query
          → Tool spawns sub-conversation
               → Sub-conversation has ALL tools (except ask_llm)
               → Iterates up to 5 times
               → Uses search_web, scrape, execute_js, etc.
               → Builds comprehensive answer
          → Returns final response to main conversation
     → LLM incorporates sub-agent response
→ User receives complete answer
```

### Infinite Recursion Prevention
1. **Tool Filtering**: `ask_llm` is excluded from sub-conversation tool list
2. **Iteration Limit**: Maximum 5 iterations per sub-conversation
3. **Token Budget**: Uses existing chat endpoint safeguards
4. **SSE Stream**: Maintains connection monitoring and client disconnect detection

### SSE Events
The tool emits the following Server-Sent Events:
- `ask_llm_progress` with `phase: 'starting'`
- `ask_llm_progress` with `phase: 'executing'`
- `ask_llm_progress` with `phase: 'completed'`
- `ask_llm_progress` with `phase: 'error'` (on failure)

## Use Cases

### When to Use ask_llm
✅ Complex queries requiring multiple tools:
- "Search for recent quantum computing papers, scrape the top 3, compare their methodologies with code examples"
- "Find Python async/await tutorials, analyze the best one, and create a beginner-friendly version"
- "Research current AI trends, execute calculations on market growth, and generate a summary chart"

✅ Deep research combining multiple data sources:
- Multi-step web searches with content extraction
- Cross-referencing information across documents
- Analyzing and synthesizing complex information

✅ Complex workflows requiring calculation + data:
- Financial analysis with web data + JavaScript calculations
- Scientific research with multiple paper sources + computational verification

### When NOT to Use ask_llm
❌ Simple queries answerable with one tool
❌ Direct calculations (use `execute_javascript` directly)
❌ Single web searches (use `search_web` directly)
❌ Cost-sensitive applications (5-10x token usage)

## Token Cost Impact

### Estimated Consumption
- **Simple Query**: ~500-1,000 tokens (direct response)
- **With ask_llm**: ~2,500-10,000 tokens (5-10x multiplier)
- **Complex ask_llm**: Can exceed 15,000 tokens with deep research

### Cost Breakdown
Each ask_llm invocation includes:
1. **Initial query tokens**: User's question to sub-agent
2. **Tool execution tokens**: Each tool call (search, scrape, etc.)
3. **Iteration tokens**: Multiple conversation turns (up to 5)
4. **Response aggregation**: Final synthesis back to main conversation

### Mitigation
- **Default Disabled**: User must explicitly enable in settings
- **Clear UI Warnings**: Multiple warnings about cost impact
- **Iteration Limit**: Hard cap at 5 iterations
- **Visual Prominence**: Amber highlighting draws attention to cost

## Assessor Integration (Future Enhancement)

### Current Status
**Not Implemented** - Architectural changes required.

### Planned Behavior
The original requirement was:
> "Assessor tool can use ask_llm if original query was not useful/accurate"
> "Assessor feature always enabled regardless of user settings"

### Why Deferred
The current assessor (in `src/endpoints/chat.js` line ~3680) is a **response evaluator**, not a **tool executor**:
- Assessor reviews final responses for quality
- Assessor does not currently call tools or make LLM requests
- Integration would require significant architectural changes:
  1. Convert assessor from evaluator to active agent
  2. Add tool execution capability to assessor
  3. Implement retry logic with ask_llm fallback
  4. Handle nested recursion scenarios
  5. Manage token budgets for assessor-initiated calls

### Implementation Path (Future)
To enable assessor integration:
1. **Modify assessor logic** to detect inadequate responses
2. **Add tool execution** capability to assessor
3. **Call ask_llm** with reformulated query when needed
4. **Bypass user settings** for assessor-initiated calls
5. **Add safeguards** to prevent assessor recursion loops

## Testing Recommendations

### Manual Testing Checklist
- [ ] Enable `ask_llm` in Settings → Tools
- [ ] Send query: "Search for Python decorators, scrape the top result, and create a code example"
- [ ] Verify sub-conversation spawns with tool access
- [ ] Confirm iteration count doesn't exceed 5
- [ ] Check UI shows ask_llm progress events
- [ ] Verify final response is comprehensive
- [ ] Test with disabled setting - should not be available
- [ ] Confirm no infinite recursion with edge cases

### Performance Testing
- [ ] Monitor token consumption (should be 5-10x baseline)
- [ ] Verify iteration limit enforcement
- [ ] Check memory usage during recursion
- [ ] Confirm SSE stream stability
- [ ] Test client disconnect handling

### Error Scenarios
- [ ] Malformed query parameter
- [ ] Chat endpoint failure
- [ ] Tool execution errors in sub-conversation
- [ ] Timeout scenarios
- [ ] Authentication failures in sub-context

## Known Limitations

1. **High Token Cost**: Can consume 5-10x more tokens than direct responses
2. **No Assessor Integration**: Assessor cannot currently use this tool
3. **Iteration Cap**: Hard limit of 5 iterations may be insufficient for very complex queries
4. **Single Query Input**: Cannot batch multiple queries in one call
5. **No Progress Granularity**: UI shows coarse-grained progress (starting/executing/completed)

## Future Enhancements

### Priority 1 - Assessor Integration
- Modify assessor to call ask_llm for query reformulation
- Implement always-enabled flag for assessor use
- Add assessor-specific iteration limits

### Priority 2 - Token Budget Management
- Add explicit token budget parameter
- Implement budget exhaustion detection
- Provide budget remaining in progress events

### Priority 3 - Enhanced Progress Reporting
- Show sub-conversation tool calls in real-time
- Display iteration count as it progresses
- Provide token consumption estimates during execution

### Priority 4 - Batching Support
- Allow multiple queries in single ask_llm call
- Parallel execution of independent queries
- Aggregated response formatting

## Related Documentation
- Model Selection Strategy: `developer_logs/MODEL_SELECTION_STRATEGY_ANALYSIS.md`
- Provider Load Balancing: `README.md` (⚖️ Provider Load Balancing section)
- Chat Endpoint Documentation: `developer_logs/CHAT_ENDPOINT_DOCUMENTATION.md`
- Tool System Architecture: `src/tools.js` (inline documentation)

## Code Locations

### Backend
- Tool Definition: `src/tools.js` line ~710-732
- Tool Execution: `src/tools.js` line ~3778-3912
- Chat Handler Import: `src/tools.js` line 3756 (`require('./endpoints/chat')`)

### Frontend
- Settings UI: `ui-new/src/components/SettingsModal.tsx` line ~474-500
- Interface Definition (SettingsModal): `ui-new/src/components/SettingsModal.tsx` line 12
- Interface Definition (ChatTab): `ui-new/src/components/ChatTab.tsx` line 52
- Default Value: `ui-new/src/App.tsx` line 66

## Deployment Notes

### Backend Deployment
After modifying `src/tools.js`, deploy with:
```bash
make deploy-lambda-fast  # Fast deployment (code only)
# OR
make deploy-lambda       # Full deployment (if dependencies changed)
```

### Frontend Deployment
After modifying UI files, deploy with:
```bash
make deploy-ui  # Builds and pushes to GitHub Pages
```

### Local Development
Test changes locally with:
```bash
make dev  # Starts both backend (port 3000) and frontend (port 8081)
```

The dev server has hot reload enabled - backend changes restart automatically.

## Conclusion

The `ask_llm` recursive tool provides a powerful capability for handling complex multi-step queries that require multiple tools and iterative refinement. While it comes with significant token cost implications, the careful design with default-disabled state, prominent warnings, and hard iteration limits provides appropriate safeguards. Future integration with the assessor will enable automatic query reformulation for improved response quality.
