# FEATURE: Todos Tool, Assessor-driven Progression, and UI Panel

Date: 2025-10-20

This document is the plan and detailed design (with code examples) for adding a backend-managed todos workflow callable by the model, integrating with the assessor phase to auto-progress through tasks, and exposing an above-input UI panel that reflects the todo state live via SSE events.

NOTE: This is a planning document. Code snippets below are examples of intended changes, provided to clarify the design and serve as TDD targets. Development follows our Local-First workflow; do not deploy until all local checks pass.

## Goals and scope

- Add a new tool, `manage_todos`, to let the model add/delete actionable steps.
- Maintain todos server-side (per chat request), track current/remaining, and advance after an “OK” assessor result.
- Auto-resubmit the conversation with the next todo appended as a synthetic user message.
- Stream SSE events for todos updates; update the UI with a compact, expandable panel above the input.

Out of scope (initially): persistence across sessions, shared queues, advanced prioritization. The manager is in-memory for a single streaming chat cycle.

## Contracts and data shapes

Tool: `manage_todos`
- Parameters (OpenAI-compatible schema):
	- `add?: string[]` — descriptions to add in order
	- `delete?: (string | number)[]` — ids or exact descriptions to remove
- Returns: `{ success: boolean, state: TodosState }`

TodosState
- `{ total: number, remaining: number, current: Todo | null, items: Todo[] }`
- `Todo: { id: string | number, description: string, status: 'pending' | 'current' | 'done' }`

SSE Events
- `todos_updated`: `{ total, remaining, current, items }` (full state)
- `todos_current`: `{ current, remaining, total }` (lightweight update)
- `todos_resubmitting`: `{ next: string, state?: TodosState }` (informational)

## Backend design

Files involved
- `src/tools.js` — register tool and dispatch execution
- `src/utils/todos-manager.js` — new in-memory manager
- `src/endpoints/chat.js` — wire manager and assessor/auto-resubmission

### TodosManager (new)

Responsibilities:
- Maintain an ordered queue of todos
- Mark first as `current` upon activation
- On completion, mark current `done` and advance next `pending` → `current`
- Emit SSE events on any change

Example shape:

```js
// src/utils/todos-manager.js
class TodosManager {
	constructor(writeEvent) {
		this.writeEvent = writeEvent; // (type, data) => void
		this.items = []; // [{ id, description, status }]
		this.nextId = 1;
	}

	_emit(type, data) {
		try { if (this.writeEvent) this.writeEvent(type, data); } catch {}
	}

	getState() {
		const total = this.items.length;
		const current = this.items.find(i => i.status === 'current') || null;
		const remaining = this.items.filter(i => i.status !== 'done').length;
		return { total, remaining, current, items: this.items };
	}

	add(descriptions = []) {
		descriptions.forEach(desc => this.items.push({ id: this.nextId++, description: String(desc), status: 'pending' }));
		// Activate first item as current if none exists
		if (!this.items.some(i => i.status === 'current') && this.items.some(i => i.status === 'pending')) {
			const firstPending = this.items.find(i => i.status === 'pending');
			if (firstPending) firstPending.status = 'current';
		}
		const state = this.getState();
		this._emit('todos_updated', state);
		this._emit('todos_current', { current: state.current, remaining: state.remaining, total: state.total });
		return state;
	}

	delete(matchers = []) {
		const toDelete = new Set(matchers.map(String));
		this.items = this.items.filter(i => !toDelete.has(String(i.id)) && !toDelete.has(i.description));
		// Ensure there is a current item if items remain
		if (!this.items.some(i => i.status === 'current')) {
			const firstPending = this.items.find(i => i.status === 'pending');
			if (firstPending) firstPending.status = 'current';
		}
		const state = this.getState();
		this._emit('todos_updated', state);
		this._emit('todos_current', { current: state.current, remaining: state.remaining, total: state.total });
		return state;
	}

	completeCurrent() {
		const current = this.items.find(i => i.status === 'current');
		if (current) current.status = 'done';
		const nextPending = this.items.find(i => i.status === 'pending');
		if (nextPending) nextPending.status = 'current';
		const state = this.getState();
		this._emit('todos_updated', state);
		this._emit('todos_current', { current: state.current, remaining: state.remaining, total: state.total });
		return state;
	}

	hasPending() { return this.items.some(i => i.status === 'pending' || i.status === 'current'); }
}

module.exports = { TodosManager };
```

