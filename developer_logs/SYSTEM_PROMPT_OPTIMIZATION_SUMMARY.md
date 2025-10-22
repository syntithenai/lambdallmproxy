# System Prompt Optimization - Executive Summary

**Date**: 2024-01-15  
**Status**: Analysis Complete - Awaiting Approval  
**Full Plan**: [PLAN_SYSTEM_PROMPT_OPTIMIZATION.md](./PLAN_SYSTEM_PROMPT_OPTIMIZATION.md)

---

## Quick Stats

| Metric | Current | Optimized | Improvement |
|--------|---------|-----------|-------------|
| **Tokens** | 3,720 | 1,941-2,201 | **-38% to -48%** |
| **API Cost** (100k/mo) | $11.16/mo | $5.82-6.64/mo | **$4.52-5.34/mo** |
| **Annual Savings** (100k/mo) | N/A | N/A | **$54-64/year** |
| **Response Time** | Baseline | -10-15% | **Faster** |

---

## Top 7 Redundancies Found

| Issue | Current | Optimized | Savings | Priority |
|-------|---------|-----------|---------|----------|
| 1. Tool Instructions (repeated 8x) | 789 tokens | 200 tokens | **589 tokens** | ⭐ High |
| 2. Response Guidelines (verbose) | 1,650 tokens | 450 tokens | **1,200 tokens** | ⭐ High |
| 3. XML Warnings (repeated 8x) | 280 tokens | 30 tokens | **250 tokens** | 🔸 Medium |
| 4. Emphasis Markers (excessive) | 200 tokens | 80 tokens | **120 tokens** | 🔸 Medium |
| 5. Examples Section (verbose) | 200 tokens | 50 tokens | **150 tokens** | 🔹 Low |
| 6. Temporal Instructions (3x) | 120 tokens | 30 tokens | **90 tokens** | 🔹 Low |
| 7. Implicit Instructions | 80 tokens | 0 tokens | **80 tokens** | 🔹 Low |
| **TOTAL** | **3,449** | **~1,800** | **~1,650** | **48%** |

---

## 3-Phase Implementation

### Phase 1: Low-Risk Quick Wins 🟢
**Target**: 600 tokens | **Time**: 1-2 hours | **Risk**: Minimal

**Actions**:
- Remove 7 duplicate XML warnings → 250 tokens
- Reduce emphasis formatting → 120 tokens
- Condense examples → 150 tokens
- Merge temporal sections → 90 tokens
- Remove implicit instructions → 80 tokens

**Testing**: Unit tests + 5 spot-checks

---

### Phase 2: Medium-Risk Consolidation 🟡
**Target**: 800 tokens | **Time**: 3-4 hours | **Risk**: Moderate

**Actions**:
- Consolidate tool instructions (789→200) → 589 tokens
- Compress self-reflection (350→80) → 270 tokens

**Testing**: Full integration tests + A/B testing + parameter validation

---

### Phase 3: High-Risk Restructuring 🔴
**Target**: 1,200 tokens | **Time**: 5-6 hours | **Risk**: High

**Actions**:
- Compress response guidelines (1650→450) → 1,200 tokens

**Testing**: 50 query review + quality panel + gradual rollout

---

## Example: Tool Instructions Consolidation

### Before (789 tokens):
```
**CRITICAL JSON TOOL CALL RULES:**
- You MUST respond by invoking an approved tool with valid JSON arguments using the OpenAI function calling protocol. No plain-text or XML-style tool syntax is allowed.
- Do NOT output strings like <function=name> or mix narration alongside the JSON arguments. The tool call response should contain only the JSON payload required for execution.
- If you cannot complete the tool call, emit a tool call that surfaces the blocking issue in an 'error' field—never reply with free-form text.

[... 600 more tokens of similar instructions ...]

TOOL USAGE GUIDELINES - CRITICAL:
- **YOUTUBE RULE**: If the user mentions "YouTube", "videos", "video", "watch", "tutorials", "music videos", "lectures", "entertainment", or asks to "search YouTube", you MUST use search_youtube tool - NEVER use search_web instead
[... 310 more tokens ...]

CRITICAL TOOL PARAMETER RULES:
- For execute_javascript: ONLY provide the "code" parameter. NEVER include result, type, executed_at or any other properties.
- For search_web: ONLY provide the "query" parameter. NEVER include count, results, limit, or any other properties except query.
[... 144 more tokens ...]
```

### After (200 tokens):
```
**TOOLS** (OpenAI JSON format only, no XML):
- execute_javascript(code) - Math, calculations, data processing
- search_web(query|[queries]) - Current info (multi-query: ["q1","q2"])
- search_youtube(query) - Videos only (use for "YouTube", "videos", "tutorials")
- scrape_web_content(url) - Extract page content
- Strict params: No extra fields (additionalProperties: false), no JSON in text
- Errors: Return via tool error field
```

**Savings**: 589 tokens (75% reduction)

---

## Quick Reference: Files to Edit

| File | Current Tokens | Target Tokens | Lines to Edit |
|------|----------------|---------------|---------------|
| `src/config/prompts.js` | 3,449 | 1,800 | 34-210 (main prompt) |
| `src/lambda_search_llm_handler.js` | 230-287 | 100 | 229, 247 (additions) |
| `src/tools.js` | 25 | 25 | 881 (no change) |

---

## Rollback Options

1. **Instant**: Set `SYSTEM_PROMPT_SEARCH` in `.env` and `make deploy-env`
2. **Fast** (5 min): `git revert [commit] && make deploy-lambda-fast`
3. **Gradual** (1 hour): Reduce traffic 100%→50%→10%→0%

---

## Success Criteria

### Must Maintain:
✅ Tool parameter validation (strict schemas)  
✅ YouTube routing accuracy (100%)  
✅ Response completeness (all parts answered)  
✅ Markdown formatting (headings, lists, links)  
✅ Date/time handling (no guessing)

### Expected Improvements:
⬆️ Response time (-10-15%)  
⬆️ Context window availability (+1,650 tokens)  
⬆️ Memory efficiency (TokenAwareMemoryTracker headroom)  
⬇️ API costs (-38-48%)

---

## Next Steps

1. **Review**: Read full plan ([PLAN_SYSTEM_PROMPT_OPTIMIZATION.md](./PLAN_SYSTEM_PROMPT_OPTIMIZATION.md))
2. **Approve**: Confirm Phase 1 implementation
3. **Backup**: Create backup of `src/config/prompts.js`
4. **Test Suite**: Create `tests/integration/system_prompt_optimization.test.js`
5. **Implement**: Start with Phase 1 (low-risk, 600 tokens)

---

## Questions?

- **Will this break tool calling?** No - strict parameter rules are preserved
- **Will responses be shorter?** No - "1000-3000 words" requirement maintained
- **Can we roll back quickly?** Yes - 3 rollback options (instant to 1 hour)
- **How confident are you?** Phase 1: 95% | Phase 2: 85% | Phase 3: 70%
- **Should we do all phases?** Recommend Phase 1+2 (conservative 38% savings)

---

**Recommendation**: Implement **Phase 1 immediately** (low-risk, 600 tokens, 1-2 hours) to validate approach. Proceed to Phase 2 after confirming no regressions. Consider Phase 3 only if quality testing is pristine.
