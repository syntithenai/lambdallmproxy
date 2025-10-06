# Groq Reasoning Raw Format & Auto-Submit Examples - October 6, 2025

## Overview
This update implements two user experience improvements:
1. **Groq Reasoning Raw Format**: Changes reasoning format from 'default' to 'raw' so reasoning tokens appear directly in the response text
2. **Auto-Submit Examples**: Makes example buttons automatically submit queries instead of just populating the input field

## Changes Implemented

### 1. Groq Reasoning Raw Format

**Problem**: When using Groq reasoning models (like deepseek-r1-distill-llama-70b), the reasoning tokens were hidden by default, making it impossible to see the model's thought process.

**Solution**: Changed the `reasoning_format` parameter from `'default'` to `'raw'` in the Groq reasoning configuration.

**File**: `src/llm_tools_adapter.js`

**Before**:
```javascript
function mapReasoningForGroq(model, options) {
  if (!groqSupportsReasoning(model)) return {};
  const effort = options?.reasoningEffort || process.env.REASONING_EFFORT || 'low';
  return { include_reasoning: true, reasoning_effort: effort, reasoning_format: 'default' };
}
```

**After**:
```javascript
function mapReasoningForGroq(model, options) {
  if (!groqSupportsReasoning(model)) return {};
  const effort = options?.reasoningEffort || process.env.REASONING_EFFORT || 'low';
  return { include_reasoning: true, reasoning_effort: effort, reasoning_format: 'raw' };
}
```

**Impact**:
- Reasoning models now show their full thought process in the response
- Users can see how the model arrives at conclusions
- Debugging and understanding model behavior becomes easier
- No change for non-reasoning models

**Groq Reasoning Models** (controlled by `GROQ_REASONING_MODELS` env var):
- `deepseek-r1-distill-llama-70b` (advanced reasoning)
- Any other models explicitly enabled via environment variable

**Format Comparison**:

| Format | Behavior |
|--------|----------|
| `default` | Reasoning tokens hidden, only final answer shown |
| `raw` | Full reasoning visible inline with answer (like `<think>...</think>` tags) |

---

### 2. Auto-Submit Examples

**Problem**: Example buttons only populated the input field, requiring users to manually click "Send" afterward. This added friction to trying examples.

**Solution**: Modified all example buttons to automatically submit the query after populating the input field.

**File**: `ui-new/src/components/ChatTab.tsx`

**Before**:
```typescript
<button onClick={() => setInput('What are the latest developments in artificial intelligence this week?')}>
  Latest AI developments
</button>
```

**After**:
```typescript
<button onClick={() => { 
  setInput('What are the latest developments in artificial intelligence this week?'); 
  setTimeout(handleSend, 0); 
}}>
  Latest AI developments
</button>
```

**Affected Examples** (8 total):

**Web Search & Current Events:**
1. Latest AI developments
2. Climate change policy updates  
3. Tesla stock price and news

**Mathematical & Computational:**
4. Compound interest calculation
5. Multiplication table

**Data Analysis & Research:**
6. Population growth comparison
7. Python vs JavaScript
8. Renewable energy analysis

**Implementation Details**:
- Uses `setTimeout(handleSend, 0)` to ensure state update completes before submission
- Respects all existing validation (authentication, empty input, loading state)
- Works with all tool configurations

**Benefits**:
- ✅ Faster example testing (one click instead of two)
- ✅ Better first-time user experience
- ✅ Encourages exploration of different query types
- ✅ Maintains existing error handling and validation

---

## Technical Details

### Reasoning Format Options

Groq supports three reasoning formats:

1. **`default`**: Reasoning hidden, only answer visible
2. **`raw`**: Full reasoning visible inline (we use this)
3. **`structured`**: Reasoning in separate fields (not implemented)

### Auto-Submit Pattern

The auto-submit uses a zero-delay timeout to ensure React state batching completes:

