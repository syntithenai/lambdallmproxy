# Model Selection System Documentation

## Overview

The Lambda LLM Proxy includes an intelligent model selection system that automatically chooses the best LLM model for each request based on multiple factors:

- **Request complexity** (simple questions vs. reasoning tasks)
- **Cost optimization** (free vs. paid providers)
- **Rate limits** (proactive avoidance of 429 errors)
- **Model health** (automatic failover from unhealthy models)
- **Performance** (historical latency tracking)
- **Context requirements** (model capacity for long conversations)

## Architecture

```
User Request
    ↓
[Request Analysis] → Classify: SIMPLE | COMPLEX | REASONING | CREATIVE | TOOL_HEAVY
    ↓
[Category Recommendation] → Suggest: SMALL | LARGE | REASONING
    ↓
[Filtering Pipeline]
├── Context Window Filter (can model handle the conversation?)
├── Rate Limit Filter (is model available now?)
├── Health Filter (has model been reliable?)
└── Cost Filter (within budget constraints)
    ↓
[Strategy Application] → cheap | balanced | powerful | fastest
    ↓
[Round-Robin Selection] (distribute load across equivalent models)
    ↓
[Fallback Logic] (if primary fails, try alternatives)
    ↓
Selected Model → Make Request
```

## Optimization Modes

### 💰 Cheap Mode (default)
**Best for:** Cost-conscious users, high-volume usage

**Behavior:**
- Prioritizes free providers (Groq, Gemini) first
- Within free tier, prefers smallest capable models
- Saves large context models (gemini-2.0-flash 2M) for requests that truly need them
- Falls back to paid providers only when free providers are rate-limited
- Shorter max_tokens (50% of standard)
- Reduced search results (3 instead of 5)
- Aggressive content truncation

**Model Priority:**
1. llama-3.1-8b-instant (Groq free)
2. llama-3.3-70b-versatile (Groq free - for complex tasks)
3. gemini-2.0-flash (Gemini free - for large context)
4. gpt-4o-mini (OpenAI - cheapest paid fallback)

**Example:**
```
User: "What is the capital of France?"
→ llama-3.1-8b-instant (fast, free, sufficient for simple facts)
```

### ⚖️ Balanced Mode
**Best for:** General use, quality-conscious but cost-aware

**Behavior:**
- Optimizes cost-per-quality ratio
- Free tier when quality is equivalent to paid
- Paid models when quality difference is significant
- Considers request complexity:
  - Simple tasks → Free tier
  - Reasoning/complex tasks → Paid models (gpt-4o-mini, gemini-2.5-flash)
- Standard max_tokens (100% of standard)
- Standard search results (5)
- Balanced content truncation

**Cost-Per-Quality Formula:**
```
score = avgCost / (contextWindow / 100000)
Lower score = better value
```

**Example:**
```
User: "Analyze this 10-page document and summarize key themes"
→ gemini-2.5-flash (paid but cheap, excellent quality for analysis)

User: "What is 2+2?"
→ llama-3.1-8b-instant (free, sufficient for simple math)
```

### 💪 Powerful Mode
**Best for:** Research, complex analysis, coding tasks

**Behavior:**
- Prioritizes best available models
- Reasoning models (o1, deepseek-r1) get highest priority for complex analysis
- Within paid tier, sorts by cost (higher cost = better quality)
- Prefers:
  - GPT-4o, o1-preview for complex reasoning
  - Gemini 2.5 Pro for long context analysis
  - DeepSeek-R1 for mathematical/logical reasoning
- Longer max_tokens (150% of standard)
- Maximum search results (10 for large context models)
- Generous content truncation limits

**Model Priority (by request type):**
1. **Reasoning Tasks:** o1-preview > deepseek-r1 > o1-mini
2. **Complex Tasks:** gpt-4o > gemini-2.5-pro > llama-3.3-70b
3. **Simple Tasks:** gpt-4o-mini > gemini-2.5-flash

**Example:**
```
User: "Solve this complex optimization problem: ..."
→ o1-preview (reasoning model, best for complex problem-solving)

User: "Write a detailed analysis of quantum computing"
→ gpt-4o (high capability, large context, excellent quality)
```

### ⚡ Fastest Mode
**Best for:** Interactive sessions, real-time applications

**Behavior:**
- Uses historical response time data
- Prioritizes models with lowest latency
- Typical speed ranking: Groq >> Gemini > Together > OpenAI
- May sacrifice some quality for speed on simple requests
- Moderate max_tokens (70% of standard)
- Reduced search results (3)
- Moderate content truncation

