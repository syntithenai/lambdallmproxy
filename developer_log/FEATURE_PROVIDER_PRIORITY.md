# Provider Priority System

## Overview

The priority system allows fine-grained control over provider and model selection across **all endpoints** (chat, embeddings, transcription, image generation) using the `LP_PRIORITY_X` environment variable.

## Environment Variable Format

```bash
LP_PRIORITY_0=1   # Highest priority
LP_PRIORITY_1=50  # Medium priority  
LP_PRIORITY_2=100 # Default priority (if not specified)
LP_PRIORITY_3=200 # Lower priority
```

**Key Points:**
- Priority numbers can be any positive integer (1-999)
- **Lower numbers = Higher priority**
- Priority 1 = highest priority (selected first)
- Priority 999 = lowest priority (selected last)
- Default priority = 100 (if `LP_PRIORITY_X` not specified)
- The `X` must match the index of other `LP_*_X` variables

## Complete Example

```bash
# OpenAI - Highest priority for production workloads
LP_TYPE_0=openai
LP_KEY_0=sk-...
LP_PRIORITY_0=1

# Groq Free - High priority for cost optimization
LP_TYPE_1=groq-free
LP_KEY_1=gsk_...
LP_PRIORITY_1=10

# Gemini Free - Medium priority as fallback
LP_TYPE_2=gemini-free
LP_KEY_2=AIza...
LP_PRIORITY_2=50

# Custom OpenAI-compatible - Low priority (experimental)
LP_TYPE_3=openai-compatible
LP_KEY_3=custom_key
LP_ENDPOINT_3=https://custom-api.example.com/v1
LP_PRIORITY_3=200
```

## How Priority Works Across Endpoints

### 1. Chat Endpoint (`/chat`)

**Selection Process:**
1. **Request Analysis**: Analyze complexity, token requirements, reasoning needs
2. **Category Selection**: Determine model category (SMALL, LARGE, REASONING)
3. **Candidate Filtering**: 
   - Filter by category
   - Filter by context window requirements
   - Filter by rate limits (exclude rate-limited providers)
   - Filter by cost constraints (if specified)
4. **Strategy-Based Sorting**:
   - `cheap` mode: Free tier first, then by cost
   - `balanced` mode: Optimize cost-per-quality ratio
   - `powerful` mode: Best quality first
   - `fastest` mode: Lowest latency first
5. **Priority Sorting**: Within each strategy tier, sort by priority
6. **Final Selection**: Pick first model from sorted list

**Priority Application:**
- Priority sorting is applied **AFTER** strategy-based sorting
- Within the same priority tier, strategy-based order is maintained
- This means priority acts as the **primary discriminator** when multiple models are equally suitable

**Example Scenarios:**

**Scenario 1: Simple Request with `cheap` mode**
```
Available models after filtering:
- llama-3.3-70b (groq-free, priority=10, free=true)
- gemini-2.5-flash (gemini-free, priority=50, free=true)
- gpt-4o-mini (openai, priority=1, free=false)

Strategy sorting (cheap): Free tier first
→ llama-3.3-70b, gemini-2.5-flash, gpt-4o-mini

Priority sorting: Lower priority number first
→ gemini-2.5-flash (p50), llama-3.3-70b (p10), gpt-4o-mini (p1)

Selected: gemini-2.5-flash ❌ WRONG!

Wait, priority should be WITHIN free tier:
Free tier: [llama-3.3-70b (p10), gemini-2.5-flash (p50)]
→ Priority sort: llama-3.3-70b (p10) comes first
Paid tier: [gpt-4o-mini (p1)]

Final order: llama-3.3-70b (p10), gemini-2.5-flash (p50), gpt-4o-mini (p1)
Selected: llama-3.3-70b ✅
```

**Scenario 2: Complex Request with `powerful` mode**
```
Available models:
- gpt-4o (openai, priority=1, cost=high)
- claude-3.5-sonnet (anthropic, priority=5, cost=high)
- llama-3.3-70b (groq-free, priority=10, cost=free)

Strategy sorting (powerful): Quality first (higher cost = better quality)
→ gpt-4o, claude-3.5-sonnet, llama-3.3-70b

Priority sorting: Within same quality tier
→ gpt-4o (p1), claude-3.5-sonnet (p5), llama-3.3-70b (p10)

Selected: gpt-4o ✅
```

### 2. Embeddings Endpoint (`/rag/embed`)

**Selection Process:**
1. Filter providers with embedding capability
2. Match requested embedding model (if specified)
3. Sort by priority
4. Select first available provider

**Priority Impact:**
- When multiple providers offer the same embedding model
- Priority determines which provider's API key is used
- Lower priority number = preferred provider

