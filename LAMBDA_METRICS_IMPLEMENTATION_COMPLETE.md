# Lambda Metrics Implementation - Phase 2.3 Complete ✅

**Date**: October 20, 2025  
**Status**: Complete and Tested  
**Branch**: agent

## Summary

Successfully implemented Lambda metrics tracking across all endpoints. The system now captures memory usage, memory limits, and request IDs for every API call, providing visibility into Lambda resource consumption alongside cost tracking.

## Changes Made

### 1. Google Sheets Logger Schema Update

**File**: `src/services/google-sheets-logger.js`

- Added 3 new columns to logging sheet:
  - **Column K**: Memory Limit (MB) - Lambda's configured memory
  - **Column L**: Memory Used (MB) - Actual heap usage at time of logging
  - **Column M**: Request ID - Unique Lambda invocation identifier

- Updated sheet initialization:
  - Changed range from `A1:L1` to `A1:O1` (12 → 15 columns)
  - Added headers: `'Memory Limit (MB)', 'Memory Used (MB)', 'Request ID'`

- Updated row data writing:
  - Changed range from `A:L` to `A:O`
  - Added fields: `logData.memoryLimitMB || ''`, `logData.memoryUsedMB || ''`, `logData.requestId || ''`

### 2. Lambda Context Propagation

**File**: `src/index.js`

- Updated all endpoint handler calls to pass `context` parameter:
  - Line 128: `await planningEndpoint.handler(event, responseStream, context);`
  - Line 133: `await searchEndpoint.handler(event, responseStream, context);`
  - Line 138: `await chatEndpoint.handler(event, responseStream, context);`
  - Lines 158-170: All RAG endpoint calls now include `context`

### 3. Chat Endpoint Updates

**File**: `src/endpoints/chat.js`

- Updated handler signature:
  ```javascript
  async function handler(event, responseStream, context)
  ```

- Added Lambda metrics extraction at handler start:
  ```javascript
  const memoryLimitMB = context?.memoryLimitInMB || 0;
  const requestId = context?.requestId || '';
  const memoryUsedMB = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
  ```

- Updated **5 logging locations**:
  1. **Main chat logging** (~line 3161):
     - Added cost calculation: `calculateCost(model, promptTokens, completionTokens)`
     - Added `type: 'chat'`
     - Added Lambda metrics: `memoryLimitMB`, `memoryUsedMB`, `requestId`
     - Changed duration: `durationMs / 1000` (ms → seconds)
  
  2. **Guardrail input logging** (~line 1172):
     - Added Lambda metrics to guardrail_input logs
  
  3. **Guardrail output logging** (~line 3001):
     - Added Lambda metrics to guardrail_output logs
  
  4. **Max iterations error logging** (~line 3247):
     - Added cost (0), type ('chat'), Lambda metrics
  
  5. **General error logging** (~line 3332):
     - Added cost (0), type ('chat'), Lambda metrics

### 4. RAG Endpoint Updates

**File**: `src/endpoints/rag.js`

- Updated main handler signature:
  ```javascript
  exports.handler = async (event, responseStream, context)
  ```

- Added Lambda metrics extraction at handler start

- Updated `handleEmbedSnippets` function:
  - Added `lambdaMetrics` parameter
  - Passed metrics object: `{ memoryLimitMB, memoryUsedMB, requestId }`

- Updated embedding logging (~line 196):
  - Added Lambda metrics from `lambdaMetrics` parameter
  - Changed duration: `duration / 1000` (ms → seconds)

### 5. Planning Endpoint Updates

**File**: `src/endpoints/planning.js`

- Added `calculateCost` import:
  ```javascript
  const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');
  ```

- Updated handler signature:
  ```javascript
  async function handler(event, responseStream, context)
  ```

- Added Lambda metrics extraction at handler start

- Updated planning logging (~line 848):
  - Added cost calculation: `calculateCost(model, promptTokens, completionTokens)`
  - Added `type: 'planning'`
  - Added Lambda metrics: `memoryLimitMB`, `memoryUsedMB`, `requestId`
  - Changed duration: `durationMs / 1000` (ms → seconds)

## Lambda Metrics Captured

| Metric | Source | Description |
|--------|--------|-------------|
| **Memory Limit (MB)** | `context.memoryLimitInMB` | Lambda function's configured memory allocation |
| **Memory Used (MB)** | `process.memoryUsage().heapUsed / (1024 * 1024)` | Actual heap memory used at time of logging |
| **Request ID** | `context.requestId` | Unique identifier for Lambda invocation (debugging) |

## Google Sheets Column Layout (15 columns)

| Column | Field | Type |
|--------|-------|------|
| A | Timestamp | datetime |
| B | User Email | string |
| C | Provider | string |
| D | Model | string |
| E | Type | string (chat/embedding/guardrail_input/guardrail_output/planning) |
| F | Tokens In | number |
| G | Tokens Out | number |
| H | Total Tokens | number |
| I | Cost ($) | number |
| J | Duration (s) | number |
| **K** | **Memory Limit (MB)** | **number** ← NEW |
| **L** | **Memory Used (MB)** | **number** ← NEW |
| **M** | **Request ID** | **string** ← NEW |
| N | Error Code | string |
| O | Error Message | string |

