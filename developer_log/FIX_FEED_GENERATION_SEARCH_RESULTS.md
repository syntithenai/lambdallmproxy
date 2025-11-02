# Fix: Feed Generation Now Uses Web Search Results

**Date**: 2025-01-27  
**Status**: ✅ Completed  
**Priority**: Critical  

## Issue

User reported that generated feed items don't reflect their interests input prompt, questioning if the backend is actually searching the web on the required topics.

## Investigation

### Traced Complete Flow

1. **Frontend (FeedPage.tsx)**:
   - User enters interests: `"artificial intelligence, space exploration"`
   - Calls `updateSearchTerms([interestsInput.trim()])` to save interests
   - Calls `generateMore()` to trigger generation

2. **Frontend (FeedContext.tsx)**:
   - Line 228: `const searchTermsForGeneration = snippetTags.length > 0 ? snippetTags : preferencesRef.current.searchTerms;`
   - When no snippets exist, uses user-provided interests as search terms

3. **Frontend (feedGenerator.ts)**:
   - Sends POST request to `/feed/generate` with:
     ```typescript
     {
       swagContent: [],
       searchTerms: ["artificial intelligence", "space exploration"],
       count: 10,
       preferences: {...},
       maturityLevel: 'adult'
     }
     ```

4. **Backend (src/endpoints/feed.js)**:
   - **Lines 144-175**: DOES perform web searches
     ```javascript
     for (const term of searchTerms.slice(0, 3)) {
       const results = await performDuckDuckGoSearch(term, 5);
       searchResults.push(...results);
     }
     ```
   - **Lines 180-183**: Builds search summary from results
     ```javascript
     searchSummary = searchResults
       .slice(0, 10)
       .map(r => `${r.title}: ${r.snippet}`)
       .join('\n');
     ```

### Root Cause

The backend **WAS** searching the web correctly, but the LLM system prompt (lines 186-215) didn't explicitly tell the model to **use** those search results. The prompt said:

```
TASK: Generate ${count} high-quality educational items mixing:
- "Did You Know" facts (70%)
- Question & Answer pairs (30%)
```

The LLM was generating generic educational content instead of basing it on the actual web search findings.

## Solution

### Updated LLM System Prompt

Modified `src/endpoints/feed.js` lines 179-217 to add explicit instructions when search results are present:

**Key Changes**:

1. **TASK Line**: Now says `"based on the search results provided above"` when `searchSummary` exists

2. **Added Critical Warning**:
   ```
   ⚠️ CRITICAL: You MUST base your content on the "Recent news/searches" section above. 
   Use the titles, snippets, and information from those search results as your primary 
   source material. Do NOT generate generic facts - use the specific information 
   provided in the search results.
   ```

3. **Updated All Content Requirements**: Added phrases like:
   - "drawn from the search results"
   - "based on search findings"
   - "that references information from the search results"
   - "from the search results"

4. **Added Requirement #7**: 
   ```
   7. ⚠️ Base ALL content on the search results provided - do NOT make up generic facts
   ```

### Conditional Logic

All search-related instructions are conditional using `${searchSummary ? '...' : ''}` so they only appear when web searches were actually performed. This preserves original behavior when generating from Swag content alone.

## Example Prompt (After Fix)

When user enters interests "artificial intelligence, space exploration":

```
You are a content curator generating in-depth educational content.

INPUT CONTEXT:
Recent news/searches:
AI Breakthrough in Natural Language Processing: New transformer model achieves 95% accuracy...
SpaceX Starship Launch Success: Successful orbital test flight demonstrates...
NASA Mars Rover Discovery: Evidence of ancient water found in Jezero Crater...
[... more search results ...]

TASK: Generate 10 high-quality educational items based on the search results provided above mixing:
- "Did You Know" facts (70%) - surprising, educational facts drawn from the search results
- Question & Answer pairs (30%) - thought-provoking Q&A based on search findings

⚠️ CRITICAL: You MUST base your content on the "Recent news/searches" section above. 
Use the titles, snippets, and information from those search results as your primary 
source material. Do NOT generate generic facts - use the specific information provided 
in the search results.

CRITICAL REQUIREMENTS:
1. Each item MUST have:
   - Short summary (2-3 sentences) in "content" that references information from the search results
   - Expanded article (4-6 paragraphs) in "expandedContent" with AT LEAST 4 interesting facts drawn from the search results
   - Creative mnemonic in "mnemonic" - use acronyms, rhymes, or surprising connections
   
[... rest of requirements ...]

7. ⚠️ Base ALL content on the search results provided - do NOT make up generic facts
```

## Expected Behavior

### Before Fix
- User enters: "artificial intelligence, space exploration"
- Backend searches DuckDuckGo and gets relevant articles
- LLM ignores search results and generates generic educational content
- Result: Feed items about random facts, not related to user interests

### After Fix
- User enters: "artificial intelligence, space exploration"
- Backend searches DuckDuckGo and gets relevant articles
- LLM is explicitly instructed to use those search results
- Result: Feed items about current AI breakthroughs and recent space missions

## Testing

1. **Start local dev server**: `make dev`
2. **Open UI**: http://localhost:8081
3. **Navigate to Feed page**
4. **Enter interests**: e.g., "quantum computing, renewable energy"
5. **Click Generate**
6. **Verify**: Generated items should reference current news/information about quantum computing and renewable energy

## Files Changed

- `src/endpoints/feed.js` (lines 179-217) - Updated LLM system prompt

## Related Issues

- User reported: "the generated feed items dont reflect the user interests input prompt"
- User questioned: "it is not clear to me that the backend is searching the web on the required topics"
- Both concerns are now addressed - backend was searching, but LLM wasn't using results

## Notes

- The web search was working correctly all along
- The issue was purely in the LLM prompt engineering
- This is a common problem: providing context to an LLM isn't enough - you must explicitly instruct it to **use** that context
- The fix is backward-compatible: instructions only appear when search results exist

## Deployment

⚠️ **IMPORTANT**: This is a backend change. To test:
1. Local development: Already running on `http://localhost:3000`
2. Production deployment: Run `make deploy-lambda-fast` when ready

## Success Metrics

- Generated feed items should now include:
  - References to current news/events
  - Specific facts from search results
  - Content clearly related to user's interests
  - URLs/sources that match the search query topics