**Example:**
```bash
# OpenAI embeddings - highest priority
LP_TYPE_0=openai
LP_KEY_0=sk-...
LP_PRIORITY_0=1

# Voyage AI embeddings - fallback
LP_TYPE_1=voyage
LP_KEY_1=voyage_...
LP_PRIORITY_1=50

Request: { "model": "text-embedding-3-small" }
→ Uses OpenAI (p1) instead of failing over to Voyage
```

### 3. Transcription Endpoint (`/transcribe`)

**Selection Process:**
1. Filter providers with Whisper transcription support (Groq, OpenAI)
2. Prefer free providers (Groq) over paid (OpenAI)
3. Sort by priority within each tier
4. Select first available

**Priority Impact:**
```bash
# Groq Free - free transcription
LP_TYPE_0=groq-free
LP_KEY_0=gsk_...
LP_PRIORITY_0=10

# OpenAI - paid transcription
LP_TYPE_1=openai
LP_KEY_1=sk-...
LP_PRIORITY_1=1

Selection:
Free tier: [groq-free (p10)]
Paid tier: [openai (p1)]

→ Selects groq-free (p10) because free tier has higher precedence
→ Priority is used as tie-breaker within free tier
```

### 4. Image Generation Endpoint (`/generate-image`)

**Selection Process:**
1. Determine quality tier (fast/standard/high/ultra)
2. Filter providers by quality capability
3. Check rate limits and cost constraints
4. Sort by priority
5. Select first available

**Priority Impact:**
```bash
# Together AI - fast/standard quality
LP_TYPE_0=together
LP_KEY_0=...
LP_IMAGE_MAX_QUALITY_0=standard
LP_PRIORITY_0=1

# OpenAI - all quality tiers
LP_TYPE_1=openai
LP_KEY_1=sk-...
LP_PRIORITY_1=50

Request: { "quality": "standard" }
Available: [together (p1), openai (p50)]
→ Selects together (p1)

Request: { "quality": "high" }
Available: [openai (p50)]  # together filtered out
→ Selects openai (p50)
```

## UI Integration: Provider List Ordering

The UI allows users to reorder providers using arrow buttons. The list order maps to priority values:

**Mapping Logic:**
```typescript
// Top of list = priority 1
// Second = priority 2
// Third = priority 3
// etc.

providers.forEach((provider, index) => {
  provider.priority = index + 1;
});
```

**Example UI State:**
```
┌─────────────────────────────────┐
│ ↑ ↓  OpenAI (sk-...)            │ → Priority 1
│ ↑ ↓  Groq Free (gsk_...)        │ → Priority 2
│ ↑ ↓  Gemini Free (AIza...)      │ → Priority 3
│ ↑ ↓  Custom Provider (...)      │ → Priority 4
└─────────────────────────────────┘
```

When user clicks ↑ on "Groq Free":
```
┌─────────────────────────────────┐
│ ↑ ↓  Groq Free (gsk_...)        │ → Priority 1 ⬅️ moved up
│ ↑ ↓  OpenAI (sk-...)            │ → Priority 2
│ ↑ ↓  Gemini Free (AIza...)      │ → Priority 3
│ ↑ ↓  Custom Provider (...)      │ → Priority 4
└─────────────────────────────────┘
```

## Priority vs Strategy: Which Takes Precedence?

**Answer: Strategy THEN Priority**

The selection logic follows this hierarchy:

1. **Filter Phase**: Remove unavailable models (rate limited, wrong category, insufficient context)
2. **Strategy Phase**: Sort by strategy-specific criteria
   - `cheap`: Free tier > paid, cost-optimized
   - `powerful`: Quality/cost > capability
   - `balanced`: Cost-per-quality ratio
   - `fastest`: Latency/speed metrics
3. **Priority Phase**: Stable sort by priority number (maintains strategy order within same priority)
4. **Selection Phase**: Pick first model

**Why This Order?**

- **Strategy** reflects the **user's immediate intent** for this request
- **Priority** reflects the **administrator's long-term preferences** for provider selection
- Priority acts as a tie-breaker when multiple models are equally suitable per strategy
- This allows strategy to optimize for request needs while priority controls provider preference

**Example: Cheap Mode with Mixed Priorities**
```
Request: Simple chat with 'cheap' optimization

Before filtering:
- gpt-4o (openai, p1, paid, $15/MTok)
- llama-3.3-70b (groq-free, p10, free)
- gemini-2.5-flash (gemini-free, p50, free)
- claude-3.5-haiku (anthropic, p5, paid, $1/MTok)

After strategy sort (cheap = free first):
FREE TIER:
  - llama-3.3-70b (p10)
  - gemini-2.5-flash (p50)
PAID TIER:
  - claude-3.5-haiku (p5, $1/MTok)
  - gpt-4o (p1, $15/MTok)

After priority sort within each tier:
FREE TIER:
  - llama-3.3-70b (p10) ⬅️ Lower priority number
  - gemini-2.5-flash (p50)
PAID TIER:
  - gpt-4o (p1) ⬅️ Lower priority number
  - claude-3.5-haiku (p5)

Final order: llama-3.3-70b, gemini-2.5-flash, gpt-4o, claude-3.5-haiku

Selected: llama-3.3-70b ✅
```

