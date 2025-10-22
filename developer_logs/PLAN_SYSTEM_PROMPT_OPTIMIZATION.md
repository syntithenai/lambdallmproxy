# System Prompt Optimization Plan

**Status**: Analysis Complete - Awaiting Approval  
**Created**: 2024-01-15  
**Estimated Token Savings**: 35-45% (1,300-1,700 tokens)  
**Risk Level**: Low-Medium (with proper testing)

---

## Executive Summary

The current system prompts consume **~3,720-3,776 tokens** per request (base + additions), with the comprehensive research system prompt accounting for **3,449 tokens** alone. Through strategic consolidation, redundancy removal, and conciseness improvements, we can reduce token usage by **1,300-1,700 tokens (35-45%)** without losing critical functionality.

### Key Findings

1. **Extensive Repetition**: Multiple sections repeat the same instructions with different phrasing
2. **Verbose Formatting**: Excessive use of emphasis markers (bold, CRITICAL, etc.) and bullet points
3. **Redundant Examples**: Many examples illustrate the same point
4. **Implicit Knowledge**: Instructions for behaviors LLMs already know
5. **XML Syntax Warnings**: Repeated 8+ times despite being a one-time learning point

---

## Current State Analysis

### Token Breakdown

| Component | Tokens | Percentage |
|-----------|--------|------------|
| **Base System Prompt** | 3,449 | 92.7% |
| Critical Tool Rules Addition | 230 | 6.2% |
| Environment Context | 41 | 1.1% |
| Math Addition (optional) | 57 | N/A |
| **Total (typical request)** | **3,720** | **100%** |
| Total with Math | 3,776 | N/A |

### File Locations

1. **`src/config/prompts.js`** - Main system prompt (3,449 tokens)
2. **`src/lambda_search_llm_handler.js`** - Dynamic additions (230-287 tokens)
3. **`src/tools.js`** - Digest analyst prompt (25 tokens)

---

## Redundancy Analysis

### 1. Tool Calling Instructions - SEVERE REDUNDANCY ⚠️

**Repeated 8+ times across prompt:**

1. Lines 36-39: JSON tool call rules (105 tokens)
2. Lines 139-154: Tool usage guidelines with YouTube emphasis (310 tokens)
3. Lines 156-163: Critical tool parameter rules (144 tokens)
4. Line 229 (lambda_search_llm_handler.js): CRITICAL TOOL RULES addition (230 tokens)
5. Multiple "NEVER write XML tags" warnings scattered throughout

**Total Redundancy**: ~789 tokens  
**Consolidated Target**: ~200 tokens (75% reduction)

**Example Consolidation**:

**BEFORE** (789 tokens):
```
**CRITICAL JSON TOOL CALL RULES:**
- You MUST respond by invoking an approved tool with valid JSON arguments using the OpenAI function calling protocol. No plain-text or XML-style tool syntax is allowed.
- Do NOT output strings like <function=name> or mix narration alongside the JSON arguments. The tool call response should contain only the JSON payload required for execution.
- If you cannot complete the tool call, emit a tool call that surfaces the blocking issue in an 'error' field—never reply with free-form text.

[... 600 more tokens of similar instructions ...]

TOOL USAGE GUIDELINES - CRITICAL:
[... another 310 tokens ...]

CRITICAL TOOL PARAMETER RULES:
[... another 144 tokens ...]
```

**AFTER** (200 tokens):
```
**TOOL USAGE:**
- Use OpenAI function calling (JSON only, no XML/text syntax)
- Parameters: execute_javascript(code), search_web(query), scrape_web_content(url), search_youtube(query) - no extra fields
- YouTube: Use search_youtube for video queries (NOT search_web)
- Multi-query: search_web supports array queries: ["query1", "query2"]
- Errors: Return via tool call with error field
```

**Savings**: ~589 tokens (75%)

---

### 2. Response Format Guidelines - MODERATE REDUNDANCY

**Repeated 3 times:**

1. Lines 76-97: "RESPONSE LENGTH & DETAIL EXPECTATIONS" (500 tokens)
2. Lines 99-112: "HANDLING OPEN-ENDED QUESTIONS" (320 tokens)
3. Lines 119-137: "RESPONSE FORMAT GUIDELINES" (480 tokens)