```typescript
onClick={() => { 
  setInput(exampleText);           // Step 1: Update input state
  setTimeout(handleSend, 0);       // Step 2: Submit after state update
}}
```

**Why `setTimeout(handleSend, 0)`?**
- React batches state updates for performance
- `setInput` schedules a state update but doesn't complete immediately
- `setTimeout(..., 0)` defers execution to next event loop tick
- By then, state update is complete and `handleSend` sees correct input
- Alternative would be `useEffect` watching input, but this is simpler

### Environment Configuration

**Groq Reasoning Models** are controlled by environment variable:

```bash
# .env file
GROQ_REASONING_MODELS="deepseek-r1-distill-llama-70b,other-model"
```

If not set, reasoning features are disabled by default for safety.

---

## Example Usage

### Reasoning Model Example

**Query**: "Calculate the optimal strategy for investing $10,000"

**Before (default format)**:
```
Assistant: I recommend diversifying across stocks (60%), bonds (30%), 
and cash (10%) based on a moderate risk profile.
```

**After (raw format)**:
```
Assistant: <think>
Let me analyze this investment scenario:
- Principal: $10,000
- No risk profile specified, assume moderate
- Time horizon not mentioned, assume medium-term (5-10 years)
- Need to balance growth and stability

Strategy considerations:
1. Stocks: Higher returns but volatile
2. Bonds: Stable income, lower returns
3. Cash: Liquidity and safety

For moderate risk with medium-term horizon:
- 60% stocks for growth
- 30% bonds for stability  
- 10% cash for liquidity
</think>

I recommend diversifying across stocks (60%), bonds (30%), 
and cash (10%) based on a moderate risk profile.
```

The `<think>` tags show the model's reasoning process!

### Auto-Submit Example

**Before**:
1. Hover over "Examples" dropdown
2. Click "Latest AI developments"
3. See query in input field: "What are the latest developments..."
4. Click "Send" button
5. Query submits

**After**:
1. Hover over "Examples" dropdown
2. Click "Latest AI developments"
3. ✅ Query immediately submits and starts processing

---

## Testing

### Test 1: Reasoning Model with Raw Format

**Prerequisites**:
- Set `GROQ_REASONING_MODELS="deepseek-r1-distill-llama-70b"` in `.env`
- Deploy backend: `./scripts/deploy.sh`

**Steps**:
1. Select model: `deepseek-r1-distill-llama-70b`
2. Send query: "Explain quantum computing"
3. Observe response

**Expected**:
- Response contains `<think>` tags or similar reasoning markers
- You can see the model's thought process before the answer
- Response is longer due to included reasoning

### Test 2: Auto-Submit Examples

**Steps**:
1. Hover over "📝 Examples ▾" button
2. Click any example (e.g., "Latest AI developments")

**Expected**:
- Query immediately appears in input field
- Query automatically submits without clicking "Send"
- Loading state activates
- Response appears as usual

### Test 3: Non-Reasoning Model (No Change)

**Steps**:
1. Select model: `meta-llama/llama-4-scout-17b-16e-instruct`
2. Send any query

**Expected**:
- No reasoning tags in response
- Behaves exactly as before (no change)
- Only models in `GROQ_REASONING_MODELS` are affected

---

## Build Results

### UI Build
```bash
npm run build
✓ 44 modules transformed.
../docs/assets/index-BxZt1LI1.js  258.87 kB │ gzip: 78.09 kB
✓ built in 996ms
```

**Size Impact**: 258.72 KB → 258.87 KB (+0.15 KB)
- Minimal increase from auto-submit logic

### Backend Deployment
```bash
./scripts/deploy.sh
✅ Function deployed successfully
✅ Environment variables configured
✅ CORS configuration verified
🎉 Deployment completed successfully!
```

**Files Updated**:
- `llm_tools_adapter.js` (reasoning format change)

---

## Configuration Reference

### Environment Variables