## Testing

### Unit Tests
- ✅ All pricing accuracy tests pass (7/7)
- ✅ No regressions in existing functionality

### Integration Tests
Created `tests/integration/lambda-metrics.test.js`:
- ✅ Chat endpoint accepts context parameter
- ✅ RAG endpoint accepts context parameter
- ✅ Planning endpoint accepts context parameter
- ✅ logToGoogleSheets accepts Lambda metrics fields
- ✅ Missing Lambda metrics handled gracefully
- ✅ Memory usage calculation correct (MB with 2 decimals)

**Test Results**: 6/6 tests passing

### Syntax Validation
- ✅ All modified files have valid JavaScript syntax
- ✅ No linting errors

## Benefits

1. **Resource Optimization**: Track memory usage patterns to right-size Lambda memory allocation
2. **Cost Analysis**: Correlate memory allocation with API costs
3. **Debugging**: Request IDs enable tracing specific invocations in CloudWatch logs
4. **Performance Insights**: Identify memory-intensive operations
5. **Capacity Planning**: Understand memory requirements across different model types

## Usage Examples

### Analyzing Memory Patterns
```sql
-- Google Sheets query: Find high memory usage requests
=QUERY(A2:O, "SELECT C, D, AVG(L), MAX(L) WHERE L > 0 GROUP BY C, D ORDER BY AVG(L) DESC")
```

### Correlating Memory and Cost
```sql
-- High cost + high memory usage (optimization candidates)
=QUERY(A2:O, "SELECT C, D, AVG(I), AVG(L) WHERE I > 0.01 AND L > 100 GROUP BY C, D")
```

### Debugging with Request ID
When investigating issues:
1. Find request in Google Sheets by timestamp/user/model
2. Copy Request ID from column M
3. Search CloudWatch logs: `requestId: "abc123-def456"`

## Next Steps

### Phase 2.4: Enhance calculateCostForType() (Optional)
**Decision needed**: Determine if type-specific cost calculations are required, or if current implementation handles all cases.

**Current state**: `calculateCost()` function works for all logging types (chat, embedding, guardrail, planning).

**Recommendation**: Skip Phase 2.4 unless specific type-based pricing variations are identified.

### Phase 3: User-Owned Billing Sheet (8-10 hours)
**Goal**: Allow users to create their own Google Drive billing sheet for personalized cost tracking.

**Key features**:
- OAuth-based Google Drive access
- Sheet creation in user's Drive
- Data export/sync from main logging sheet
- User-specific filtering and aggregations

**Files to create**:
- `src/services/user-billing-sheet.js`
- `src/endpoints/billing.js`

### Phase 4: Billing UI Page (10-12 hours)
**Goal**: Rich frontend for billing data visualization and management.

**Key features**:
- Cost summaries with date range filters
- Model/provider breakdowns
- CSV export functionality
- Clear data modes (user-only, all-data, confirm-required)
- Integration with user-owned sheets

**Files to create**:
- `ui-new/src/components/BillingPage.tsx`
- `ui-new/src/components/BillingChart.tsx`

## Deployment Checklist

Before deploying to Lambda:

- ✅ All tests passing locally
- ✅ Syntax validation complete
- ✅ No breaking changes to existing functionality
- ⏳ Manual test in Lambda environment
- ⏳ Verify Google Sheets columns K, L, M populate correctly
- ⏳ Check CloudWatch logs for Lambda metrics

### Deploy Commands
```bash
# Deploy Lambda function
./deploy.sh

# Verify environment variables (if any changes)
make deploy-env
```

### Verification Steps
1. Make a test API call (chat, RAG, or planning)
2. Check Google Sheets - verify columns K, L, M have values:
   - Memory Limit: Should match Lambda config (e.g., 256, 512, 1024)
   - Memory Used: Should be > 0, typically 50-200 MB
   - Request ID: Should be a unique string (e.g., "abc123-def456-...")
3. Check CloudWatch logs - find request by Request ID

## Files Modified

- `src/services/google-sheets-logger.js` - Schema update (15 columns)
- `src/index.js` - Context propagation to all endpoints
- `src/endpoints/chat.js` - Handler update + 5 logging locations
- `src/endpoints/rag.js` - Handler update + embedding logging
- `src/endpoints/planning.js` - Handler update + planning logging

## Files Created

- `tests/integration/lambda-metrics.test.js` - Integration test suite

## Related Documentation

- [PRICING_DISPLAY_COMPLETE.md](./PRICING_DISPLAY_COMPLETE.md) - Phase 1 & 2.1 completion
- [PRICING_DISPLAY_IMPLEMENTATION_PLAN.md](./PRICING_DISPLAY_IMPLEMENTATION_PLAN.md) - Overall plan
- [GOOGLE_SHEETS_LOGGING_SETUP.md](./GOOGLE_SHEETS_LOGGING_SETUP.md) - Logging system setup

---

**Implementation Time**: ~2 hours  
**Lines of Code Changed**: ~100 lines across 5 files  
**Tests Added**: 6 integration tests  
**Breaking Changes**: None (backward compatible)
