# Project Rebuild Master Guide

This master document ties together every element required to reconstruct the entire system (backend Lambda + streaming web UI). It provides an overview, dependency relationships, build/deploy workflows, environment configuration, and testing methodology. For deep subsystem details see:

- `build_instructions_backend.md` – Request lifecycle, tool loop, streaming protocol, continuation, error handling.
- `build_instructions_frontend.md` – UI structure, styling system, streaming event rendering, component behaviors.

---
## 1. System Overview

The project is an “Intelligent Research Proxy” combining:
1. Multi-phase LLM orchestration (planning → iterative tool usage → final synthesis).
2. Tool ecosystem: web search (DuckDuckGo), web scraping (HTML → text), sandboxed JavaScript execution (calculations/demos), optional summarization.
3. Real-time insight via Server-Sent Events (SSE) to progressively update a minimal UI with persona, research strategy, tool execution, costs, and final answer.
4. Continuation resilience for rate limits (emits saved state + wait directive).
5. Aggressive token + memory safeguards to prevent runaway cost.

Primary Goals: Fresh, evidence-based, reproducible research-like LLM answers with traceable intermediate steps.

---
## 2. Repository Structure (Key Paths)

```
src/                     # Backend runtime code
  index.js               # Exports handler
  lambda_search_llm_handler.js  # Core orchestrator (planning, tool loop, streaming)
  tools.js               # Tool schemas + dispatcher
  providers.js           # Model/provider registry
  search.js              # DuckDuckGo search abstraction
  html-parser.js         # Lightweight HTML → text extraction
  streaming/             # SSE writer helpers
  config/                # Token limits, prompts, memory constants
  utils/                 # Error handling + token estimation
  services/              # Tracking services (LLM/tool call tracking)
  pricing*.js            # Token pricing + cost calculations
ui/                      # Source of truth for frontend assets (template + modular JS)
docs/                    # Built static site (DO NOT EDIT manually)
scripts/                 # Deployment & build scripts
tests/                   # Unit + integration tests (Jest)
build_instructions*.md   # Rebuild specification docs
```

Never edit files under `docs/` directly; always modify `ui/` and rebuild.

---
## 3. Core Data & Control Flow

Simplified lifecycle diagram:
```
Client (POST query) → Lambda (init) → Setup LLM call (persona + questions) → Tool Loop:
   LLM decides tool calls → dispatch tools (search/scrape/execute_js) → capture outputs → append truncated summaries → repeat until no calls.
→ Final Synthesis LLM call → cost aggregation → emit final answer + metadata → stream completion.
```

Streaming events define the UI state machine. Frontend reacts purely to event sequence (stateless re-derivation aside from incremental maps).

---
## 4. Build & Deployment Workflow

### 4.1 Frontend
1. Edit template assets under `ui/` (HTML, CSS, modular JS).
2. Run build script: `./scripts/build-docs.sh` → injects CSS & copies scripts into `docs/`.
3. Deploy docs: `./scripts/deploy-docs.sh` (or `make deploy-docs` for build + deploy combo).
4. Local preview: `cd docs && python3 -m http.server 8081` (serve on port 8081).

### 4.2 Backend (Lambda)
1. Modify code under `src/`.
2. Deploy: `./scripts/deploy.sh` (handles packaging & AWS update – script specifics assumed but not shown here). Optionally `dev-deploy.sh` for iterative updates.
3. Environment variables set in Lambda console (or IaC) for provider keys and template overrides.

### 4.3 Combined Changes
If both backend and frontend changed, apply both processes; no coupling beyond shared event contract.

---
## 5. Environment Configuration

Required (or user-supplied):
- Provider Keys: `GROQ_API_KEY`, `OPENAI_API_KEY` (optional if user passes `apiKey` in body).
- Optional gating: `ACCESS_SECRET` (requires matching `accessSecret` in requests).
- Optional overrides: `FINAL_TEMPLATE`, `SYSTEM_PROMPT_DIGEST_ANALYST`, `GROQ_MODEL`, `OPENAI_MODEL`.

Security posture:
- Never expose raw API keys to client unless user explicitly enters (stored locally via settings dialog).
- Strict function schemas reject extraneous arguments to tools.
- Sandboxed JS environment restricts accessible objects.

---
## 6. Tool Ecosystem Summary

| Tool | Purpose | Key Params | Output (stringified JSON) |
| ---- | ------- | ---------- | ------------------------- |
| search_web | Query DuckDuckGo + optional page content + optional summary | query, limit, timeout, load_content, generate_summary | { query, results[], summary? } |
| scrape_web_content | Fetch & extract readable body text | url, timeout | { url, content | error } |
| execute_javascript | Run sandboxed JS for computation/demos | code, timeout | { result | error } |

Outputs truncated & extracted for token efficiency before re-injection into LLM conversation.

---
## 7. Streaming Protocol Overview

