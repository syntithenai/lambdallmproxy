# TODO

replace the current system of iterative searching with a more general approach that allows for iterative tools calls. 
	


## ✅ COMPLETED: Multi-Search Loop Implementation

✅ Changed the Lambda function to support iterative search cycles (up to 3 iterations)
✅ LLM can now request additional searches based on information gaps
✅ Creates a search loop until the LLM determines it has sufficient information

✅ Modified decision template to return arrays of search queries instead of single search terms
✅ Each search query is executed independently and results are digested by LLM
✅ Individual search summaries are generated before final response synthesis

## New Features Implemented

- **Multi-Search Decision Making**: LLM provides 1-3 search queries in initial decision
- **Search Result Digestion**: Each search's results are summarized with key information
- **Continuation Logic**: LLM determines if additional searches are needed (max 3 iterations)
- **Enhanced Response Format**: Includes search summaries, source links, and full search results JSON
- **Frontend Enhancements**: Updated UI to display search summaries, links, and collapsible JSON results

## Architecture Changes

- `processInitialDecision()`: Now returns `search_queries` array instead of single `search_terms`
- `digestSearchResults()`: New method to summarize individual search results
- `shouldContinueSearching()`: New method to determine if more searches are needed
- `generateFinalResponse()`: New method to synthesize all gathered information
- Enhanced response format with `searchSummaries`, `links`, and `searchResults` fields

## Next Potential Enhancements

	- [x] Move Final Response to the top and show placeholder immediately
	- [x] Add Search Summary list under the final response with per-search rows
	- [x] Add closed-by-default Full results tree grouped by iteration → query
	- [x] Remove the initial empty 'search_results' emission to avoid 'null' row
	- [ ] Rebuild docs so docs/index.html picks up ui/index_template.html changes


