# System Prompt Optimization - Quick Implementation Guide

**Full Plan**: [PLAN_SYSTEM_PROMPT_OPTIMIZATION.md](./PLAN_SYSTEM_PROMPT_OPTIMIZATION.md)  
**Summary**: [SYSTEM_PROMPT_OPTIMIZATION_SUMMARY.md](./SYSTEM_PROMPT_OPTIMIZATION_SUMMARY.md)  
**Examples**: [SYSTEM_PROMPT_OPTIMIZATION_EXAMPLES.md](./SYSTEM_PROMPT_OPTIMIZATION_EXAMPLES.md)

---

## Quick Start (Phase 1 - 1-2 hours)

### Step 1: Backup Current Prompt

```bash
cd /home/stever/projects/lambdallmproxy
cp src/config/prompts.js src/config/prompts.js.backup.$(date +%Y%m%d_%H%M%S)
```

### Step 2: Apply Phase 1 Changes

Edit `src/config/prompts.js` and make these 5 low-risk changes:

#### Change 1: Remove 7 Duplicate XML Warnings (Keep 1)

**Find and DELETE these lines** (scattered throughout prompt):
```javascript
- NEVER output tool parameters as text (e.g., don't write {"url": "...", "timeout": 15} in your response)
- NEVER include XML tags, JSON objects, or function call syntax in your text responses
- NEVER write things like <execute_javascript>{"code": "..."}</execute_javascript> in your response
- NEVER write things like <search_web>{"query": "..."}</search_web> in your response
- NEVER write things like <scrape_web_content>{"url": "..."}</scrape_web_content> in your response
- NEVER write things like <function=search>, <function=search_web>, or <function=execute_javascript> in your response
- NEVER use Anthropic/Claude-style function syntax like <function=name> or any XML-style tags - this API uses OpenAI format only
```

**KEEP this one** (add to end of tool section):
```javascript
- Tool calls happen automatically via OpenAI function calling - no XML syntax
```

**Savings**: 250 tokens

---

#### Change 2: Reduce Emphasis Formatting

**Find and REPLACE**:

**12x "CRITICAL"** → Keep only 2
```javascript
// DELETE these headers:
**CRITICAL JSON TOOL CALL RULES:** → **TOOL USAGE:**
**CRITICAL: SELF-REFLECTION & COMPLETENESS CHECK:** → **COMPLETENESS CHECK:**
**CRITICAL: Default to comprehensive** → Default: Comprehensive
🎬 **CRITICAL: YOUTUBE TOOL PRIORITY** 🎬 → (remove emojis)
```

**15x "NEVER"** → Keep only 3
```javascript
// DELETE excessive repetition, keep core rules:
- NEVER guess dates
- NEVER add extra tool parameters
- NEVER use XML syntax
```

**8x Emojis** → Remove all
```javascript
// DELETE:
🎬 🎬 ⚠️ (and similar)
```

**Savings**: 120 tokens

---

#### Change 3: Condense Examples Section

**Find this** (Lines ~114-117):
```javascript
**EXAMPLES OF OPEN-ENDED QUESTION CATEGORIES:**
- "How should we think about..." → Provide philosophical frameworks, ethical considerations, multiple perspectives
- "What are the implications of..." → Explore short-term/long-term effects, different stakeholders, various scenarios
- "Why is there..." → Examine historical evolution, underlying mechanisms, competing theories
- "What's the relationship between..." → Analyze connections, correlations, causal mechanisms, system dynamics
- "How can we improve..." → Present multiple approaches, compare methodologies, discuss tradeoffs
- "What does the future hold for..." → Explore trends, scenarios, uncertainties, expert opinions
```

**Replace with**:
```javascript
**EXAMPLES:**
- "How/why/what" questions → Multiple perspectives, frameworks, examples, implications
```

**Savings**: 150 tokens

---

#### Change 4: Merge Temporal Sections

**Find and DELETE** (appears 3 times):
```javascript
You have access to the current date and time above. Use this information when responding to temporal queries about "today", "current date", "what time is it", etc. You do not need to use tools to get the current date/time as it is provided in this system prompt.

[... and later ...]

**TEMPORAL INFORMATION - IMPORTANT:**
- The current date and time are provided at the top of this system prompt
- Use this information when responding to queries about "today", "current date", "what time is it", etc.
- For date/time calculations (e.g., "days until Christmas", "age calculation"), you may use the execute_javascript tool
- **NEVER guess or hallucinate dates** - refer to the provided current date/time at the top of this prompt
- The execute_javascript tool captures ALL console.log outputs for date calculations and formatting
```