Events (union of back & front specs): `init`, `log`, `persona`, `research_questions`, `llm_request`, `llm_response`, `tools`, `tool_result`, `cost_summary`, `final_answer`, `final_response` (UI alias), `complete`, `error`, `quota_exceeded`, `interrupt_state`, `search_results` (legacy/continuation), plus optional `search_digest` (UI incremental summarization). SSE frame format: `event: <name>\ndata: <JSON>\n\n`.

Ordering (canonical example):
```
log → init → (llm_request/response initial_setup) → setup_complete → persona → research_questions →
 [loop { log → llm_request → llm_response → (tools → tool_result*)? }+] →
 llm_request(final_synthesis) → llm_response(final_synthesis) → cost_summary → final_answer → complete
```

Rate limit scenario: any phase may instead emit `quota_exceeded` (with continuation state) then end stream.

---
## 8. Continuation Contract

If rate limited, backend emits:
```
quota_exceeded: {
  message, waitTime, continuationState: {
    toolCallCycles[], llmCalls[], searchResults[], currentIteration,
    researchPlan, totalCost, totalTokens
  }
}
```
Client resends body with `{ continuation: true, continuationContext: <continuationState> }`. Backend replays historical events (marked `continued: true`) before resuming. Frontend must treat duplicate tool/LLM events idempotently.

---
## 9. Token & Cost Governance

Token limits per phase stored in `config/tokens.js`. Emergency pruning if context > ~3000 estimated tokens. Per-call usage aggregated to produce `cost_summary` before final answer. Complexity or math classification modifies final max token allocation (e.g. math responses shorter).

---
## 10. Testing Strategy (TDD Oriented)

Test layers:
1. Unit (tools):
   - Validate schema: extra param triggers rejection (simulate in LLM call path or direct dispatcher invocation if wrapper enforces).
   - `execute_javascript` timeout and sandbox scoping (no global leaks).
   - Content extraction heuristic limited length & structure.
2. Unit (search):
   - Deterministic stub for DuckDuckGo results; ensure scoring & extraction logic keeps required fields.
3. Unit (prompt planning fallback):
   - Force malformed planning output → fallback persona & questions.
4. Integration (handler streaming):
   - Simulate POST request; read event sequence order; assert presence and structural validity.
   - Simulate quota error injection → assert `quota_exceeded` & serialized continuation state completeness.
5. Cost tracking:
   - Stub pricing map to deterministic rates; assert aggregated totals & step breakdown ordering.

Mocking Guidance:
- Intercept outbound HTTPS calls to providers.
- Replace DuckDuckGo network functions with fixtures.
- Force tool dispatcher exceptions (e.g., throw inside search) to test error surface.

---
## 11. Local Development

Frontend preview: `make deploy-docs` or manual build + `python3 -m http.server` in `docs/` on port 8081. Use browser devtools network tab to watch SSE events (look for `event:` frames).

Backend quick iteration: modify source, redeploy via `./scripts/deploy.sh`, run integration test suite `npm test` (script likely wraps Jest configuration `jest.config.json`).

---
## 12. Operational Considerations

Logging: Rich console logging (emoji prefixed) intentionally verbose – maintain for observability (especially in cold start debugging).

Scalability: Lambda concurrency scales horizontally; no persistent state (continuation state always serialized in client-visible event before termination).

Security Hardening Recommendations (future):
- Add HTML sanitizer for Markdown output.
- Limit maximum simultaneous tool executions (currently sequential per iteration but could enforce cap).
- Add HMAC signing for continuation state to prevent tampering.

---
## 13. Rebuild Acceptance Criteria

The system is deemed equivalently rebuilt when:
1. A canonical query produces a comparable sequence of SSE events (names + structural fields) in the same high-level order.
2. Tool loop decisions result in valid `tools` + `tool_result` emissions (even if underlying search content differs due to external variance).
3. Continuation test (simulated quota) resumes without loss of previously emitted context.
4. Final answer includes cost pill populated from aggregated mock pricing.
5. Frontend gracefully handles missing optional events (e.g., no persona on failure) without fatal errors.

---
## 14. Cross-File Consistency Map

| Concern | Backend Source | Frontend Consumer |
| ------- | -------------- | ----------------- |
| Event Names | `lambda_search_llm_handler.js` | `ui/js/events.js` switch cases |
| Tool Schemas | `src/tools.js` | Not hardcoded (render only) |
| Continuation Payload | Emitted via quota_exceeded | Stored in browser memory & reused in POST |
| Cost Metrics | `cost_summary` emission | Cost badge + breakdown panel |
| Persona/Questions | Setup & planning events | Persona & strategy cards |

---
## 15. Reference Documents

See sibling docs for granular detail:
- Backend: `build_instructions_backend.md`
- Frontend: `build_instructions_frontend.md`

---
## 16. Final Notes

This guide intentionally separates conceptual responsibilities from implementation details. The strict contract is: event taxonomy, tool schema signatures, continuation serialization, and streaming framing. Implementation internals (exact heuristics, extraction algorithm) may vary if they preserve outward semantics and resource safety envelopes.
