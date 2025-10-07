# Link Preservation Updates - Prompts and Tool Descriptions

**Date**: October 6, 2025  
**Status**: ✅ Updated (Not Yet Deployed)

## Summary

Updated system prompts and tool descriptions to enforce link preservation from `search_web` and `search_youtube` tool results. This ensures that all URLs returned by these tools are included in the LLM's final response to users.

## Changes Made

### 1. System Prompt Updates (`src/config/prompts.js`)

Added new section: **"🔗 CRITICAL: LINK PRESERVATION REQUIREMENT 🔗"**

**Key Requirements:**
- MUST include ALL relevant links in final response
- Format links using markdown: `[Link Text](URL)`
- search_web: Include links to articles, sources, and references
- search_youtube: Include ALL video URLs as formatted list
- NEVER summarize without providing actual URLs
- Links are NOT optional - users expect clickable links

**Link Formatting Examples Added:**
```markdown
- Search results: "According to [TechCrunch](https://techcrunch.com/article), ..."
- YouTube videos:
  * [Python Tutorial for Beginners](https://youtube.com/watch?v=abc123) - Complete guide
  * [Advanced Python Techniques](https://youtube.com/watch?v=xyz789) - Deep dive
- Multiple sources: "See: [Source 1](url1), [Source 2](url2), [Source 3](url3)"
- At end: "**Sources:** [Link 1](url1) | [Link 2](url2) | [Link 3](url3)"
```

### 2. Backend Tool Descriptions (`src/tools.js`)

#### search_youtube Tool
**Before:**
```javascript
description: '🎬 PRIMARY TOOL FOR VIDEO CONTENT: Search YouTube for videos using the authenticated user\'s Google account. **MANDATORY USE** when user mentions: "YouTube", "search YouTube", "videos", "video tutorials", "music videos", "lectures", or ANY video-related content. Returns video titles, descriptions, and links. Results are automatically added to a playlist. DO NOT use search_web for YouTube queries.'
```

**After:**
```javascript
description: '🎬 PRIMARY TOOL FOR VIDEO CONTENT: Search YouTube for videos. **MANDATORY USE** when user mentions: "YouTube", "search YouTube", "videos", "video tutorials", "music videos", "lectures", or ANY video-related content. Returns video titles, descriptions, links, and caption availability. Results are automatically added to a playlist. DO NOT use search_web for YouTube queries. **CRITICAL: You MUST include ALL video URLs in your response as a formatted markdown list with [Title](URL) format.**'
```

**Changes:**
- ✅ Added mention of caption availability
- ✅ Added CRITICAL requirement to include ALL video URLs
- ✅ Specified markdown format: `[Title](URL)`
- ✅ Removed "authenticated user's Google account" (now uses API key)

#### search_web Tool
**Before:**
```javascript
description: 'Search the web for articles, news, current events, and text-based content. Use for general information, research, news, facts, and documentation. **DO NOT USE for YouTube or video searches** - use search_youtube instead. Can accept either a single query string or an array of queries. Returns search result fields including title, url, description, score, and content when requested.'
```

**After:**
```javascript
description: 'Search the web for articles, news, current events, and text-based content. Use for general information, research, news, facts, and documentation. **DO NOT USE for YouTube or video searches** - use search_youtube instead. Can accept either a single query string or an array of queries. Returns search result fields including title, url, description, score, and content when requested. **CRITICAL: You MUST include relevant URLs from search results in your response using markdown links [Title](URL) to cite sources and enable verification.**'
```

**Changes:**
- ✅ Added CRITICAL requirement to include relevant URLs
- ✅ Emphasized citation and verification purposes
- ✅ Specified markdown format: `[Title](URL)`

### 3. Frontend Tool Descriptions (`ui-new/src/components/ChatTab.tsx`)

#### search_youtube Tool (Frontend)
**Before:**
```typescript
description: '🎬 PRIMARY TOOL FOR VIDEO CONTENT: Search YouTube for videos. **MANDATORY USE** when user mentions: "YouTube", "search YouTube", "videos", "video tutorials", "music videos", "lectures", or ANY video-related content. Returns video titles, descriptions, links, and caption availability. Results are automatically added to a playlist. DO NOT use search_web for YouTube queries.'
```

**After:**
```typescript
description: '🎬 PRIMARY TOOL FOR VIDEO CONTENT: Search YouTube for videos. **MANDATORY USE** when user mentions: "YouTube", "search YouTube", "videos", "video tutorials", "music videos", "lectures", or ANY video-related content. Returns video titles, descriptions, links, and caption availability. Results are automatically added to a playlist. DO NOT use search_web for YouTube queries. **CRITICAL: You MUST include ALL video URLs in your response as a formatted markdown list with [Title](URL) format.**'
```

**Changes:**
- ✅ Added CRITICAL requirement to include ALL video URLs
- ✅ Specified markdown format: `[Title](URL)`

