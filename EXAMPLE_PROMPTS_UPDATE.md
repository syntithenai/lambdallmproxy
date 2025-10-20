# Example Prompts Update - Todos & Snippets

## Changes Made

### 1. Added Multi-Step Workflows Section to Examples Modal

**File**: `ui-new/src/components/ExamplesModal.tsx`

**New Section**: "✅ Multi-Step Workflows (Backend Todos)"

**Example Prompts Added**:
1. **Build: React blog app**
   - "Create a complete React blog application with authentication, post creation, and comments. Break this down into steps and implement each one."

2. **Setup: CI/CD pipeline**
   - "Help me set up a full CI/CD pipeline for my Node.js app. Plan out all the steps needed and execute them in order."

3. **Migrate: JS to TypeScript**
   - "Migrate my Express server from JavaScript to TypeScript. Create a step-by-step plan and execute each phase."

4. **Deploy: AWS infrastructure**
   - "Set up a complete AWS deployment for my application including VPC, RDS database, Lambda functions, and API Gateway. Plan and implement this step by step."

**Note**: ℹ️ Auto-progresses through steps (max 5 iterations)

---

### 2. Added Knowledge Snippets Section

**New Section**: "📝 Knowledge Snippets (Google Sheets)"

**Example Prompts Added**:
1. **Save: Code snippet**
   - "Save this code example to my snippets with tags 'javascript' and 'async': async function fetchData() { const response = await fetch(url); return response.json(); }"

2. **Save: Quick note**
   - "Remember this information: TypeScript 5.0 introduced const type parameters for generic functions"

3. **Search: Saved snippets**
   - "Search my snippets for 'react hooks'"

4. **Search: By tag**
   - "Find all my snippets tagged with 'python'"

**Note**: ℹ️ Stored in your personal Google Sheet

---

## How Todos Work

### Trigger Keywords
- "plan", "step by step", "break down", "multi-step", "phases", "systematically"

### Process Flow
1. User requests multi-step task
2. LLM calls `manage_todos` tool with array of step descriptions
3. Backend creates todo queue and shows first step
4. LLM works on current step
5. System auto-advances to next step (up to 5 iterations)
6. Progress continues until all steps complete

### UI Indicators
- Progress indicator showing current step
- Todo list with completed/pending items
- Auto-progression between steps
- Completion notification

---

## How Manage Snippets Works

### 5 Actions

1. **INSERT** - Add new snippet with full metadata
   ```javascript
   {
     "action": "insert",
     "payload": {
       "title": "Snippet Title",
       "content": "Content here",
       "tags": ["tag1", "tag2"],
       "source": "manual"
     }
   }
   ```

2. **CAPTURE** - Quick save from conversation
   ```javascript
   {
     "action": "capture",
     "payload": {
       "title": "Quick Note",
       "content": "Information",
       "source": "chat"
     }
   }
   ```

3. **GET** - Retrieve by ID or title
   ```javascript
   {
     "action": "get",
     "payload": { "id": 42 }
   }
   ```

4. **SEARCH** - Find by query or tags
   ```javascript
   {
     "action": "search",
     "payload": {
       "query": "react hooks",
       "tags": ["react"]
     }
   }
   ```

5. **DELETE** - Remove snippet
   ```javascript
   {
     "action": "delete",
     "payload": { "id": 42 }
   }
   ```

### Storage
- **Location**: Google Sheet "Research Agent/Research Agent Swag"
- **Access**: User's OAuth token (requires login)
- **Structure**: ID, Title, Content, Tags, Source, URL, Created

### Trigger Keywords
- Save: "save this", "remember this", "add to knowledge base"
- Search: "search my snippets", "find my notes", "what did I save"
- Retrieve: "get snippet", "show me snippet"

### Authentication
- Requires Google OAuth login (Cloud Sync Settings)
- Scope: `drive.file` (access to app-created files only)
- Error if not authenticated: "Please login with Google to use snippets feature"

---

## UI Integration

### Examples Modal
- **Access**: Click "💡" button in chat input area
- **Layout**: 3-column grid with categorized examples
- **Interaction**: Click any example to populate input field

### New Sections Position
- **Column 3** (rightmost): Knowledge Base, Data Analysis, **Multi-Step Workflows**, **Knowledge Snippets**

### Visual Consistency
- Same styling as existing examples
- Hover effects and transitions
- Info notes with emoji indicators
- Consistent button layout

---

## Documentation Created

### 1. MANAGE_SNIPPETS_TOOL_GUIDE.md
Comprehensive 400+ line guide covering:
- Tool definition and parameters
- All 5 actions with examples
- Authentication & security
- Trigger keywords
- Backend implementation
- UI integration
- Error handling
- Example conversations
- Troubleshooting
- Future enhancements

### 2. This Summary (EXAMPLE_PROMPTS_UPDATE.md)
Quick reference for the changes made

---

## Testing

### Test Todos Feature
1. Click "💡" button in chat
2. Select any "Multi-Step Workflows" example
3. Watch LLM create todo queue
4. Observe auto-progression through steps
5. Check UI shows progress indicator

### Test Snippets Feature
1. Ensure logged in with Google (Cloud Sync Settings)
2. Click "💡" button
3. Select "Save: Code snippet" example
4. Verify snippet saved to Google Sheet
5. Try search examples to retrieve

---

## Status

✅ **COMPLETE** 
- Examples modal updated with 8 new prompts
- Comprehensive documentation created
- No TypeScript errors
- Ready for testing

## Next Steps

1. Test multi-step workflows with various complexity levels
2. Test snippet operations (requires Google login)
3. Consider adding more specialized examples:
   - Database migrations
   - API endpoint creation
   - Test suite generation
   - Documentation generation
4. Monitor user engagement with new examples
5. Collect feedback on todo auto-progression limits

---

## Related Files

- `ui-new/src/components/ExamplesModal.tsx` - Examples UI
- `src/tools.js` - Tool definitions (manage_todos, manage_snippets)
- `src/utils/todos-manager.js` - Todo queue backend
- `src/services/google-sheets-snippets.js` - Snippets backend
- `src/endpoints/chat.js` - Main chat handler with todo auto-progression
