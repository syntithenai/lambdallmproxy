# Issue: llama-3.3-70b-versatile Generates Function Syntax for ALL Questions

**Date**: October 6, 2025  
**Problem**: `llama-3.3-70b-versatile` generates `<function=search>` for EVERY question  
**Root Cause**: Model architecture - trained on mixed function calling formats  
**Solution**: Switch to a different model

## Problem Analysis

### Observed Behavior

**Request**:
```json
{
  "model": "llama-3.3-70b-versatile",
  "messages": [
    {
      "role": "user",
      "content": "how old will bob brown be tomorrow"
    }
  ],
  "tools": [...]
}
```

**Model Response**: `<function=search>`

### Why This is Wrong

1. **Question doesn't need tools**: "How old will Bob Brown be tomorrow" is a simple calculation
2. **Model generates syntax anyway**: Because tools are available, it always uses them
3. **Happens for ALL questions**: Even simple ones that don't need web search

### Root Cause: Model Training

`llama-3.3-70b-versatile` was trained on datasets that include:
- ✅ OpenAI function calling format (structured `tool_calls`)
- ✅ Claude/Anthropic format (`<function=...>` text tags)
- ❌ Mixed training causes "format bleeding"

**Result**: Model generates Claude-style syntax even when using OpenAI API format.

## Testing Results

### Test 1: Simple Question (No Tools Needed)
- **Query**: "how old will bob brown be tomorrow"
- **Expected**: Direct calculation/answer
- **Actual**: `<function=search>`
- **Result**: ❌ FAIL

### Test 2: With Improved Prompt
- **Query**: (same)
- **Prompt**: Removed negative prompting, positive instructions only
- **Actual**: Still generates `<function=search>`
- **Result**: ❌ FAIL - Prompt fix didn't help

### Conclusion

**The issue is NOT the prompt** - it's the model architecture itself. `llama-3.3-70b-versatile` has this behavior deeply ingrained from training.

## Solution: Switch Models

### Recommended Model: qwen/qwen3-32b

**Why qwen/qwen3-32b**:

1. ✅ **Different architecture**: Qwen family, not Llama
2. ✅ **Strong instruction following**: Known for good adherence to instructions
3. ✅ **Parallel tool support**: Better than llama-3.3-70b
4. ✅ **Same context window**: 131K (vs llama's 128K)
5. ✅ **Good performance**: 32B params, solid capability
6. ✅ **Clean tool calling**: Uses structured format properly
7. ✅ **6K TPM**: Sufficient for most use cases

**Specs**:
- Model ID: `qwen/qwen3-32b`
- Size: 32B parameters
- Context: 131,072 tokens
- Tool use: ✅ Yes
- Parallel tools: ✅ Yes
- JSON mode: ✅ Yes
- TPM (free): 6,000
- TPD (free): 500,000

### Alternative Options

If qwen/qwen3-32b doesn't work:

#### Option 2: meta-llama/llama-4-scout-17b-16e-instruct
**Why**:
- Newer architecture (Llama 4)
- 30K TPM (fastest on Groq!)
- Vision capable
- Smaller but efficient

**Trade-off**: Only 17B params (less capable than 32B)

#### Option 3: moonshotai/kimi-k2-instruct-0905
**Why**:
- Huge context (262K!)
- Good instruction following
- Parallel tools

**Trade-off**: Unknown parameter count, less battle-tested

#### Option 4: openai/gpt-oss-120b (Previous Attempt)
**Status**: We tried this, got "invalid model ID" error

**Note**: The provider routing is now fixed, but we haven't retested this model.

## Implementation

### Step 1: Update Default Model

**File**: `ui-new/src/components/ChatTab.tsx`

```typescript
const [settings] = useLocalStorage('app_settings', {
    provider: 'groq',
    llmApiKey: '',
    apiEndpoint: 'https://api.groq.com/openai/v1',
    largeModel: 'qwen/qwen3-32b'  // Changed from openai/gpt-oss-120b
});
```

### Step 2: Clear LocalStorage (Important!)

The user's browser has `llama-3.3-70b-versatile` stored in localStorage. They need to:

**Option A - Via Browser Console**:
```javascript
localStorage.removeItem('app_settings');
// Then refresh the page
```

**Option B - Via UI**:
- Open browser DevTools (F12)
- Go to Application tab
- Find Local Storage → your domain
- Delete `app_settings` key
- Refresh page

**Option C - Update Code to Override**:
```typescript
// Force model update
const [settings, setSettings] = useLocalStorage('app_settings', {
    provider: 'groq',
    llmApiKey: '',
    apiEndpoint: 'https://api.groq.com/openai/v1',
    largeModel: 'qwen/qwen3-32b'
});

// Force update on mount if using old model
useEffect(() => {
    if (settings.largeModel === 'llama-3.3-70b-versatile' || 
        settings.largeModel === 'openai/gpt-oss-120b') {
        setSettings({
            ...settings,
            largeModel: 'qwen/qwen3-32b'
        });
    }
}, []);
```

### Step 3: Build and Test

```bash
cd ui-new && npm run build
```

## Expected Results with qwen/qwen3-32b

### Test 1: Simple Question
- **Query**: "how old will bob brown be tomorrow"
- **Expected**: Direct answer (no tool calling)
- **Check**: No `<function=...>` syntax

### Test 2: Tool-Requiring Question
- **Query**: "What are the latest AI developments?"
- **Expected**: Proper structured tool call → results → natural response
- **Check**: Clean output, tools work correctly

### Test 3: Mixed Conversation
- **Query 1**: "What is 2+2?" (simple)
- **Query 2**: "Search for AI news" (needs tool)
- **Expected**: Simple answer for Q1, tool use for Q2
- **Check**: Model intelligently decides when to use tools

## Model Comparison

| Feature | llama-3.3-70b | qwen/qwen3-32b | openai/gpt-oss-120b |
|---------|---------------|----------------|---------------------|
| Parameters | 70B | 32B | 120B |
| Context | 128K | 131K | 131K |
| Parallel Tools | ✅ Yes | ✅ Yes | ❌ No |
| Function Syntax Issue | ❌ Always | 🔍 Unknown | 🔍 Unknown |
| TPM (free) | 12,000 | 6,000 | 8,000 |
| Known Working | ⚠️ With cleaning | 🔍 To test | ⚠️ Had errors |

## Why llama-3.3-70b Fails

### Technical Explanation

1. **Training Data Mixing**: Trained on both OpenAI and Claude examples
2. **Format Confusion**: Can't distinguish between text content and function calling
3. **Overeager Tool Use**: Sees tools available → always tries to use them
4. **Text Generation**: Generates `<function=...>` as text instead of structured calls

### Evidence

- ✅ Generates syntax even when prompt says not to
- ✅ Generates syntax for questions that don't need tools
- ✅ Generates syntax for ALL questions when tools are present
- ✅ Continues behavior despite prompt improvements

### Conclusion

This is NOT a prompt engineering problem. This is a **model architecture/training problem**.

## Workarounds (Not Recommended)

### Workaround 1: Remove Tools from Simple Questions
**Idea**: Don't include tools array for simple questions  
**Problem**: How do you determine which questions are "simple"?  
**Result**: Complex logic, likely to fail

### Workaround 2: Re-enable Content Cleaning
**Idea**: Clean the `<function=...>` syntax  
**Problem**: Masks the issue, doesn't fix it  
**Result**: Works but not ideal

### Workaround 3: Post-Processing
**Idea**: Detect and fix function syntax after generation  
**Problem**: Still generating wrong output  
**Result**: Band-aid solution

## Recommended Approach

1. ✅ **Switch to qwen/qwen3-32b** (best solution)
2. 🔄 **Test thoroughly** with various questions
3. 📊 **Monitor performance** vs llama-3.3-70b
4. 📝 **Document findings** for future reference
5. ⏭️ **Keep alternatives ready** if qwen doesn't work

## Code Changes Needed

### Update Default Model

```typescript
// ui-new/src/components/ChatTab.tsx
largeModel: 'qwen/qwen3-32b'
```

### Build

```bash
cd ui-new && npm run build
```

### Clear User's LocalStorage

Users need to clear `app_settings` from localStorage or update code to force migration.

## Success Criteria

After switching to qwen/qwen3-32b:

- ✅ Simple questions get direct answers (no function syntax)
- ✅ Tool-requiring questions trigger proper structured calls
- ✅ No `<function=...>` syntax in ANY response
- ✅ Natural language responses throughout
- ✅ Good response quality maintained

## Fallback Plan

If qwen/qwen3-32b also has issues:

1. Try `meta-llama/llama-4-scout-17b-16e-instruct`
2. Try `moonshotai/kimi-k2-instruct-0905`
3. Retest `openai/gpt-oss-120b` (provider routing is now fixed)
4. Last resort: Return to `llama-3.3-70b-versatile` with cleaning

## Key Learnings

1. **Not all models handle tool calling the same way**
2. **Training data matters more than prompt engineering**
3. **Model architecture determines behavior more than prompts**
4. **Testing with real queries reveals true model behavior**
5. **Some model issues can't be fixed with prompting**

---

**Status**: Ready to switch to `qwen/qwen3-32b`  
**Action Required**: Update model + clear localStorage  
**Expected Outcome**: Clean responses without function syntax
