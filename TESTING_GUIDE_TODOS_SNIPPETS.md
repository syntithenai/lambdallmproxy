# Todos and Snippets Feature - Testing Guide

## Quick Start

### 1. Start Backend (Lambda Local)
```bash
make dev
```

Expected output:
```
Starting local Lambda server...
Server running on http://localhost:9000
```

### 2. Start Frontend (React Dev Server)
```bash
cd ui-new
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in XXX ms
➜  Local:   http://localhost:5173/
```

### 3. Open Browser
Navigate to: `http://localhost:5173`

---

## Testing Todos Feature ✅ (Already Implemented)

### Test 1: Basic Todo Management
1. Start a new chat
2. Type: "Create a todo list with 3 tasks: Task A, Task B, Task C"
3. **Expected:** LLM calls `manage_todos` tool
4. **Verify:** Todos panel appears above input with "3 total • 3 remaining"
5. **Verify:** Current todo shows "Task A"

### Test 2: Auto-Progression
1. Continue from Test 1
2. LLM completes Task A, assessor returns OK
3. **Expected:** System auto-submits `NEXT_TODO: Task B`
4. **Verify:** Todos panel updates to "3 total • 2 remaining"
5. **Verify:** Current todo changes to "Task B"
6. **Verify:** Task A shows ✅ (done) in expanded list

### Test 3: Todos Panel UI
1. Click "▸ Expand" on todos panel
2. **Verify:** All 3 todos visible with status icons:
   - ✔️ Task A (done)
   - 🟡 Task B (current)
   - ⏳ Task C (pending)
3. Click "▾ Collapse"
4. **Verify:** Panel collapses to compact view

### Test 4: Max Iterations Cap
1. Create a todo list with 15 tasks
2. LLM auto-progresses through tasks
3. **Expected:** After `MAX_TODO_AUTO_ITERATIONS` (default: 10), stops
4. **Verify:** Warning toast: "Todo auto-progression limit reached"

---

## Testing Snippets Feature 🆕 (Newly Implemented)

### Test 1: Open Snippets Panel
1. Click "📝 Snippets" button in chat header
2. **Verify:** Panel slides up from bottom (2/3 screen height)
3. **Verify:** Header shows "📝 Snippets" with close button
4. **Verify:** "+ Capture" button visible

### Test 2: Manual Snippet Capture (UI)
1. Click "+ Capture" button
2. Fill in form:
   - Title: "Test Snippet"
   - Content: "This is a test snippet with some content"
   - Tags: "test, example, manual"
   - Source: "Manual"
3. Click "Save Snippet"
4. **Expected:** 
   - Modal closes
   - Toast: "Saved snippet: Test Snippet"
   - Snippet appears in Google Sheet (verify in Drive)

### Test 3: LLM-Driven Snippet Insert
1. In chat, type: "Save a snippet titled 'OAuth Pattern' with content about Google OAuth 2.0 implementation, tagged with oauth, google, authentication"
2. **Expected:** LLM calls `manage_snippets` tool with action: "insert"
3. **Verify:**
   - SSE event: `snippet_inserted`
   - Toast: "Saved snippet: OAuth Pattern"
   - Snippet visible in panel (if still open)
   - Snippet in Google Sheet (verify in Drive)

### Test 4: Search Snippets
1. Create 3-5 snippets with different tags
2. In snippets panel search box, type: "oauth"
3. **Verify:** Only matching snippets displayed
4. Clear search
5. Click a tag pill (e.g., "authentication")
6. **Verify:** Only snippets with that tag shown

### Test 5: LLM Search Snippets
1. In chat, type: "Search my snippets for anything related to authentication"
2. **Expected:** LLM calls `manage_snippets` with action: "search", query: "authentication"
3. **Verify:** LLM responds with list of matching snippets

### Test 6: Get Specific Snippet
1. In chat, type: "Get my snippet titled 'OAuth Pattern'"
2. **Expected:** LLM calls `manage_snippets` with action: "get", payload: { title: "OAuth Pattern" }
3. **Verify:** LLM responds with snippet details (title, content, tags, source, date)

