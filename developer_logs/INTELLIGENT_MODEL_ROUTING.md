# Intelligent Model Routing - Together AI

## Overview

The system automatically routes queries to the optimal Together AI model based on task complexity:

- **70B Model** (`meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo`) - Fast, efficient for simple queries and text compression
- **405B Model** (`meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo`) - Most capable for complex reasoning

## Routing Rules

## How It Works

**User Experience:**
1. User selects `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` in UI (or any Together AI model)
2. User types query: "Analyze the ethical implications of AI in healthcare"
3. Backend intercepts request and analyzes query
4. Backend automatically upgrades to 405B model
5. Response is generated with the more capable model
6. User gets better results without manual model switching

**Text Compression (Summaries) → 70B:**

Text compression/summarization always uses the 70B model for speed and efficiency:

- Summarizing search results
- Compressing webpage content
- Creating digests
- Synthesizing information
- TL;DR generation
- Key points extraction

**Example:**
```javascript
// In search_web tool - summary generation
summary_model = getOptimalModel(query, { 
  isCompression: true,  // Forces 70B
  context: context 
});
```

### 2. Query Complexity Analysis → 70B or 405B

For general queries, the system analyzes complexity using multiple factors:

#### Complexity Factors (Increase Score)

- **Query length**: >50 words (+2), >20 words (+1)
- **Multiple questions**: >2 questions (+2), >1 question (+1)
- **Complex reasoning keywords**: analyze, compare, evaluate, synthesize, deduce, infer (+2 each)
- **Advanced concepts**: philosophical, ethical, strategic, comprehensive (+2 each)
- **Code generation**: write code/function/class (+1)
- **Math/logic**: solve, equation, proof, theorem (+2)
- **Tool usage**: requires multiple tools (+1)
- **Long conversations**: >10 messages (+1)

#### Simplicity Factors (Decrease Score)

- **Simple questions**: "what is", "who is", "define" (-2 each)
- **Quick answers**: "briefly", "yes or no", "true or false" (-2 each)
- **Lists**: "list", "name" (-2)

#### Decision Threshold

- **Score ≥ 3**: Complex → Use 405B model
- **Score < 3**: Simple → Use 70B model

## Implementation

### Automatic Request Interception (`src/endpoints/chat.js`)

The system intercepts **all incoming chat requests** and analyzes the selected model:

```javascript
// In chat.js handler - BEFORE any LLM calls
if (model && model.includes('Meta-Llama-3.1-8B-Instruct-Turbo')) {
  const { getOptimalModel } = require('../utils/query-complexity');
  
  // Extract user's query
  const latestQuery = userMessages[userMessages.length - 1].content;
  
  // Analyze and route
  model = getOptimalModel(latestQuery, {
    isCompression: false,
    context: { hasTools, conversationLength, requiresMultipleSteps },
    provider: 'together'
  });
  
  console.log(`🎯 Intelligent routing: 8B → ${model}`);
}
```

**Key Benefit**: Users can keep "8B" selected in the UI, but the backend **automatically upgrades** to 70B or 405B when needed.

### Module: `src/utils/query-complexity.js`

```javascript
const { getOptimalModel, analyzeQueryComplexity, isTextCompression } = require('./utils/query-complexity');

// For text compression (always 70B)
const model = getOptimalModel(query, { 
  isCompression: true,
  provider: 'together'
});

// For general queries (automatic complexity detection)
const model = getOptimalModel(query, { 
  context: { hasTools: true, conversationLength: 5 },
  provider: 'together'
});
```

### Search Summaries

All search result summarization uses 70B model:

```javascript
// In src/tools.js - search_web case
summary_model = getOptimalModel(query, { 
  isCompression: true,  // Text compression task
  context: context,
  provider: 'together'
});
```

### Model Pool for Load Balancing

When using Together AI, the model pool prioritizes 70B for summaries:

```javascript
const modelPool = [
  'together:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',  // Primary
  'together:meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',   // Fallback
];
```

## Examples

### Example 1: Simple Query → 70B
```
Query: "What is the capital of France?"
Complexity Score: 0 (simple question pattern)
Selected Model: meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo
```

### Example 2: Complex Query → 405B
```
Query: "Analyze the ethical implications of AI in healthcare, comparing utilitarian 
        and deontological perspectives, and evaluate potential regulatory frameworks."
Complexity Score: 8 (analyze +2, ethical +2, comparing +2, evaluate +2)
Selected Model: meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo
```

### Example 3: Text Compression → 70B
```
Task: Summarizing 5 search results into a digest
Context: { isCompression: true }
Selected Model: meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo (always)
```

## Benefits

1. **Cost Optimization**: Use expensive 405B model only when needed
2. **Speed**: 70B model responds faster for simple queries  
3. **Quality**: 405B model handles complex reasoning better
4. **Automatic**: No manual model selection required - **works transparently**
5. **Better Function Calling**: Always uses 70B minimum (8B struggles with tools)
6. **User-Friendly**: Users can keep one model selected, backend optimizes automatically

## Upgrade Rules

### Rule 1: Minimum 70B for Function Calling
- **Input**: Any Together AI 8B model selection
- **Action**: Automatically upgrade to 70B
- **Reason**: 8B models struggle with reliable function calling
- **Log**: `🎯 Upgraded 8B to 70B for better function calling`

### Rule 2: Complexity-Based 405B Upgrade
- **Input**: User query with complexity score ≥ 3
- **Action**: Upgrade to 405B model  
- **Reason**: Complex reasoning requires most capable model
- **Log**: `📊 Model selection: 405B (complex query detected)`

### Rule 3: Keep 70B for Simple Queries
- **Input**: User query with complexity score < 3
- **Action**: Use 70B model
- **Reason**: Fast and efficient for straightforward tasks
- **Log**: `📊 Model selection: 70B (simple query)`

## Configuration

Enable Together AI provider in `.env`:

```env
# Provider 3: Together AI (ENABLED)
LLAMDA_LLM_PROXY_PROVIDER_TYPE_3=together
LLAMDA_LLM_PROXY_PROVIDER_KEY_3=your_together_api_key
```

## Logs

The system logs routing decisions for transparency:

```
🎯 Intelligent routing: together:meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo → together:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo
📊 Query: "What are the latest headlines RIGHT NOW"

🎯 Intelligent routing: together:meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo → together:meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo
📊 Query: "Analyze the ethical implications of AI in healthcare, comparing..."
📊 Model selection: 405B (complex query detected)

🎯 Upgraded 8B to 70B for better function calling
📊 Summary generation: together:... → together:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo (text compression: 70B)
```

## Real-World Example

**Scenario**: User has 8B model selected, asks "What are the latest headlines RIGHT NOW?"

**Without Routing**:
- Uses 8B model
- 8B fails to call `search_web` tool properly
- Hallucinates fake headlines
- ❌ Poor user experience

**With Intelligent Routing**:
- Detects 8B selection
- Upgrades to 70B automatically  
- 70B properly calls `search_web` tool
- Returns real, current headlines
- ✅ Excellent user experience

## Future Enhancements

- [ ] Fine-tune complexity thresholds based on usage patterns
- [ ] Add user preferences for model selection
- [ ] Track accuracy of complexity predictions
- [ ] Add model performance metrics
- [ ] Support other model families (Mixtral, Claude, etc.)