**Replace with** (place right after date/time header):
```javascript
Use for temporal queries ("today", "current date"). For date calculations: execute_javascript. Never guess dates.
```

**Savings**: 90 tokens

---

#### Change 5: Remove Implicit Instructions

**Find and DELETE these obvious statements**:
```javascript
- Use bullet points (- or *) for lists
- Use numbered lists (1., 2., 3.) for sequential information
- Use code blocks (\`\`\`) for code examples
- Use inline code (\`) for technical terms
- Use blockquotes (>) for citations
- Use [links](url) to reference sources
- Start with an executive summary or overview
- End with a synthesis section
```

**Replace with**:
```javascript
- Use Markdown formatting extensively (headings, lists, code, links)
```

**Savings**: 80 tokens

---

### Step 3: Test Changes

```bash
# Run unit tests
npm test

# Spot-check 5 queries manually
# Test: Simple fact, Math, Search, Video, Open-ended
```

### Step 4: Commit and Deploy

```bash
# Commit Phase 1 changes
git add src/config/prompts.js
git commit -m "refactor: optimize system prompt Phase 1 (low-risk, -600 tokens)

- Remove 7 duplicate XML warnings (-250 tokens)
- Reduce emphasis formatting (-120 tokens)
- Condense examples section (-150 tokens)
- Merge temporal sections (-90 tokens)
- Remove implicit instructions (-80 tokens)

Total savings: ~600 tokens (17% reduction)
Risk: Low - no functional changes"

# Deploy fast (code only)
make deploy-lambda-fast

# Monitor logs for 15 minutes
make logs-tail
```

### Step 5: Rollback (if needed)

If issues occur:

```bash
# Option 1: Instant rollback via environment variable
echo 'SYSTEM_PROMPT_SEARCH="[paste original prompt here]"' >> .env
make deploy-env

# Option 2: Git revert (5 minutes)
git revert HEAD
make deploy-lambda-fast
```

---

## Phase 2 Implementation (Medium-Risk - 3-4 hours)

**⚠️ Only proceed if Phase 1 completed successfully with no issues**

### Changes Required:

#### Change 6: Consolidate Tool Instructions

**Find all tool-related sections** (scattered throughout):
- JSON Tool Call Rules (lines 36-39)
- Tool Usage Guidelines (lines 139-154)
- Tool Parameter Rules (lines 156-163)

**Replace entire section with**:
```javascript
**TOOLS** (OpenAI JSON format only, no XML):
- execute_javascript(code) - Math, calculations, data processing
- search_web(query|[queries]) - Current info (multi-query: ["q1","q2"])
- search_youtube(query) - Videos only (use for "YouTube", "videos", "tutorials")
- scrape_web_content(url) - Extract page content
- Strict params: No extra fields (additionalProperties: false), no JSON in text
- Errors: Return via tool error field

**YOUTUBE PRIORITY:** For video queries ("YouTube", "videos", "tutorials"), use search_youtube, NOT search_web.
```

**Also update** `src/lambda_search_llm_handler.js` (lines 229, 247):

**From**:
```javascript
dynamicSystemPrompt = researchPlan.optimal_persona + ' CRITICAL TOOL RULES: Always use the available search_web and execute_javascript tools when they can enhance your response. Use search tools for current information and calculations tools for math problems. PARAMETER RULES: When calling execute_javascript, ONLY provide the "code" parameter. When calling search_web, ONLY provide the "query" parameter. NEVER add extra properties like count, results, limit, etc. The schemas have additionalProperties: false and will reject extra parameters with HTTP 400 errors. RESPONSE FORMAT: Start with the direct answer, then show work if needed. Be concise and minimize descriptive text about your thinking. Cite all sources with URLs. CRITICAL: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. NEVER write things like <execute_javascript>{\"code\": \"...\"}</execute_javascript> in your response. Tool calls happen automatically through the API.' + environmentContext;
```

**To**:
```javascript
dynamicSystemPrompt = researchPlan.optimal_persona + ' Use tools when helpful. Strict params only. Cite sources with URLs.' + environmentContext;
```

**Savings**: 589 tokens (75%)

---

#### Change 7: Compress Self-Reflection Section

