# LLM Info Button Feature

**Date**: October 8, 2025 22:58 UTC  
**Feature**: Enhanced LLM transparency with Info button and token tracking  
**Deployment**: commit f1ef1a2, build index-Bl-2FomC.js

## Overview

Replaced the expandable LLM transparency block with a compact **Info button** that shows token counts inline and opens a comprehensive full-screen dialog with complete LLM call details.

## User Experience

### Before
- Large expandable block below each response
- Cluttered interface
- No token visibility unless expanded
- Hidden page_summary and synthesis_summary calls

### After
- **Compact Info button** in action row (Copy/Gmail/Grab/Info)
- **Inline token counts**: `Info (1234↓/567↑)` 
  - ↓ = prompt tokens (input)
  - ↑ = completion tokens (output)
- **Full-screen dialog** with scrollable content
- **Complete transparency** including search tool LLM calls
- **Total aggregation** across all calls

## Features

### 1. Info Button

**Location**: Right of Copy/Gmail/Grab buttons on assistant messages  
**Visibility**: Only appears if LLM calls were made  
**Display**: Shows aggregated token counts from all LLM calls

**Format**:
```
Info (1234↓/567↑)
     ^^^^  ^^^^
     |     └─ completion tokens (output)
     └─ prompt tokens (input)
```

**Example Scenarios**:

**Simple query** (1 LLM call):
```
Info (234↓/150↑)
```

**Search query** (7 LLM calls: 5 page summaries + 1 synthesis + 1 final):
```
Info (8234↓/1567↑)
```

**No tokens yet** (request sent, awaiting response):
```
Info
```

### 2. Full-Screen Dialog

**Trigger**: Click Info button  
**Layout**: Modal dialog with header, scrollable content, footer

**Header**:
- Title: "🔍 LLM Transparency Info"
- Summary: Number of calls and total tokens
- Close button (×)

**Content** (scrollable):

For each LLM call:
- **Phase label**: 
  - 🧠 Planning
  - 🔧 Tool Execution
  - ✨ Final Answer
  - 📄 Page Summary (NEW!)
  - 🔄 Search Synthesis (NEW!)
- **Provider & Model**: e.g., "Groq • llama-3.3-70b-versatile"
- **Token metrics**:
  - 📥 X in (prompt tokens)
  - 📤 Y out (completion tokens)
  - 📊 Z total
- **Timing** (if available):
  - ⏱️ total time
  - ⏳ queue time
  - 🔄 prompt time
  - ✍️ completion time
- **Timestamp**: When request was made
- **Request Body**: Full JSON (collapsible)
- **Response Headers**: HTTP headers (collapsible, if available)
- **Response**: Full JSON (collapsible)

**Footer**:
- **Total summary**: Aggregated tokens across ALL calls
- Close button

### 3. Token Aggregation

**Algorithm**:
```typescript
const totalTokensIn = apiCalls.reduce((sum, call) => 
  sum + (call.response?.usage?.prompt_tokens || 0), 0);
  
const totalTokensOut = apiCalls.reduce((sum, call) => 
  sum + (call.response?.usage?.completion_tokens || 0), 0);
  
const totalTokens = apiCalls.reduce((sum, call) => 
  sum + (call.response?.usage?.total_tokens || 0), 0);
```

**Display Locations**:
1. **Button label**: Compact format `(8234↓/1567↑)`
2. **Dialog header**: Full format "Total: 📥 8,234 in • 📤 1,567 out • 📊 9,801 total"
3. **Dialog footer**: Same as header (visible when scrolled to bottom)

## Implementation

### Files Created

**`ui-new/src/components/LlmInfoDialog.tsx`** (278 lines)
- New full-screen dialog component
- Displays all LLM calls with detailed information
- Calculates and displays token totals
- Expandable JSON trees for request/response bodies
- Responsive layout with scrollable content

### Files Modified

**`ui-new/src/components/ChatTab.tsx`**:

**1. Import new component** (line 17):
```typescript
import { LlmInfoDialog } from './LlmInfoDialog';
```

**2. Add dialog state** (line 128):
```typescript
const [showLlmInfo, setShowLlmInfo] = useState<number | null>(null);
```

