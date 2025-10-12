# UI Fine-Tuning - Quick Implementation Guide

## Summary of Required Changes

### 1. Token Display Changes
**Current**: Shows "📥 1000 • 📤 500 • 📊 1500"
**New**: ALWAYS show both in/out tokens for ALL providers
- For Gemini (free): "📥 1000 in • � 500 out • �💰 $0.0000 (would be $0.0234 on paid plan)"
- For OpenAI (paid): "📥 1000 in • 📤 500 out • 💰 $0.0234"

**Rationale**: Show dual pricing for free-tier models to help users understand costs if they switched to paid providers

### 2. Cost Prioritization
**Current**: Cost is secondary, tokens are primary
**New**: Cost is PRIMARY and prominent, tokens are secondary/smaller

**Example**: `💰 $0.0234 • 📊 1,500 tokens • ⏱️ 2.3s`

### 3. Summary Totals
Add footer to LLM transparency views showing:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL SUMMARY
📊 Total Tokens: 12,345 in • 8,901 out • 21,246 total
💰 Total Cost: $0.1234 ($0.4567 if on paid plan)
⏱️ Total Duration: 12.34s
3 LLM API Calls
```

### 4. Chat Info Button
**Current**: Shows detailed token breakdown
**New**: Simplified view with cost prominent

```tsx
// In message header next to timestamp
<button className="info-button">
  💰 $0.02 • 1.2k tokens • 2.3s ℹ️
</button>
```

### 5. Expandable Search & Scraped Content
**Current**: Always expanded, clutters view, no access to full scraped data
**New**: Multi-level expandable view

```tsx
<div className="search-result-collapsed">
  🔍 Found 5 results from web search • 
  <button>Click to expand ▼</button>
</div>

{expanded && (
  <div className="search-results">
    {results.map(result => (
      <div className="result-item">
        <div className="result-summary">
          <a href={result.url}>{result.title}</a>
          <p>{result.snippet}</p>
        </div>
        
        {/* Each result can expand to show full scraped content */}
        <button onClick={() => toggleDetail(result.url)}>
          View scraped content ▼
        </button>
        
        {detailExpanded[result.url] && (
          <JsonTree 
            data={{
              url: result.url,
              fullContent: result.fullScrapedContent,
              summarizedContent: result.summary,
              links: result.extractedLinks,
              images: result.extractedImages,
              youtubeLinks: result.youtubeVideos,
              otherMedia: result.otherMedia
            }}
          />
        )}
      </div>
    ))}
  </div>
)}
```

## Key Files to Modify

### 1. `ui-new/src/utils/pricing.ts`
Add helper to determine if model is free and calculate dual pricing:

```typescript
export function isFreeTierModel(model: string): boolean {
  const cleanModel = model.replace(/^(openai:|groq:|anthropic:|gemini:)/, '');
  return cleanModel.startsWith('gemini-') || 
         cleanModel.includes('llama') || 
         cleanModel.includes('mixtral') ||
         cleanModel.includes('gemma');
}

export function calculateDualPricing(
  model: string, 
  tokensIn: number, 
  tokensOut: number
): { actualCost: number | null; paidEquivalentCost: number | null; isFree: boolean } {
  const isFree = isFreeTierModel(model);
  const actualCost = calculateCost(model, tokensIn, tokensOut);
  
  if (isFree && actualCost === 0) {
    // Calculate what it WOULD cost on a paid plan
    // Use gpt-4o-mini as the baseline paid model
    const equivalentPricing = MODEL_PRICING['gpt-4o-mini'];
    const paidEquivalentCost = 
      ((tokensIn / 1_000_000) * equivalentPricing.input) +
      ((tokensOut / 1_000_000) * equivalentPricing.output);
    
    return { 
      actualCost: 0, 
      paidEquivalentCost, 
      isFree: true 
    };
  }
  
  return { 
    actualCost, 
    paidEquivalentCost: null, 
    isFree: false 
  };
}
```

### 2. `ui-new/src/components/LlmApiTransparency.tsx`

Update token and cost display section (around line 215):

```tsx
{/* Token counts - ALWAYS show both in/out for all models */}
{tokensIn > 0 && <span className="text-xs opacity-75">📥 {tokensIn.toLocaleString()} in</span>}
{tokensOut > 0 && <span className="text-xs opacity-75">📤 {tokensOut.toLocaleString()} out</span>}
{totalTokens > 0 && <span className="text-xs opacity-75">� {totalTokens.toLocaleString()}</span>}

{/* Cost display - show dual pricing for free models */}
{(() => {
  const pricing = calculateDualPricing(call.model, tokensIn, tokensOut);
  if (pricing.isFree && pricing.paidEquivalentCost !== null) {
    return (
      <div className="text-xs">
        💰 $0.0000 
        <span className="opacity-75 ml-1">
          (would be {formatCost(pricing.paidEquivalentCost)} on paid plan)
        </span>
      </div>
    );
  } else if (pricing.actualCost !== null) {
    return <div className="text-xs">💰 {formatCost(pricing.actualCost)}</div>;
  }
  return null;
})()}
```

Add summary footer at end of component:

```tsx
{/* Add after all API calls are rendered */}
<div className="border-t-2 border-gray-300 dark:border-gray-600 mt-4 pt-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
  <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">
    📊 TOTAL SUMMARY
  </h4>
  {/* Calculate totals here */}