**Total Redundancy**: ~1,300 tokens  
**Consolidated Target**: ~400 tokens (69% reduction)

**Example Consolidation**:

**BEFORE** (1,300 tokens):
```
**RESPONSE LENGTH & DETAIL EXPECTATIONS:**
- **CRITICAL: Default to comprehensive, extensive responses** - Brief answers are only appropriate for very simple factual queries
- **Target length: 1000-3000+ words** for substantive questions that deserve exploration
[... 20 more bullet points ...]

**HANDLING OPEN-ENDED QUESTIONS:**
When faced with broad, exploratory, or philosophical questions, your response should:
1. **Acknowledge the complexity:** "This is a multifaceted question that touches on [X, Y, Z]..."
[... 10 more numbered points ...]

RESPONSE FORMAT GUIDELINES:
- Use **Markdown formatting** extensively for all responses to improve readability
[... 15 more bullet points ...]
```

**AFTER** (400 tokens):
```
**RESPONSE GUIDELINES:**
- **Default: Comprehensive** (1000-3000+ words for substantive queries; brief only for simple facts)
- **Markdown**: Headings (##/###), bold, lists, code blocks, links, blockquotes
- **Structure**: Overview → Details → Examples → Synthesis → Further exploration
- **Open-ended**: Map territory, explore angles, compare viewpoints, use real examples
- **Completeness check**: Answer all parts? Sufficient depth? Need more searches/scrapes?
- **Avoid**: Short answers (<500 words), single perspectives, missing context
```

**Savings**: ~900 tokens (69%)

---

### 3. Warning Repetition - HIGH REDUNDANCY

**"NEVER write XML tags" appears 8 times:**

- Line 38: "No plain-text or XML-style tool syntax is allowed"
- Line 145: "NEVER output tool parameters as text"
- Line 146-148: "NEVER include XML tags, JSON objects, or function call syntax"
- Lines 149-152: Four separate "NEVER write things like..." examples
- Line 153: "NEVER use Anthropic/Claude-style function syntax"
- Line 155: "If you output JSON in your text response instead of calling a tool, you are doing it WRONG"

**Total**: ~280 tokens  
**Consolidated**: ~30 tokens (89% reduction)

**AFTER**:
```
- **No XML/text syntax**: OpenAI format only, no <function=name> or JSON in text
```

**Savings**: ~250 tokens (89%)

---

### 4. Emphasis Markers - EXCESSIVE FORMATTING

**Problem**: Overuse of bold, CAPS, emojis, and "CRITICAL" markers adds ~150-200 tokens without semantic value.

**Examples**:
- "**CRITICAL:**" appears 12 times
- "NEVER" appears 15 times
- Emojis (🎬, ⚠️, 🔧) used 8 times
- Triple asterisks (***) for emphasis

**Consolidated**: Use sparingly, only for truly critical sections.

**Savings**: ~120 tokens (60% of emphasis overhead)

---

### 5. Self-Reflection Section - VERBOSE

**Current** (Lines 139-154, ~350 tokens):
```
**CRITICAL: SELF-REFLECTION & COMPLETENESS CHECK:**
Before finalizing your response, you MUST perform this self-assessment:
1. **Have I answered ALL parts of the user's question?** Review the original query and verify each sub-question or aspect has been addressed.
[... 8 more verbose bullet points ...]

**IF YOUR SELF-ASSESSMENT REVEALS GAPS OR INCOMPLETE INFORMATION:**
- DO NOT provide a partial answer and stop
[... 4 more bullet points ...]

**YOUR GOAL:** Every response should be so thorough and complete that the user has no follow-up questions and feels fully informed on the topic.
```

**Optimized** (~80 tokens):
```
**COMPLETENESS CHECK** before finalizing:
- Answered all parts? Sufficient depth? Missing data/sources?
- If gaps: Make additional tool calls (search/scrape) before responding
```

**Savings**: ~270 tokens (77%)

---

### 6. Examples Section - EXCESSIVE

**Lines 114-117**: "EXAMPLES OF OPEN-ENDED QUESTION CATEGORIES" (200 tokens)

