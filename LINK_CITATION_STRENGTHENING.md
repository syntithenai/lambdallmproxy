# Link Citation Requirement Strengthening

**Date**: October 9, 2025  
**Issue**: When asking for stock prices (and other simple queries), the LLM was not including source links in the response despite using web search.  
**Update**: October 9, 2025 - Further strengthened after LLM mentioned source names without URLs

## Problem Statement

Users expect source citations for all information obtained from web searches, including:
- Stock prices and financial data
- Weather information
- News headlines
- Simple factual queries
- Any information retrieved via search_web

**Original Behavior**: The LLM would sometimes provide the information without citing the source URL, especially for short/simple queries like "What's the Tesla stock price?"

**After First Fix**: LLM mentioned source names but didn't include the actual URLs:
> "The current stock price of Tesla is $438.65, and there are several recent news articles about the company. You can find more information on Reuters, CNBC, and Markets Insider."

This is USELESS because users cannot click on source names - they need actual clickable markdown links.

**Expected Behavior**: ALL search results should include source links as clickable markdown formatted URLs `[Source Name](url)`, both inline and in a References section at the end.

## Root Cause

**Initial Issue**: While the system prompt already included guidance about link preservation, it wasn't strong enough to ensure compliance for **short, simple queries**. The LLM was interpreting the link requirement as optional for brief answers.

**Second Issue**: After strengthening the requirements, the LLM started mentioning source names but not providing the actual URLs. This suggests the prompt wasn't explicit enough about:
1. Using the ACTUAL URLs from tool results
2. Never mentioning a source name without its URL
3. The difference between BAD (source names only) and GOOD (markdown links with URLs)

## Solution

**Phase 1 - Strengthened Link Requirements**: Updated the system prompt to make link citation absolutely mandatory with:
1. More emphatic language (CRITICAL, NO EXCEPTIONS, NOT OPTIONAL)
2. Explicit examples for short queries (stock prices)
3. Clear statement that even 1-sentence answers must include sources
4. Specific example response format for stock price queries

**Phase 2 - Explicit URL Usage Requirements**: After LLM mentioned source names without URLs, added:
1. **"USE THE ACTUAL URLs from the tool results"** - Direct instruction to copy URLs
2. **"NEVER say 'You can find more information on Reuters' without the URL"** - Explicit prohibition
3. **"NEVER mention a source name without providing its clickable URL"** - Crystal clear rule
4. **BAD vs GOOD examples** - Show exactly what NOT to do and what TO do
5. **Complete example with the actual problematic response** - Show the bad response users were seeing

### Changes Made (src/config/prompts.js)

#### 1. Enhanced Link Requirement Section

**Before**:
```
**LINKS (MANDATORY):**
1. You MUST include ALL relevant links in your final response
2. Format links using markdown: [Link Text](URL)
3. For search_web: The tool provides a "links" array - use these in your answer
4. For scrape_web_content: The tool provides a "links" array - reference these when relevant
5. For search_youtube: Include ALL video URLs as a formatted list
6. NEVER summarize search results without providing the actual URLs
7. Users expect clickable links - this is NOT optional
8. Links provide direct access to sources and enable verification
9. At the END of your response, you MUST include a "**References & Sources**" section with ALL links
```

**After**:
```
**LINKS (MANDATORY - CRITICAL REQUIREMENT):**
1. **ALWAYS include source links** - Even for simple queries (stock prices, weather, news), you MUST provide clickable source URLs
2. **NO EXCEPTIONS**: Whether the answer is 1 sentence or 1000 words, if you used search_web, you MUST include the source links
3. Format links using markdown: [Link Text](URL)
4. For search_web: The tool provides a "links" array - use EVERY SINGLE ONE of these in your answer
5. For scrape_web_content: The tool provides a "links" array - reference these when relevant
6. For search_youtube: Include ALL video URLs as a formatted list
7. **NEVER provide information from search results without citing the source URL** - This is a CRITICAL user expectation
8. Users expect and REQUIRE clickable links - this is NOT optional, not negotiable, not a suggestion
9. Links provide direct access to sources and enable verification - WITHOUT THEM, your answer is incomplete
10. **At the END of your response, you MUST include a "References & Sources" section** with ALL links from the search results
11. **CRITICAL FOR SHORT ANSWERS**: Even if your answer is brief (like a stock price), you MUST include the source link inline and in the References section
```

