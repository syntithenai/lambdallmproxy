# Frontend Rebuild & UX Specification

This document enables a complete re‑implementation of the frontend UI from first principles. It specifies DOM structure, layout strategy, visual styles, color usage, component behaviors, streaming update logic, and integration assumptions with the backend SSE event contract.

---
## 1. Purpose & Core Principles

The frontend is a lightweight, dependency‑minimal, modular vanilla JavaScript application that:
1. Sends a POST query to the Lambda endpoint and consumes an SSE stream.
2. Renders progressive research state: persona, research questions, tool execution, intermediate search/activity logs, and final answer.
3. Surfaces cost and token usage meta after synthesis.
4. Provides minimal authentication (Google Sign-In) and API key management for providers (OpenAI / Groq).
5. Maintains a responsive, compact “research workstation” layout with emphasis on clarity and incremental feedback.

Design constraints:
- Zero framework (no React/Vue) – purely modular JS files.
- Index template (`ui/index_template.html`) is the source of truth; built assets are generated to `docs/`.
- All UI state transitions respond to SSE events defined by backend spec; event names are semantic API surface.

---
## 2. High-Level Layout Regions

DOM Primary Regions (top-to-bottom order in template):
1. Toast Container: `<div id="toast-container" class="toast-container"></div>` – ephemeral notifications.
2. Top Bar (`.top-bar`): Compact horizontal bar with title, model selector, sample button, submit/stop/continue controls (left) and auth/settings (right).
3. Google Button Fallback Container: `#google-button-container` (absolute positioned for GIS widget injection).
4. Settings Dialog: Hidden overlay for API key storage & management.
5. Persona & Research Questions Layout: Container holding two cards (Persona / Research Strategy) revealed when events arrive.
6. Compact Form Container: Houses query `<textarea>` inside `<form id="llm-form">` plus hidden `access_secret` field & Lambda URL script assignment.
7. Status Sections Placeholder: `<div class="status-sections"></div>` – can host future progress cards.
8. Response Container: `<div id="response-container" class="compact-response-container"></div>` – dynamic insertion point for answer, metadata, expandable panels.

Visual Flow: Top bar is always visible. All subsequent regions stack vertically with generous padding and minimal borders. Persona & Research Questions appear after planning phases. Response container becomes visible on first `init` event.

---
## 3. Color & Visual System (Inferred Palette)

