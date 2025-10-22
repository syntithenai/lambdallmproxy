# Backend Rebuild & Architecture Specification

This document defines everything required for an AI or engineer to fully reconstruct the backend of this project (an AWS Lambda based LLM research/search proxy with streaming, tool use, continuation, and memory/cost safety). It is deliberately exhaustive and implementation‑oriented.

---
## 1. High-Level Purpose

Provide a single Lambda endpoint that:
1. Accepts a POST request containing a user query plus optional model/apiKey/auth fields.
2. Performs (a) initial planning / setup, (b) iterative tool-augmented research (web search, scraping, sandboxed JS), and (c) final answer synthesis.
3. Streams Server‑Sent Events (SSE) back to the client in real time (preferred path) or can fall back to JSON (non-streaming path, though UI forces streaming).
4. Emits rich structured events so the UI can visualize progress, intermediate tool calls, costs, persona, research questions, and final answer.
5. Handles rate limit quota errors gracefully by emitting a continuation state the client can resend to resume work.
6. Applies aggressive token/memory controls to prevent runaway cost or OOM conditions.

---
## 2. Runtime & Deployment Environment

| Aspect | Value |
| ------ | ----- |
| Platform | AWS Lambda (Node.js runtime) |
| Entry Point | `src/index.js` exporting `{ handler }` |
| Primary Logic File | `src/lambda_search_llm_handler.js` (~2k LOC) |
| Packaging | Standard Lambda zip (not described here) |
| Streaming | AWS Lambda Response Streaming (via `awslambda.streamifyResponse`) OR legacy manual stream adapter |
| Protocol | HTTP(S) – POST required for processing queries |
| Output Transport | SSE (`text/event-stream`) – multiple `event:` frames |

Environment variables of note (inferred / used):
- `OPENAI_API_KEY`, `GROQ_API_KEY`: Provider keys (optional if user supplies apiKey).
- `ACCESS_SECRET`: If set, clients must include matching `accessSecret` in request body.
- `FINAL_TEMPLATE`: Overrides default final synthesis prompt template.
- `SYSTEM_PROMPT_DIGEST_ANALYST`: System prompt for search result summarization.
- Optional model override: `OPENAI_MODEL`, `GROQ_MODEL` for summarization or default selection.

---
## 3. Source File Responsibilities

| File | Responsibility |
| ---- | -------------- |
| `src/index.js` | Re-exports main `handler` function (thin facade). |
| `src/lambda_search_llm_handler.js` | End-to-end orchestration: auth, planning, tool loop, synthesis, streaming events, continuation, error handling. |
| `src/providers.js` | Provider catalog (hostnames, paths), parse and config selection functions. |
| `src/tools.js` | Tool schemas (OpenAI function-call style) + dispatcher (`callFunction`) for: `search_web`, `scrape_web_content`, `execute_javascript`; plus summarization support helpers. |
| `src/search.js` | DuckDuckGo search abstraction & optional content fetching. |
| `src/html-parser.js` | Lightweight HTML → text extraction for scraping. |
| `src/llm_tools_adapter.js` | Wrapper to call LLM provider(s) with tool usage compatibility (not fully shown above but referenced). |
| `src/memory-tracker.js` | Memory tracking utilities (TokenAware + simple). |
| `src/config/tokens.js` | Token ceilings for phases (planning, tool synthesis, math, final response) + complexity mapping. |
| `src/config/prompts.js` | System prompt constants like `COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT`. |
| `src/config/memory.js` | Memory safety constants (limits, buffer). |
| `src/utils/error-handling.js` | Rate limit / quota error detection + wait time parsing. |
| `src/utils/token-estimation.js` | Basic JSON parsing & token estimation helper. |
| `src/services/tracking-service.js` | Functions to record tool + LLM calls (emitted events). |
| `src/streaming/sse-writer.js` | `StreamingResponse` aggregator + adapter constructor for SSE. |
| `src/pricing.js` | Pricing table loader & cost calculation (tracks token costs). |
| `src/pricing_scraper.js` | (Optional) Scraper for pricing sources (not central to flow). |

---
## 4. Request Lifecycle (Streaming Path)