**Key Changes**:
- Added "CRITICAL REQUIREMENT" to title
- Point #1: Explicitly mentions simple queries (stock prices, weather, news)
- Point #2: "NO EXCEPTIONS" - whether 1 sentence or 1000 words
- Point #4: "use EVERY SINGLE ONE" - more emphatic
- Point #7: "NEVER provide information without citing" - absolute requirement
- Point #8: "NOT optional, not negotiable, not a suggestion" - crystal clear
- Point #9: "WITHOUT THEM, your answer is incomplete" - strong consequence
- Point #11: **NEW** - Specifically addresses short answers

#### 2. Added Stock Price Example

**Added to Link Formatting Examples**:
```
**Link Formatting Examples:**
- **Stock prices**: "Tesla (TSLA) is currently trading at $242.50 according to [Yahoo Finance](https://finance.yahoo.com/quote/TSLA)" - ALWAYS include source!
- Search results: "According to [TechCrunch](https://techcrunch.com/article), the latest developments..."
- YouTube videos: 
  * [Python Tutorial for Beginners](https://youtube.com/watch?v=abc123) - Complete guide covering basics
  * [Advanced Python Techniques](https://youtube.com/watch?v=xyz789) - Deep dive into OOP and design patterns
- Multiple sources: "For more information, see: [Source 1](url1), [Source 2](url2), [Source 3](url3)"
- **Short answers MUST have sources**: Even if your answer is one sentence, include the source link inline AND in a References section
```

**Key Additions**:
- First example is now a stock price query (the reported issue)
- Added note: "Short answers MUST have sources"

#### 3. Added Complete Stock Price Example

**Added after Example Complete Response Format**:
```
**Example for Simple Stock Price Query:**
User: "What's the Tesla stock price?"
Your Response:
"Tesla (TSLA) is currently trading at $242.50, according to [Yahoo Finance](https://finance.yahoo.com/quote/TSLA).

---
**References & Sources**
1. [Tesla Stock Quote - Yahoo Finance](https://finance.yahoo.com/quote/TSLA) - Real-time stock price and data"
```

**Purpose**: 
- Shows exactly how to format a response to a simple query
- Demonstrates inline link AND References section for short answers
- Uses the specific use case (Tesla stock price) that was reported

## Expected Behavior After Fix

### Stock Price Query
**User**: "What's the Tesla stock price?"

**LLM Response** (expected):
```
Tesla (TSLA) is currently trading at $242.50, according to [Yahoo Finance](https://finance.yahoo.com/quote/TSLA).

---
**References & Sources**
1. [Tesla Stock Quote - Yahoo Finance](https://finance.yahoo.com/quote/TSLA) - Real-time stock price and data
```

### Weather Query
**User**: "What's the weather in New York?"

**LLM Response** (expected):
```
The current weather in New York is 68°F (20°C) with partly cloudy skies, according to [Weather.com](https://weather.com/weather/today/l/New+York+NY).

---
**References & Sources**
1. [New York Weather Forecast - Weather.com](https://weather.com/weather/today/l/New+York+NY) - Current conditions and forecast
```

### News Query
**User**: "Latest tech news?"

**LLM Response** (expected):
```
Here are the latest tech headlines:

1. Apple announces new iPhone models - [TechCrunch](https://techcrunch.com/article1)
2. Tesla releases FSD update - [The Verge](https://theverge.com/article2)
3. OpenAI launches new features - [Ars Technica](https://arstechnica.com/article3)

---
**References & Sources**
1. [Apple iPhone Announcement - TechCrunch](https://techcrunch.com/article1)
2. [Tesla FSD Update - The Verge](https://theverge.com/article2)
3. [OpenAI New Features - Ars Technica](https://arstechnica.com/article3)
```