Though full CSS not reproduced here, inlined styling within event handlers reveals gradient and accent system:
- Primary accent blues: `#007bff` (links, persona card border), `linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)` (strategy cards), white text overlays.
- Success / progress greens: `#28a745` (tool result border), soft gradients for accepted events.
- Warning / pause / iteration: `linear-gradient(135deg, #fa709a 0%, #fee140 100%)` (iteration steps), amber `#ffc107` highlight badges.
- Neutral greys: `#6c757d` (tool planning boxes), `#f8f9fa` (light backgrounds), subtle borders `#dee2e6`.
- Error gradient: `linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)` with deep red text (#721c24) inside.
- Cost emphasis: red border `#dc3545` wrapper for cost total, blue `#007bff` for token counts, green `#28a745` for iteration counts.

Typography: System default stack; headings stylized via inline `<strong>` or gradient container emphasis. Token/cost badges use smaller font (0.8–0.9em) plus pill style (rounded, semi‑transparent backgrounds).

Spacing & Geometry:
- Card padding: 8–15px.
- Border radius: 4–8px standard.
- Tool logs: left border accent (3–4px) indicating semantic category (gray=plan, green=result).
- Gradient cards: Light shadow `box-shadow: 0 2px 10px rgba(0,0,0,0.1)` for depth.

---
## 4. Component Specifications

### 4.1 Top Bar (`.top-bar`)
Structure:
```
<div class="top-bar">
  <div class="top-bar-left">
    <h1 class="compact-title">AI Search</h1>
    <div class="inline-controls">
      <select id="model">…</select>
      <button id="sample-queries-btn">📝 Samples</button>
      <button id="submit-btn" disabled>Sign in or add API key</button>
      <button id="stop-btn" style="display:none;">Stop</button>
      <button id="continue-btn" style="display:none;">Continue in 60s</button>
    </div>
  </div>
  <div class="top-bar-right">
    <button id="login-btn"><span id="login-text">Sign in with Google</span></button>
    <button id="settings-btn" title="Settings">⚙️</button>
  </div>
</div>
```
Behavior:
- `model` select prepopulates Groq & OpenAI model groups.
- `submit-btn` disabled until auth or API key present.
- `stop-btn` shown during active stream; `continue-btn` shown during pause/quota wait with countdown text (handled by countdown timer module not shown here but referenced).
- `sample-queries-btn` toggles sample dropdown anchored relative to top bar.

### 4.2 Settings Dialog
Elements:
- Container `.settings-dialog` hidden by default (likely `display:none` until toggled).
- Inputs: `#openai_api_key`, `#groq_api_key` with adjacent help `?` buttons.
- Clear buttons appear when a key is stored (JS toggled `display` attribute).
Behavior:
- Keys persisted (localStorage) through settings module.
- Status `<small>` elements updated to indicate stored/active state.

### 4.3 Persona & Research Questions Cards
Two sibling cards inside `.persona-questions-layout` (initially `.hidden`).
Each card: header bar (emoji + label), followed by body text.
Visibility triggered by `persona` and `research_questions` events.
Research strategy card renders questions as `<ul>` plus optional reasoning block (italicized small text).

### 4.4 Query Form
Single `<textarea id="prompt" class="auto-resize-textarea">` sized to one row initially; expands with content.
Hidden `access_secret` input included for backend gating.
Submission initiates streaming fetch; disables submit and displays stop button.

### 4.5 Response Container
Dynamic host for:
- A header `<h3>` (not originally in template but implied by styling inside response updates – final response header updated with cost badge).
- Answer content region (`answerElement` reference – inserted by code, typically a div appended with formatted Markdown / HTML; uses `marked` global library for Markdown rendering if invoked).
- Metadata panel (grid of result counts, iterations, completion time) styled with colored left borders.
- Expandable sections (Tools, Cost Breakdown) – realized as hidden blocks toggled once data arrives (IDs referenced in events.js: `expandable-cost-section`, `cost-badge`, `cost-breakdown-content`). If rebuilding, define these inside response container markup so event handlers can target them.

### 4.6 Tools Panel & Logs
Represented via `toolsPanel`, `toolsLog` elements (not shown in template snippet but referenced inside event processor). Rebuild assumption: create within response container:
```
<div id="tools-panel" style="display:none;">
  <h4>Tool Activity</h4>
  <div id="tools-log"></div>
</div>
```
Each `tools` event inserts planning box; each `tool_result` event appends green-accented result card (with args + output `pre` blocks). Additional instrumentation optionally updates a real-time monitoring subsystem (if present).

### 4.7 Cost Breakdown Section
IDs used: `expandable-cost-section`, `cost-badge`, `cost-breakdown-content`.
When `cost_summary` arrives → section made visible, pill badge shows `$<totalCost>`; grid layout displays total cost & token counts; step breakdown iterates `stepCosts` with each row styled with left colored border.

### 4.8 Timers & Active Search Indicators
Search iteration timers referenced through context methods: `startSearchTimer(iter, term, index, total)` & `stopSearchTimer(iter, term, state)` generating dynamic countdown bars (implementation in another UI module – ensure to provide container, e.g. an active searches stack `<div id="active-searches"></div>`).

### 4.9 Toast System
`#toast-container` receives ephemeral notifications (success/error/information). Toast manager JS handles creation & lifecycle (close buttons, timeouts). Provide base styles: position fixed top-right (z-index > overlays), stacked vertical spacing.

---
## 5. JavaScript Module Responsibilities

| Module | Purpose |
| ------ | ------- |
| `utils.js` | Shared helpers (DOM selection, formatting, fetch wrappers, maybe debounce). |
| `auth.js` | Google Sign-In integration, token verification, storing user state, enabling submit button. |
| `settings.js` | Load/save provider API keys, update UI state of inputs & clear buttons. |
| `samples.js` | Populate & toggle sample queries dropdown; inject sample text into prompt. |
| `state-manager.js` | Central ephemeral state (current query, timers, results state objects). |
| `toast-manager.js` | Create/dismiss toast notifications. |
| `error-handler.js` | Centralized error display & logging to console + toast. |
| `ui-manager.js` | Higher-level DOM composition for response container, inserting expandable panels, answer area. |
| `countdown-timer.js` | Implements countdown for continuation / pause and per-search progress bars. |
| `events.js` | Pure dispatcher: `processStreamingEvent(type, data, context)` updating UI for each SSE. Rich logging instrumentation baked in. |
| `streaming.js` | Opens SSE connection (fetch with `text/event-stream`), parses chunk boundaries, extracts `event:` + `data:` pairs, invokes `processStreamingEvent` with full context. Includes granular console logs (chunk sizes, parse steps). |
| `main.js` | Entry script: wires event listeners for submit/stop/continue, gathers form data, triggers streaming request, sets up context references and maps (digestMap, metaMap, resultsState). |

Module Load Order (critical): `events.js` must load before `streaming.js` so `processStreamingEvent` is defined globally when streaming begins.

---
## 6. Streaming Event Handling (Frontend Perspective)

`processStreamingEvent` switch handles (subset):
- `init`: Ensure response container visible; set initial status message; optionally append note for env fallback.
- `log`: Update status line.
- `persona` / `research_questions`: Populate card content and reveal card.
- `tools`: Show tools panel, list intended tool calls, update monitoring.
- `tool_result`: Append result card with args & output; update monitoring.
- `llm_response`: If `type === 'final_response'`, re-dispatch as `final_response` for unified handling; otherwise log model response.
- `final_response` OR `final_answer`: Render answer (HTML with pre-wrap), disable stop button, update cost badge if data available.
- `cost_summary`: Populate cost breakdown section; update header with cost and tokens.
- `complete`: Final status + ensure results tree consistent; optionally reset model to cheap default.
- `error`: Show error card + status update; disable controls.
- `interrupt_state`: Hide stop, show continue; display pause card; store state for resumption.
- `search`, `search_results`, `search_digest`: Maintain live summaries, results tree, timers.

Context object passed into dispatcher includes references:
```
{
  statusElement, stepsElement, toolsPanel, toolsLog,
  responseElement, answerElement, metadataElement, metadataContent,
  searchSummaryList, fullResultsTree, activeSearchesEl,
  formStopBtn, digestMap, metaMap, resultsState,
  startSearchTimer, stopSearchTimer, stopAllTimers,
  updateLiveSummary, updateFullResultsTree
}
```

Persistent Maps:
- `digestMap`: Key = `${iteration}|${term}`; value = { summary, links[] }.
- `metaMap`: Key = same; value = { subQuestion, keywords[] }.
- `resultsState`: { byIteration: { [iteration]: { [searchTerm]: resultArray } } }.

---
## 7. Accessibility & Progressive Enhancement

Considerations for rebuild:
- Ensure buttons have discernible text or emoji plus text label.
- Maintain keyboard focus management for settings dialog (trap focus when open; return focus to invoking control on close).
- Provide `aria-live="polite"` region for status updates (statusElement) to announce progress for screen readers.
- Semantic `<ul>` lists for research questions to aid screen reader navigation.

---
## 8. State & Resilience Patterns

Error Resilience:
- Missing DOM nodes cause console errors but not fatal runtime – logging is verbose (prefixed with emojis) to simplify debugging.
- Final answer rendering tolerant: uses `eventData.response || eventData.content` fallback.

Continuation UX:
- When backend issues `quota_exceeded` or `interrupt_state`, UI switches to paused mode and reveals `continue-btn`. A timer updates its label (e.g., “Continue in 60s” counting down). On resume, previously rendered tool and LLM events are already present; backend may re-emit them with `continued: true` flags.

---
## 9. Styling Implementation Guide

Core CSS to recreate (conceptual outline):
```
body { font-family: system-ui, sans-serif; margin:0; background:#f5f7fa; color:#222; }
.top-bar { display:flex; justify-content:space-between; align-items:center; padding:8px 16px; background:#1f2430; color:#fff; position:sticky; top:0; z-index:50; }
.compact-title { font-size:1.1rem; margin:0 12px 0 0; }
.inline-controls { display:flex; gap:8px; align-items:center; }
select.compact-select, .compact-btn { height:32px; font-size:0.85rem; }
.compact-btn { background:#2d3342; color:#fff; border:1px solid #3a4152; border-radius:4px; padding:4px 10px; cursor:pointer; }
.compact-btn.submit-btn { background:#2b6cb0; border-color:#2b6cb0; }
#stop-btn { background:#c53030; border-color:#9b2c2c; }
#continue-btn { background:#d69e2e; border-color:#b7791f; }
.persona-card, .questions-card { background:#fff; border-radius:6px; padding:12px 16px; margin:12px 0; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
.persona-card-header, .questions-card-header { font-weight:600; margin-bottom:6px; }
.compact-form-container { padding:12px 16px; }
.auto-resize-textarea { width:100%; resize:vertical; min-height:42px; font:inherit; padding:10px; border:1px solid #cbd5e0; border-radius:6px; }
.compact-response-container { margin:10px 16px 40px; background:#202633; color:#fff; padding:20px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.15); display:none; }
pre { background:#282c34; color:#e2e8f0; padding:8px 10px; border-radius:4px; overflow:auto; font-size:0.75rem; }
.toast-container { position:fixed; top:12px; right:12px; z-index:1000; display:flex; flex-direction:column; gap:8px; }
```

---
## 10. Networking & Streaming Logic

Fetch pattern (conceptual):
1. Construct POST body: `{ query: promptValue, model: selectedModel, apiKey?, accessSecret?, googleToken? }`.
2. Set `Accept: text/event-stream` header.
3. Read `response.body.getReader()`; accumulate bytes into text buffer; split by double newlines to extract SSE frames.
4. For each frame extract `event:` line (default to `message` if absent) and `data:` lines (concatenate, JSON parse).
5. Invoke `processStreamingEvent(eventType, parsedData, context)`.
6. Abort controller used when user clicks Stop.

Edge cases: Partial frames may span chunks; keep remainder buffer between reads. Empty heartbeat lines ignored.

---
## 11. Markdown Rendering

The template loads `marked.min.js`. To reproduce: after final response content is received, if content includes Markdown, pass through `marked.parse(text)` before injecting. Ensure sanitization for security – current code appears to trust model output (rebuild should optionally sanitize or escape). If re-implementing sanitization: allow basic formatting (bold, italics, lists, code) and block unsafe HTML (script/style if present).

---
## 12. Rebuild Checklist

1. Implement HTML skeleton with all ID hooks used by event dispatcher.
2. Ensure script load order: utilities → auth/settings/samples → state & managers → events → streaming → main.
3. Implement `processStreamingEvent` with complete switch – treat event names as contract.
4. Provide context assembly in `main.js` mapping DOM nodes & helper methods to dispatcher params.
5. Implement auto-resize textarea (input & change listeners adjusting height based on scrollHeight).
6. Implement stop/continue logic tied to AbortController and saved `interrupt_state` object.
7. Add cost & tools expandable sections within response container so events can populate them.
8. Provide summary & full results tree DOM nodes if replicating advanced search visualization (IDs referenced: `searchSummaryList`, `fullResultsTree`).
9. Ensure robust console diagnostics for missing elements (helps debugging early).
10. Wrap all dynamic DOM updates in try/catch or existence checks to avoid fatal errors mid-stream.

---
## 13. Progressive Enhancements / Future Extensions

- Add local transcript export (serialize received events).
- Add retry with exponential backoff for transient network errors before declaring `error`.
- Add dark/light theme toggle (currently hard-coded dark accent for response container).
- Add keyboard shortcuts (Ctrl+Enter submit, Esc stop/close dialogs).
- Implement virtualization for long tool logs to keep DOM lightweight.

---
## 14. Security Considerations

- Escape tool output strings when inserting into `<pre>` to prevent accidental HTML injection (current version writes raw text – replication should consider `textContent` not `innerHTML`).
- If enabling Markdown, sanitize or whitelist tags.
- Do not persist API keys beyond localStorage; never echo them back to server.

---
## 15. Minimal Data Contracts (Frontend Expectations)

```
final_answer: { content, timestamp, costSummary? }
cost_summary: { totalCost, tokenCounts:{input,output,total?}, stepCosts:[ { stepName, model, cost, inputTokens, outputTokens } ] }
tools: { iteration, pending, calls:[ { call_id, name, args } ] }
tool_result: { iteration, call_id, name, args, output }
persona: { persona }
research_questions: { questions[], reasoning? }
quota_exceeded: { waitTime, continuationState{...} }
error: { error }
```

---
## 16. Completion Criteria for Rebuild

A successful replication will:
1. Render streaming status within 500ms of request start.
2. Show persona & questions after setup events (or fallback) without manual refresh.
3. Log each tool call and result with visually distinct styling.
4. Display final answer & cost summary, updating header cost pill.
5. Handle simulated quota event by transitioning to paused mode with Continue control.
6. Recover gracefully from intentionally malformed tool outputs without crashing.

---
## 17. Summary

This frontend specification exhaustively captures structure, styling intent, state flows, and event-driven rendering logic necessary to rebuild the UI. Fidelity hinges on strict adherence to event naming and DOM ID hooks. Internal module code may vary if external behavior (rendered DOM and user interaction outcomes) remains identical.