**3. Track ALL LLM calls** (lines 1011-1071):

**BEFORE**:
```typescript
if (data.phase !== 'page_summary' && data.phase !== 'synthesis_summary') {
  // Only track main agent calls
}
```

**AFTER**:
```typescript
// Track ALL phases including page_summary and synthesis_summary
setMessages(prev => {
  // Attach to active assistant or create new placeholder
});
```

**4. Remove expandable block** (previously at line 1694):
```typescript
// REMOVED:
{msg.llmApiCalls && msg.llmApiCalls.length > 0 && (
  <div className="mt-3">
    <LlmApiTransparency apiCalls={msg.llmApiCalls} />
  </div>
)}
```

**5. Add Info button** (lines 1745-1769):
```typescript
{msg.llmApiCalls && msg.llmApiCalls.length > 0 && (
  <button
    onClick={() => setShowLlmInfo(idx)}
    className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-100 flex items-center gap-1"
    title="View LLM transparency info"
  >
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    Info
    {(() => {
      const tokensIn = msg.llmApiCalls.reduce((sum: number, call: any) => 
        sum + (call.response?.usage?.prompt_tokens || 0), 0);
      const tokensOut = msg.llmApiCalls.reduce((sum: number, call: any) => 
        sum + (call.response?.usage?.completion_tokens || 0), 0);
      if (tokensIn > 0 || tokensOut > 0) {
        return (
          <span className="ml-1 text-[10px] opacity-75">
            ({tokensIn > 0 ? `${tokensIn}↓` : ''}{tokensIn > 0 && tokensOut > 0 ? '/' : ''}{tokensOut > 0 ? `${tokensOut}↑` : ''})
          </span>
        );
      }
      return null;
    })()}
  </button>
)}
```

**6. Render dialog** (lines 2245-2251):
```typescript
{showLlmInfo !== null && messages[showLlmInfo]?.llmApiCalls && (
  <LlmInfoDialog 
    apiCalls={messages[showLlmInfo].llmApiCalls}
    onClose={() => setShowLlmInfo(null)}
  />
)}
```

### Files Deprecated

**`ui-new/src/components/LlmApiTransparency.tsx`** (379 lines)
- Still exists but no longer used
- Replaced by LlmInfoDialog
- Can be removed in future cleanup

## Why Track Search Tool Calls?

### Problem

**Before**: Search tool LLM calls (page_summary, synthesis_summary) were filtered out:

```typescript
if (data.phase !== 'page_summary' && data.phase !== 'synthesis_summary') {
  // Only track main agent calls
}
```

**Issues**:
- ❌ Users couldn't see true token usage
- ❌ Incomplete cost estimates
- ❌ No visibility into search efficiency
- ❌ Hidden costs for page summarization

### Solution

**After**: Track ALL LLM calls regardless of phase:

```typescript
// Track ALL phases
setMessages(prev => {
  // Attach llmApiCalls for every phase
});
```

**Benefits**:
- ✅ Complete token usage transparency
- ✅ Accurate cost estimates
- ✅ Users can see search query efficiency
- ✅ Identify expensive searches (many page summaries)
- ✅ Better understanding of what happens during search

### Example

**Search query**: "Find recent climate policy news"

**LLM calls made**:
1. **Planning** (150 tokens): Decide to use search tool
2. **Page Summary #1** (234 tokens): Summarize first result
3. **Page Summary #2** (234 tokens): Summarize second result
4. **Page Summary #3** (234 tokens): Summarize third result
5. **Page Summary #4** (234 tokens): Summarize fourth result
6. **Page Summary #5** (234 tokens): Summarize fifth result
7. **Search Synthesis** (1,200 tokens): Combine all summaries
8. **Final Answer** (5,664 tokens): Generate user-facing response

**Total**: 8,234 prompt tokens / 1,567 completion tokens = 9,801 tokens

**Before**: Only saw calls 1 and 8 → appeared to use ~5,814 tokens (40% undercount!)  
**After**: See all 8 calls → accurate 9,801 token count

## User Benefits

### 1. Cost Awareness
- See exactly how many tokens were used
- Understand which queries are expensive
- Make informed decisions about query complexity

