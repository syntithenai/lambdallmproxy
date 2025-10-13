# Pricing Display Implementation Plan

**Date**: October 13, 2025  
**Status**: Planning Phase  
**Priority**: High - User Visibility Feature

---

## Problem Statement

Currently, pricing information is calculated but not prominently displayed in the chat interface:
1. **No pricing on info buttons** - LLM transparency dialogs show tokens but cost is not highlighted
2. **No content block pricing** - Individual assistant responses don't show $ tallies
3. **No session totals** - Bottom summary doesn't show total $ cost for the conversation

**User Requirement**:
> "no pricing information is being shown on the chat page. the tallied total $ cost should be shown as part of the info button for the final llm response. each content block should show a $ tally in the info button label for all the llm queries collated into this response. The total token usage block at the bottom should show pricing and token tallies for all final responses"

---

## Current State Analysis

### Existing Pricing Infrastructure ✅

**Backend**:
- `src/pricing_scraper.js` - Model pricing database (15+ models)
- `src/pricing.js` - Cost calculation functions
- `src/services/google-sheets-logger.js` - Pricing for logging

**Frontend**:
- `ui-new/src/utils/pricing.ts` - Client-side pricing database (40+ models)
  * `calculateCost()` - Calculate total cost
  * `getCostBreakdown()` - Get input/output cost breakdown
  * `calculateDualPricing()` - Handle free vs paid models
  * `formatCost()` - Format cost strings

**Components**:
- `ui-new/src/components/LlmApiTransparency.tsx` - Shows per-call costs ✅
- `ui-new/src/components/LlmInfoDialog.tsx` - Shows aggregated costs ✅
- `ui-new/src/components/ChatTab.tsx` - Main chat interface

### Current Pricing Display

**What Works**:
1. ✅ LlmInfoDialog shows total cost in header
2. ✅ Individual API calls show costs with 💰 icon
3. ✅ Dual pricing for free models (shows $0 + paid equivalent)
4. ✅ Cost tooltips with input/output breakdown

**What's Missing**:
1. ❌ Info button labels don't show $ amounts
2. ❌ Content blocks don't display costs prominently
3. ❌ Session totals at bottom don't show pricing
4. ❌ No way to see "this response cost X dollars" at a glance

---

## Requirements Breakdown

### 1. Info Button with $ Cost

**Current**: `ℹ️ LLM Info (3 calls)` or just `ℹ️`

**Required**: `ℹ️ $0.0042 (3 calls)` or `💰 $0.0042 ℹ️`

**Implementation**: Add cost calculation to info button label

**Where**: 
- ChatTab.tsx - Message rendering (lines ~3200-3400)
- Each assistant message with llmApiCalls should show total cost

**Calculation**:
```typescript
const totalCost = msg.llmApiCalls?.reduce((sum, call) => {
  const tokensIn = call.response?.usage?.prompt_tokens || 0;
  const tokensOut = call.response?.usage?.completion_tokens || 0;
  const cost = calculateCost(call.model, tokensIn, tokensOut);
  return sum + (cost || 0);
}, 0) || 0;
```

### 2. Content Block $ Tally

**Current**: Assistant responses show text without cost indication

**Required**: Each final response block shows cumulative cost for all internal LLM calls

**Implementation**: 
- Add cost badge near the response header
- Show total cost for planning + tool iterations + final synthesis
- Format: `💰 Total: $0.0156 (8 LLM calls)`

**Where**:
- ChatTab.tsx - Assistant message rendering
- Position: Below or next to role indicator, above content

**Visual Design**:
```
┌─────────────────────────────────────┐
│ 🤖 Assistant                        │
│ 💰 $0.0156 • 8 calls • ℹ️ LLM Info │
├─────────────────────────────────────┤
│ Here's your answer...               │
│ ...                                 │
└─────────────────────────────────────┘
```

### 3. Session Total at Bottom

**Current**: Bottom summary shows token counts but no pricing

**Required**: Show cumulative $ cost for all assistant responses in session

**Implementation**:
- Add new section to bottom summary
- Calculate sum of all final response costs
- Show breakdown: Free models vs Paid models
- Format: `💰 Session Cost: $0.1234 (12 responses, 45 LLM calls)`