Sequence (simplified):
1. Client opens POST including `query`, `model` (e.g. `groq:llama-3.1-8b-instant`), optional `apiKey`, optional Google token, optional `accessSecret`.
2. Handler determines if `Accept` header or query parameter indicates SSE; chooses streaming branch (`legacyStreamingHandler`).
3. Validate method = POST; authenticate if `ACCESS_SECRET` present; optionally verify Google token and whitelist.
4. Emit `log` and then `init` events containing query, model, user context, and fallback permission.
5. Execute Initial Setup Phase (`executeInitialSetupQuery`):
   - Build setup prompt; call LLM (no tools) → expected JSON { persona, questions[], response_length, reasoning_level, temperature }.
   - Emit `llm_request` (phase: `initial_setup`), then `llm_response` on success.
   - Parse JSON; fallback defaults if parse fails.
   - Emit `setup_complete` event with persona, questions, cost (if pricing loaded).
6. Execute Research Phase (`executeQueryCycle`) with `runToolLoop`:
   - Compose research prompt embedding persona, research questions, and user query.
   - Iterative loop (max `MAX_TOOL_ITERATIONS`):
     a. Emit `log` for iteration.
     b. LLM call with tool schemas → emit `llm_request` / `llm_response` (phase: `tool_iteration`).
     c. If tool calls present (type `function_call` objects):
        - Emit `tools` event enumerating calls (iteration, names, args snapshot).
        - For each call:
          * Dispatch via `callFunction`:
            - `search_web`: DuckDuckGo search + optional content + optional summarization sub‑LLM.
            - `scrape_web_content`: Fetch & extract text from a URL.
            - `execute_javascript`: Sandbox code in `vm` context, capturing console output.
          * On completion emit `tool_result` event (iteration, call_id, args, raw/truncated output).
        - Append tool outputs as `function_call_output` messages to conversation (drastically truncated for token safety).
        - Dynamic emergency pruning if estimated tokens > threshold (>3000) to small working set.
     d. Break loop when LLM returns zero tool calls (signals readiness for synthesis) or iteration cap reached.
   - After loop → Final Synthesis Phase:
     * Summarize up to two tool outputs into `allInformation` snippet.
     * Determine complexity & math heuristics → choose token cap (math vs complexity mapping via `getTokensForComplexity`).
     * Build final prompt (template substitution + temporal context + environment context) and call LLM.
     * Emit final `llm_request` / `llm_response` (phase: `final_synthesis`).
     * Calculate cost summary; emit `cost_summary` event.
     * Emit `final_answer` with answer text & cost subset.
7. Emit `complete` event with execution metadata.
8. Stream ends.

Non-streaming path simply collects a full result object and writes JSON once; UI normally enforces streaming so reproduction should prioritize SSE implementation.

---
## 5. Streaming Event Taxonomy

Event names observed:
`log`, `init`, `persona`, `research_questions`, `llm_call`, `llm_request`, `llm_response`, `tools`, `tool_result`, `setup_complete`, `step`, `search_results` (legacy / continuation), `cost_summary`, `final_answer`, `final_response` (UI alias), `complete`, `error`, `quota_exceeded`, `continuation`, `interrupt_state` (UI pause), plus specialized internal `search`, `search_digest` (frontend), though backend primarily emits the subset above.

Essential payload fields (representative examples):
- `log`: { message, timestamp }
- `init`: { query, model, user?, timestamp, allowEnvFallback? }
- `persona`: { persona, research_questions_needed, reasoning }
- `research_questions`: { questions[], questions_needed, reasoning }
- `llm_request`: { phase, iteration?, model, request, timestamp }
- `llm_response`: { phase, iteration?, model, response, timestamp, type? }
- `tools`: { iteration, pending, calls: [ { iteration, call_id, name, args } ] }
- `tool_result`: { iteration, call_id, name, args, output, duration?, cost? }
- `cost_summary`: { totalCost, tokenCounts { input, output, total }, stepCosts[] }
- `final_answer`: { content, timestamp, costSummary? }
- `complete`: { result, executionTime, timestamp }
- `quota_exceeded`: { message, waitTime, continuationState{...} }
- `error`: { error, stack?, timestamp }

Continuation state includes: toolCallCycles, llmCalls, searchResults, currentIteration, researchPlan, totalCost, totalTokens.

---
## 6. Tool Implementations (Deterministic Specs)

### 6.1 Common Pattern
Each tool returns a JSON string (stringified inside `callFunction`) – the LLM sees string output later truncated. All schemas explicitly set `additionalProperties: false` to force strict parameter usage.