**Current**:
```
**EXAMPLES OF OPEN-ENDED QUESTION CATEGORIES:**
- "How should we think about..." → Provide philosophical frameworks, ethical considerations, multiple perspectives
- "What are the implications of..." → Explore short-term/long-term effects, different stakeholders, various scenarios
[... 4 more examples ...]
```

**Optimized** (~50 tokens):
```
- "How/why/what" questions → Multiple perspectives, frameworks, examples, implications
```

**Savings**: ~150 tokens (75%)

---

### 7. Temporal Information - REDUNDANT

**Appears 3 times:**

1. Line 34-35: Current date/time injection
2. Line 44: "You have access to the current date and time above"
3. Line 160-164: "TEMPORAL INFORMATION - IMPORTANT" section (120 tokens)

**Consolidated** (~30 tokens):
```
Current date/time provided above. Use for "today", date calculations (via execute_javascript). Never guess dates.
```

**Savings**: ~90 tokens (75%)

---

## Optimization Strategies

### Strategy 1: Consolidate Tool Instructions ⭐ HIGH IMPACT

**Action**: Merge all tool-related instructions into one concise section.

**Current Distribution**:
- JSON Tool Call Rules: 105 tokens
- Tool Usage Guidelines: 310 tokens
- Tool Parameter Rules: 144 tokens
- Dynamic Addition: 230 tokens
- Total: 789 tokens

**Optimized Version**:
```markdown
**TOOLS** (OpenAI JSON format only):
- execute_javascript(code) - Math, calculations, data processing
- search_web(query|[queries]) - Current info, multi-query supported
- search_youtube(query) - Videos (use for "YouTube", "videos", "tutorials")
- scrape_web_content(url) - Extract full page content
- Strict params: No extra fields (additionalProperties: false)
- No XML (<function=name>), no JSON in text responses
- Errors: Return via tool call error field
```

**Savings**: 789 → 200 tokens = **589 tokens saved (75%)**

---

### Strategy 2: Compress Response Guidelines ⭐ HIGH IMPACT

**Action**: Combine verbose sections into bullet-point guidelines.

**Current Sections**:
- Response Length (500 tokens)
- Handling Open-Ended (320 tokens)
- Format Guidelines (480 tokens)
- Avoid Short Answers (350 tokens)
- Total: 1,650 tokens

**Optimized Version**:
```markdown
**RESPONSE:**
- Default: Comprehensive 1000-3000+ words (brief only for simple facts)
- Markdown: ##/### headings, bold, lists, code blocks, links
- Structure: Overview → Details → Examples → Synthesis → Exploration
- Open-ended: Multiple angles, perspectives, real examples, implications
- Before finalizing: All parts answered? Depth sufficient? Need more searches?
```

**Savings**: 1,650 → 450 tokens = **1,200 tokens saved (73%)**

---

### Strategy 3: Remove Repetitive Warnings 🔸 MEDIUM IMPACT

**Action**: State XML warning once, remove 7 duplicates.

**Current**: 8 instances (~280 tokens)  
**Optimized**: 1 instance (~30 tokens)

**Savings**: **250 tokens saved (89%)**

---

### Strategy 4: Reduce Emphasis Formatting 🔸 MEDIUM IMPACT

**Action**: Remove excessive bold, CAPS, emojis.

**Current**: 12x "CRITICAL", 15x "NEVER", 8x emojis (~200 tokens)  
**Optimized**: 2x "Critical", 3x "Never", 0x emojis (~80 tokens)

**Savings**: **120 tokens saved (60%)**

---

### Strategy 5: Condense Examples 🔹 LOW IMPACT

**Action**: Remove verbose examples, use terse lists.

**Current**: 6 example categories (~200 tokens)  
**Optimized**: 1 condensed line (~50 tokens)

**Savings**: **150 tokens saved (75%)**

---

### Strategy 6: Merge Temporal Instructions 🔹 LOW IMPACT

**Action**: Consolidate 3 temporal sections into 1.

**Current**: 3 sections (~120 tokens)  
**Optimized**: 1 section (~30 tokens)

**Savings**: **90 tokens saved (75%)**

---

### Strategy 7: Remove Implicit Instructions 🔹 LOW IMPACT

**Action**: Cut instructions LLMs already know.

**Examples to Remove**:
- "Use bullet points for lists" (LLMs know markdown)
- "Be thorough" (implied by context)
- "Cite sources" (standard practice)

