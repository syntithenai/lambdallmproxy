# Self-Reflection System Prompt Update

## Overview
Updated the system prompt to include a mandatory self-reflection and completeness check that encourages the LLM to evaluate whether it has comprehensively answered all questions before finalizing its response.

## Date
October 6, 2025

## Changes Made

### File Modified
- `src/config/prompts.js` - Added new section to `COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT`

### New Section Added: "CRITICAL: SELF-REFLECTION & COMPLETENESS CHECK"

This new section instructs the LLM to perform a thorough self-assessment before responding:

#### Self-Assessment Questions (6-Point Checklist):
1. **Have I answered ALL parts of the user's question?** - Verify each sub-question or aspect has been addressed
2. **Is my response comprehensive and detailed enough?** - Ensure depth rather than surface-level answers
3. **Are there gaps in my knowledge or information?** - Identify missing critical details, current data, or specific facts
4. **Do I need more search results?** - Determine if search results were too limited or shallow
5. **Should I scrape additional sources?** - Identify relevant URLs that should be examined in detail
6. **Do calculations need verification?** - Double-check mathematical work

#### Action Items When Gaps Are Found:
- **DO NOT** provide partial answers and stop
- **DO NOT** apologize for not having complete information if tools can get it
- **INSTEAD**: Make additional tool calls immediately to fill gaps:
  - Use `search_web` with different or more specific queries
  - Use `scrape_web_content` on relevant URLs not yet examined
  - Use `execute_javascript` for calculations or data processing
  - Continue the cycle until a truly comprehensive answer can be provided

#### Ultimate Goal:
> "Every response should be so thorough and complete that the user has no follow-up questions and feels fully informed on the topic."

## Expected Behavior Changes

### Before This Update:
- LLM might provide initial answer and stop after one round of tool calls
- May not realize it missed parts of multi-part questions
- Could give incomplete information when more details were available via additional searches
- Might stop after surface-level search results without deeper investigation

### After This Update:
- LLM will explicitly evaluate completeness before responding
- Will identify when it has only partially answered the question
- Will automatically perform additional tool calls to fill information gaps
- Will continue iterating until it can provide a comprehensive response
- Will proactively scrape additional sources found in search results
- Will verify calculations and gather more data when needed

## Technical Details

### Implementation
The self-reflection check is positioned after the "RESPONSE FORMAT GUIDELINES" section and before the "TOOL USAGE GUIDELINES" section, ensuring the LLM considers completeness as a core requirement.

### Integration with Existing Features
- Works seamlessly with existing `MAX_TOOL_ITERATIONS = 20` limit
- Complements the existing verbosity encouragement (800-2000 word responses)
- Enhances multi-query search capabilities by encouraging their use when initial results are insufficient
- Supports the existing tool calling infrastructure (search_web, scrape_web_content, execute_javascript)

### Deployment
- ✅ Deployed to Lambda function via `./scripts/deploy.sh`
- ✅ Changes immediately active for all new conversations
- ✅ No frontend changes required (backend-only update)

## Testing Recommendations

### Test Scenarios:
1. **Multi-part questions**: Ask questions with multiple components (e.g., "What is X, how does it work, and what are alternatives?")
2. **Insufficient initial data**: Ask about topics where initial search results might be incomplete
3. **Current events**: Request recent information that requires multiple searches to get full picture
4. **Technical deep-dives**: Ask for comprehensive explanations that require both search and scraping
5. **Complex calculations**: Request computations with verification and explanation

### Success Criteria:
- LLM makes additional tool calls when initial information is incomplete
- Multi-part questions receive answers addressing all parts
- Responses demonstrate deeper research (multiple searches, multiple scrapes)
- LLM continues until truly comprehensive rather than stopping at "good enough"
- No increase in hallucinations (still uses tools for facts, not invented information)

## Example Use Cases

### Use Case 1: Multi-Part Question
**User**: "What is Rust, why was it created, what problems does it solve, and how does it compare to C++?"

**Expected Behavior**:
- Initial search for general Rust information
- Self-reflection: "Have I covered ALL four aspects?"
- Additional searches for: Rust history, Rust vs C++ comparison, memory safety problems
- Possibly scrape Rust documentation and comparison articles
- Final comprehensive response covering all four parts in detail

### Use Case 2: Current Event Deep Dive
**User**: "Tell me about the latest SpaceX launch"

**Expected Behavior**:
- Initial search for latest SpaceX launch
- Self-reflection: "Do I have complete information? Date, payload, outcome, significance?"
- Additional searches if details missing: specific mission name, technical specs, outcome
- Scrape official SpaceX page or news articles for complete details
- Final response with full launch details, context, and significance

### Use Case 3: Technical Documentation
**User**: "How do I implement OAuth2 authentication in Node.js?"

**Expected Behavior**:
- Initial search for OAuth2 Node.js tutorials
- Self-reflection: "Is this comprehensive enough? Code examples? Security considerations?"
- Scrape official OAuth2 documentation
- Scrape popular library documentation (Passport.js, etc.)
- Search for security best practices
- Final response with detailed implementation, code examples, and security guidance

## Monitoring

### What to Watch:
- **Average tool calls per query**: May increase (expected and desired)
- **Response completeness**: Should improve significantly
- **User satisfaction**: Fewer follow-up questions needed
- **Iteration limit hits**: Monitor if queries frequently hit the 20-iteration limit
- **Response time**: May increase slightly due to additional tool calls (acceptable trade-off)

### Potential Issues:
- **Over-iteration**: If LLM gets stuck in loop, may need to refine self-reflection criteria
- **Token usage**: More comprehensive responses = higher token costs (already optimized for this)
- **Latency**: Additional tool calls add time (streaming helps mitigate user-perceived delay)

## Rollback Plan

If issues arise, can easily rollback by:
1. Remove the "CRITICAL: SELF-REFLECTION & COMPLETENESS CHECK" section from `src/config/prompts.js`
2. Run `./scripts/deploy.sh` to redeploy previous version
3. Original behavior restored immediately

## Future Enhancements

Potential improvements based on this foundation:
1. **Adaptive iteration limits**: Increase limit for complex queries, decrease for simple ones
2. **Explicit completeness score**: Have LLM output confidence score on completeness
3. **User feedback loop**: Learn from queries where users ask follow-ups
4. **Query complexity detection**: Adjust self-reflection depth based on query complexity
5. **Tool usage analytics**: Track which gaps trigger which tool calls for optimization

## Conclusion

This update significantly enhances the LLM's ability to provide comprehensive, complete responses by adding a built-in self-reflection mechanism. The system now actively evaluates whether it has fully answered the user's question and automatically takes action to fill any gaps before responding.

**Key Benefit**: Users receive more complete, thorough answers on the first response, reducing back-and-forth and improving overall satisfaction.
