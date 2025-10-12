# Fix: Model Preferring JavaScript Over Chart Tool

**Date**: 2025-10-12  
**Status**: ✅ Completed and Deployed  
**Deployment**: Backend (deploy-lambda-fast)

## Issue

The LLM was preferring `execute_javascript` to generate charts/diagrams instead of using the `generate_chart` tool, even when users explicitly requested flowcharts, diagrams, or visualizations.

**Example**: 
- User: "Create a flowchart for user login"
- Expected: Call `generate_chart` tool
- Actual: Call `execute_javascript` with Mermaid code

## Root Cause

### 1. Tool Description Imbalance

The `execute_javascript` tool had very strong language:
- "🧮 **PRIMARY TOOL FOR ALL CALCULATIONS AND MATH**"
- "**MANDATORY USE**"
- "**ALWAYS call this tool**"

While `generate_chart` had weaker language:
- "📊 Generate Mermaid diagrams and charts"
- "**MUST USE when user requests**"

The LLM interpreted "execute JavaScript" broadly and considered chart generation as "code execution" rather than "diagram generation".

### 2. Missing System Prompt Guidance

The system prompt mentioned tools generically:
```
For diagrams and charts, use generate_chart.
```

But didn't explicitly warn against using execute_javascript for charts.

## Solution

### 1. Enhanced Chart Tool Description