**Savings**: **80 tokens saved**

---

## Consolidated Token Savings Summary

| Strategy | Current | Optimized | Savings | Impact |
|----------|---------|-----------|---------|--------|
| 1. Consolidate Tool Instructions | 789 | 200 | **589** | ⭐ High |
| 2. Compress Response Guidelines | 1,650 | 450 | **1,200** | ⭐ High |
| 3. Remove Repetitive Warnings | 280 | 30 | **250** | 🔸 Medium |
| 4. Reduce Emphasis Formatting | 200 | 80 | **120** | 🔸 Medium |
| 5. Condense Examples | 200 | 50 | **150** | 🔹 Low |
| 6. Merge Temporal Instructions | 120 | 30 | **90** | 🔹 Low |
| 7. Remove Implicit Instructions | 80 | 0 | **80** | 🔹 Low |
| **TOTAL** | **3,449** | **~1,800** | **~1,650** | **48%** |

**Conservative Estimate** (implementing only High + Medium impact): **~1,300 tokens saved (38%)**  
**Aggressive Estimate** (all strategies): **~1,650 tokens saved (48%)**

---

## Rules Categorization

### ✅ Critical Rules (MUST PRESERVE)

**Breaking these breaks core functionality:**

1. **Tool Parameter Restrictions**: "additionalProperties: false" - strict schema enforcement
2. **Date/Time Handling**: Use provided date/time, no guessing
3. **YouTube Priority**: Use search_youtube (not search_web) for video queries
4. **Multi-Query Support**: search_web accepts array of queries
5. **Response Format**: Markdown with proper structure
6. **Completeness Check**: Verify all parts answered before responding

**Token Allocation**: ~400 tokens (preserving functionality)

---

### ⚠️ Important Rules (PRESERVE IF POSSIBLE)

**Breaking these degrades quality but doesn't break functionality:**

1. **Comprehensive Responses**: Default to 1000-3000 words for substantive queries
2. **Tool Usage Encouragement**: Use tools when they provide better info
3. **Response Structure**: Overview → Details → Examples → Synthesis
4. **Open-Ended Handling**: Multiple perspectives, real examples
5. **Self-Reflection**: Check for gaps before finalizing

**Token Allocation**: ~600 tokens (quality maintenance)

---

### 🔹 Nice-to-Have Rules (CAN BE REMOVED)

**Breaking these has minimal impact:**

1. **Style Preferences**: Specific phrasing like "Let me elaborate..."
2. **Verbose Examples**: Detailed category breakdowns
3. **Emphasis Markers**: Excessive use of bold, CAPS, emojis
4. **Repeated Warnings**: 8x "NEVER write XML tags"
5. **Implicit Instructions**: "Use bullet points", "Be thorough"

**Token Reduction**: ~800 tokens (remove safely)

---

## Implementation Plan

### Phase 1: Low-Risk Quick Wins (1-2 hours) 🟢

**Target**: 600 token reduction with zero functionality risk

**Tasks**:
1. ✅ Remove 7 duplicate XML warnings (keep 1) - **250 tokens**
2. ✅ Reduce emphasis formatting (12→2 "CRITICAL", 15→3 "NEVER", remove emojis) - **120 tokens**
3. ✅ Condense examples section (6 categories → 1 line) - **150 tokens**
4. ✅ Merge 3 temporal sections into 1 - **90 tokens**
5. ✅ Remove implicit instructions - **80 tokens**

**Testing**:
- Run existing unit tests (auth, rate limiting, tool execution)
- Spot-check 5 sample queries (simple fact, math, search, scrape, open-ended)
- Verify no regressions in response quality

**Rollback**: Keep original prompt commented out in code

---

### Phase 2: Medium-Risk Consolidation (3-4 hours) 🟡

**Target**: 800 additional tokens with careful testing

**Tasks**:
1. ⚠️ Consolidate tool instructions (789→200 tokens) - **589 tokens**
2. ⚠️ Compress self-reflection section (350→80 tokens) - **270 tokens**

**Testing**:
- Integration tests for tool calling (all 4 tools)
- Test parameter validation (ensure strict schemas work)
- Test YouTube vs web search routing
- Test multi-query search functionality
- A/B test 20 queries (old vs new prompt)

