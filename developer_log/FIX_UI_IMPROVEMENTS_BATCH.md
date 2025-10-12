# UI Improvements Batch - October 12, 2025

## Overview
This document tracks a batch of UI and backend improvements requested by the user. Two issues were fixed and deployed, three remain for future implementation.

## Completed Issues

### 1. ✅ JSON Tree Display for Tool Arguments

**Problem**: The generate_chart tool output block showed arguments as a plain JSON dump, making it difficult to read complex parameters.

**Solution**: 
- Modified `ui-new/src/components/ChatTab.tsx` to use the `JsonTree` component for displaying tool arguments
- Added special handling: code arguments continue to show syntax-highlighted display, all other arguments (including generate_chart) show as an expandable JSON tree
- Tree is fully expanded by default (`expandAll={true}`)

**Code Changes**:
- File: `ui-new/src/components/ChatTab.tsx` (lines 2669-2695)
- Added conditional logic to check for `parsed.code` first, then fall back to JSON tree display for all other arguments
- JSON tree wrapped in styled container with overflow handling

**Commit**: `7480f7c` - "feat: display tool arguments as expandable JSON tree"

**Testing**: Tool calls like `generate_chart`, `search_web`, etc. now show their arguments in a readable, expandable tree format.

### 2. ✅ Self-Evaluation Text Response Handling

**Problem**: When Gemini returns plain text instead of JSON in response evaluation, the system showed "Evaluation failed - assuming comprehensive" even though the text clearly indicated whether the response was comprehensive.

**Solution**:
- Enhanced `src/endpoints/chat.js` evaluation parsing to handle both JSON and plain text responses
- Added fallback text parsing with keyword detection:
  - Comprehensive indicators: "comprehensive", "yes", "true", "complete", "sufficient"
  - Not comprehensive indicators: "not comprehensive", "no", "false", "incomplete", "insufficient", "too brief"
- Maintains fail-safe behavior: assumes comprehensive if text is ambiguous

**Code Changes**:
- File: `src/endpoints/chat.js` (lines 130-176)
- Added `else` branch after JSON parsing attempt
- Implemented keyword-based text analysis
- Logs parsed evaluation with `✅ Parsed text evaluation: comprehensive=true/false`

**Commit**: `00fb02f` - "fix: handle Gemini text-only responses in self-evaluation"

**Testing**: Evaluation now works correctly even when Gemini returns text responses like "Yes, this is comprehensive" or "No, too brief".

## Pending Issues (Not Implemented)

### 3. 🔜 Google Sheets LLM Log - No Entries

**Status**: Requires investigation

**Issue**: No entries appearing in Google Sheet for LLM API calls

**Next Steps**:
1. Verify Google Sheets API credentials and permissions
2. Check `src/endpoints/log-llm-call.js` implementation
3. Test logging flow with manual API call
4. Verify Sheet ID and tab name configuration
5. Check for silent failures or error logs

**Files to Investigate**:
- `src/endpoints/log-llm-call.js`
- `src/services/google-sheets-logger.js`
- `.env` (Google Sheets API key, Sheet ID)

### 4. 🔜 Pricing Information in Chat UI

**Status**: Requires implementation

**Issue**: Pricing information should be shown in the main chat as part of the info buttons and the full price of the request shown in the last response

**Requirements**:
1. Add pricing tooltips to info buttons (ℹ️) in chat messages
2. Display cost breakdown in the button hover/click
3. Show total request cost prominently in the final assistant response
4. Consider showing per-message costs and cumulative session cost

**Files to Modify**:
- `ui-new/src/components/ChatTab.tsx` (message rendering, info buttons)
- May need to aggregate pricing data from `llmApiCalls` on messages
- Use existing pricing data structure from `useUsage` context

**Design Considerations**:
- Should pricing be always visible or only on hover?
- Format: "$0.000123" vs "0.012¢"?
- Show breakdown by provider/model?

### 5. 🔜 MCP Server Live Event Streaming

**Status**: Requires architectural design

**Issue**: MCP server should stream live events to UI instead of polling or batch updates