### Tool registration and dispatch

Add to `toolFunctions` and handle in `callFunction`:

```js
// src/tools.js (excerpt)
toolFunctions.push({
	type: 'function',
	function: {
		name: 'manage_todos',
		description: 'Manage backend todo queue for multi-step tasks',
		parameters: {
			type: 'object',
			properties: {
				add: { type: 'array', items: { type: 'string' } },
				delete: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] } }
			},
			additionalProperties: false
		}
	}
});

// In callFunction(name, args, context)
case 'manage_todos': {
	const { TodosManager } = require('./utils/todos-manager');
	if (!context.__todosManager) {
		context.__todosManager = new TodosManager((type, data) => context.writeEvent && context.writeEvent(type, data));
	}
	const mgr = context.__todosManager;
	let state = mgr.getState();
	if (Array.isArray(args.add) && args.add.length) state = mgr.add(args.add);
	if (Array.isArray(args.delete) && args.delete.length) state = mgr.delete(args.delete);
	context.writeEvent && context.writeEvent('todos_updated', state);
	return JSON.stringify({ success: true, state });
}
```

### Chat endpoint integration (assessor + auto-resubmission)

High-level flow inside the streaming chat handler:

```js
// src/endpoints/chat.js (pseudo)
const { TodosManager } = require('../utils/todos-manager');
const todosManager = new TodosManager((type, data) => sseWriter.writeEvent(type, data));
toolContext.__todosManager = todosManager;

// After model response and assessor evaluation
if (assessorResult.ok) {
	const state = todosManager.completeCurrent(); // emits events
	if (state.remaining > 0 && state.current) {
		sseWriter.writeEvent('todos_resubmitting', { next: state.current.description, state });
		// Append synthetic user message and loop
		messages.push({ role: 'user', content: `NEXT_TODO: ${state.current.description}` });
		continue; // loop to run the next step in the same stream
	}
}
```

Guardrail: Cap auto-resubmission loops (e.g., max 3–5) per request to avoid infinite cycling.

## UI design (ChatTab)

Placement: An expandable panel appears immediately above the input when there are todos.

State and SSE handling (excerpt):

```tsx
// State
const [todosState, setTodosState] = useState<{
	total: number; remaining: number;
	current: { id: string | number; description: string; status?: string } | null;
	items: Array<{ id: string | number; description: string; status: string }>
} | null>(null);
const [todosExpanded, setTodosExpanded] = useState(false);
const [todosResubmitting, setTodosResubmitting] = useState<string | null>(null);

// SSE handler cases (inside sendChatMessageStreaming callback)
switch (eventType) {
	case 'todos_updated':
		setTodosState({
			total: data.total ?? 0,
			remaining: data.remaining ?? 0,
			current: data.current ?? null,
			items: Array.isArray(data.items) ? data.items : []
		});
		break;
	case 'todos_current':
		setTodosState(prev => ({
			total: data.total ?? (prev?.total ?? 0),
			remaining: data.remaining ?? (prev?.remaining ?? 0),
			current: data.current ?? prev?.current ?? null,
			items: prev?.items ?? []
		}));
		break;
	case 'todos_resubmitting':
		setTodosResubmitting(data?.next || data?.state?.current?.description || null);
		setTimeout(() => setTodosResubmitting(null), 2000);
		break;
}
```

Panel rendering (above input):