**Validation Metrics**:
- Tool call success rate: >95%
- Response completeness score: >4/5 (human eval)
- YouTube routing accuracy: 100%
- Parameter validation: 100% strict enforcement

**Rollback**: Environment variable `SYSTEM_PROMPT_SEARCH` override

---

### Phase 3: High-Risk Restructuring (5-6 hours) 🔴

**Target**: 400 additional tokens, requires extensive validation

**Tasks**:
1. ⚠️⚠️ Compress response guidelines (1650→450 tokens) - **1,200 tokens**

**Testing**:
- Full integration test suite
- Manual review of 50 diverse queries
- User acceptance testing (if possible)
- Side-by-side comparison (old vs new)

**Validation Metrics**:
- Response length: Maintain 1000-3000 words for substantive queries
- Markdown formatting: Proper structure preserved
- Completeness: All query parts addressed
- Quality score: >4.5/5 (human eval panel)

**Risk Mitigation**:
- Deploy to staging environment first
- Gradual rollout (10% → 50% → 100% traffic)
- Monitor error rates and user feedback
- Keep rollback ready for 48 hours

---

## Testing Plan

### Unit Tests (Existing)

**Files**: `tests/unit/auth.test.js`, `tests/unit/tools.test.js`

**Coverage**:
- ✅ Authentication and token verification
- ✅ Rate limiting and continuation
- ✅ Tool parameter validation
- ✅ Search query processing
- ✅ Memory safety

**Action**: Run `npm test` after each phase

---

### Integration Tests (Existing)

**Files**: `tests/integration/lambda_handler.test.js`

**Coverage**:
- ✅ End-to-end Lambda handler flow
- ✅ Tool execution (search, scrape, JS)
- ✅ Streaming response handling
- ✅ Error handling

**Action**: Run `npm test` after each phase

---

### New Test Suite (Required)

**File**: `tests/integration/system_prompt_optimization.test.js`

**Test Cases**:

1. **Tool Calling Accuracy** (10 tests)
   - execute_javascript with valid code
   - search_web with single query
   - search_web with multi-query
   - search_youtube with video query
   - scrape_web_content with URL
   - Invalid parameters (should reject)
   - XML syntax (should NOT appear)
   - YouTube routing (should use search_youtube)

2. **Response Quality** (10 tests)
   - Simple fact query (should be brief)
   - Math query (should show calculation)
   - Open-ended query (should be comprehensive 1000+ words)
   - Multi-part query (should answer all parts)
   - Markdown formatting (should have headings/lists)
   - Completeness (should use tools if needed)
   - Date/time query (should use provided date)

3. **Edge Cases** (5 tests)
   - Empty query
   - Very long query (>1000 words)
   - Query with special characters
   - Query requesting XML syntax (should ignore)
   - Query with multiple tool needs (should chain tools)

**Success Criteria**: 100% pass rate

---

### A/B Testing (Phase 2+)

**Setup**:
1. Deploy optimized prompt to 10% of traffic
2. Compare metrics: tool success rate, response length, user feedback
3. Gradually increase to 50%, then 100%

**Metrics to Track**:
- Tool call success rate (target: >95%)
- Average response length (target: maintain 1000-3000 for substantive)
- User satisfaction (if feedback mechanism exists)
- Error rate (target: <2%)
- Response time (should improve due to fewer tokens)

---

## Rollback Plan

### Level 1: Environment Variable Override (Instant) ⚡

**Setup**: Add to `.env` and `make deploy-env`:
```bash
SYSTEM_PROMPT_SEARCH="[original full prompt]"
```

**Effect**: Immediately reverts to original prompt without code deployment

**Use Case**: Emergency rollback if critical issues detected

---

### Level 2: Git Revert (5 minutes) 🔄

**Command**:
```bash
git revert [optimization-commit-hash]
make deploy-lambda-fast
```

**Effect**: Reverts code to pre-optimization state

**Use Case**: Issues detected after 24-48 hours

---

### Level 3: Gradual Rollback (1 hour) 🔙

**Action**: Reduce traffic to optimized prompt (100% → 50% → 10% → 0%)

**Effect**: Smooth transition back to original