**Find** (lines ~139-154):
```javascript
**CRITICAL: SELF-REFLECTION & COMPLETENESS CHECK:**
Before finalizing your response, you MUST perform this self-assessment:
1. **Have I answered ALL parts of the user's question?** Review the original query and verify each sub-question or aspect has been addressed.
2. **Is my response comprehensive and detailed enough?** If your answer feels brief or surface-level, it probably is - go deeper.
3. **Are there gaps in my knowledge or information?** If you're missing critical details, current data, or specific facts, you MUST make additional tool calls to gather complete information.
4. **Do I need more search results?** If search results were limited, shallow, or didn't fully answer the question, perform additional searches with refined queries.
5. **Should I scrape additional sources?** If you found relevant URLs in search results but didn't extract their full content, use scrape_web_content to get detailed information.
6. **Do calculations need verification?** If you performed calculations, double-check them with execute_javascript if not already done.

**IF YOUR SELF-ASSESSMENT REVEALS GAPS OR INCOMPLETE INFORMATION:**
- DO NOT provide a partial answer and stop
- DO NOT apologize for not having complete information if you can get it with tools
- INSTEAD: Make additional tool calls immediately to fill those gaps
- Use search_web with different or more specific queries
- Use scrape_web_content on relevant URLs you haven't yet examined
- Use execute_javascript for any calculations or data processing needed
- Continue this cycle until you can provide a truly comprehensive answer

**YOUR GOAL:** Every response should be so thorough and complete that the user has no follow-up questions and feels fully informed on the topic.
```

**Replace with**:
```javascript
**COMPLETENESS CHECK** before finalizing:
- All parts answered? Depth sufficient? Missing data/sources?
- If gaps: Make additional tool calls (search/scrape) before responding
```

**Savings**: 270 tokens (77%)

---

### Testing Phase 2:

```bash
# Run full test suite
npm test

# Run integration tests
npm test tests/integration/

# Test all 4 tools
# - execute_javascript with valid code → Should work
# - execute_javascript with extra params → Should reject (HTTP 400)
# - search_web with single query → Should work
# - search_web with multi-query → Should work
# - search_youtube for videos → Should work
# - scrape_web_content with URL → Should work

# Validate parameter strictness
# Ensure HTTP 400 errors for invalid params
```

### Commit Phase 2:

```bash
git add src/config/prompts.js src/lambda_search_llm_handler.js
git commit -m "refactor: optimize system prompt Phase 2 (medium-risk, -800 tokens)

- Consolidate tool instructions (-589 tokens)
- Compress self-reflection section (-270 tokens)

Total savings: ~800 tokens (additional 22% reduction)
Cumulative: ~1,400 tokens (38% total reduction)
Risk: Medium - requires testing"

# Deploy
make deploy-lambda-fast

# Monitor for 24 hours
make logs-tail
```

---

## Phase 3 Implementation (High-Risk - 5-6 hours)

**⚠️⚠️ Only proceed if Phase 1+2 completed successfully with extensive validation**

### Change 8: Compress Response Guidelines

This is the most aggressive change and requires careful validation.

**Find** (lines 76-137):
- Response Length & Detail Expectations (500 tokens)
- Handling Open-Ended Questions (320 tokens)
- Response Format Guidelines (480 tokens)
- Avoid Short Answers (350 tokens)

**Replace entire section with**:
```javascript
**RESPONSE:**
- Default: Comprehensive 1000-3000+ words (brief only for simple facts like "What is X?")
- Markdown: ##/### headings, **bold**, lists, \`code\`, [links](url), > quotes
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
```

**Savings**: 1,200 tokens (73%)

---

### Testing Phase 3 (CRITICAL):

```bash
# Full test suite
npm test

# Manual review of 50 diverse queries
# - 10 simple facts
# - 10 math calculations
# - 10 search queries
# - 10 video queries
# - 10 open-ended research questions

# Quality assessment checklist:
# [ ] Response length maintained (1000-3000 words for substantive)
# [ ] Markdown formatting preserved
# [ ] All query parts addressed
# [ ] Tools used appropriately
# [ ] Sources cited with links
```

### A/B Testing (Recommended):

Deploy to 10% of traffic first, monitor for 48 hours, then gradually increase.

### Commit Phase 3:

```bash
git add src/config/prompts.js
git commit -m "refactor: optimize system prompt Phase 3 (high-risk, -1200 tokens)

- Compress response guidelines (-1,200 tokens)

Total savings: ~1,200 tokens (additional 27% reduction)
Cumulative: ~2,600 tokens (48% total reduction from original 3,449)
Risk: High - requires extensive validation

⚠️ Rollback plan: Set SYSTEM_PROMPT_SEARCH in .env or git revert"

# Deploy with caution
make deploy-lambda-fast

# Monitor closely for 1 week
make logs-tail
```

---

## Complete Optimized Prompt (All Phases)

After all 3 phases, your `src/config/prompts.js` should look like this:

```javascript
function getComprehensiveResearchSystemPrompt() {
    const currentDateTime = getCurrentDateTime();
    
    return process.env.SYSTEM_PROMPT_SEARCH || `You are a highly knowledgeable AI research assistant with computational tools. Provide comprehensive, structured responses with proper citations.

