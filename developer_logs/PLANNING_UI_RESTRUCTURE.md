# Planning UI Restructure - Implementation Guide

## Overview
The Planning UI needs to be restructured to use three auto-resizing textarea fields with fixed action buttons at the top.

## Required Changes

### 1. Add Auto-Resize Hook
**File**: `ui-new/src/hooks/useAutoResizeTextarea.ts` ✅ CREATED

```typescript
import { useEffect, useRef } from 'react';

export const useAutoResizeTextarea = (value: string) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return textareaRef;
};
```

### 2. Update PlanningTab Component
**File**: `ui-new/src/components/PlanningTab.tsx`

#### A. Add Import
```typescript
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';
```

#### B. Add State Variables (after existing state):
```typescript
// Generated prompts that will be sent to chat
const [generatedSystemPrompt, setGeneratedSystemPrompt] = useLocalStorage('planning_generated_system_prompt', '');
const [generatedUserQuery, setGeneratedUserQuery] = useLocalStorage('planning_generated_user_query', '');
```

#### C. Update handleSubmit - Result Processing
In the `case 'result':` section, replace the current code with:

```typescript
case 'result':
  // Display the plan result
  setResult(data);
  
  // Transform result into system prompt and user query immediately
  let systemPromptText = '';
  let userQueryText = query;
  
  // Build system prompt from plan fields
  if (data.persona) {
    systemPromptText += `AI Persona:\n${data.persona}\n\n`;
  }
  
  if (data.plan) {
    systemPromptText += `Research Plan:\n${data.plan}\n\n`;
  }
  
  if (data.reasoning) {
    systemPromptText += `Research Context:\n${data.reasoning}\n\n`;
  }
  
  if (data.steps && data.steps.length > 0) {
    systemPromptText += `Research Steps:\n`;
    systemPromptText += data.steps.map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n');
    systemPromptText += '\n\n';
  }
  
  if (data.sources && data.sources.length > 0) {
    systemPromptText += `Recommended Sources:\n`;
    systemPromptText += data.sources.map((source: string) => `- ${source}`).join('\n');
    systemPromptText += '\n\n';
  }
  
  if (data.notes) {
    systemPromptText += `Additional Notes:\n${data.notes}\n\n`;
  }
  
  // Build user query from search keywords and questions
  userQueryText = `I need help with the following research task:\n\n`;
  userQueryText += `**Original Query:** ${query}\n\n`;
  
  if (data.searchKeywords && data.searchKeywords.length > 0) {
    userQueryText += `**Search Keywords:**\n`;
    userQueryText += data.searchKeywords.map((kw: string) => `- ${kw}`).join('\n');
    userQueryText += `\n\nPlease use your search tools to find information about these keywords.\n\n`;
  }
  
  if (data.questions && data.questions.length > 0) {
    userQueryText += `**Be sure to answer the following questions:**\n`;
    userQueryText += data.questions.map((q: string, idx: number) => `${idx + 1}. ${q}`).join('\n');
    userQueryText += `\n\nPlease research and provide complete answers to all these questions.\n\n`;
  }
  
  userQueryText += `Please help me research this topic thoroughly using your available tools.`;
  
  // Update the generated prompts
  setGeneratedSystemPrompt(systemPromptText.trim());
  setGeneratedUserQuery(userQueryText.trim());
  
  // Auto-save successful plan to cache
  saveCachedPlan(query, data);
  console.log('Plan auto-saved to cache');
  break;
```

#### D. Update handleTransferToChat
Replace the entire function with:

```typescript
const handleTransferToChat = () => {
  if (!generatedUserQuery.trim()) return;
  
  // Use the pre-generated prompts (no further manipulation needed)
  const transferData = {
    prompt: generatedUserQuery,
    systemPrompt: generatedSystemPrompt
  };
  
  onTransferToChat(JSON.stringify(transferData));
};
```

#### E. Add Auto-Resize Refs (before return statement)
```typescript
// Auto-resize textareas
const queryTextareaRef = useAutoResizeTextarea(query);
const systemPromptTextareaRef = useAutoResizeTextarea(generatedSystemPrompt);
const userQueryTextareaRef = useAutoResizeTextarea(generatedUserQuery);
```

#### F. Replace Entire Return Statement

Replace the entire `return (...)` section with the new UI structure. Key changes:

1. **Fixed Header with Buttons**:
```tsx
<div className="flex flex-col h-full">
  {/* Fixed Header with Action Buttons */}
  <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 space-y-3">
    {/* Primary Actions */}
    <div className="flex flex-wrap gap-2">
      <button
        onClick={handleSubmit}
        disabled={isLoading || !query.trim() || !isAuthenticated}
        className="btn-primary flex-1 sm:flex-none"
      >
        {isLoading ? 'Generating Plan...' : '🔍 Generate Plan'}
      </button>
      
      <button
        onClick={handleTransferToChat}
        disabled={!generatedUserQuery.trim()}
        className="btn-primary flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
      >
        💬 Send To Chat
      </button>

      <button onClick={() => setShowLoadDialog(true)} className="btn-secondary">
        📂 Load
      </button>
      
      <button 
        onClick={() => { 
          setQuery(''); 
          setResult(null);
          setGeneratedSystemPrompt('');
          setGeneratedUserQuery('');
        }} 
        className="btn-secondary"
        title="Start a new research plan"
      >
        ➕ New
      </button>
    </div>
    
    {!isAuthenticated && (
      <div className="text-center text-red-500 text-sm py-2 bg-red-50 dark:bg-red-900/20 rounded">
        Please sign in to use planning
      </div>
    )}
  </div>

  {/* Scrollable Content Area */}
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    {/* ... rest of content ... */}
  </div>
</div>
```