**Use Case**: Quality degradation observed over time

---

## Expected Outcomes

### Token Reduction

| Metric | Current | Phase 1 | Phase 2 | Phase 3 | Change |
|--------|---------|---------|---------|---------|--------|
| Base Prompt | 3,449 | 2,849 | 2,060 | 1,800 | **-48%** |
| + Critical Rules | 230 | 230 | 100 | 100 | **-57%** |
| + Environment | 41 | 41 | 41 | 41 | 0% |
| **Total** | **3,720** | **3,120** | **2,201** | **1,941** | **-48%** |

---

### Cost Savings

**Assumptions**:
- Current: 3,720 tokens/request
- Optimized: 1,941 tokens/request
- Reduction: 1,779 tokens/request (48%)
- API Cost: $0.03 per 1M input tokens (GPT-4o average)
- Monthly Requests: 100,000

**Calculation**:
```
Current Cost: 3,720 tokens × 100,000 requests × $0.03 / 1M = $11.16/month
Optimized Cost: 1,941 tokens × 100,000 requests × $0.03 / 1M = $5.82/month
Savings: $5.34/month (48%)
```

**Annual Savings**: $64.08/year (at 100k requests/month)

**At Scale** (1M requests/month): $640.80/year

---

### Performance Improvements

1. **Faster Response Time**: Fewer tokens to process = faster LLM responses (~10-15% faster)
2. **Reduced Latency**: Less data transfer, lower network overhead
3. **Better Context Window**: More tokens available for actual conversation history
4. **Improved Memory Efficiency**: TokenAwareMemoryTracker has more headroom

---

### Quality Assurance

**No Expected Degradation**:
- ✅ Critical rules preserved (tool parameters, date handling, YouTube routing)
- ✅ Response quality maintained (comprehensive, structured, complete)
- ✅ Tool functionality intact (all 4 tools work with strict params)
- ✅ Markdown formatting preserved
- ✅ Self-reflection retained (completeness checks)

**Potential Improvements**:
- ✅ Clearer, more concise instructions → less confusion
- ✅ Reduced cognitive load → better adherence
- ✅ Faster responses → improved user experience

---

## Detailed Optimized Prompt (Preview)

### Before (3,449 tokens):

```
You are a highly knowledgeable AI assistant with access to powerful research and computational tools. You excel at providing comprehensive, thorough, and detailed responses that fully address the user's questions.

**CURRENT DATE AND TIME:**
[date/time string]

**CRITICAL JSON TOOL CALL RULES:**
- You MUST respond by invoking an approved tool with valid JSON arguments using the OpenAI function calling protocol. No plain-text or XML-style tool syntax is allowed.
- Do NOT output strings like <function=name> or mix narration alongside the JSON arguments. The tool call response should contain only the JSON payload required for execution.
- If you cannot complete the tool call, emit a tool call that surfaces the blocking issue in an 'error' field—never reply with free-form text.

You have access to the current date and time above. Use this information when responding to temporal queries about "today", "current date", "what time is it", etc. You do not need to use tools to get the current date/time as it is provided in this system prompt.

🎬 **CRITICAL: YOUTUBE TOOL PRIORITY** 🎬
When the user mentions "YouTube", "search YouTube", "videos", "video tutorials", "music videos", or any video-related content, you MUST use the search_youtube tool. DO NOT use search_web for YouTube queries. The search_youtube tool is specifically designed for video searches and creates automatic playlists.

**RESPONSE LENGTH & DETAIL EXPECTATIONS:**
- **CRITICAL: Default to comprehensive, extensive responses** - Brief answers are only appropriate for very simple factual queries
- **Target length: 1000-3000+ words** for substantive questions that deserve exploration
[... 1,500+ more tokens of similar verbosity ...]
```

---

### After (1,800 tokens):