**Requirements**:
1. Implement WebSocket or SSE (Server-Sent Events) connection between frontend and backend
2. Stream MCP server events in real-time
3. Update UI immediately as events occur
4. Handle connection failures and reconnection

**Technical Approach Options**:

**Option A: WebSocket**
- Pros: Bidirectional, efficient, real-time
- Cons: More complex, requires WebSocket support in Lambda (API Gateway WebSocket API)
- Implementation: AWS API Gateway WebSocket + Lambda + React useWebSocket hook

**Option B: Server-Sent Events (SSE)**
- Pros: Simpler, unidirectional (server → client), built into Lambda streaming response
- Cons: One-way only, less efficient than WebSocket
- Implementation: Lambda streaming response + EventSource API in React

**Recommended**: Start with SSE since Lambda already supports streaming responses via `awslambda.streamifyResponse`

**Files to Modify**:
- Backend: `src/index.js` (add streaming response support)
- Backend: Create new MCP event emitter/handler
- Frontend: `ui-new/src/components/ChatTab.tsx` (add EventSource connection)
- Frontend: Create custom hook `useMcpEventStream.ts`

**Example Flow**:
```
1. User triggers action requiring MCP
2. Frontend connects to `/stream-mcp-events` endpoint
3. Backend executes MCP operations, emits events
4. Frontend receives events via EventSource
5. UI updates in real-time (progress bars, status messages)
6. Connection closes when MCP operations complete
```

## Deployment Status

**Backend**: ✅ Deployed via `make deploy-lambda-fast`
- Lambda function URL: `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws`
- Deployment time: ~5-10 seconds

**Frontend**: ✅ Deployed via `make deploy-ui`
- GitHub Pages: `https://lambdallmproxy.pages.dev`
- Changes pushed to `agent` branch

## Commits

1. `7480f7c` - feat: display tool arguments as expandable JSON tree
2. `00fb02f` - fix: handle Gemini text-only responses in self-evaluation
3. `25f2151` - docs: update built site (2025-10-12 05:58:40 UTC)

## Testing Recommendations

### For Completed Features:

1. **JSON Tree Display**:
   - Create a chart with `generate_chart` tool
   - Verify arguments show as expandable tree (not JSON dump)
   - Check that tree is fully expanded by default
   - Test with complex nested data structures

2. **Text Evaluation Parsing**:
   - Make requests that trigger evaluation
   - Check CloudWatch logs for "✅ Parsed text evaluation" messages
   - Verify no more "Evaluation failed" when Gemini returns text
   - Test with both JSON and text responses

### For Pending Features:

1. **Google Sheets Logging**:
   - Check Sheet for recent LLM API call entries
   - Manually trigger log-llm-call endpoint
   - Review CloudWatch logs for errors
   - Verify Google API credentials

2. **Pricing Display**:
   - Design mockup for pricing tooltips
   - Calculate total session cost
   - Test with multiple API calls
   - Verify cost accuracy

3. **MCP Streaming**:
   - Prototype SSE connection
   - Test connection stability
   - Measure latency and performance
   - Handle reconnection scenarios

## Known Issues

None for the implemented features.

## Future Enhancements

1. **JSON Tree Customization**: Allow users to toggle between tree and raw JSON view
2. **Evaluation Transparency**: Show evaluation results in UI (currently only in logs)
3. **Cost Tracking**: Persistent session cost tracking across page reloads
4. **MCP Observability**: Real-time progress indicators for MCP operations

## Related Documentation

- `developer_log/FIX_MERMAID_ERROR_MESSAGES.md` - Recent Mermaid error fix
- `developer_log/FIX_GEMINI_PARAMETER_COMPATIBILITY.md` - Gemini parameter handling
- `.github/copilot-instructions.md` - Development guidelines

## References

- JsonTree component: `ui-new/src/components/JsonTree.tsx`
- Response evaluation: `src/endpoints/chat.js` (lines 45-180)
- Tool rendering: `ui-new/src/components/ChatTab.tsx` (lines 2500-2900)