### 6.2 `search_web`
Parameters: { query (string, required), limit (int 1–50 default 3), timeout (int 1–60 default 15), load_content (bool), generate_summary (bool) }
Flow:
1. Validate and clamp numbers.
2. Use `DuckDuckGoSearcher.search(query, limit, loadContent, timeout)` → returns structured results.
3. For each result build object { title, url, description, score, duckduckgoScore, state, contentLength, fetchTimeMs, content?, originalLength?, intelligentlyExtracted?, truncated? }.
4. If `generate_summary` and model/apiKey available, run summarization LLM with drastically trimmed prompt (2 sources max) → include summary fields.
5. Token size estimation; if > 4000 tokens, half the results and truncate fields; mark `truncated: true`.

### 6.3 `scrape_web_content`
Parameters: { url (string, required), timeout (int 1–60 default 15) }
Process: Fetch URL via existing searcher -> parse with `SimpleHTMLParser` -> return `{ url, content }` or `{ url, error }`.

### 6.4 `execute_javascript`
Parameters: { code (string, required), timeout (int 1–10 default 5) }
Sandbox: Node `vm` context exposing a safe subset (Math, Date, JSON, Array, Object, primitives). Captures first `console.log` outputs via injected console wrapper storing `_output`. Returns `{ result: output }` or `{ error }`.

---
## 7. LLM Interaction Model

Provider string format: `provider:modelName` (e.g. `groq:llama-3.1-8b-instant`). `parseProviderModel` splits provider, model.
All LLM calls go through `llmResponsesWithTools` which handles:
- Request body shape: { model, input: [{ role, content }...], tools: [function schemas], options: { apiKey, temperature, reasoningEffort?, max_tokens, timeoutMs } }
- Response shape consumed: { output, text, usage?, ... } where `output` may contain tool/function call entries: { type: 'function_call', name, arguments, id/call_id }.
Tool iteration builds conversation:
- Assistant message including `tool_calls` referencing function calls.
- Tool result messages as synthetic objects with `{ type: 'function_call_output', call_id, output }` (not OpenAI chat format but internal representation used for next prompt assembly).

---
## 8. Memory & Token Safety

Controls:
- Hard truncation of each tool output to 300 chars before adding to context.
- Emergency pruning if estimated context tokens > 3000: keep only system, user, last assistant with tool_calls, last 2 tool results.
- Intelligent content extraction for loaded pages reduces verbosity.
- Complexity-based final token allocation via `getTokensForComplexity` (low/medium/high → 1024/2048/4096 tokens) and a separate math mode (`MAX_TOKENS_MATH_RESPONSE`).

---
## 9. Cost Tracking

Mechanism:
- Pricing cache loaded once (`loadAllPricing`): maps provider/model to per-token rates.
- Each LLM call presumably updates `allLLMCalls` (structure present though some tracking omitted in the excerpt) enabling aggregation.
- Final synthesis emits `cost_summary` and `final_answer` referencing computed totals (input/output token counts aggregated from calls; step breakdown from recorded calls). Ensure to persist per-call metadata: cost, inputTokens, outputTokens, timestamp.

---
## 10. Continuation & Rate Limiting

Detection: `isQuotaLimitError(message)` and `parseWaitTimeFromMessage(message)` parse provider error strings.
On quota during synthesis or tool loop final phase: emit `quota_exceeded` with `waitTime` (seconds) and full `continuationState`.
Client later resends with body: `{ continuation: true, continuationContext: { ...state... } }` to restore.
Restore Path:
- Re-emit prior tool results (`tool_result`) and LLM responses (`llm_response` type: `continuation_restore`).
- Recreate `researchPlan` and append system persona promptly.
- Resume where left off (iteration count etc.).

---
## 11. Error Handling Strategy

Categories:
1. Validation / Auth: Missing POST, missing query, missing apiKey (when fallback not allowed) → emit `error` then end stream.
2. Tool Execution Errors: Wrapped per tool; errors JSON-stringified into output to keep iteration alive.
3. Planning / Setup Failure: Fallback to default persona and generic research questions; continue flow.
4. Final Synthesis Failure: If quota → continuation; else emit error text inside `final_answer`.
5. Unexpected Exceptions: Catch-all around streaming logic emits `error` then ends stream.