```
You are a highly knowledgeable AI research assistant with computational tools. Provide comprehensive, structured responses with proper citations.

**CURRENT DATE/TIME:** [date/time string]
Use for temporal queries. Never guess dates. For date calculations: execute_javascript.

**TOOLS** (OpenAI JSON format only, no XML):
- execute_javascript(code) - Math, calculations, data processing
- search_web(query|[queries]) - Current info (multi-query: ["q1","q2"])
- search_youtube(query) - Videos only (use for "YouTube", "videos", "tutorials")
- scrape_web_content(url) - Extract page content
- Strict params: No extra fields (additionalProperties: false), no JSON in text
- Errors: Return via tool error field

**RESPONSE:**
- Default: Comprehensive 1000-3000+ words (brief only for simple facts like "What is X?")
- Markdown: ##/### headings, **bold**, lists, `code`, [links](url), > quotes
- Structure: Overview → Details → Examples → Synthesis → Further exploration
- Open-ended: Multiple angles, perspectives, real examples, implications, connections
- Before finalizing: All parts answered? Depth sufficient? Need more searches/scrapes?
  - If gaps: Make additional tool calls before responding
- Avoid: <500 words for substantive queries, single perspective, missing context

**EXAMPLES:**
- Simple fact: "Capital of France?" → Brief answer
- Math: "Calculate 234 * 567" → execute_javascript, show work
- Search: "Latest AI news" → search_web, comprehensive summary with sources
- Video: "Python tutorials" → search_youtube (NOT search_web)
- Research: "How does X work?" → Multi-angle 1000+ word analysis with sources

**YOUTUBE PRIORITY:** For video queries ("YouTube", "videos", "tutorials"), use search_youtube tool, NOT search_web.

**Note:** When using tools, cite sources with clickable markdown links.
```

---

## Risk Assessment

### Low Risk ✅

- Removing duplicate warnings (7→1 XML warnings)
- Reducing emphasis formatting (bold, CAPS, emojis)
- Condensing examples section
- Merging temporal instructions
- Removing implicit instructions

**Justification**: These are presentation/style changes with no semantic impact on functionality.

---

### Medium Risk ⚠️

- Consolidating tool instructions (789→200 tokens)
- Compressing self-reflection section (350→80 tokens)

**Justification**: Core instructions preserved but condensed. Requires testing to ensure LLM still follows strict parameter rules.

**Mitigation**:
- Extensive integration tests for tool calling
- Parameter validation tests (strict schema enforcement)
- A/B testing before full deployment

---

### High Risk 🔴

- Compressing response guidelines (1650→450 tokens)

**Justification**: Major restructuring of response expectations. Potential for quality degradation if LLM misinterprets condensed instructions.

**Mitigation**:
- Side-by-side comparison testing (50+ queries)
- Human evaluation panel for quality assessment
- Gradual rollout with monitoring
- Quick rollback capability via environment variable

---

## Implementation Checklist

### Pre-Implementation

- [ ] Create backup of `src/config/prompts.js`
- [ ] Document original prompt in comments
- [ ] Set up `SYSTEM_PROMPT_SEARCH` override in `.env.example`
- [ ] Create new test file: `tests/integration/system_prompt_optimization.test.js`
- [ ] Review optimization plan with team (if applicable)

---

### Phase 1: Low-Risk Quick Wins

- [ ] Remove 7 duplicate XML warnings
- [ ] Reduce emphasis formatting (12→2 "CRITICAL", 15→3 "NEVER", remove emojis)
- [ ] Condense examples section
- [ ] Merge 3 temporal sections
- [ ] Remove implicit instructions
- [ ] Run unit tests: `npm test`
- [ ] Run integration tests
- [ ] Manual spot-check 5 queries
- [ ] Commit: `git commit -m "refactor: optimize system prompt Phase 1 (low-risk, -600 tokens)"`
- [ ] Deploy: `make deploy-lambda-fast`
- [ ] Monitor CloudWatch logs: `make logs-tail` (15 minutes)
- [ ] If issues: `git revert HEAD && make deploy-lambda-fast`

---

### Phase 2: Medium-Risk Consolidation

- [ ] Consolidate tool instructions (789→200)
- [ ] Compress self-reflection section (350→80)
- [ ] Run full test suite: `npm test`
- [ ] Run new test suite: `npm test tests/integration/system_prompt_optimization.test.js`
- [ ] A/B test 20 queries (old vs new)
- [ ] Validate metrics (tool success >95%, completeness >4/5)
- [ ] Commit: `git commit -m "refactor: optimize system prompt Phase 2 (medium-risk, -800 tokens)"`
- [ ] Deploy to 10% traffic (if load balancing available)
- [ ] Monitor for 24 hours
- [ ] If stable: Deploy to 100%
- [ ] Update `.env.example` with override option