**Where**:
- ChatTab.tsx - Bottom token usage section (if exists)
- Or: Create new persistent summary bar

**Visual Design**:
```
┌───────────────────────────────────────────────┐
│ 📊 Session Summary                            │
│ • 💰 Total Cost: $0.1234                      │
│ • 🆓 Free Models: $0 (worth $0.0456)          │
│ • 💵 Paid Models: $0.1234                     │
│ • 📝 12 responses, 45 LLM calls               │
│ • 📊 125,432 total tokens                     │
└───────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Helper Functions (30 minutes)

**File**: `ui-new/src/components/ChatTab.tsx`

**Task 1.1**: Enhance `calculateCostFromLlmApiCalls()` function
- Already exists (lines 631-671)
- Works correctly
- ✅ No changes needed

**Task 1.2**: Create aggregation helper functions
```typescript
// Calculate cost for a single message
const getMessageCost = (msg: any): number => {
  if (!msg.llmApiCalls || msg.llmApiCalls.length === 0) return 0;
  return calculateCostFromLlmApiCalls(msg.llmApiCalls);
};

// Calculate session total cost
const getSessionCost = (): { total: number; free: number; paid: number; responses: number; calls: number } => {
  let total = 0;
  let free = 0;
  let paid = 0;
  let responses = 0;
  let calls = 0;
  
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.llmApiCalls) {
      const msgCost = getMessageCost(msg);
      responses++;
      calls += msg.llmApiCalls.length;
      
      // Check if any calls are free models
      const hasFreeModels = msg.llmApiCalls.some((call: any) => {
        const model = call.model;
        // Free models: Gemini, Groq
        return model?.includes('gemini') || model?.includes('llama') || model?.includes('mixtral');
      });
      
      if (hasFreeModels && msgCost === 0) {
        // Calculate "worth" for free models
        const worth = msg.llmApiCalls.reduce((sum: number, call: any) => {
          if (call.model?.includes('gemini') || call.model?.includes('llama') || call.model?.includes('mixtral')) {
            // Use paid equivalent pricing
            const tokensIn = call.response?.usage?.prompt_tokens || 0;
            const tokensOut = call.response?.usage?.completion_tokens || 0;
            const pricing = calculateDualPricing(call.model, tokensIn, tokensOut);
            return sum + (pricing.paidEquivalentCost || 0);
          }
          return sum;
        }, 0);
        free += worth;
      } else {
        paid += msgCost;
      }
      
      total += msgCost;
    }
  }
  
  return { total, free, paid, responses, calls };
};

// Format cost for display
const formatCostDisplay = (cost: number): string => {
  if (cost === 0) return '$0';
  if (cost < 0.0001) return '<$0.0001';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
};
```

### Phase 2: Info Button Enhancement (1 hour)

**File**: `ui-new/src/components/ChatTab.tsx`

**Current Info Button Location**: Search for `LlmInfoDialog` or `ℹ️` icon in assistant messages

**Changes Needed**:

1. Find info button rendering code (likely around line 3200-3400)
2. Calculate cost before rendering button
3. Update button label to include cost

**Before**:
```tsx
<button onClick={() => openLlmInfo(msg.llmApiCalls)}>
  ℹ️ LLM Info ({msg.llmApiCalls?.length || 0} calls)