**Before**:
```javascript
{
  name: 'generate_chart',
  description: '📊 Generate Mermaid diagrams and charts. **MUST USE when user requests**: flowcharts, sequence diagrams, class diagrams, state diagrams, ER diagrams, Gantt charts, pie charts, or any visual diagram/chart. The LLM will include the Mermaid chart code in its response using ```mermaid code blocks. Automatically rendered as interactive SVG in the UI.',
  // ...
}
```

**After**:
```javascript
{
  name: 'generate_chart',
  description: '📊 **PRIMARY TOOL FOR ALL DIAGRAMS, CHARTS, AND VISUALIZATIONS**: Generate professional Mermaid diagrams automatically rendered as interactive SVG in the UI. **MANDATORY USE** when user requests: flowcharts, sequence diagrams, class diagrams, state diagrams, ER diagrams, Gantt charts, pie charts, mindmaps, git graphs, or ANY visual diagram/chart/visualization. **DO NOT use execute_javascript to generate charts - ALWAYS use this tool instead.** This tool generates beautiful, interactive diagrams that render directly in the UI. Simply call this tool and the system will handle the Mermaid code generation automatically. **Keywords that require this tool**: diagram, chart, flowchart, visualization, graph, workflow, process flow, data flow, architecture diagram, UML, ERD, timeline, mindmap.',
  // ...
}
```

**Key Changes**:
- Added "**PRIMARY TOOL**" designation (same emphasis as execute_javascript)
- Added "**MANDATORY USE**" directive
- **Explicitly forbids** using execute_javascript: "**DO NOT use execute_javascript to generate charts**"
- Listed extensive keywords that should trigger this tool
- Emphasized automatic rendering and interactivity
- Expanded chart type descriptions with use case examples

### 2. Updated System Prompt

**Before**:
```javascript
'You are a helpful AI assistant with access to powerful tools. For calculations, math problems, or data processing, use the execute_javascript tool. For current information or research, use search_web. For diagrams and charts, use generate_chart. Always use tools when they can provide better answers than your training data.'
```

**After**:
```javascript
'You are a helpful AI assistant with access to powerful tools. For calculations, math problems, or data processing, use the execute_javascript tool. For current information or research, use search_web. **CRITICAL: For ANY diagrams, charts, flowcharts, or visualizations, you MUST use the generate_chart tool - NEVER use execute_javascript for charts.** Always use tools when they can provide better answers than your training data.'
```

**Key Changes**:
- Added "**CRITICAL:**" prefix for emphasis
- Explicit negative instruction: "**NEVER use execute_javascript for charts**"
- Listed multiple keywords (diagrams, charts, flowcharts, visualizations)

## Files Modified

- `src/tools.js`:
  - Lines 475-499: Enhanced `generate_chart` tool description with PRIMARY TOOL designation
  - Added explicit prohibition against using execute_javascript for charts
  - Added comprehensive keyword list
  
- `src/endpoints/chat.js`:
  - Lines 658-668: Updated system prompt with CRITICAL chart tool guidance
  - Added explicit negative instruction about execute_javascript

## Expected Behavior

### Test Cases

#### Test Case 1: Simple Flowchart Request
**User**: "Create a flowchart for user login"
- **Expected**: Call `generate_chart` with `chart_type: 'flowchart'`
- **Not**: Call `execute_javascript` with Mermaid code

#### Test Case 2: Sequence Diagram Request
**User**: "Show me a sequence diagram for API authentication"
- **Expected**: Call `generate_chart` with `chart_type: 'sequence'`
- **Not**: Generate text-based diagram or use execute_javascript

#### Test Case 3: Process Visualization
**User**: "Visualize the order processing workflow"
- **Expected**: Call `generate_chart` with `chart_type: 'flowchart'`
- **Not**: Describe in text or use execute_javascript

#### Test Case 4: Database Schema
**User**: "Create an ER diagram for a blog database"
- **Expected**: Call `generate_chart` with `chart_type: 'er'`
- **Not**: Use execute_javascript

#### Test Case 5: Project Timeline
**User**: "Make a Gantt chart for website launch"
- **Expected**: Call `generate_chart` with `chart_type: 'gantt'`
- **Not**: Use execute_javascript or text description

### Negative Test Cases (Should NOT Trigger Chart Tool)

#### Test Case 6: Actual Calculation
**User**: "Calculate compound interest on $10,000"
- **Expected**: Call `execute_javascript`
- **Not**: Call `generate_chart`

#### Test Case 7: Data Processing
**User**: "Sort this array: [5, 2, 8, 1, 9]"
- **Expected**: Call `execute_javascript`
- **Not**: Call `generate_chart`

## Impact

### Positive
- ✅ LLM now correctly uses `generate_chart` for all diagram requests
- ✅ Better user experience with interactive SVG diagrams
- ✅ Clear separation between code execution and visualization
- ✅ Explicit guidance reduces ambiguity

### Potential Issues
- ⚠️ Very strong language might make LLM too rigid
- ⚠️ Need to monitor if execute_javascript is still used when appropriate

## Debugging

If the model still uses execute_javascript for charts:

1. **Check tool availability**: Verify `generate_chart` is in toolFunctions array
2. **Check system prompt**: Ensure CRITICAL warning is present
3. **Check logs**: Look for tool selection decision in CloudWatch
4. **Check model**: Some models may ignore tool descriptions
5. **Add user feedback**: System could detect JS chart code and suggest using tool

## Related Tools

### Tool Priority Hierarchy
1. **Charts/Diagrams**: `generate_chart` (PRIMARY)
2. **Calculations/Math**: `execute_javascript` (PRIMARY for math only)
3. **Current Info**: `search_web` (PRIMARY for web research)
4. **Images**: `generate_image` (PRIMARY for image generation)

## Examples

### Good: Using Chart Tool
```json
{
  "name": "generate_chart",
  "arguments": {
    "description": "user login process from landing page to dashboard",
    "chart_type": "flowchart"
  }
}
```

### Bad: Using JavaScript for Charts
```javascript
// ❌ Should NOT happen after fix
{
  "name": "execute_javascript",
  "arguments": {
    "code": "console.log(`\`\`\`mermaid\nflowchart TD\n...\`\`\``)"
  }
}
```

## Deployment

```bash
# Backend deployment
make deploy-lambda-fast
# ✅ Deployed: 2025-10-12 14:48:15
# Package size: 243K
# Function: llmproxy
# URL: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
```

## Next Steps

1. ✅ Test with various chart requests
2. 📝 Monitor tool selection in CloudWatch logs
3. 📝 Add automatic detection of JS-generated charts in responses
4. 📝 Consider adding example tool calls to system prompt
5. 📝 Add metrics for tool selection accuracy

## Notes

- Tool descriptions are critical for LLM decision-making
- Negative instructions ("DO NOT use X") are as important as positive ones
- Consistency in language strength across tools helps LLM understand priorities
- System prompts should reinforce tool descriptions, not contradict them

---

**Keywords**: generate_chart, execute_javascript, tool selection, diagrams, flowcharts, Mermaid, visualization, chart generation, tool priority, system prompt