**CURRENT DATE/TIME:**
${currentDateTime}

Use for temporal queries ("today", "current date", "what time"). For date calculations: execute_javascript. Never guess dates.

**TOOLS** (OpenAI JSON format only, no XML):
- execute_javascript(code) - Math, calculations, data processing
- search_web(query|[queries]) - Current info (multi-query: ["q1","q2"])
- search_youtube(query) - Videos only (use for "YouTube", "videos", "tutorials")
- scrape_web_content(url) - Extract page content
- Strict params: No extra fields (additionalProperties: false), no JSON in text
- Errors: Return via tool error field

**RESPONSE:**
- Default: Comprehensive 1000-3000+ words (brief only for simple facts like "What is X?")
- Markdown: ##/### headings, **bold**, lists, \`code\`, [links](url), > quotes
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

**Note:** When using tools, cite sources with clickable markdown links.`;
}
```

**Original**: 3,449 tokens  
**Optimized**: ~1,800 tokens  
**Savings**: ~1,649 tokens (48% reduction)

---

## Token Count Verification

After each phase, verify token reduction:

```bash
# Run token counter
node token_count.js

# Expected output:
# Phase 1: ~2,849 tokens (600 saved)
# Phase 2: ~2,060 tokens (800 more saved)
# Phase 3: ~1,800 tokens (1,200 more saved)
```

---

## Rollback Procedures

### Method 1: Environment Variable (Instant)

```bash
# Add to .env
SYSTEM_PROMPT_SEARCH="[paste entire original prompt here]"

# Deploy environment variables
make deploy-env

# Verify via logs
make logs
```

### Method 2: Git Revert (5 minutes)

```bash
# Revert specific phase
git revert HEAD  # Revert Phase 3
git revert HEAD~1  # Revert Phase 2
git revert HEAD~2  # Revert Phase 1

# Deploy
make deploy-lambda-fast
```

### Method 3: Restore from Backup (5 minutes)

```bash
# Find backup
ls -la src/config/prompts.js.backup.*

# Restore
cp src/config/prompts.js.backup.YYYYMMDD_HHMMSS src/config/prompts.js

# Commit and deploy
git add src/config/prompts.js
git commit -m "rollback: restore original system prompt"
make deploy-lambda-fast
```

---

## Success Metrics

After each phase, verify:

### Functional Tests (Must Pass 100%):
- [ ] Tool parameter validation (strict schemas enforced)
- [ ] YouTube routing (search_youtube for video queries)
- [ ] Multi-query search (array of queries works)
- [ ] Date handling (uses provided date, no hallucination)

### Quality Tests (Target >90%):
- [ ] Response length (1000-3000 words for substantive queries)
- [ ] Markdown formatting (proper structure)
- [ ] Completeness (all query parts addressed)
- [ ] Tool usage (tools used when helpful)

### Performance Tests (Expected Improvement):
- [ ] Response time (-10-15% faster)
- [ ] API cost (-17-48% lower)
- [ ] Memory efficiency (more headroom)

---

## Timeline

| Phase | Time | Risk | Savings | Cumulative |
|-------|------|------|---------|------------|
| Phase 1 | 1-2 hours | 🟢 Low | 600 tokens (17%) | 600 (17%) |
| Phase 2 | 3-4 hours | 🟡 Medium | 800 tokens (22%) | 1,400 (38%) |
| Phase 3 | 5-6 hours | 🔴 High | 1,200 tokens (27%) | 2,600 (48%) |
| **Total** | **9-12 hours** | | **~1,650 tokens** | **48%** |

---

## Recommended Approach

1. **Week 1**: Implement Phase 1 (low-risk)
2. **Week 2**: Monitor Phase 1, implement Phase 2 if stable
3. **Week 3**: Monitor Phase 2, implement Phase 3 if pristine
4. **Week 4**: Monitor Phase 3, finalize or rollback

**Conservative**: Stop at Phase 2 (38% savings, medium risk)  
**Aggressive**: Complete all 3 phases (48% savings, high risk)

---

## Questions?

- **Which phase should I start with?** Phase 1 (low-risk, quick wins)
- **Can I skip phases?** No - each phase builds on previous
- **What if tests fail?** Stop immediately, rollback, investigate
- **How do I know it's working?** CloudWatch logs + manual testing
- **Should I do all phases?** Recommend Phase 1+2 only (38% savings, manageable risk)

---

**Status**: ✅ Ready for Implementation  
**Next Action**: Backup `src/config/prompts.js` and start Phase 1
