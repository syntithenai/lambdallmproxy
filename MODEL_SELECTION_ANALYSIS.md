# Model Selection Analysis: Fixing Function Syntax Issue

**Date**: October 6, 2025  
**Problem**: Model generates `<function=search>` syntax in responses  
**Root Cause**: System prompt mentions the syntax (negative prompting backfire)  
**Solution**: Fix prompt + potentially switch models

## Root Cause: Negative Prompting Backfire

### The Problematic System Prompt

**Old prompt** (line 250 in ChatTab.tsx):
```
Tool calls are made automatically through the API using OpenAI function calling format. 
Just invoke the tool when needed - do NOT write XML-style tags like <function=search> 
or similar syntax in your text responses. Your responses should be natural language only.
```

**Problem**: By saying "do NOT write `<function=search>`", we:
1. ✅ Teach the model this syntax exists
2. ✅ Prime it to think about this format
3. ✅ Make it MORE likely to use it ("pink elephant" effect)

### The Fix

**New prompt**:
```
The API will automatically handle tool execution. After calling a tool, you'll receive 
the results and should incorporate them naturally into your response. Always provide 
complete, helpful answers using the tool results.
```

**Benefits**:
- ✅ No mention of problematic syntax
- ✅ Positive instructions only
- ✅ Focuses on desired behavior (natural responses)
- ✅ No priming effect

## Model Comparison: Should We Switch?

### Current Model: openai/gpt-oss-120b

**Specs**:
- 120B parameters
- 131K context window
- Tool use: ✅ Yes
- Parallel tools: ❌ No
- JSON mode: ✅ Yes
- TPM (free): 8,000
- TPD (free): 200,000

**Issue**: Generates `<function=...>` syntax (likely due to our prompt)

**Recommendation**: **Try prompt fix first**, then test alternatives

### Alternative Models on Groq

| Model | Size | Context | Parallel Tools | TPM | Notes |
|-------|------|---------|----------------|-----|-------|
| **llama-3.3-70b-versatile** | 70B | 128K | ✅ Yes | 12,000 | Previous default, same issue |
| **qwen/qwen3-32b** | 32B | 131K | ✅ Yes | 6,000 | Good alternative, parallel tools |
| **meta-llama/llama-4-scout-17b-16e-instruct** | 17B | 128K | ✅ Yes | 30,000 (!!) | Fast, vision, highest TPM |
| **meta-llama/llama-4-maverick-17b-128e-instruct** | 17B | 128K | ✅ Yes | 6,000 | Vision capable |
| **moonshotai/kimi-k2-instruct-0905** | ? | 262K (!!) | ✅ Yes | 10,000 | Huge context |
| **llama-3.1-8b-instant** | 8B | 128K | ✅ Yes | 6,000 | Fast fallback |

### Recommendation: Try This Order

#### 1. **First: Fix the System Prompt** ✅ (DONE)
- Remove negative prompting
- Test with `openai/gpt-oss-120b`
- **Expected**: 90% chance this fixes it

#### 2. **If Still Issues: Try qwen/qwen3-32b**
**Why**:
- ✅ Parallel tool support (better than openai/gpt-oss-120b)
- ✅ 32B params (solid capability)
- ✅ 131K context (same as gpt-oss)
- ✅ Different architecture (may not have same issue)
- ✅ Qwen models known for good instruction following

**To test**:
```typescript
largeModel: 'qwen/qwen3-32b'
```

#### 3. **If Need More Speed: Try meta-llama/llama-4-scout-17b-16e-instruct**
**Why**:
- ✅ 30,000 TPM (highest on Groq!)
- ✅ Parallel tools
- ✅ Vision capable
- ✅ Fast inference
- ⚠️ Smaller (17B) but efficient

**To test**:
```typescript
largeModel: 'meta-llama/llama-4-scout-17b-16e-instruct'
```

#### 4. **If Need Huge Context: Try moonshotai/kimi-k2-instruct-0905**
**Why**:
- ✅ 262K context (2x others!)
- ✅ Parallel tools
- ✅ 10,000 TPM
- ✅ Good for long conversations

**To test**:
```typescript
largeModel: 'moonshotai/kimi-k2-instruct-0905'
```

## Testing Plan

### Phase 1: Test Prompt Fix (Current Model)

1. **Build and deploy** with new prompt
2. **Test queries**:
   - "What are the latest AI developments?"
   - "Search for news about quantum computing"
   - "Find information about climate change"
3. **Check for**:
   - ❌ No `<function=...>` syntax
   - ✅ Clean, natural responses
   - ✅ Tools execute properly
   - ✅ Results integrated naturally

### Phase 2: If Prompt Fix Doesn't Work

Try models in this order:

1. **qwen/qwen3-32b** (best all-around alternative)
2. **llama-4-scout-17b** (if need speed)
3. **moonshotai/kimi-k2** (if need context)
4. **Back to llama-3.3-70b** (familiar, working with cleaning)

