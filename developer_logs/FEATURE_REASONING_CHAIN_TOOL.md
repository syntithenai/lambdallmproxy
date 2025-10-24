# Feature: Deep Reasoning Chain Generator Tool

## Overview
Implemented a powerful `generate_reasoning_chain` tool that uses advanced reasoning models (o1-preview, DeepSeek-R1) with **MAXIMUM reasoning depth** to generate comprehensive step-by-step reasoning chains. The tool can autonomously call other tools during reasoning and executes them in **parallel for maximum speed** (but also maximum token consumption).

## Implementation Date
2025-01-XX (Current Session)

## Components Modified

### Backend Implementation

#### 1. Tool Definition (`src/tools.js` line ~733-762)
Added OpenAI function schema for `generate_reasoning_chain` tool:
- **Tool Name**: `generate_reasoning_chain`
- **Description**: Comprehensive warnings about EXTREME token usage (10-50x) and parallel async tool calling
- **Parameters**: 
  - `user_query` (required): Original user query requiring deep reasoning
  - `llm_responses` (optional array): Previous conversation context
  - `reasoning_goal` (optional): Specific reasoning objective
- **Safeguards**: 
  - Multiple explicit warnings about 10-50x token consumption
  - Clear guidance on when to use vs avoid
  - Mention of reasoning + output token charges
  - Parallel asynchronous tool execution warnings

```javascript
{
  type: 'function',
  function: {
    name: 'generate_reasoning_chain',
    description: '🧠 **DEEP REASONING CHAIN GENERATOR**: ⚠️ **EXTREME TOKEN USAGE WARNING** - This tool uses advanced reasoning models (o1-preview, DeepSeek-R1) with MAXIMUM reasoning depth to generate comprehensive step-by-step reasoning chains. **CRITICAL WARNINGS**: (1) Can consume 10-50x MORE tokens than normal responses due to extended thinking process, (2) May trigger PARALLEL ASYNCHRONOUS TOOL CALLS during reasoning, causing rapid token consumption, (3) Reasoning models charge for both reasoning tokens AND output tokens...',
    parameters: {
      type: 'object',
      properties: {
        user_query: {
          type: 'string',
          description: 'The original user query or question that requires deep reasoning analysis'
        },
        llm_responses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of previous LLM responses in the conversation to provide context for reasoning'
        },
        reasoning_goal: {
          type: 'string',
          description: 'Optional: Specific reasoning objective (e.g., "verify mathematical correctness", "identify logical fallacies", "generate step-by-step proof"). If omitted, generates general comprehensive reasoning chain.'
        }
      },
      required: ['user_query'],
      additionalProperties: false
    }
  }
}
```

#### 2. Tool Execution Handler (`src/tools.js` line ~3964-4141)
Added `case 'generate_reasoning_chain'` with full implementation:
- **Reasoning Model Selection**: Prefers DeepSeek-R1 via OpenRouter, falls back to o1-preview
- **Maximum Reasoning Depth**: Sets `reasoningEffort: 'high'` for deepest analysis
- **Context Building**: Includes previous LLM responses for continuity
- **Tool Access**: Provides ALL tools except generate_reasoning_chain itself (prevents recursion)
- **Parallel Execution**: Uses `Promise.all()` for embedded tool calls (⚠️ rapid token consumption)
- **Event Streaming**: Emits SSE progress events (starting, reasoning, executing_embedded_tools, completed, error)
- **Result Injection**: Returns reasoning chain with all embedded tool results included

Key implementation details:
```javascript
case 'generate_reasoning_chain': {
  // Select reasoning model (prefer DeepSeek-R1)
  const reasoningModel = context.model && context.model.includes('o1') 
    ? context.model 
    : 'openrouter:deepseek-ai/DeepSeek-R1';
  
  // Build prompt with context
  const reasoningPrompt = `You are a deep reasoning assistant. Your task is to generate a comprehensive, transparent reasoning chain for the following query.

**User Query**: ${userQuery}
**Reasoning Goal**: ${reasoningGoal}
${contextSection}

