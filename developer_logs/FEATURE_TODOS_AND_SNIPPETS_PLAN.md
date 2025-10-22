# FEATURE: Todos Tool, Assessor Progression, UI Panel, and Snippets via Google Sheets

Date: 2025-10-20

This document consolidates and expands the plan for a backend-managed todos workflow (model-callable, assessor-driven auto-progression, SSE updates, above-input UI panel) and adds a full plan for a Snippets tool backed by a user-owned Google Sheet named: "Research Agent/Research Agent Swag". It includes detailed contracts, code skeletons, and test matrices to enable TDD.

NOTE: Plan-first, local-first. Do not deploy to Lambda during iteration. Use make dev for backend, and the UI dev server locally. Secrets belong in .env and must be deployed with make deploy-env only when production-ready.

## 1) Todos Tool and UI Panel

### Goals
- Tool: manage_todos (add/delete), OpenAI-compatible function schema
- Server-side per-stream queue with current/remaining tracking
- Assessor OK advances the queue and auto-resubmits next todo in the same stream
- SSE events: todos_updated, todos_current, todos_resubmitting
- UI: compact expandable panel immediately above the chat input

### Contracts
- Tool: manage_todos
  - params: { add?: string[], delete?: (string|number)[] }
  - returns: { success: boolean, state: TodosState }
- TodosState: { total: number, remaining: number, current: Todo|null, items: Todo[] }
- Todo: { id: string|number, description: string, status: 'pending'|'current'|'done' }
- SSE events:
  - todos_updated: { total, remaining, current, items }
  - todos_current: { current, remaining, total }
  - todos_resubmitting: { next: string, state?: TodosState }

### Backend: Code Skeletons

File: src/utils/todos-manager.js
- Class TodosManager(writeEvent)
  - items: Todo[]; nextId: number
  - getState(): TodosState
  - add(descriptions: string[]): TodosState (emit todos_updated/current)
  - delete(matchers: (string|number)[]): TodosState (supports id or exact description; emit events)
  - completeCurrent(): TodosState (mark current done, next pending->current; emit events)
  - hasPending(): boolean

File: src/tools.js (excerpt)
- toolFunctions += manage_todos definition (OpenAI schema)
- callFunction('manage_todos', args, context)
  - ensure context.__todosManager bound to TodosManager(writeEvent)
  - apply add/delete, emit todos_updated, return JSON.stringify({ success: true, state })

File: src/endpoints/chat.js (integration points)
- Instantiate TodosManager with sseWriter.writeEvent
- Attach to toolContext (__todosManager)
- After assessor OK: todosManager.completeCurrent(); if remaining>0 and current exists then:
  - writeEvent('todos_resubmitting', { next: state.current.description, state })
  - push synthetic message: { role:'user', content: `NEXT_TODO: ${state.current.description}` }
  - continue streaming loop; cap resubmits per request (e.g., MAX_TODO_ADVANCES=5)

### UI: Code Skeletons (React/TypeScript)

File: ui-new/src/components/ChatTab.tsx
- State:
  - todosState: TodosState|null
  - todosExpanded: boolean
  - todosResubmitting: string|null
- SSE handler additions inside streaming callback:
  - case 'todos_updated': set full state
  - case 'todos_current': partial update (preserve items)
  - case 'todos_resubmitting': set ephemeral banner text for 2s
- Rendering panel above input when todosState?.total>0
  - shows counts, current description, expand/collapse, list with status icons
  - use minimal Tailwind utility classes consistent with existing UI style
- Types: define a TodosState type near component or in a shared types module to avoid implicit any

### Tests: Todos (TDD)

Unit tests (tests/unit/todos.test.js)
- TodosManager.add(): preserves order, sets first current, emits events
- TodosManager.delete(): delete by id and by exact description; re-activates current if needed; emits events
- TodosManager.completeCurrent(): marks current done, advances next; emits events
- manage_todos tool: schema acceptance; add-only; delete-only; mixed; emits todos_updated

Integration tests (tests/integration/chat-todos.test.js)
- Simulate chat stream with model function call to manage_todos(add:["A","B"]) and assessor ok
- Assert SSE sequence: todos_updated (after add), todos_current (after add), then after OK -> todos_updated/current, todos_resubmitting
- Assert synthetic NEXT_TODO message is injected and loop caps at MAX_TODO_ADVANCES
- Mock assessor to return ok on first, fail on second to end loop and verify no resubmit

UI tests (tests/ui/ChatTab.todos.test.tsx)
- Render ChatTab with injected SSE event dispatcher
- Fire todos_updated and todos_current and assert panel shows counts and current description
- Toggle expand and assert list items and icons
- Fire todos_resubmitting and assert ephemeral banner appears then clears

Notes
- Keep changes local; use make dev for backend iterations; UI via npm run dev in ui-new
- Ensure .env changes are not committed; deploy to Lambda only after all tests pass locally

## 2) Snippets Tool back by Google Sheets (Research Agent/Research Agent Swag)

### Goals
- Provide a model-callable snippets tool with operations: insert, capture, get, search, delete
- Use a user-owned Google Sheet as the source of truth: Spreadsheet name/path: "Research Agent/Research Agent Swag"
- Emit SSE snippet_* events so UI can refresh snippet state and RAG caches
- UI integrates with existing RAG/knowledge base patterns; do not persist locally beyond cache