**Provider Latency (typical):**
- **Groq:** 50-200ms time-to-first-token (fastest)
- **Gemini:** 200-500ms
- **Together:** 300-600ms
- **OpenAI:** 500-1000ms

**Example:**
```
User: "Quick question: what time is it in Tokyo?"
→ llama-3.1-8b-instant on Groq (sub-100ms response)
```

## Request Analysis

The system automatically classifies requests into 5 types:

### SIMPLE
**Characteristics:**
- Short questions (< 200 chars)
- Single sentence
- Fact-based queries
- No tools required

**Recommended Models:** Small models (7B-32B)

**Examples:**
- "What is the capital of France?"
- "Convert 100 USD to EUR"
- "When was Python created?"

### COMPLEX
**Characteristics:**
- Multi-paragraph prompts (> 500 chars)
- Analysis or explanation requests
- Multiple sub-questions
- May involve tools

**Recommended Models:** Large models (70B+)

**Examples:**
- "Analyze these quarterly financial reports..."
- "Compare and contrast React vs Vue..."
- "Explain quantum entanglement in detail..."

### REASONING
**Characteristics:**
- Math problems
- Logical puzzles
- Step-by-step problem solving
- Keywords: "calculate", "prove", "derive", "solve"

**Recommended Models:** Reasoning models (o1, deepseek-r1)

**Examples:**
- "Solve: If train A leaves at 2pm..."
- "Prove by mathematical induction..."
- "What is the optimal strategy for..."

### CREATIVE
**Characteristics:**
- Story writing
- Content generation
- Creative tasks
- Keywords: "write", "create", "imagine", "story"

**Recommended Models:** Large models with high creativity

**Examples:**
- "Write a short story about..."
- "Create a marketing campaign for..."
- "Imagine a world where..."

### TOOL_HEAVY
**Characteristics:**
- Web search required
- API calls needed
- Multi-step workflows
- Tool usage detected

**Recommended Models:** Models with strong tool-calling support

**Examples:**
- "Search for recent news about AI"
- "Get weather and recommend activities"
- "Find YouTube videos about Python"

## Model Categories

### SMALL (7B-32B parameters)
**Best for:** Simple tasks, quick responses, cost optimization

**Models:**
- llama-3.1-8b-instant (Groq free)
- gpt-4o-mini (OpenAI)
- gemini-2.5-flash (Gemini)

**Typical Use Cases:**
- Fact-based questions
- Simple translations
- Basic content generation
- Quick summaries

### LARGE (70B+ parameters)
**Best for:** Complex analysis, detailed explanations, creative writing

**Models:**
- llama-3.3-70b-versatile (Groq free)
- gpt-4o (OpenAI)
- gemini-2.5-pro (Gemini)
- deepseek-v3 (Atlas Cloud)

**Typical Use Cases:**
- In-depth analysis
- Long-form content
- Complex reasoning (non-math)
- Multi-topic conversations

### REASONING (specialized)
**Best for:** Mathematical problems, logical reasoning, step-by-step solutions

**Models:**
- o1-preview (OpenAI - best)
- o1-mini (OpenAI - faster)
- deepseek-r1 (Atlas Cloud)

**Typical Use Cases:**
- Mathematical proofs
- Optimization problems
- Logical puzzles
- Code debugging with formal reasoning

## Rate Limiting

### Proactive Checking
Before making a request, the system checks:
1. **Remaining capacity:** Are we within RPM/TPM limits?
2. **Recent history:** Have we been making too many requests?
3. **429 status:** Is the model temporarily unavailable?

If unavailable, the system automatically tries fallback models.

### Reactive Tracking
After each response:
1. **Parse headers:** Extract x-ratelimit-* and x-goog-quota-* headers
2. **Update state:** Track remaining requests/tokens
3. **Record usage:** Add to rolling window history
4. **Calculate reset:** Determine when limits will refresh

### Rate Limit Tiers

**Groq Free:**
- 30 requests per minute
- 6,000 tokens per minute
- Resets every 60 seconds

**Gemini Free:**
- 15 requests per minute
- 1,000,000 tokens per minute
- Resets every 60 seconds

**OpenAI (varies by model):**
- gpt-4o: 10,000 RPM, 2,000,000 TPM
- gpt-4o-mini: 500 RPM, 200,000 TPM
- o1-preview: 500 RPM, 100,000 TPM