```bash
# Enable reasoning for specific Groq models (comma-separated)
GROQ_REASONING_MODELS="deepseek-r1-distill-llama-70b"

# Set reasoning effort level (affects compute intensity)
REASONING_EFFORT="medium"  # Options: low, medium, high
```

### Model Compatibility

**Groq Reasoning Models** (as of Oct 2025):
- ✅ `deepseek-r1-distill-llama-70b` - Advanced reasoning
- ✅ `qwen/qwq-32b-preview` - Advanced reasoning
- ✅ Any future models added to `GROQ_REASONING_MODELS`

**Non-Reasoning Models** (unchanged behavior):
- `meta-llama/llama-4-scout-17b-16e-instruct`
- `qwen/qwen3-32b`
- `moonshotai/kimi-k2-instruct-0905`
- All other standard models

---

## User Experience Impact

### Before This Update

**Reasoning Models**:
```
User: "Calculate compound interest"
Model: The result is $19,671.51
```
❌ No visibility into calculation process

**Examples**:
```
User: [Hovers Examples dropdown]
User: [Clicks "Compound interest calculation"]
User: [Sees query in input]
User: [Clicks Send button]
User: [Waits for response]
```
⏱️ Extra click required

### After This Update

**Reasoning Models**:
```
User: "Calculate compound interest"
Model: <think>
  Principal: $10,000
  Rate: 7% = 0.07
  Time: 15 years
  Formula: A = P(1 + r)^t
  Calculation: 10000 * (1.07)^15
  = 10000 * 2.7591...
  = $27,591.47
</think>
The result is $27,591.47
```
✅ Full transparency into calculation

**Examples**:
```
User: [Hovers Examples dropdown]
User: [Clicks "Compound interest calculation"]
User: [Query auto-submits]
User: [Sees response immediately]
```
⚡ One-click experience

---

## Rollback Instructions

### If Reasoning Format Causes Issues

**Option 1: Disable reasoning for all models**
```bash
# In .env file
GROQ_REASONING_MODELS=""
```

**Option 2: Revert to default format**
```javascript
// In src/llm_tools_adapter.js
return { 
  include_reasoning: true, 
  reasoning_effort: effort, 
  reasoning_format: 'default'  // Change 'raw' back to 'default'
};
```

### If Auto-Submit Causes Issues

**Revert example buttons**:
```typescript
// In ui-new/src/components/ChatTab.tsx
// Change from:
onClick={() => { setInput('...'); setTimeout(handleSend, 0); }}

// Back to:
onClick={() => setInput('...')}
```

---

## Future Enhancements

### Reasoning Display Improvements
1. **Syntax Highlighting**: Parse `<think>` tags and style differently
2. **Collapsible Reasoning**: Hide reasoning by default with expand button
3. **Reasoning Toggle**: User setting to enable/disable reasoning display
4. **Token Count**: Show reasoning token count separately

### Example Improvements
1. **Example Categories**: Add more categories (e.g., "Creative Writing")
2. **Recent Examples**: Track user's recent successful queries
3. **Custom Examples**: Allow users to save their own examples
4. **Example Metadata**: Show expected tools/duration for each example

---

## Known Issues

### Reasoning Display
- Raw format may include model-specific tags (e.g., `<think>`, `<reasoning>`)
- Tag format varies by model provider
- Some models may not use tags at all (just inline reasoning)

### Auto-Submit
- Examples submit immediately (no review opportunity)
- Consider adding a setting to disable auto-submit if needed
- Dropdown closes immediately after click (expected behavior)

---

## Conclusion

Both changes significantly improve the user experience:

1. **Reasoning Transparency**: Users can now see how models think, making responses more trustworthy and debuggable
2. **Faster Exploration**: One-click examples encourage experimentation and reduce friction

**Status**: ✅ Deployed to production
**UI Build Hash**: BxZt1LI1
**Backend Status**: Deployed successfully
**Backward Compatibility**: ✅ Non-reasoning models unaffected