### Contracts
- Tool: manage_snippets
  - parameters (OpenAI-compatible schema):
    - action: 'insert'|'capture'|'get'|'search'|'delete'
    - payload?: object (depends on action)
      - insert: { title: string, content: string, tags?: string[] }
      - capture: { source: 'chat'|'url'|'file', content?: string, url?: string, title?: string, tags?: string[] }
      - get: { id?: string|number, title?: string }
      - search: { query: string, tags?: string[] }
      - delete: { id?: string|number, title?: string }
  - returns: { success: boolean, data?: any, error?: string }

- SSE events
  - snippet_inserted: { id, title, tags }
  - snippet_deleted: { id, title }
  - snippet_updated: { id, title, tags }
  - snippet_indexed: { id, embeddingProvider?: string }

### Backend Design

Module: src/services/google-sheets-snippets.js
- Responsibility: read/write snippets to Google Sheets
- Sheet location: by spreadsheet title or folder path "Research Agent/Research Agent Swag" (resolve ID via cached lookup)
- Columns (recommended): id, created_at, updated_at, title, content, tags (csv), source, url
- Methods:
  - init(auth): ensures sheet exists; caches spreadsheetId & sheetId
  - insert({ title, content, tags, source, url }): returns { id, ... }
  - update({ id, ...fields })
  - remove({ id } | { title })
  - get({ id } | { title })
  - search({ query, tags }): naive contains on title/content/tags; consider later vectorization

Auth and Env
- Use existing Google OAuth pattern referenced in GOOGLE_SHEETS_LOGGING*.md
- .env keys (examples; placeholders only):
  - GOOGLE_CLIENT_ID=
  - GOOGLE_CLIENT_SECRET=
  - GOOGLE_REFRESH_TOKEN=
  - GOOGLE_SHEETS_SNIPPETS_SPREADSHEET="Research Agent/Research Agent Swag"
  - Optional: GOOGLE_SHEETS_SNIPPETS_SHEET="Snippets"
- Strictly avoid committing real credentials; add to .env.example with placeholders

Tools Registry: src/tools.js
- Add tool function: manage_snippets
  - switch on action, call google-sheets-snippets.js
  - emit SSE on insert/update/delete and optionally snippet_indexed after async embedding

Optional Indexing and RAG
- On insert/update, enqueue embedding computation (provider flag from existing embeddings pipeline) and post snippet_indexed when ready
- Make available to existing search endpoints if a RAG index exists; else keep in Sheets-only search for MVP

### UI Integration
- On snippet_* events, UI refreshes snippet store (request snippets list or diff update)
- Add a minimal snippets panel toggle near the RAG/KB controls; defer rich UI to a later feature
- For "capture" from chat, provide a client-side tool that forwards selection to backend manage_snippets(action:'capture')

### Tests: Snippets (TDD)

Unit tests (tests/unit/snippets.service.test.js)
- insert: writes a row, returns id, emits snippet_inserted
- get: retrieves by id and by title
- search: query matches title/content/tags; tags filter narrows results
- delete: removes row, emits snippet_deleted
- Error cases: missing sheet, auth failure -> returns success:false with error

Unit tests (tests/unit/snippets.tool.test.js)
- manage_snippets validation for each action shape
- mocks service; verifies SSE events emitted correctly

Integration tests (tests/integration/snippets.test.js)
- Simulate chat function call to manage_snippets(insert) and ensure SSE + returned data
- If embedding pipeline mock exists, simulate snippet_indexed event after insert

UI tests (tests/ui/SnippetsPanel.test.tsx)
- On snippet_inserted, ensure refresh and item appears
- On snippet_deleted, item disappears
- Capture from chat: simulate action and assert event-driven refresh

### Implementation Notes
- Prefer batching Google Sheets API calls when reading many rows
- Normalize tags to lowercase and sort for stable comparisons
- ID strategy: monotonic numeric id column; if not present, generate UUID and store in a dedicated column
- Rate limits: backoff with retries; surface user-visible warning on repeated failure

## Local-First Workflow and Safety

- Backend changes: restart local server

```
make dev
```

- UI dev server

```
cd ui-new
npm install
npm run dev
```

- Verify local backend detection in UI console and observe SSE events
- Never commit .env; use .env.example for templates and placeholders
- When env changes are needed in production, run:

```
make deploy-env
```

## Acceptance Criteria

Todos
- manage_todos adds/deletes with correct state and events
- assessor OK advances and auto-resubmits capped by MAX_TODO_ADVANCES
- UI panel reflects counts/current and expands list with status icons
- Unit/integration/UI tests pass locally

Snippets
- manage_snippets supports insert/capture/get/search/delete; updates Google Sheets
- Emits snippet_* events on changes; optional snippet_indexed after embedding
- UI reacts to events and displays minimal snippets controls
- Unit/integration/UI tests pass locally

## Risks and Mitigations
- Infinite todo loops: cap advances; log when cap reached
- TypeScript strictness: define TodosState and snippet types; avoid implicit any; ensure React types present
- Sheets API quotas and auth: use backoff; cache spreadsheetId; clear errors to user on auth issues
- Embedding cost/latency: make indexing optional; batch later if needed

## References
- developer_log/FEATURE_TODOS_TOOL_AND_UI.md (detailed todos examples and code)
- GOOGLE_SHEETS_LOGGING.md and GOOGLE_SHEETS_LOGGING_SETUP.md (auth patterns)
- RAG_COMPLETE_SUMMARY.md and rag-sources/README.md (RAG design)
- SNIPPET_CASTING_COMPLETE.md and AUTO_CAST_SNIPPETS.md (related snippets UX)