### Test 7: Delete Snippet (UI)
1. In snippets panel, find a test snippet
2. Click 🗑️ delete button
3. Confirm in dialog
4. **Verify:**
   - Snippet removed from panel
   - Toast: "Deleted snippet: ..."
   - Snippet removed from Google Sheet

### Test 8: Delete Snippet (LLM)
1. In chat, type: "Delete the snippet titled 'Test Snippet'"
2. **Expected:** LLM calls `manage_snippets` with action: "delete"
3. **Verify:**
   - SSE event: `snippet_deleted`
   - Toast: "Deleted snippet: Test Snippet"
   - Snippet removed from sheet

### Test 9: Tag Filtering
1. Create snippets with multiple tags
2. In snippets panel, click 2-3 tag pills
3. **Verify:** Only snippets with ALL selected tags shown (AND logic)
4. Click tag pills again to deselect
5. **Verify:** Filters removed

### Test 10: Expand/Collapse Snippet
1. Find a snippet with content
2. Click "▸" expand button
3. **Verify:** 
   - Content visible
   - URL visible (if present)
   - Copy button appears
4. Click "▾" collapse button
5. **Verify:** Content hidden

---

## Verify Google Sheets Integration

### Check User's Google Drive
1. Go to: https://drive.google.com
2. Navigate to: "Research Agent" folder (created automatically)
3. Open: "Research Agent Swag" spreadsheet
4. Select: "Snippets" sheet
5. **Verify Schema:**
   - Column A: ID (numbers)
   - Column B: Created At (ISO timestamps)
   - Column C: Updated At (ISO timestamps)
   - Column D: Title (text)
   - Column E: Content (text)
   - Column F: Tags (CSV)
   - Column G: Source (chat/url/file/manual)
   - Column H: URL (text or empty)

### Check Data Integrity
1. Insert snippet via chat
2. Verify row appears in Google Sheet
3. Check:
   - ID is auto-incremented
   - Created At and Updated At match
   - Tags are normalized (lowercase, sorted, CSV)
   - All fields populated correctly

---

## Browser Console Checks

### SSE Events (Todos)
```javascript
// Should see in console:
✅ Todos updated: { total: 3, remaining: 2, current: {...}, items: [...] }
✅ Todos current update: { total: 3, remaining: 2, current: {...} }
🔄 Todos resubmitting: { next: "Task B", state: {...} }
```

### SSE Events (Snippets)
```javascript
// Should see in console:
📝 Snippet inserted: { id: 1, title: "OAuth Pattern", tags: [...] }
🗑️ Snippet deleted: { id: 1, title: "Test Snippet" }
✏️ Snippet updated: { id: 2, title: "Updated Title", tags: [...] }
```

### Network Tab
1. Open DevTools → Network
2. Filter: XHR/Fetch
3. Create a snippet
4. **Verify:** Requests to:
   - `https://www.googleapis.com/drive/v3/files` (find/create folder)
   - `https://sheets.googleapis.com/v4/spreadsheets` (create/update sheet)

---

## Error Cases to Test

### Missing Authentication
1. Logout from Google
2. Try to create a snippet
3. **Expected:** Error: "Authentication required. Please login with Google"

### Invalid Snippet Data
1. Via chat, ask LLM to: "Create a snippet with no title"
2. **Expected:** Error: "Both title and content are required"

### Network Errors
1. Disable internet
2. Try to create snippet
3. **Expected:** Error toast with network error message
4. Re-enable internet
5. Retry operation

### Todos Limit
1. Create 15 todos
2. Let auto-progression run
3. **Expected:** Stops at MAX_TODO_AUTO_ITERATIONS (10)
4. **Verify:** Warning toast appears

---

## Performance Checks

### Large Snippet Collections
1. Create 50+ snippets (can script this)
2. Open snippets panel
3. **Verify:** 
   - Panel loads smoothly (<1s)
   - Scroll is smooth
   - Search/filter responsive