2. **Three Auto-Resizing Textareas**:

```tsx
{/* 1. Research Query (User Editable) */}
<div className="card p-4">
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
    1. Research Query (prompt for generating plans)
  </label>
  <textarea
    ref={queryTextareaRef}
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder="Enter your research question or topic..."
    className="input-field w-full overflow-hidden"
    style={{ minHeight: '60px', resize: 'none' }}
    disabled={!isAuthenticated}
  />
</div>

{/* 2. Generated System Prompt (Auto-generated, can be edited) */}
{generatedSystemPrompt && (
  <div className="card p-4">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
      2. Generated System Prompt (auto-generated after clicking Generate Plan)
    </label>
    <textarea
      ref={systemPromptTextareaRef}
      value={generatedSystemPrompt}
      onChange={(e) => setGeneratedSystemPrompt(e.target.value)}
      placeholder="System prompt will appear here after generating plan..."
      className="input-field w-full overflow-hidden bg-blue-50 dark:bg-blue-900/10"
      style={{ minHeight: '100px', resize: 'none' }}
    />
  </div>
)}

{/* 3. Generated User Query (Auto-generated, can be edited) */}
{generatedUserQuery && (
  <div className="card p-4">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
      3. User Query (auto-generated after clicking Generate Plan, ready for Send To Chat)
    </label>
    <textarea
      ref={userQueryTextareaRef}
      value={generatedUserQuery}
      onChange={(e) => setGeneratedUserQuery(e.target.value)}
      placeholder="User query will appear here after generating plan..."
      className="input-field w-full overflow-hidden bg-green-50 dark:bg-green-900/10"
      style={{ minHeight: '150px', resize: 'none' }}
    />
  </div>
)}
```

3. **Move Configuration to Collapsible Details**:

```tsx
{/* Configuration Panel (Collapsible) */}
<details className="card p-4">
  <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300 mb-2">
    ⚙️ Configuration (Temperature: {temperature.toFixed(1)}, Tokens: {maxTokens})
  </summary>
  <div className="space-y-4 mt-4">
    {/* Temperature slider */}
    {/* Max tokens slider */}
    {/* System prompt textarea */}
  </div>
</details>
```

4. **Move Raw Results to Collapsible Details**:

```tsx
{/* Raw Result Display (for debugging/reference) */}
{result && !result.error && (
  <details className="card p-4">
    <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300">
      📋 Raw Plan Details (for reference)
    </summary>
    <div className="space-y-4 mt-4">
      {/* All the persona, plan, keywords, questions, etc. */}
    </div>
  </details>
)}
```

## Key Behaviors

### 1. Research Query
- **Always visible** in first textarea
- **User editable**
- Used as prompt for generating plans
- Only changed by user (never auto-generated)

### 2. Generated System Prompt
- **Hidden until plan generated**
- **Auto-generated** when Generate Plan clicked
- Contains: persona, plan, reasoning, steps, sources, notes
- **User can edit** after generation
- Used as system message when sending to chat

### 3. Generated User Query  
- **Hidden until plan generated**
- **Auto-generated** when Generate Plan clicked
- Contains: original query, search keywords, questions
- **User can edit** after generation
- Sent as user message when clicking Send To Chat

### 4. Send To Chat
- Takes generatedUserQuery and generatedSystemPrompt AS-IS
- No further transformation needed
- Passes as JSON: `{ prompt: userQuery, systemPrompt: systemPrompt }`

## Benefits

1. ✅ Clear workflow: Query → Generate → Review → Send
2. ✅ Full editability of all prompts before sending
3. ✅ Auto-resizing textareas adapt to content
4. ✅ Fixed buttons always accessible
5. ✅ Clean separation of input, system context, and user query
6. ✅ Configuration collapsed by default (cleaner UI)
7. ✅ Raw results available but not prominent

## Testing

1. Enter research query
2. Click "Generate Plan"
3. Verify system prompt appears with persona, plan, reasoning, etc.
4. Verify user query appears with keywords and questions
5. Edit either prompt if needed
6. Click "Send To Chat"
7. Verify chat receives both prompts correctly
8. Test textarea auto-resize by typing/pasting long text

## Implementation Status

- ✅ Auto-resize hook created
- ✅ State variables identified
- ✅ Transformation logic defined
- ✅ UI structure designed
- ⏳ PlanningTab.tsx needs to be updated (manual implementation recommended)