Event-level resilience: Each `writeEvent` call in try/catch to avoid crash on serialization errors. Stream always ended explicitly in both success and error paths.

---
## 12. Authentication & Access Control

Mechanisms:
- Optional `ACCESS_SECRET` header enforced via request body field `accessSecret`.
- Google OAuth ID token (fields `google_token` or `googleToken`) validated (`verifyGoogleToken`) → if email whitelisted (see `getAllowedEmails`) then user allowed environment fallback for provider API keys (i.e., server-side keys used when client omits one).
Exposure: `init` event includes limited user info: `{ email, name }`.

---
## 13. Temporal Context Injection

Multiple phases (planning & synthesis) append date/time context: formatted UTC date, weekday, and explicit instruction to use current context for recent events.

---
## 14. Prompt Engineering Highlights

Planning Prompt: Generates JSON research plan with fields: `research_questions[]`, `optimal_persona`, `reasoning`, `complexity_assessment` (low|medium|high). Strict JSON only instruction.

Dynamic System Prompt Augmentations:
- Persona plus “CRITICAL TOOL RULES” enumerating strict parameter constraints.
- Environmental context (current date/time) appended every major system role.
- Math queries detection triggers concise directive variant.

Final Template Replacement: `FINAL_TEMPLATE` or default `Q: {{ORIGINAL_QUERY}}\nData: {{ALL_INFORMATION}}\nAnswer with URLs:` plus environmental addendum.

---
## 15. Security Considerations

- Sandboxed JS execution via `vm` with restricted globals; no network/direct FS, only whitelisted builtins.
- `additionalProperties: false` in schemas prevents prompt-injected extraneous arguments.
- HTML scraping sanitized to text before inclusion.
- Strict truncation of tool outputs mitigates prompt injection surface.

---
## 16. Rebuild Checklist

1. Implement provider abstraction identical in semantics (`parseProviderModel`, config map with env var names, valid model list).
2. Implement `llmResponsesWithTools` wrapper that:
   - Accepts tool schemas.
   - Returns `output` array with potential function call descriptors.
   - Provides `text` field with assistant reply.
   - Includes `usage` (prompt_tokens, completion_tokens) for cost.
3. Implement tool schemas exactly (names & parameter contracts) and dispatcher logic with same truncation heuristics.
4. Implement iterative loop with emergency pruning + final synthesis as described.
5. Emit all events exactly; treat event names as stable API.
6. Implement continuation restore event emission order.
7. Provide cost estimation hook (can stub initially) but structure must match.
8. Provide robust error classification to map to `quota_exceeded` vs standard failure.
9. Ensure SSE formatting: `event: <type>\ndata: <json>\n\n`.
10. Guarantee explicit stream end.

---
## 17. Testing (Guidelines)

While not part of runtime code, to fully rebuild you must test:
- Tool loop halts when no function calls.
- Quota error triggers `quota_exceeded` with serialized continuation state.
- Planning JSON parse fallback works.
- Tool schema rejects extra properties (simulate with deliberate invalid args to confirm error propagation).
- Sandboxed JS timeout respected.
- Cost summary emitted before `final_answer`.

---
## 18. Known Edge Handling

- If planning fails, still proceeds with default persona & research question.
- If zero tool calls returned on first iteration, final synthesis executes immediately.
- If content size large, search summarization truncates sources to top 2 for digest.
- If memory tracking indicates potential overflow (not fully shown), pruning logic kicks in.

---
## 19. Data Structures (Key Internal)

```text
input: Array<ChatMessage | FunctionCallOutput>
ChatMessage: { role: 'system'|'user'|'assistant', content, tool_calls?[] }
FunctionCallOutput: { type: 'function_call_output', call_id, output }
ToolCall (LLM output element): { type:'function_call', name, arguments, id/call_id }
tool_result event payload: { iteration, call_id, name, args, output }
continuationState: { toolCallCycles[], llmCalls[], searchResults[], currentIteration, researchPlan, totalCost, totalTokens }
```

---
## 20. Conclusion

The above specification contains the complete behavioral contract required to re‑implement the backend faithfully. Any deviation (event names, ordering, truncation strategy, continuation payload shape) risks breaking the frontend coupling. Preserve emitted event semantics first; internal refactors are acceptable if they remain observationally equivalent.