### Concurrent Operations
1. Insert snippet via chat
2. Simultaneously create snippet via UI
3. **Verify:**
   - Both complete successfully
   - IDs are unique
   - No race conditions

---

## Accessibility Checks

### Keyboard Navigation
1. Press Tab repeatedly
2. **Verify:** Can navigate:
   - "Snippets" button
   - "+ Capture" button
   - Search input
   - Tag pills
   - Snippet cards
   - Delete buttons

### Screen Reader
1. Enable screen reader (macOS: VoiceOver, Windows: NVDA)
2. Navigate snippets panel
3. **Verify:** 
   - Button labels announced
   - Snippet titles read
   - Form inputs labeled

---

## Test Checklist

### Todos Feature
- [ ] Create todos via chat
- [ ] Todos panel displays correctly
- [ ] Auto-progression works after assessor OK
- [ ] Expand/collapse todos list
- [ ] Status icons correct (✅ 🟡 ⏳)
- [ ] Max iterations cap enforced
- [ ] SSE events received (console)

### Snippets Feature - Backend
- [ ] Insert snippet (chat)
- [ ] Capture snippet (UI)
- [ ] Get snippet (chat)
- [ ] Search snippets (chat)
- [ ] Delete snippet (chat + UI)
- [ ] Google Sheet created in Drive
- [ ] Schema correct (8 columns)
- [ ] Data persisted correctly

### Snippets Feature - Frontend
- [ ] Open/close snippets panel
- [ ] "+ Capture" modal works
- [ ] Search input filters
- [ ] Tag pills filter (AND logic)
- [ ] Expand/collapse snippet content
- [ ] Delete confirmation
- [ ] Toast notifications
- [ ] SSE events update UI

### Integration
- [ ] ChatTab "Snippets" button toggles panel
- [ ] SSE events flow: backend → ChatTab → SnippetsPanel
- [ ] User email passed correctly
- [ ] OAuth token works for Sheets API

### Error Handling
- [ ] Missing auth handled gracefully
- [ ] Invalid data rejected
- [ ] Network errors shown in toast
- [ ] Empty states displayed correctly

---

## Known Issues / Limitations

### Current Implementation
- **Delete operation:** Rewrites entire sheet (not optimized for >1000 snippets)
- **No pagination:** All snippets loaded at once
- **No offline mode:** Requires internet connection
- **No collaborative editing:** Single-user only

### Future Enhancements
- [ ] Row-level updates instead of full rewrite
- [ ] IndexedDB caching for offline access
- [ ] Pagination for large collections (>1000)
- [ ] Real-time collaborative editing
- [ ] Snippet versioning/history
- [ ] Export snippets to JSON/CSV
- [ ] Import snippets from files

---

## Troubleshooting

### "Cannot find snippets panel"
- **Solution:** Check that ChatTab imported SnippetsPanel correctly
- **Verify:** `import { SnippetsPanel } from './SnippetsPanel';` at top of ChatTab.tsx

### "Snippet not appearing in Google Sheet"
- **Solution:** Check OAuth token is valid
- **Verify:** Network tab shows successful Sheets API calls
- **Check:** User is logged in with correct Google account

### "Todos auto-progression not working"
- **Solution:** Check assessor is returning OK result
- **Verify:** Console shows: `🔄 Todos resubmitting: { next: "..." }`
- **Check:** MAX_TODO_AUTO_ITERATIONS not reached

### "SSE events not received"
- **Solution:** Check EventSource connection
- **Verify:** Network tab shows `/chat` stream open
- **Check:** Backend writeEvent callback working

---

## Success Criteria ✅

All tests pass and:
- ✅ Todos auto-progression works reliably
- ✅ Snippets persist to Google Sheets
- ✅ UI panels display and update correctly
- ✅ SSE events flow correctly
- ✅ Error handling graceful
- ✅ No console errors (except pre-existing)
- ✅ Performance acceptable (<1s load times)
- ✅ Keyboard navigation works

---

**Ready for:** Local testing and verification  
**Next Step:** Write unit and integration tests  
**Deployment:** After successful testing