## Health Tracking

The system monitors model health and automatically avoids unhealthy models:

### Health Score (0-100)
- **Success Rate (70 points):** Percentage of successful requests
- **Error Penalty (30 points):** Consecutive errors reduce score
- **Threshold:** Models with score < 30 are considered unhealthy

### Health Status
```
100-50: Healthy (✅) - Use normally
49-10:  Degraded (⚠️) - Use with caution
9-0:    Unhealthy (❌) - Avoid, use fallback
```

**Unhealthy Conditions:**
- 3+ consecutive errors, OR
- Health score < 10

### Consecutive Error Handling
- **1-2 errors:** Continue using, monitor
- **3+ errors:** Mark unhealthy, switch to fallback
- **Recovery:** After 10 successful requests from other models, retry

## Performance Tracking

### Metrics Collected
- **Time to First Token (TTFT):** Latency until first response chunk
- **Total Duration:** Complete request time
- **Sample Size:** Last 20 requests for rolling average

### Speed Optimization
In "fastest" mode, models are sorted by:
1. Historical TTFT (if available)
2. Provider heuristics (Groq > Gemini > OpenAI)
3. Model size (smaller = faster)

## Content Optimization

### Dynamic max_tokens
Automatically adjusts based on:
- **Model capability:** Uses model's maxOutput
- **Optimization mode:** cheap=0.5x, balanced=1.0x, powerful=1.5x
- **Request type:** SIMPLE=2k, COMPLEX=8k, REASONING=16k
- **Rate limit headroom:** Reduces if approaching limits

### Search Result Count
- **Cheap mode:** 3 results
- **Balanced mode:** 5 results
- **Powerful mode:** 10 results (for large context models)

### Content Truncation
- **Cheap mode:** 5,000 chars per page
- **Balanced mode:** 10,000 chars per page
- **Powerful mode:** 100,000+ chars (for gemini 2M context)

## Fallback Strategy

When a model fails, the system tries:

1. **Alternative models on same provider** (if rate-limited)
2. **Different provider types** (prioritize different provider families)
3. **Downgrade to smaller models** (if context too large)
4. **Simple heuristic selection** (final fallback)

### Example Fallback Chain
```
Primary: gpt-4o (OpenAI)
    ↓ (rate limited)
Fallback 1: gpt-4o-mini (OpenAI - same provider, smaller)
    ↓ (still rate limited)
Fallback 2: gemini-2.5-pro (Gemini - different provider)
    ↓ (unavailable)
Fallback 3: llama-3.3-70b (Groq free - different provider family)
    ↓ (rate limited)
Fallback 4: llama-3.1-8b-instant (Groq free - smallest available)
```

## Configuration

### UI Settings
Users can configure in Settings → Provider tab:

**Optimization Preference:**
- 💰 Cheap (default)
- ⚖️ Balanced
- 💪 Powerful
- ⚡ Fastest

**Provider Configuration:**
- Enable/disable specific providers
- Add API keys for paid providers
- Set custom rate limits (advanced)

### API Request
```javascript
POST /chat
{
  "messages": [...],
  "optimization": "cheap",  // or "balanced", "powerful", "fastest"
  "providers": [...]
}
```

## Monitoring & Debugging

### Logs
The system logs detailed selection decisions:

```
🎯 Model selection optimization: cheap
🔍 Request analysis: type=SIMPLE, tokens=150, hasTools=false
📊 Category recommendation: SMALL
✅ Filtered candidates: 5 models pass rate limits
🏥 Health filter: 4 healthy models available
💰 Cheap mode: prioritizing free tier
✅ Selected: llama-3.1-8b-instant (groq-free)
⏱️ Time to first token: 87ms
📊 Updated rate limit state: 29/30 RPM remaining
```

### Transparency Info
The UI displays:
- Selected model and provider
- Estimated token usage
- Cost per request
- Rate limit status
- Health score
- Performance metrics (TTFT, duration)

## Best Practices