## Best Practices

### 1. **Production Priorities**
```bash
# Mission-critical: High-reliability paid providers
LP_PRIORITY_0=1   # OpenAI
LP_PRIORITY_1=5   # Anthropic

# Cost-optimized: Free tier providers  
LP_PRIORITY_2=50  # Groq Free
LP_PRIORITY_3=51  # Gemini Free

# Experimental: Custom providers
LP_PRIORITY_4=200 # Custom endpoint
```

### 2. **Development Priorities**
```bash
# Fast iteration: Free providers first
LP_PRIORITY_0=1   # Groq Free (fastest free tier)
LP_PRIORITY_1=10  # Gemini Free (2M context)

# Fallback: Paid providers
LP_PRIORITY_2=100 # OpenAI
```

### 3. **Cost-Conscious Setup**
```bash
# Maximize free tier usage
LP_PRIORITY_0=1   # Groq Free
LP_PRIORITY_1=2   # Gemini Free
LP_PRIORITY_2=3   # Together Free

# Paid fallback only when necessary
LP_PRIORITY_3=100 # OpenAI (expensive, use sparingly)
```

### 4. **Quality-First Setup**
```bash
# Best models first
LP_PRIORITY_0=1   # GPT-4o (OpenAI)
LP_PRIORITY_1=2   # Claude 3.5 Sonnet (Anthropic)

# Good models as fallback
LP_PRIORITY_2=50  # Gemini 2.5 Pro

# Fast/cheap for simple requests
LP_PRIORITY_3=100 # Groq Free
```

## Common Pitfalls

### ❌ Pitfall 1: Forgetting Priority Applies Per-Provider-Type
```bash
# WRONG: Two Groq Free instances
LP_TYPE_0=groq-free
LP_KEY_0=gsk_1...
LP_PRIORITY_0=1

LP_TYPE_1=groq-free  # ❌ Same provider type
LP_KEY_1=gsk_2...
LP_PRIORITY_1=50

# What happens: Both get expanded into multiple models
# Priority applied at provider level, not model level
# This creates confusion - use separate keys or round-robin instead
```

### ❌ Pitfall 2: Priority Doesn't Override Strategy
```bash
LP_TYPE_0=openai
LP_PRIORITY_0=1  # Highest priority

LP_TYPE_1=groq-free
LP_PRIORITY_1=100  # Lowest priority

# User requests 'cheap' mode
# Result: groq-free selected (free tier beats paid)
# Priority 1 doesn't force OpenAI usage
```

**Fix**: Use `powerful` mode or set cost constraints

### ❌ Pitfall 3: Gaps in Priority Numbers Don't Matter
```bash
LP_PRIORITY_0=1
LP_PRIORITY_1=1000  # ❌ Unnecessarily large

# Both work the same as:
LP_PRIORITY_0=1
LP_PRIORITY_1=2

# Use small sequential numbers for readability
```

## Monitoring and Debugging

### Log Messages

When priority is applied, you'll see:
```
🎯 Applied priority-based sorting (LP_PRIORITY_X)
   Priority order: llama-3.3-70b(p10), gemini-2.5-flash(p50), gpt-4o(p1)

🎯 Model selected: {
  model: 'llama-3.3-70b-versatile',
  provider: 'groq-free',
  priority: 10,
  ...
}
```

### Verification

Check environment variables:
```bash
env | grep LP_PRIORITY
```

Check CloudWatch logs:
```bash
make logs | grep -A5 "Priority order"
```

## Summary

The priority system provides **administrator-level control** over provider preferences while respecting **user-level strategy choices**:

- **Strategy** = "How should I optimize this specific request?"
- **Priority** = "Which providers do I trust/prefer overall?"

Priority is **global** (applies to all endpoints) and **stable** (maintains strategy-based order within same priority tier).

Use priority to:
1. ✅ Control provider preference when multiple options exist
2. ✅ Implement cost policies (free tier > paid)
3. ✅ Ensure reliability (production > experimental)
4. ✅ Manage fallback chains

Don't use priority to:
1. ❌ Override strategy-based selection
2. ❌ Force specific models (use model pinning instead)
3. ❌ Replace rate limit handling