## Language Strengthening

### Emphatic Terms Added
- "CRITICAL REQUIREMENT" (in section title)
- "NO EXCEPTIONS" (applies to all queries)
- "EVERY SINGLE ONE" (use all links)
- "NOT optional, not negotiable, not a suggestion" (absolute requirement)
- "WITHOUT THEM, your answer is incomplete" (consequence)
- "ALWAYS include source" (imperative)

### Specificity Added
- Explicit mention of query types: "stock prices, weather, news"
- Clear scope: "Whether the answer is 1 sentence or 1000 words"
- Concrete example: Tesla stock price with exact format

## Technical Details

### System Prompt Generation
The changes are in the `getComprehensiveResearchSystemPrompt()` function which:
1. Is called at request time (not cached)
2. Returns the prompt with current date/time injected
3. Includes all the strengthened link requirements

### Affected Queries
These changes will improve link citation for:
- Stock prices and financial data
- Weather information
- Sports scores
- News headlines
- Simple factual queries
- Currency exchange rates
- Product prices
- Any short-answer query using search_web

### Not Affected
Queries that don't use search_web (like pure math or execute_javascript) won't be affected since links only apply when web search is used.

## Deployment

### Backend
```bash
make deploy-lambda-fast
```
- Package: `llmproxy-20251009-123142.zip` (108.8 KB)
- Status: ✅ Deployed successfully
- Endpoint: https://nrw7pperj jdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

### No Frontend Changes Required
This is a backend-only change affecting the system prompt.

## Testing Checklist

Test with these queries to verify link inclusion:

- [ ] "What's the Tesla stock price?" → Should include Yahoo Finance/Google Finance link
- [ ] "What's the weather in London?" → Should include Weather.com or similar link
- [ ] "Latest AI news" → Should include TechCrunch, Verge, or similar links
- [ ] "Bitcoin price" → Should include CoinMarketCap or similar link
- [ ] "Who won the Super Bowl?" → Should include ESPN or similar link
- [ ] "What time is the game tonight?" → Should include sports site link
- [ ] "Exchange rate USD to EUR" → Should include financial site link
- [ ] Each response should have BOTH inline links AND References section

## Benefits

1. **User Trust**: Source citations build credibility and trust
2. **Verification**: Users can verify information by clicking source links
3. **Transparency**: Clear where information came from
4. **Consistency**: All queries now have consistent link citation
5. **User Expectation**: Meets user expectation for sources on all information
6. **SEO/Discovery**: Users can discover original sources for deeper reading

## Alternative Solutions Considered

### Option 1: Post-processing (Rejected)
- Could scan LLM response and inject links automatically
- **Problem**: Hard to determine where links belong in the text
- **Problem**: Doesn't teach the LLM the expected behavior

### Option 2: Tool Response Formatting (Rejected)
- Could format search results to emphasize links more
- **Problem**: Links are already prominent in search results
- **Problem**: The issue is LLM behavior, not data availability

### Option 3: Prompt Strengthening (CHOSEN ✅)
- Strengthen the system prompt with emphatic language and examples
- **Benefit**: Addresses root cause (LLM not following guidance)
- **Benefit**: Scalable and maintainable
- **Benefit**: Works for all query types

## Deployment History

### Phase 1 Deployment (October 9, 2025 01:31:42 UTC)
- **Package**: llmproxy-20251009-123142.zip (108.8 KB)
- **Changes**: Initial link requirement strengthening with emphatic language and examples
- **Result**: LLM mentioned sources but didn't include URLs

### Phase 2 Deployment (October 9, 2025 01:50:40 UTC)  
- **Package**: llmproxy-20251009-125040.zip (109.4 KB)
- **Changes**: Added explicit BAD vs GOOD examples, prohibited source names without URLs
- **New Rules**:
  - "USE THE ACTUAL URLs from the tool results"
  - "NEVER say 'You can find more information on Reuters' without the URL"
  - "NEVER mention a source name without providing its clickable URL"
  - BAD example: Exact problematic response users were seeing
  - GOOD example: Correct response with all URLs in markdown format