### For Cost Optimization
1. Use "cheap" mode by default
2. Enable multiple free providers (Groq + Gemini)
3. Set reasonable max_tokens (don't request 16k if you need 2k)
4. Use search result optimization (fewer results for simple queries)

### For Quality
1. Use "powerful" mode for important tasks
2. Ensure paid provider API keys are configured
3. Provide clear, detailed prompts
4. Use appropriate tools when needed

### For Speed
1. Use "fastest" mode for real-time interactions
2. Prefer Groq provider (typically 50-100ms TTFT)
3. Use small models for simple queries
4. Enable multiple providers for load distribution

### For Reliability
1. Configure multiple providers (redundancy)
2. Monitor health scores
3. Set up fallback chains
4. Review logs for consistent failures

## Troubleshooting

### All Models Rate Limited
**Symptom:** "All models are rate limited" error

**Solutions:**
1. Wait for limits to reset (usually 1 minute)
2. Add more providers (spread load)
3. Switch to paid providers
4. Reduce request frequency

### Slow Responses
**Symptom:** Long wait for first token

**Solutions:**
1. Use "fastest" optimization mode
2. Switch to Groq provider
3. Use smaller models for simple tasks
4. Check network latency to Lambda

### Wrong Model Selected
**Symptom:** Expensive model chosen for simple task

**Solutions:**
1. Check optimization mode (should be "cheap" or "balanced")
2. Review request complexity (is prompt too long?)
3. Check if free providers are rate-limited
4. Verify provider configuration

### Consistent Failures
**Symptom:** Same model fails repeatedly

**Solutions:**
1. Check health scores (model may be marked unhealthy)
2. Verify API key is valid
3. Check provider status page
4. Review error logs for specific issues
5. Disable problematic provider temporarily

## Advanced Features

### Custom Strategies
For advanced users, the selection logic can be extended:

```javascript
// In selector.js
const CustomStrategy = {
  // Your strategy logic
  CUSTOM_BALANCED: 'custom_balanced'
};

// Add to strategy switch
case CustomStrategy.CUSTOM_BALANCED:
  candidates = yourCustomLogic(candidates);
  break;
```

### Cost Budgets (Future)
Track spending and enforce budgets:
- Set daily/monthly cost limits
- Auto-switch to cheaper models near limits
- Alert when budget exceeded
- Track per-user or per-project costs

### Provider Dashboard (Future)
UI component showing:
- Real-time rate limit status
- Health scores per model
- Average response times
- Recent errors and recovery status
- Cost tracking over time

## API Reference

### Core Functions

**selectModel(options)**
```javascript
const selection = selectModel({
  messages: ChatMessage[],
  tools: Tool[],
  catalog: ProviderCatalog,
  rateLimitTracker: RateLimitTracker,
  preferences: {
    strategy: SelectionStrategy,
    preferFree: boolean,
    maxCostPerMillion: number
  },
  roundRobinSelector: RoundRobinSelector,
  max_tokens: number
});

// Returns:
{
  model: SelectedModel,
  category: 'SMALL' | 'LARGE' | 'REASONING',
  analysis: RequestAnalysis,
  candidateCount: number,
  totalTokens: number,
  inputTokens: number,
  outputTokens: number
}
```

**analyzeRequest(options)**
```javascript
const analysis = analyzeRequest({
  messages: ChatMessage[],
  tools: Tool[],
  max_tokens: number
});

// Returns:
{
  type: 'SIMPLE' | 'COMPLEX' | 'REASONING' | 'CREATIVE' | 'TOOL_HEAVY',
  complexity: number,
  requiresReasoning: boolean,
  requiresLargeContext: boolean,
  hasTools: boolean,
  estimatedTokens: number
}
```

**RateLimitTracker Methods**
```javascript
// Check availability
tracker.isAvailable(provider, model, tokens);

// Update from headers
tracker.updateFromHeaders(provider, model, headers);

// Track request
tracker.trackRequest(provider, model, tokens);

// Record 429 error
tracker.updateFrom429(provider, model, retryAfter);

// Record performance
tracker.recordPerformance(provider, model, { timeToFirstToken, totalDuration });

// Get health score
const score = tracker.getHealthScore(provider, model);

// Filter models by health
const healthy = tracker.filterByHealth(models);

// Sort by speed
const fastest = tracker.sortBySpeed(models);
```

## Version History

- **v1.0.1** (2025-10-12): Enhanced rate limiting, optimization modes, health tracking
- **v1.0.0** (2025-10-09): Initial sophisticated model selection implementation

## Support

For issues or questions:
1. Check logs for detailed selection decisions
2. Review this documentation
3. Check provider status pages
4. File issue on GitHub with logs

---

*This system is designed to make model selection automatic, cost-effective, and reliable. The defaults work well for most use cases, but can be customized for specific needs.*