</button>
```

**After**:
```tsx
{(() => {
  const cost = getMessageCost(msg);
  const callCount = msg.llmApiCalls?.length || 0;
  return (
    <button 
      onClick={() => openLlmInfo(msg.llmApiCalls)}
      className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800"
      title={`View LLM transparency info • ${callCount} API calls • ${formatCostDisplay(cost)}`}
    >
      <span className="font-semibold text-green-600 dark:text-green-400">
        💰 {formatCostDisplay(cost)}
      </span>
      <span className="text-gray-600 dark:text-gray-400 ml-1">
        • {callCount} call{callCount !== 1 ? 's' : ''}
      </span>
      <span className="ml-1">ℹ️</span>
    </button>
  );
})()}
```

**Responsive Design**:
- Desktop: Show full text `💰 $0.0042 • 3 calls ℹ️`
- Mobile (<640px): Show compact `💰 $0.0042 ℹ️` (hide call count)

### Phase 3: Content Block Cost Badge (1 hour)

**File**: `ui-new/src/components/ChatTab.tsx`

**Location**: Assistant message header area

**Implementation**:

1. Find where assistant role is rendered (likely `{msg.role === 'assistant' && ...}`)
2. Add cost badge above or next to content
3. Position near the info button

**Component Structure**:
```tsx
{msg.role === 'assistant' && msg.llmApiCalls && (
  <div className="flex items-center justify-between mb-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        🤖 Assistant
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
      {(() => {
        const cost = getMessageCost(msg);
        const callCount = msg.llmApiCalls.length;
        return (
          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
            💰 {formatCostDisplay(cost)} 
            <span className="text-gray-500 dark:text-gray-400 font-normal ml-1">
              ({callCount} LLM call{callCount !== 1 ? 's' : ''})
            </span>
          </span>
        );
      })()}
    </div>
    <button onClick={() => openLlmInfo(msg.llmApiCalls)}>
      ℹ️ Details
    </button>
  </div>
)}
```

**Visual Hierarchy**:
- Cost: Green, bold, prominent
- Call count: Gray, normal weight
- Info button: Blue, interactive

### Phase 4: Session Total Display (1.5 hours)

**File**: `ui-new/src/components/ChatTab.tsx`

**Implementation Options**:

**Option A: Persistent Footer Bar** (Recommended)
- Always visible at bottom of chat
- Shows running total that updates in real-time
- Collapsible to save space

**Option B: Expandable Summary Block**
- Click to expand/collapse
- Shows detailed breakdown
- Less intrusive

**Recommended: Option A with Collapse**

**Component Structure**:
```tsx
// Add state for collapsed/expanded
const [sessionSummaryExpanded, setSessionSummaryExpanded] = useState(false);