---

### Phase 3: High-Risk Restructuring

- [ ] Compress response guidelines (1650→450)
- [ ] Run full test suite: `npm test`
- [ ] Manual review of 50 diverse queries
- [ ] Side-by-side comparison (old vs new prompts)
- [ ] Quality assessment by human eval panel
- [ ] Validate metrics (quality >4.5/5, length maintained)
- [ ] Commit: `git commit -m "refactor: optimize system prompt Phase 3 (high-risk, -1200 tokens)"`
- [ ] Deploy to 10% traffic
- [ ] Monitor for 48 hours
- [ ] Gradual rollout: 10% → 50% → 100%
- [ ] Keep rollback ready for 1 week

---

### Post-Implementation

- [ ] Document final token counts
- [ ] Calculate actual cost savings
- [ ] Measure response time improvements
- [ ] Create `developer_log/IMPLEMENTATION_SYSTEM_PROMPT_OPTIMIZATION.md`
- [ ] Update README.md if relevant
- [ ] Remove old prompt from comments (after 30 days stable)

---

## Related Documentation

- [FEATURE_MEMORY_TRACKING.md](./FEATURE_MEMORY_TRACKING.md) - TokenAwareMemoryTracker implementation
- [CHAT_ENDPOINT_DOCUMENTATION.md](./CHAT_ENDPOINT_DOCUMENTATION.md) - API endpoint details
- [AI_AGENT_WORKFLOW.md](./AI_AGENT_WORKFLOW.md) - Overall system architecture

---

## Future Enhancements

### Dynamic Prompt Adaptation

**Idea**: Load different prompt variations based on query type.

**Implementation**:
```javascript
function getOptimizedSystemPrompt(queryType) {
  const basePrompt = getComprehensiveResearchSystemPrompt(); // 1,800 tokens
  
  if (queryType === 'math') {
    return basePrompt + mathAddition; // +60 tokens
  } else if (queryType === 'search') {
    return basePrompt + searchEnhancement; // +50 tokens
  } else {
    return basePrompt; // 1,800 tokens only
  }
}
```

**Benefit**: Further token savings by only including relevant additions.

**Estimated Savings**: 100-200 additional tokens per request (5-10%)

---

### Prompt Compression at Runtime

**Idea**: Use prompt compression libraries (e.g., LLMLingua, gzip) to dynamically compress prompts.

**Tools**:
- **LLMLingua**: Removes non-critical tokens while preserving semantics
- **AutoCompressor**: Learns optimal compression strategies

**Benefit**: Up to 50-70% compression without semantic loss.

**Estimated Savings**: 800-1,200 additional tokens (40-60% of optimized prompt)

**Trade-off**: Requires additional processing time and dependencies.

---

### Prompt Caching (OpenAI Feature)

**Idea**: Use OpenAI's prompt caching to reuse system prompt across requests.

**Implementation**:
```javascript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: systemPrompt, cache: true }, // Cache system prompt
    { role: "user", content: userQuery }
  ]
});
```

**Benefit**: 50% cost reduction for cached prompts (charged once, reused multiple times).

**Estimated Savings**: ~$5/month → $2.50/month (additional 50% savings on input tokens)

---

## Conclusion

This optimization plan provides a **structured, phased approach** to reducing system prompt token usage by **35-48% (1,300-1,650 tokens)** without sacrificing functionality or response quality. The three-phase implementation allows for gradual deployment with proper testing and validation at each stage.

**Recommended Action**: Begin with **Phase 1** (low-risk, 600 tokens) to validate approach, then proceed to **Phase 2** (medium-risk, 800 tokens) after confirming no regressions. **Phase 3** (high-risk, 1,200 tokens) should only be implemented if extensive testing confirms no quality degradation.

**Timeline**:
- Phase 1: 1-2 hours
- Phase 2: 3-4 hours
- Phase 3: 5-6 hours
- **Total: 9-12 hours** for full optimization

**ROI**: At 100k requests/month, annual savings of **$64** with improved response times. At 1M requests/month, annual savings of **$640**.

---

**Status**: ✅ Plan Complete - Ready for Review and Implementation