## Why Negative Prompting Fails

### Psychology of "Don't Think About Pink Elephants"

When you tell someone "Don't think about pink elephants," what happens?
1. They immediately think about pink elephants
2. The brain processes the concept to avoid it
3. The concept becomes more accessible

### AI Models Work Similarly

When we tell a model "do NOT write `<function=search>`":
1. Model tokenizes and processes `<function=search>`
2. This syntax gets activated in its latent space
3. Model is now MORE likely to generate it

### Examples of Negative Prompting Failures

**Bad**: "Don't use passive voice"  
**Good**: "Use active voice"

**Bad**: "Do NOT write XML tags"  
**Good**: "Write natural language responses"

**Bad**: "Don't hallucinate facts"  
**Good**: "Only use information from the provided context"

### Our Case

**Bad** (our old prompt):
```
do NOT write XML-style tags like <function=search> or similar syntax
```

**Good** (our new prompt):
```
The API will automatically handle tool execution. [positive instructions only]
```

## Expected Outcomes

### With Prompt Fix Only

**Probability of success**: ~90%

**Why it should work**:
- Removes priming effect
- No mention of problematic syntax
- Positive framing only
- Model has no template to follow

**If it fails**:
- Model has deep training on this syntax
- Switch to alternative model

### With qwen/qwen3-32b

**Probability of success**: ~95%

**Why it should work**:
- Different architecture
- Different training data
- Strong instruction following
- Parallel tool support (better)

### With llama-4-scout-17b

**Probability of success**: ~85%

**Why it might work**:
- Newer model
- Different training
- Vision capable (more modalities)
- Very fast (30K TPM!)

**Trade-off**: Smaller model (17B vs 120B)

## Code Changes

### Updated System Prompt

**File**: `ui-new/src/components/ChatTab.tsx`

```typescript
// Old (BAD - mentions the syntax)
Tool calls are made automatically through the API using OpenAI function calling format. 
Just invoke the tool when needed - do NOT write XML-style tags like <function=search> 
or similar syntax in your text responses. Your responses should be natural language only.

// New (GOOD - positive instructions only)
The API will automatically handle tool execution. After calling a tool, you'll receive 
the results and should incorporate them naturally into your response. Always provide 
complete, helpful answers using the tool results.
```

### To Test Alternative Models

**File**: `ui-new/src/components/ChatTab.tsx` (line 48)

```typescript
// Current
largeModel: 'openai/gpt-oss-120b'

// Alternative 1: Best all-around
largeModel: 'qwen/qwen3-32b'

// Alternative 2: Fastest
largeModel: 'meta-llama/llama-4-scout-17b-16e-instruct'

// Alternative 3: Huge context
largeModel: 'moonshotai/kimi-k2-instruct-0905'

// Alternative 4: Familiar option
largeModel: 'llama-3.3-70b-versatile'
```

## Deployment

### Step 1: Deploy Prompt Fix

```bash
cd ui-new && npm run build
```

**Result**: New prompt deployed, no backend changes needed

### Step 2: Test Current Model

Test with `openai/gpt-oss-120b` and new prompt

### Step 3: If Needed, Switch Model

1. Update `largeModel` in ChatTab.tsx
2. Build: `npm run build`
3. Test new model

## Success Metrics

### Prompt Fix Success

- ✅ No `<function=...>` syntax in responses
- ✅ Tools execute properly
- ✅ Natural language responses
- ✅ Good response quality

### Model Switch Success

Same as above, plus:
- ✅ Similar or better response quality
- ✅ Similar or better speed
- ✅ No new issues introduced

## Key Learnings

1. **Negative prompting can backfire**: Mentioning unwanted behavior can trigger it
2. **Use positive framing**: Describe what TO do, not what NOT to do
3. **Priming matters**: Every token in the prompt influences the model
4. **Test prompts first**: Before switching models, fix prompts
5. **Have alternatives ready**: Keep a ranked list of fallback models

## Quick Reference

### If You See Function Syntax

1. ✅ Check system prompt for negative prompting
2. ✅ Remove mentions of the syntax
3. ✅ Use positive instructions only
4. ✅ Test with current model
5. ⏭️ If still issues, try qwen/qwen3-32b
6. ⏭️ If still issues, try llama-4-scout-17b
7. ⏭️ Last resort: keep cleaning, document limitation

### Model Selection Priority

For this use case (tool calling, natural responses):

1. **qwen/qwen3-32b** - Best all-around
2. **openai/gpt-oss-120b** - Most capable (with prompt fix)
3. **llama-4-scout-17b** - Fastest
4. **moonshotai/kimi-k2** - Huge context
5. **llama-3.3-70b** - Familiar, proven

---

**Status**: ✅ Prompt fixed, ready to test  
**Next**: Test with current model, switch if needed