#### search_web Tool (Frontend)
**Before:**
```typescript
description: 'Search the web using DuckDuckGo to find current information, news, articles, and real-time data. USE THIS whenever users ask for current/latest information, news, or anything requiring up-to-date web content. Returns search results with titles, URLs, and snippets.'
```

**After:**
```typescript
description: 'Search the web using DuckDuckGo to find current information, news, articles, and real-time data. USE THIS whenever users ask for current/latest information, news, or anything requiring up-to-date web content. Returns search results with titles, URLs, and snippets. **CRITICAL: You MUST include relevant URLs from search results in your response using markdown links [Title](URL).**'
```

**Changes:**
- ✅ Added CRITICAL requirement to include relevant URLs
- ✅ Specified markdown format: `[Title](URL)`

## Implementation Strategy

### Phase 1: Prompt-Based Enforcement (✅ Completed)
- System prompt instructions
- Tool description requirements
- Example formatting provided

### Phase 2: Automated Verification (Future - Not Implemented Yet)
When ready to implement:
1. Add `extractUrlsFromToolResults()` function
2. Add `verifyLinksInResponse()` checker
3. Add automatic retry with reminder prompt if links missing
4. Add `link_verification` event streaming
5. Deploy backend and frontend

## Benefits

1. **Improved UX**: Users get clickable links to all sources
2. **Transparency**: Clear sourcing for all information
3. **Verification**: Users can verify claims by visiting sources
4. **Playlist Creation**: YouTube URLs automatically populate playlist
5. **Consistency**: All responses follow same link formatting

## Expected Behavior

### Example: Web Search
**Query**: "Search for recent AI developments"

**Expected Response**:
```markdown
Recent AI developments include:

1. **GPT-4 Improvements** - According to [OpenAI Blog](https://openai.com/blog/gpt4-improvements), 
   recent updates have enhanced reasoning capabilities...

2. **Google's Gemini** - [TechCrunch reports](https://techcrunch.com/gemini-launch) that 
   Google has launched its most advanced AI model...

**Sources:**
- [OpenAI Blog: GPT-4 Updates](https://openai.com/blog/gpt4-improvements)
- [TechCrunch: Google Gemini Launch](https://techcrunch.com/gemini-launch)
- [The Verge: AI Industry Trends](https://theverge.com/ai-trends-2025)
```

### Example: YouTube Search
**Query**: "Search YouTube for Python tutorials"

**Expected Response**:
```markdown
Here are excellent Python tutorials:

1. [Python for Absolute Beginners](https://youtube.com/watch?v=abc123)
   - Complete 4-hour course covering Python basics
   - Includes exercises and projects
   - Captions available in English

2. [Advanced Python Programming](https://youtube.com/watch?v=xyz789)
   - Deep dive into OOP, decorators, and generators
   - Real-world examples and best practices
   - Captions available in English

3. [Python Project Tutorial](https://youtube.com/watch?v=def456)
   - Build a complete web application
   - Covers Flask, databases, and deployment
   - Captions available in English

All videos have been added to your playlist.
```

## Testing Checklist

Before deployment, verify:
- [ ] Web search returns responses with markdown links
- [ ] YouTube search returns ALL video URLs as formatted list
- [ ] Links are clickable in the UI
- [ ] Link format is consistent: `[Title](URL)`
- [ ] Multiple sources are properly listed
- [ ] YouTube playlist populates correctly

## Deployment

When ready to deploy:

```bash
# Backend (prompts and tool descriptions)
./scripts/deploy.sh

# Frontend (tool descriptions)
cd ui-new && npm run build
cd .. && ./scripts/deploy-docs.sh -m "feat: Enforce link preservation in tool results"
```

## Rollback Plan

If issues arise after deployment:

```bash
# Revert changes
git revert HEAD

# Redeploy
./scripts/deploy.sh
cd ui-new && npm run build
./scripts/deploy-docs.sh -m "revert: Remove link preservation enforcement"
```

## Monitoring

After deployment, monitor for:
- Responses missing expected links
- Link formatting issues
- User feedback about link presence/absence
- CloudWatch logs for any new errors

## Next Steps (Future Enhancements)

1. **Automated Verification**: Implement backend verification functions
2. **Link Quality Check**: Verify links are accessible before including
3. **Smart Link Selection**: Choose most relevant links when many are available
4. **Citation Styles**: Support academic citation formats
5. **Link Metadata**: Include preview images, descriptions with links

## Files Modified

- ✅ `src/config/prompts.js` - System prompt updates
- ✅ `src/tools.js` - Backend tool descriptions
- ✅ `ui-new/src/components/ChatTab.tsx` - Frontend tool descriptions

## Status

**Ready for Deployment**: ✅ Yes  
**Breaking Changes**: ❌ No  
**Requires Testing**: ✅ Yes (manual verification recommended)  
**User Impact**: 🟢 Positive (better link preservation)

---

**Created**: October 6, 2025  
**Last Updated**: October 6, 2025  
**Version**: 1.0