// Add to bottom of chat container (after messages map)
{messages.length > 0 && (() => {
  const { total, free, paid, responses, calls } = getSessionCost();
  const totalTokens = messages.reduce((sum, msg) => {
    if (msg.llmApiCalls) {
      return sum + msg.llmApiCalls.reduce((callSum: number, call: any) => {
        return callSum + (call.response?.usage?.total_tokens || 0);
      }, 0);
    }
    return sum;
  }, 0);
  
  return (
    <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t-2 border-blue-500 shadow-lg">
      {/* Collapsed View */}
      <div 
        className="px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setSessionSummaryExpanded(!sessionSummaryExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-green-600 dark:text-green-400">
              💰 {formatCostDisplay(total)}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {responses} response{responses !== 1 ? 's' : ''} • {calls} LLM calls
            </span>
          </div>
          <button className="text-gray-500 dark:text-gray-400">
            {sessionSummaryExpanded ? '▼' : '▲'} Session Summary
          </button>
        </div>
      </div>
      
      {/* Expanded View */}
      {sessionSummaryExpanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Cost Breakdown
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>💵 Paid Models:</span>
                  <span className="font-semibold">{formatCostDisplay(paid)}</span>
                </div>
                <div className="flex justify-between">
                  <span>🆓 Free Models:</span>
                  <span className="font-semibold">
                    $0 
                    {free > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        (worth {formatCostDisplay(free)})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                  <span className="font-semibold">Total:</span>
                  <span className="font-bold text-green-600 dark:text-green-400">
                    {formatCostDisplay(total)}
                  </span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Usage Statistics
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>📝 Responses:</span>
                  <span className="font-semibold">{responses}</span>
                </div>
                <div className="flex justify-between">
                  <span>🔄 LLM Calls:</span>
                  <span className="font-semibold">{calls}</span>
                </div>
                <div className="flex justify-between">
                  <span>📊 Total Tokens:</span>
                  <span className="font-semibold">{totalTokens.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
})()}
```

**Positioning**:
- `sticky bottom-0` - Always visible at bottom
- Above input area but below messages
- Scrolls with chat but stays fixed when at bottom

### Phase 5: Mobile Optimization (30 minutes)

**Responsive Breakpoints**:
- **≥768px (Desktop)**: Show all details
- **640-767px (Tablet)**: Moderate detail
- **<640px (Mobile)**: Compact display

**Mobile Optimizations**:

**Info Button** (Mobile):
```tsx
<button className="text-xs px-1.5 py-1">
  <span className="hidden sm:inline">💰 {formatCostDisplay(cost)} • </span>
  <span className="sm:hidden">💰 {formatCostDisplay(cost)}</span>
  <span className="hidden sm:inline">{callCount} calls </span>
  <span>ℹ️</span>
</button>
```

**Content Block Badge** (Mobile):
```tsx
<div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
  <span>🤖 Assistant</span>
  <span className="text-xs font-semibold text-green-600">
    💰 {formatCostDisplay(cost)}
  </span>
</div>
```

**Session Summary** (Mobile):
```tsx
{/* Collapsed mobile view - single line */}
<div className="flex items-center justify-between text-sm sm:text-base">
  <span className="font-bold text-green-600">
    💰 {formatCostDisplay(total)}
  </span>
  <span className="text-xs sm:text-sm">
    {responses}r • {calls}c
  </span>
</div>

{/* Expanded mobile view - stacked */}
{sessionSummaryExpanded && (
  <div className="space-y-2">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {/* Mobile: Stack vertically */}
    </div>
  </div>
)}
```

---

## Testing Strategy

### Unit Tests

**File**: `tests/unit/pricing-display.test.tsx` (new)

```typescript
describe('Pricing Display Functions', () => {
  test('calculateCostFromLlmApiCalls - handles empty array', () => {
    expect(calculateCostFromLlmApiCalls([])).toBe(0);
  });
  
  test('calculateCostFromLlmApiCalls - calculates GPT-4o cost', () => {
    const calls = [{
      model: 'gpt-4o',
      response: { usage: { prompt_tokens: 1000, completion_tokens: 500 } }
    }];
    // (1000/1M * 2.50) + (500/1M * 10.00) = 0.0025 + 0.005 = 0.0075
    expect(calculateCostFromLlmApiCalls(calls)).toBeCloseTo(0.0075, 6);
  });
  
  test('calculateCostFromLlmApiCalls - free models return 0', () => {
    const calls = [{
      model: 'gemini-2.0-flash',
      response: { usage: { prompt_tokens: 1000, completion_tokens: 500 } }
    }];
    expect(calculateCostFromLlmApiCalls(calls)).toBe(0);
  });
  
  test('getSessionCost - aggregates multiple messages', () => {
    // Test with mock messages array
    const messages = [
      { role: 'user', content: 'Test' },
      { 
        role: 'assistant', 
        llmApiCalls: [
          { model: 'gpt-4o', response: { usage: { prompt_tokens: 1000, completion_tokens: 500 } } }
        ]
      },
      { 
        role: 'assistant', 
        llmApiCalls: [
          { model: 'gemini-2.0-flash', response: { usage: { prompt_tokens: 2000, completion_tokens: 1000 } } }
        ]
      }
    ];
    
    const result = getSessionCost(messages);
    expect(result.responses).toBe(2);
    expect(result.calls).toBe(2);
    expect(result.total).toBeCloseTo(0.0075, 6);
    expect(result.paid).toBeCloseTo(0.0075, 6);
    expect(result.free).toBeGreaterThan(0); // Should have paid equivalent value
  });
  
  test('formatCostDisplay - formats correctly', () => {
    expect(formatCostDisplay(0)).toBe('$0');
    expect(formatCostDisplay(0.00001)).toBe('<$0.0001');
    expect(formatCostDisplay(0.0042)).toBe('$0.0042');
    expect(formatCostDisplay(0.15)).toBe('$0.150');
    expect(formatCostDisplay(1.5)).toBe('$1.50');
  });
});
```

### Integration Tests

**Manual Testing Checklist**:
- [ ] Create new chat with 3-4 exchanges
- [ ] Verify info button shows $ cost
- [ ] Verify content block shows $ badge
- [ ] Verify session summary calculates correctly
- [ ] Test with free models (Gemini, Groq)
- [ ] Test with paid models (GPT-4, Claude)
- [ ] Test with mixed free/paid in same response
- [ ] Verify mobile layout (320px, 375px, 768px)
- [ ] Test expand/collapse session summary
- [ ] Verify cost updates in real-time during streaming

### Visual Regression Tests

**Screenshots to Compare**:
1. Info button - before/after
2. Content block - before/after
3. Session summary - collapsed/expanded
4. Mobile views - all sizes

---

## Implementation Order

### Day 1 (3-4 hours)
1. ✅ Create helper functions (30 min)
2. ✅ Enhance info button with cost (1 hour)
3. ✅ Add content block cost badge (1 hour)
4. ✅ Test basic functionality (30 min)

### Day 2 (2-3 hours)
5. ✅ Implement session summary (1.5 hours)
6. ✅ Mobile optimization (30 min)
7. ✅ Integration testing (1 hour)

### Day 3 (1-2 hours)
8. ✅ Write unit tests (1 hour)
9. ✅ Documentation updates (30 min)
10. ✅ Final review and polish (30 min)

**Total Estimated Time**: 6-9 hours

---

## Edge Cases to Handle

### 1. Missing Pricing Data
**Issue**: Model not in pricing database

**Solution**: Show warning icon and fallback text
```tsx
{cost === null ? (
  <span className="text-xs text-yellow-600 dark:text-yellow-400">
    ⚠️ Pricing unavailable
  </span>
) : (
  <span>💰 {formatCostDisplay(cost)}</span>
)}
```

### 2. Zero Cost (Free Models)
**Issue**: Show $0 or hide?

**Solution**: Always show, add "(free)" label
```tsx
<span className="text-green-600 dark:text-green-400">
  💰 $0 <span className="text-xs opacity-75">(free tier)</span>
</span>
```

### 3. Streaming Messages
**Issue**: Cost unknown during streaming

**Solution**: Show "Calculating..." then update when complete
```tsx
{msg.isStreaming ? (
  <span className="text-xs text-gray-500">Calculating cost...</span>
) : (
  <span>💰 {formatCostDisplay(cost)}</span>
)}
```

### 4. Tool Iterations
**Issue**: Multiple LLM calls in single response

**Solution**: Show cumulative total, detail in tooltip
```tsx
<span title={`${planningCost} planning + ${toolCost} tools + ${synthesisCost} synthesis`}>
  💰 {formatCostDisplay(totalCost)}
</span>
```

### 5. Deleted Messages
**Issue**: Session total changes when messages deleted

**Solution**: Recalculate on message array changes
```tsx
useEffect(() => {
  // Recalculate session totals when messages change
  const newTotals = getSessionCost();
  setSessionTotals(newTotals);
}, [messages]);
```

---

## Visual Design Specifications

### Color Scheme
- **Cost Primary**: `text-green-600 dark:text-green-400` (money green)
- **Cost Secondary**: `text-gray-600 dark:text-gray-400` (muted details)
- **Free Badge**: `text-green-600 dark:text-green-400` with `bg-green-100 dark:bg-green-900`
- **Warning**: `text-yellow-600 dark:text-yellow-400` (missing pricing)
- **Session Border**: `border-blue-500` (2px top border)

### Typography
- **Cost Amount**: `font-semibold` or `font-bold` (emphasize)
- **Call Count**: `font-normal` (de-emphasize)
- **Labels**: `text-xs` or `text-sm` uppercase (section headers)

### Spacing
- **Info Button**: `px-2 py-1` compact
- **Content Badge**: `px-4 py-2` moderate
- **Session Summary**: `px-4 py-3` comfortable
- **Gap Between Elements**: `gap-2` or `gap-3`

### Icons
- **Money**: 💰 (U+1F4B0)
- **Free**: 🆓 (U+1F193)
- **Paid**: 💵 (U+1F4B5)
- **Info**: ℹ️ (U+2139)
- **Warning**: ⚠️ (U+26A0)

---

## Success Criteria

### Functional Requirements
- ✅ Info button shows $ cost for each response
- ✅ Content blocks show cumulative $ tally
- ✅ Session summary shows total $ cost
- ✅ Free models show $0 with "worth" indicator
- ✅ Paid models show actual cost
- ✅ Mobile layout works on 320px+ screens

### Performance Requirements
- ✅ Cost calculation takes <10ms per message
- ✅ Session total updates in <50ms
- ✅ No janky scrolling with sticky footer
- ✅ Memory usage stays under 5MB for cost tracking

### UX Requirements
- ✅ Cost is visible without opening dialogs
- ✅ Cost updates in real-time during streaming
- ✅ Clear visual hierarchy (cost > tokens > timing)
- ✅ Tooltips provide detailed breakdowns
- ✅ Works in light and dark modes

---

## Dependencies

### External
- None (all using existing pricing infrastructure)

### Internal
- `ui-new/src/utils/pricing.ts` - Already exists ✅
- `ui-new/src/components/LlmApiTransparency.tsx` - Already has cost display ✅
- `ui-new/src/components/LlmInfoDialog.tsx` - Already aggregates costs ✅

### Data Flow
```
Backend (llmApiCalls) 
  → ChatTab state (messages with llmApiCalls)
  → calculateCostFromLlmApiCalls()
  → Display components (info button, badge, summary)
  → LlmInfoDialog (detailed breakdown)
```

---

## Risks and Mitigation

### Risk 1: Pricing Data Out of Date
**Impact**: High - Shows incorrect costs

**Mitigation**: 
- Add last updated timestamp to pricing.ts
- Document update process
- Add warning if pricing >30 days old

### Risk 2: Performance with Large Sessions
**Impact**: Medium - Lag with 100+ messages

**Mitigation**:
- Memoize session totals with useMemo
- Only recalculate on message array changes
- Consider pagination for very large sessions

### Risk 3: Layout Shift
**Impact**: Low - Content jumps when costs load

**Mitigation**:
- Reserve space for cost badge during streaming
- Use skeleton placeholders
- Smooth transitions with CSS

### Risk 4: Mobile Overflow
**Impact**: Medium - Text/buttons cut off on small screens

**Mitigation**:
- Test on 320px width (iPhone SE)
- Use truncation with ellipsis
- Stack elements vertically on mobile

---

## Future Enhancements

### Phase 2 (Post-Launch)
1. **Cost Alerts** - Warn when approaching budget limits
2. **Historical Charts** - Graph costs over time
3. **Model Comparison** - Show "would have cost X with model Y"
4. **Export Costs** - CSV/PDF reports for accounting
5. **Cost Optimization** - Suggest cheaper models for similar tasks

### Nice-to-Have
- Animated cost counter (odometer style)
- Per-user cost tracking (multi-tenant)
- Budget limits and warnings
- Cost prediction before sending prompt
- Provider cost comparison

---

## Documentation Updates Needed

### README.md
- Add section on pricing transparency
- Explain how costs are calculated
- Link to pricing.ts for model pricing

### TESTING.md
- Add pricing display test cases
- Document testing checklist

### UI_IMPROVEMENTS.md (or similar)
- Document pricing display feature
- Include screenshots
- Note accessibility considerations

---

## Accessibility Considerations

### Screen Readers
- Add `aria-label` to cost displays
- Ensure tooltips are keyboard accessible
- Provide text alternatives for icons

### Color Contrast
- Green on white: 4.5:1+ ratio ✅
- Green on dark background: 4.5:1+ ratio ✅
- Fallback to text if icons unavailable

### Keyboard Navigation
- Info button focusable and clickable
- Session summary expandable via keyboard
- Tooltips show on focus

---

## Deployment Notes

### No Breaking Changes
- All changes are additive (UI only)
- No API changes required
- No database migrations needed

### Feature Flag (Optional)
```typescript
const SHOW_PRICING = true; // Toggle to disable if needed

{SHOW_PRICING && (
  <span>💰 {formatCostDisplay(cost)}</span>
)}
```

### Rollback Plan
- Remove cost display components
- Fall back to token-only display
- No data loss or corruption risk

---

## Approval Checklist

- [ ] Review plan with stakeholders
- [ ] Confirm UI/UX design
- [ ] Verify pricing data accuracy
- [ ] Approve mobile layout approach
- [ ] Confirm session summary design
- [ ] Schedule implementation time
- [ ] Assign developer resources
- [ ] Set testing criteria

---

**Plan Status**: ✅ Complete and Ready for Implementation

**Next Step**: Get approval and begin Phase 1 implementation

---

*Plan created: October 13, 2025*  
*Estimated implementation: 6-9 hours over 2-3 days*  
*Priority: High - User visibility feature*