### 2. Performance Insight
- View timing for each LLM call
- Identify slow provider/model combinations
- See queue times vs processing times

### 3. Debugging Support
- Full request/response bodies for troubleshooting
- HTTP headers show rate limits, model info
- Phase labels clarify workflow

### 4. Trust & Transparency
- Complete visibility into what happens
- No hidden LLM calls
- Exact token counts for billing verification

### 5. Search Optimization
- See how many page summaries were generated
- Identify searches that hit too many pages
- Understand search tool efficiency

## Visual Design

**Button Style**:
- Color: Purple (distinct from Copy/Gmail/Grab)
- Icon: Info circle (ℹ️)
- Size: Same as other action buttons
- Hover: Brightens to purple-900

**Token Count Style**:
- Size: 10px (smaller than button text)
- Opacity: 75% (subtle but readable)
- Format: Compact `(1234↓/567↑)`
- Arrows: Unicode down/up arrows for direction

**Dialog Style**:
- Full-screen overlay with dark backdrop
- White/gray-900 dialog box (theme-aware)
- Max width: 7xl (1280px)
- Max height: 90vh (allows margin)
- Scrollable content area
- Fixed header/footer with totals

## Testing

**Test Scenarios**:

1. **Simple query** (1 LLM call):
   - ✅ Button shows single call tokens
   - ✅ Dialog shows one entry
   - ✅ Total matches single call

2. **Search query** (7+ LLM calls):
   - ✅ Button shows aggregated tokens
   - ✅ Dialog shows all calls including page_summary
   - ✅ Total is sum of all calls

3. **Streaming response**:
   - ✅ Button appears when first llm_request arrives
   - ✅ Tokens update as llm_response events arrive
   - ✅ Final totals match after streaming complete

4. **Multi-turn conversation**:
   - ✅ Each response has its own Info button
   - ✅ Previous responses show their historical tokens
   - ✅ New response tokens tracked correctly

5. **No LLM calls** (cached/error):
   - ✅ No Info button appears
   - ✅ No errors in console

## Performance

**Bundle Size**:
- Added: LlmInfoDialog.tsx (~8KB uncompressed)
- Removed: LlmApiTransparency usage
- Net: ~+1KB gzipped

**Runtime**:
- Token calculation: O(n) where n = number of LLM calls (typically 1-10)
- Negligible performance impact
- Dialog renders only when opened

**Memory**:
- All llmApiCalls already tracked in message state
- No additional storage overhead
- Dialog unmounts when closed

## Future Enhancements

### 1. Cost Estimates
Add pricing info to show estimated cost:
```
Info (8234↓/1567↑ • $0.023)
```

### 2. Export Functionality
Allow users to export LLM call details:
- JSON export for debugging
- CSV export for analysis
- Copy to clipboard

### 3. Filtering
Add filters to dialog:
- Show only specific phases
- Hide successful/failed calls
- Search by model or provider

### 4. Visualizations
Add charts to dialog:
- Token distribution by phase
- Timeline of calls
- Model comparison

### 5. Aggregation by Conversation
Track cumulative tokens across entire conversation:
```
Conversation totals: 45,678 tokens ($0.123)
```

## Deployment

**Git**:
- Commit: `f1ef1a2`
- Message: "feat: Add Info button with token counts for LLM transparency"
- Branch: `agent`
- Remote: `origin`

**Build**:
- Node.js: 20.12.2
- Vite: 7.1.9
- Modules: 531 transformed
- Build time: 2.31s

**Assets**:
- CSS: `docs/assets/index-BZmvwmzG.css` (48.79 KB)
- JS: `docs/assets/index-Bl-2FomC.js` (713.27 KB)

**Status**: ✅ Deployed October 8, 2025 22:58:32 UTC

## Related Documentation

- [TOKEN_OPTIMIZATION_STRATEGY.md](./TOKEN_OPTIMIZATION_STRATEGY.md) - Full token optimization overview
- [LLM_INFO_ATTACHMENT_FIX.md](./LLM_INFO_ATTACHMENT_FIX.md) - Fixed LLM info attaching to wrong responses
- [UI_FILTER_BUG_FIX.md](./UI_FILTER_BUG_FIX.md) - Message filtering improvements