```tsx
{todosState && todosState.total > 0 && (
	<div className="mb-3 p-3 border border-yellow-200 dark:border-yellow-800 rounded bg-yellow-50 dark:bg-yellow-900/20">
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2 text-yellow-900 dark:text-yellow-200 font-semibold text-sm">
				<span>✅ Todos</span>
				<span className="text-xs font-normal text-yellow-700 dark:text-yellow-300">
					{todosState.total} total • {todosState.remaining} remaining
				</span>
				{todosResubmitting && (
					<span className="ml-2 text-xs italic text-yellow-800 dark:text-yellow-300">
						Continuing: {todosResubmitting}
					</span>
				)}
			</div>
			<button className="text-xs text-yellow-800 dark:text-yellow-300 hover:underline" onClick={() => setTodosExpanded(v => !v)}>
				{todosExpanded ? '▾ Collapse' : '▸ Expand'}
			</button>
		</div>
		<div className="mt-1 text-sm text-gray-900 dark:text-gray-100">
			<span className="font-medium">Current:</span> {todosState.current?.description || '—'}
		</div>
		{todosExpanded && (
			<ul className="mt-2 max-h-48 overflow-y-auto text-sm divide-y divide-yellow-200 dark:divide-yellow-800">
				{todosState.items.map((item, idx) => (
					<li key={String(item.id) || idx} className="py-1 flex items-start gap-2 text-gray-900 dark:text-gray-100">
						<span className="mt-0.5 text-xs">
							{item.status === 'done' ? '✔️' : item.status === 'current' ? '🟡' : '⏳'}
						</span>
						<span className="flex-1">{item.description}</span>
					</li>
				))}
			</ul>
		)}
	</div>
)}
```

## Test plan (TDD)

Unit tests
- TodosManager
	- add(): order, activation, events
	- delete(): by id/description, events, reactivation of current
	- completeCurrent(): advance logic, events
- manage_todos tool
	- schema acceptance, add-only, delete-only, mixed; event emissions

Example (Jest):

```js
// tests/unit/todos.test.js (excerpt)
const { callFunction } = require('../../src/tools');

test('adds todos and returns state', async () => {
	const writeEvent = jest.fn();
	const result = await callFunction('manage_todos', { add: ['A', 'B'] }, { writeEvent });
	const parsed = JSON.parse(result);
	expect(parsed.success).toBe(true);
	expect(parsed.state.total).toBe(2);
	expect(parsed.state.current.description).toBe('A');
	expect(writeEvent).toHaveBeenCalledWith('todos_updated', expect.any(Object));
});
```

Integration tests
- Chat endpoint: simulate a conversation that triggers manage_todos, return an “OK” assessor result, verify:
	- current marked done, next becomes current
	- todos_resubmitting emitted
	- synthetic “NEXT_TODO: …” user message injected
	- loop caps appropriately

UI tests
- Component tests to simulate SSE payloads and assert:
	- panel visibility and counts
	- current description updates
	- expand/collapse renders all items with icons
	- ephemeral “Continuing…” line appears on resubmission event

## Local-first workflow

- Backend: iterate and restart local dev server

```bash
make dev
```

- UI: hot reload dev server

```bash
cd ui-new
npm install
npm run dev
```

- Verify local backend usage and events
	- Browser console: “🏠 Using local Lambda server at http://localhost:3000”
	- SSE events appear in console logs when todos are added/deleted or advanced

## Acceptance criteria

- Tool adds/deletes todos with accurate state and status transitions
- After assessor “OK,” next todo is auto-resubmitted; SSE events reflect updates
- UI panel shows total, remaining, current; expands to list items with status icons
- Unit/integration/UI tests pass; no regressions to existing tools/features

## Risks and mitigations

- Infinite loops: cap auto-resubmissions per request; expose warning if cap hit
- Large lists: soft-limit visible items in UI or paginate later; truncate with “+N more” indicator
- Ambiguous deletions: prefer id-based deletes; treat description deletes as exact matches only
- Assessor misfires: provide manual recovery/continue (future enhancement), log evaluator decisions for tuning

## Rollout

- Land tests first (red), implement to green, refactor; all local
- Validate end-to-end locally (backend + UI); do not deploy on each change
- Deploy to Lambda only after local verification and sign-off; sync .env changes with `make deploy-env` if applicable

