# Dynamic Token Allocation System

## Overview

The Lambda LLM Proxy now implements a sophisticated **dynamic token allocation system** where the first planning LLM call assesses query complexity and automatically adjusts the output token limits for subsequent responses.

## How It Works

### 1. Planning Phase Assessment
The initial planning call analyzes the query and returns:
```json
{
  "research_questions": ["Question 1", "Question 2", ...],
  "optimal_persona": "Expert role and specialization",
  "reasoning": "Detailed analysis strategy",
  "complexity_assessment": "low|medium|high"
}
```

### 2. Dynamic Token Allocation
Based on the `complexity_assessment`, the system automatically selects appropriate token limits:

| Complexity | Token Limit | Use Case | Example Queries |
|------------|-------------|----------|-----------------|
| **Low** | 1,024 tokens | Simple facts, definitions, basic calculations | "What is the capital of France?", "Calculate 15% of 200" |
| **Medium** | 2,048 tokens | Standard analysis, comparisons, explanations | "Compare Python vs JavaScript", "Explain machine learning" |
| **High** | 4,096 tokens | Comprehensive analysis, multi-faceted topics | "Analyze economic implications of AI on global markets" |

### 3. Smart Override for Math Queries
Mathematical queries always use **512 tokens** for concise, direct answers regardless of complexity assessment.

## Configuration (in .env)

```env
# Planning Phase
MAX_TOKENS_PLANNING=300           # Planning decision tokens

# Dynamic Token Allocation
MAX_TOKENS_LOW_COMPLEXITY=1024    # Simple queries
MAX_TOKENS_MEDIUM_COMPLEXITY=2048 # Standard queries  
MAX_TOKENS_HIGH_COMPLEXITY=4096   # Complex analysis

# Special Cases
MAX_TOKENS_MATH_RESPONSE=512      # Mathematical queries (always concise)
```

## Enhanced System Prompts

### High Complexity Queries
For queries assessed as "high complexity", the system enhances the prompt:
```
For this high-complexity analysis: Provide comprehensive, detailed responses with thorough analysis. You have expanded token allocation to deliver in-depth insights, multiple perspectives, and detailed explanations as needed.
```

### Mathematical Queries
Math queries get specialized prompts for conciseness:
```
For mathematical questions: Start with the answer first (e.g., "The result is X."), then show calculations if helpful. Be direct and concise.
```

## Benefits

1. **Efficiency**: Simple queries don't waste tokens on unnecessary elaboration
2. **Depth**: Complex queries get the token budget they need for thorough analysis
3. **Automatic**: No manual configuration needed - the AI decides based on content
4. **Cost Effective**: Optimizes token usage based on actual requirements
5. **Quality**: Ensures appropriate response depth for each query type

## Logging and Monitoring

The system logs the dynamic allocation decisions:
```
🔧 Dynamic token allocation: complexity=high, tokens=4096
Using 4096 tokens for high complexity analysis
```

This allows you to monitor how the system is allocating resources and adjust thresholds if needed.

## Examples

### Low Complexity Query
- **Query**: "What is the population of Tokyo?"
- **Assessment**: complexity=low
- **Tokens**: 1,024
- **Response**: Concise factual answer with source

### High Complexity Query  
- **Query**: "Analyze the economic implications of artificial intelligence on global labor markets, including job displacement, new job creation, regional variations, and policy recommendations for the next decade"
- **Assessment**: complexity=high  
- **Tokens**: 4,096
- **Response**: Comprehensive analysis with multiple perspectives, detailed explanations, and thorough coverage

The system intelligently matches response depth to query requirements while optimizing resource usage.