- **Result**: Still no improvement - "You can find more information on CNBC's website"

### Phase 3 Deployment (October 9, 2025 02:14:38 UTC)  
- **Package**: llmproxy-20251009-131438.zip (109.6 KB)
- **Changes**: Added ULTRA-FORCEFUL final reminder box at end of system prompt
- **Strategy**: Place unmissable warning at the VERY END where LLM will see it last
- **New Addition**:
  ```
  ═══════════════════════════════════════════════════════════════
  🚨 FINAL CRITICAL REMINDER - READ THIS BEFORE EVERY RESPONSE 🚨
  ═══════════════════════════════════════════════════════════════
  
  When you used search_web, the tool results contain URLs in THIS FORMAT:
  ## [Title](https://actual-url-here.com)
  
  YOU MUST COPY THESE EXACT URLs INTO YOUR RESPONSE!
  
  ❌ FORBIDDEN: "You can find more information on CNBC's website"
  ✅ REQUIRED: "According to [CNBC](https://cnbc.com/actual-article-url)"
  
  IF YOU USED search_web AND DON'T INCLUDE THE URLS, YOU HAVE FAILED.
  ```
- **Rationale**: System prompt is long - LLM may not retain early instructions. Placing critical requirement at END ensures it's fresh in context when generating response.
- **Result**: Still no improvement - LLM ignoring instructions

### Phase 4 Deployment (October 9, 2025 02:19:32 UTC)  
- **Package**: llmproxy-20251009-131932.zip (110.0 KB)
- **Root Cause Discovery**: System prompt warnings weren't enough - LLM needs URLs injected directly into tool results
- **Strategy**: Make URLs impossible to miss by adding explicit section in compressed search results
- **Changes to `compressSearchResultsForLLM()`**:
  - Added dedicated "CRITICAL URLS" section at END of tool results
  - Lists all URLs in numbered markdown format ready to copy
  - Uses visual box formatting with ═══ lines and 🚨 emoji
  - Positioned AFTER content so it's freshest in LLM context
  - Example format:
    ```
    ═══════════════════════════════════════════════════════════════
    🚨 CRITICAL: YOU MUST COPY THESE URLS INTO YOUR RESPONSE 🚨
    ═══════════════════════════════════════════════════════════════
    The following URLs MUST be included in your response:
    
    1. [Tesla Stock Quote](https://finance.yahoo.com/quote/TSLA)
    2. [Tesla News - CNBC](https://cnbc.com/tesla-article)
    
    ❌ FORBIDDEN: Mentioning source names without URLs
    ✅ REQUIRED: Copy the markdown links above
    ═══════════════════════════════════════════════════════════════
    ```
- **Rationale**: LLM sees tool results IMMEDIATELY before generating response - this is the most effective place to inject URL requirements
- **Expected Result**: URLs are now in the tool result itself, not just in system prompt instructions

## Future Enhancements

### Potential Improvements
1. **Link Validation**: Could add a post-processing step to verify all search_web queries have links
2. **Link Counter**: Could count links used vs links available and emit a warning
3. **Structured Output**: Could use JSON mode to enforce link structure
4. **Response Validation**: Could reject responses that mention source names without URLs
4. **User Feedback**: Could allow users to report missing sources

### Monitoring
Consider tracking:
- Percentage of search_web responses that include references section
- Number of links per response vs links available in search results
- User feedback on source citation quality

## Related Files

- `src/config/prompts.js` - System prompt with strengthened link requirements
- `src/lambda_search_llm_handler.js` - Lambda handler that uses the prompt
- `src/tools.js` - search_web tool that provides the links array

## Conclusion

This change strengthens the link citation requirement in the system prompt to ensure ALL queries that use web search include proper source citations, with special emphasis on short/simple queries like stock prices where the LLM was previously omitting links. The fix uses emphatic language, clear examples, and specific guidance to make link inclusion non-negotiable.