**Instructions**:
1. Think step-by-step through the problem
2. Show your reasoning process explicitly
3. If you need additional information, you can call tools...
4. Identify assumptions and uncertainties
5. Consider alternative approaches
6. Arrive at a well-reasoned conclusion`;
  
  // Get all tools except this one (prevent recursion)
  const toolsForReasoning = allTools.filter(t => 
    t.function && t.function.name !== 'generate_reasoning_chain'
  );
  
  // Call LLM with MAXIMUM reasoning depth
  const reasoningResponse = await llmResponsesWithTools({
    model: reasoningModel,
    input: messages,
    tools: toolsForReasoning,
    options: {
      reasoningEffort: 'high', // MAXIMUM reasoning depth
      max_tokens: 8192,
      temperature: 0.7
    }
  });
  
  // Execute embedded tool calls in PARALLEL (⚠️ token explosion risk)
  const toolPromises = reasoningResponse.toolCalls.map(async (toolCall) => {
    return await callFunction(toolName, toolArgs, context);
  });
  const toolResults = await Promise.all(toolPromises);
}
```

### Frontend Implementation

#### 3. Settings Modal UI (`ui-new/src/components/SettingsModal.tsx`)
Added checkbox with **EXTREME WARNING** styling:
- **Location**: After `ask_llm` tool checkbox
- **Default State**: `false` (disabled by default)
- **Visual Design**: 
  - Red border (border-3) and background highlighting
  - "⚠️⚠️ EXTREME TOKEN USAGE" badge with **animate-pulse**
  - Shadow effect for prominence
  - Large detailed warning box with critical points
  - Different styling from ask_llm to emphasize higher severity
- **Warning Text**: 
  > "🚨 CRITICAL WARNINGS:
  > • Can consume 10-50x MORE tokens than normal responses
  > • Uses maximum reasoning depth - models think extensively before responding
  > • May trigger PARALLEL ASYNCHRONOUS TOOL CALLS causing rapid token consumption
  > • Reasoning models charge for both reasoning AND output tokens
  > 
  > USE ONLY FOR: Complex problems requiring deep logical analysis, multi-step proofs, mathematical derivations, or strategic planning where explicit reasoning transparency is essential."

#### 4. EnabledTools Interface Updates
Updated TypeScript interfaces in 3 files:
- `ui-new/src/components/SettingsModal.tsx` (line 12)
- `ui-new/src/components/ChatTab.tsx` (line 52)
- `ui-new/src/App.tsx` (line 44)

Added `generate_reasoning_chain: boolean` field to all `EnabledTools` interfaces.

#### 5. Default Settings (`ui-new/src/App.tsx` line 44-68)
Set default value to `false` with explanatory comment:
```typescript
generate_reasoning_chain: false // Deep reasoning chains - DISABLED by default due to EXTREME token usage
```

## Architecture

### Reasoning Flow
```
User → LLM detects need for deep reasoning
     → Calls generate_reasoning_chain tool
          → Tool selects reasoning model (DeepSeek-R1 or o1-preview)
               → Sets reasoningEffort: 'high' (MAXIMUM depth)
               → Model thinks extensively (reasoning tokens charged)
               → Reasoning chain may call tools autonomously:
                    → search_web, execute_javascript, scrape_web_content, etc.
                    → Tools execute in PARALLEL via Promise.all()
                    → ⚠️ Can cause rapid token consumption spike
               → Returns reasoning chain text + all tool results
          → Tool injects embedded results into response
     → LLM receives complete reasoning with evidence
→ User gets transparent step-by-step reasoning chain
```

### Parallel Tool Execution
Unlike sequential execution, embedded tools run **simultaneously**:
```javascript
// PARALLEL EXECUTION (current implementation)
const toolPromises = toolCalls.map(async (toolCall) => {
  return await callFunction(toolName, toolArgs, context);
});
const toolResults = await Promise.all(toolPromises); // All execute at once

// ⚠️ If reasoning calls 5 tools simultaneously:
// - 5 search_web calls → 5 concurrent web searches
// - 5 scrape_web_content calls → 5 concurrent page fetches
// - 5 execute_javascript calls → 5 concurrent code executions
// Result: MASSIVE token consumption in seconds
```