</div>
```

### 3. `ui-new/src/components/ChatTab.tsx`

Find the message rendering section (around line 1900-2400) and update:

**A. Info Button** (find where llmApiCalls info button is rendered):

```tsx
{msg.llmApiCalls && msg.llmApiCalls.length > 0 && (
  <button
    onClick={() => setViewingApiCalls(msg.llmApiCalls)}
    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
    title="View LLM API details"
  >
    {(() => {
      const totalCost = msg.llmApiCalls.reduce((sum:number, call:any) => {
        const cost = calculateCost(
          call.model,
          call.response?.usage?.prompt_tokens || 0,
          call.response?.usage?.completion_tokens || 0
        );
        return sum + (cost || 0);
      }, 0);
      
      const totalTokens = msg.llmApiCalls.reduce((sum:number, call:any) => {
        return sum + (call.response?.usage?.total_tokens || 0);
      }, 0);
      
      const totalTime = msg.llmApiCalls.reduce((sum:number, call:any) => {
        return sum + (call.response?.usage?.total_time || 0);
      }, 0);
      
      return (
        <>
          {totalCost > 0 && <span>💰 {formatCost(totalCost)}</span>}
          {totalCost > 0 && totalTokens > 0 && <span> • </span>}
          {totalTokens > 0 && <span>📊 {(totalTokens / 1000).toFixed(1)}k</span>}
          {totalTime > 0 && <span> • ⏱️ {totalTime.toFixed(1)}s</span>}
          <span> ℹ️</span>
        </>
      );
    })()}
  </button>
)}
```

**B. Expandable Search Results with Scraped Content** (find search_web rendering around line 1980):

```tsx
{msg.name === 'search_web' && typeof msg.content === 'string' && (() => {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  
  const toggleResultDetail = (url: string) => {
    const newSet = new Set(expandedResults);
    if (newSet.has(url)) {
      newSet.delete(url);
    } else {
      newSet.add(url);
    }
    setExpandedResults(newSet);
  };
  
  try {
    const parsed = JSON.parse(msg.content);
    const resultCount = parsed.results?.length || 0;
    
    return (
      <div className="search-result-container">
        <button
          onClick={() => setSearchExpanded(!searchExpanded)}
          className="w-full text-left px-3 py-2 bg-blue-50 dark:bg-blue-900 rounded hover:bg-blue-100 dark:hover:bg-blue-800 flex items-center justify-between"
        >
          <span>
            🔍 Found {resultCount} results from web search
          </span>
          <span>{searchExpanded ? '▲' : '▼'}</span>
        </button>
        
        {searchExpanded && (
          <div className="mt-2 space-y-3">
            {parsed.results?.map((result: any, idx: number) => (
              <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                <a href={result.url} className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                  {result.title}
                </a>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{result.snippet}</p>
                
                {/* Button to expand scraped content */}
                {result.scrapedContent && (
                  <>
                    <button
                      onClick={() => toggleResultDetail(result.url)}
                      className="text-xs text-purple-600 dark:text-purple-400 hover:underline mt-2"
                    >
                      {expandedResults.has(result.url) ? '▲' : '▼'} View scraped content
                    </button>
                    
                    {expandedResults.has(result.url) && (
                      <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded">
                        <JsonTree
                          data={{
                            url: result.url,
                            title: result.title,
                            fullScrapedContent: result.scrapedContent?.fullText || result.scrapedContent,
                            summarizedContent: result.scrapedContent?.summary,
                            links: result.scrapedContent?.links || [],
                            images: result.scrapedContent?.images || [],
                            youtubeLinks: result.scrapedContent?.youtube || [],
                            otherMedia: result.scrapedContent?.media || []
                          }}
                          label="Scraped Content Data"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (e) {
    return <div>{msg.content}</div>;
  }
})()}
```

## Quick Win Implementation Order

1. **Pricing utils** (5 min) - Add `isFreeTierModel()` and `calculateDualPricing()`
2. **LlmApiTransparency** (20 min) - Update cost display with dual pricing, add summary
3. **LlmInfoDialog** (20 min) - Same changes as Transparency
4. **Chat Info Button** (10 min) - Simplify display, cost-first, show dual pricing
5. **Expandable Search** (30 min) - Add collapse/expand UI with nested scraped content detail view

**Total time**: ~85 minutes for core functionality

## Testing

After changes, test with:
1. Gemini model (free) - should show BOTH in/out tokens + dual pricing "$0.0000 (would be $0.0234 on paid plan)"
2. OpenAI model (paid) - should show both in/out tokens + single pricing "$0.0234"
3. Search query - results should be collapsed by default with "View scraped content" buttons
4. Expand search result - should show scraped content in JsonTree with links, images, youtube, media
5. Info button - should show cost prominently with dual pricing for free models
6. Transparency view - should show totals at bottom

## Notes

- This is a UI-only change, no backend modifications needed
- Changes are backwards compatible
- Focus on UX improvements for clarity
- Cost should always be the primary metric, not tokens