### Recursion Prevention
1. **Tool Filtering**: `generate_reasoning_chain` excluded from tools available to reasoning model
2. **No Iteration Limit**: Unlike ask_llm, reasoning runs to completion (controlled by model's reasoning depth)
3. **Single Call**: Returns complete reasoning chain in one response

### SSE Events
The tool emits the following Server-Sent Events:
- `reasoning_chain_progress` with `phase: 'starting'`
- `reasoning_chain_progress` with `phase: 'reasoning'` (includes model name)
- `reasoning_chain_progress` with `phase: 'executing_embedded_tools'` (includes tool count)
- `reasoning_chain_progress` with `phase: 'completed'` (includes reasoning length, embedded tool count)
- `reasoning_chain_progress` with `phase: 'error'` (on failure)

## Reasoning Models

### Supported Models
1. **OpenAI o1-preview** (`openai:o1-preview`)
   - Native reasoning model
   - Cost: $15/M input tokens, $60/M output tokens
   - Reasoning effort levels: low, medium, high

2. **OpenAI o1-mini** (`openai:o1-mini`)
   - Smaller reasoning model
   - More affordable but less capable
   - Same reasoning effort support

3. **DeepSeek-R1** (`openrouter:deepseek-ai/DeepSeek-R1`)
   - **DEFAULT MODEL** for this tool
   - Open-source reasoning model
   - Available via OpenRouter
   - Category: reasoning
   - Supports extended thinking process

4. **QwQ Models** (via Groq or OpenRouter)
   - Alternative reasoning models
   - Configured in GROQ_REASONING_MODELS env var

### Reasoning Depth Configuration
Maximum reasoning depth is achieved via:
```javascript
options: {
  reasoningEffort: 'high', // 'low' | 'medium' | 'high'
  max_tokens: 8192,         // Allow longer chains
  temperature: 0.7          // Balanced creativity
}
```

The `reasoningEffort: 'high'` parameter tells the model to:
- Think more extensively before responding
- Generate longer reasoning chains
- Consider more alternatives
- Perform deeper analysis
- **⚠️ Consume significantly more reasoning tokens**

## Use Cases

### When to Use generate_reasoning_chain
✅ **Complex Logical Problems**:
- Mathematical proofs requiring step-by-step derivation
- Scientific hypothesis verification with evidence gathering
- Legal argument construction with precedent analysis

✅ **Multi-Step Strategic Planning**:
- Business strategy formulation with market research
- Software architecture decisions with tradeoff analysis
- Research methodology design with validation steps

✅ **Transparency-Critical Scenarios**:
- Debugging complex code with reasoning trace
- Financial analysis with explicit assumptions
- Medical diagnosis reasoning (educational)

✅ **Deep Analysis Tasks**:
- Literature review synthesis across multiple papers
- Competitive analysis with web research
- Technical feasibility assessment with calculations

### When NOT to Use generate_reasoning_chain
❌ Simple factual queries (use search_web directly)
❌ Quick calculations (use execute_javascript directly)
❌ Content summarization (use standard LLM)
❌ Cost-sensitive applications (10-50x token cost)
❌ Time-critical responses (reasoning adds latency)
❌ When reasoning transparency not needed

## Token Cost Impact

### Estimated Consumption
- **Simple Query**: ~500-1,000 tokens (direct response)
- **With Reasoning**: ~5,000-50,000 tokens (10-50x multiplier)
- **With Embedded Tools**: Can exceed 100,000 tokens

### Cost Breakdown
Each `generate_reasoning_chain` invocation includes:
1. **Reasoning Tokens**: Model's internal thinking process (charged by o1 models)
2. **Input Tokens**: User query + context + tool schemas
3. **Output Tokens**: Reasoning chain text + tool results
4. **Embedded Tool Tokens**: Each tool call (search, scrape, etc.) has its own token cost
5. **Parallel Multiplier**: If 5 tools run simultaneously, 5x the tool token cost

### Example Scenario
Query: "Prove the Pythagorean theorem and verify with numerical examples"

Estimated breakdown:
- Reasoning tokens (high depth): ~15,000 tokens
- Input (prompt + schemas): ~2,000 tokens
- Output (reasoning chain): ~5,000 tokens
- Embedded tools:
  - `execute_javascript` (numerical verification): ~1,000 tokens
  - `search_web` (historical context): ~3,000 tokens
- **Total**: ~26,000 tokens (52x a simple 500-token response)

At o1-preview pricing ($15/$60 per M tokens):
- Input: 17,000 × $15/M = $0.255
- Output: 9,000 × $60/M = $0.540
- **Total cost**: ~$0.80 per query

### Mitigation Strategies
- **Default Disabled**: User must explicitly enable in settings
- **Extreme Visual Warnings**: Red border, pulse animation, detailed explanation
- **Clear Use Case Guidance**: Explicit "USE ONLY FOR" section
- **No Iteration Limit**: Reasoning completes in single call (no infinite loops)
- **Recursion Prevention**: Tool cannot call itself

## Comparison with ask_llm Tool

| Feature | ask_llm | generate_reasoning_chain |
|---------|---------|-------------------------|
| **Purpose** | Multi-step workflows | Deep logical analysis |
| **Token Usage** | 5-10x | 10-50x |
| **Model Type** | Standard LLMs | Reasoning models only |
| **Tool Execution** | Sequential iterations | Parallel embedded calls |
| **Iteration Limit** | 5 max | None (single reasoning run) |
| **Reasoning Depth** | Standard | Maximum (effort: 'high') |
| **Cost Impact** | High | EXTREME |
| **Warning Level** | Amber (⚠️) | Red (⚠️⚠️) |
| **UI Styling** | Border-2 amber | Border-3 red + pulse |
| **Default State** | Disabled | Disabled |
| **Use Case** | Complex multi-tool tasks | Transparent logical reasoning |

## Implementation Details

### Model Selection Logic
```javascript
// Prefer o1 models if already in context (user explicitly chose)
// Otherwise default to DeepSeek-R1 via OpenRouter
const reasoningModel = context.model && context.model.includes('o1') 
  ? context.model 
  : 'openrouter:deepseek-ai/DeepSeek-R1';
```

Rationale:
- **DeepSeek-R1**: Open-source, cost-effective, good reasoning capability
- **o1-preview**: Premium option if user is already using OpenAI reasoning models
- **Fallback safe**: Always has a valid reasoning model

### Context Preservation
```javascript
const contextSection = llmResponses.length > 0 
  ? `\n\nPrevious conversation context:\n${llmResponses.map((r, i) => `Response ${i + 1}: ${r}`).join('\n\n')}`
  : '';
```

Ensures reasoning builds on previous conversation, not isolated.

### Error Handling
```javascript
try {
  const toolResult = await callFunction(toolName, toolArgs, context);
  return { tool: toolName, result: toolResult, success: true };
} catch (error) {
  console.error(`❌ Embedded tool ${toolName} failed:`, error.message);
  return { tool: toolName, error: error.message, success: false };
}
```

Failed tools don't crash reasoning - errors are included in results.

## Code Locations

### Backend
- Tool Definition: `src/tools.js` line ~733-762
- Tool Execution: `src/tools.js` line ~3964-4141
- Reasoning Support: `src/llm_tools_adapter.js` line 42-60 (mapReasoningForOpenAI, mapReasoningForGroq)

### Frontend
- Settings UI: `ui-new/src/components/SettingsModal.tsx` line ~500-540
- Interface Definition (SettingsModal): `ui-new/src/components/SettingsModal.tsx` line 12
- Interface Definition (ChatTab): `ui-new/src/components/ChatTab.tsx` line 52
- Default Value: `ui-new/src/App.tsx` line 67

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

### Environment Variables
Reasoning model configuration (optional):
```bash
# .env file
REASONING_EFFORT=high              # Default reasoning depth (low|medium|high)
GROQ_REASONING_MODELS=model1,model2 # Allowlist for Groq reasoning models
```

## Testing Recommendations

### Manual Testing Checklist
- [ ] Enable `generate_reasoning_chain` in Settings → Tools
- [ ] Send query: "Prove that the square root of 2 is irrational using a step-by-step logical proof"
- [ ] Verify reasoning model is selected (DeepSeek-R1 or o1)
- [ ] Confirm reasoning chain includes explicit thinking steps
- [ ] Check if any embedded tools were called
- [ ] Verify parallel execution if multiple tools used
- [ ] Confirm UI shows reasoning_chain_progress events
- [ ] Test with disabled setting - should not be available
- [ ] Verify extreme warning styling is visible

### Performance Testing
- [ ] Monitor token consumption (should be 10-50x baseline)
- [ ] Verify reasoning depth setting (reasoningEffort: 'high')
- [ ] Check parallel tool execution speed
- [ ] Confirm memory usage during tool parallelization
- [ ] Test SSE stream stability during long reasoning

### Error Scenarios
- [ ] Malformed user_query parameter
- [ ] Reasoning model unavailable
- [ ] Embedded tool execution failures
- [ ] Timeout scenarios (long reasoning chains)
- [ ] Authentication failures in embedded tools
- [ ] Parallel tool explosion (too many concurrent calls)

## Known Limitations

1. **EXTREME Token Cost**: 10-50x consumption is not an exaggeration - can easily exceed 50,000 tokens
2. **No Budget Enforcement**: Unlike ask_llm (5 iteration limit), reasoning runs until model decides to stop
3. **Parallel Tool Risk**: If reasoning calls 10 tools, all execute simultaneously - massive spike
4. **Single Query Only**: Cannot batch multiple reasoning queries in one call
5. **No Streaming Reasoning**: Reasoning tokens are hidden until completion
6. **Model Availability**: DeepSeek-R1 requires OpenRouter access

## Future Enhancements

### Priority 1 - Token Budget Control
- Add explicit token budget parameter
- Implement budget exhaustion detection
- Provide real-time token consumption estimates
- Option to limit parallel tool execution (sequential fallback)

### Priority 2 - Streaming Reasoning Transparency
- Stream reasoning tokens as they're generated (if model supports)
- Show thinking process in real-time
- Allow user to stop reasoning mid-process

### Priority 3 - Reasoning Quality Metrics
- Track reasoning chain quality (logical consistency, completeness)
- Compare reasoning vs non-reasoning approaches
- Measure accuracy improvement

### Priority 4 - Multi-Query Reasoning
- Support array of queries for batch reasoning
- Reasoning across multiple related problems
- Comparative reasoning (option A vs option B)

### Priority 5 - Reasoning Templates
- Pre-defined reasoning patterns (proof, debugging, strategy)
- Domain-specific reasoning modes (math, legal, technical)
- Customizable reasoning instructions

## Security Considerations

1. **Tool Access**: Reasoning model has access to ALL tools (except itself)
   - Can search the web, execute code, scrape pages
   - Same security model as regular tool execution
   - All tool validations still apply

2. **Parallel Execution**: Multiple tools run simultaneously
   - No additional security risk (same tools, different timing)
   - Resource consumption risk (too many concurrent requests)
   - Rate limiting applies per-tool, not aggregate

3. **Reasoning Chain Content**: May expose model's thinking process
   - Transparent reasoning is the feature, not a bug
   - May reveal assumptions or biases
   - Users should review reasoning for accuracy

## Related Documentation
- ask_llm Tool: `developer_logs/FEATURE_ASK_LLM_RECURSIVE_TOOL.md`
- Model Selection Strategy: `developer_logs/MODEL_SELECTION_STRATEGY_ANALYSIS.md`
- Provider Load Balancing: `README.md` (⚖️ Provider Load Balancing section)
- Reasoning Models: `src/model-selection/categorizer.js` (reasoning model patterns)
- LLM Adapter: `src/llm_tools_adapter.js` (reasoning effort mapping)

## Conclusion

The `generate_reasoning_chain` tool provides unprecedented transparency into the LLM's thinking process using advanced reasoning models with maximum depth. While it comes with **EXTREME token cost implications** (10-50x normal usage), the careful design with:
- Default-disabled state
- Prominent red warning styling with pulse animation
- Detailed multi-point explanation
- Clear use case guidance
- Parallel tool execution for speed (with warnings)

...ensures users understand the trade-offs before enabling. The tool is ideal for scenarios where explicit step-by-step reasoning is essential, such as mathematical proofs, logical analysis, strategic planning, or educational demonstrations.

The parallel asynchronous tool execution capability allows reasoning to gather evidence rapidly, but users must be aware this can cause sudden token consumption spikes when multiple tools execute simultaneously. Future enhancements should focus on token budget controls and streaming transparency.
