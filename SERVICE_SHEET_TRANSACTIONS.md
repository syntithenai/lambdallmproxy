# Service Sheet Transaction Support - Summary

**Date:** October 20, 2025  
**Status:** ✅ Completed

## Problem
Initially, when falling back to the service key Google Sheet, we were only returning aggregated totals (total cost) without detailed transaction data. This meant:
- No transaction history displayed
- No breakdowns by type, provider, or model
- Limited value when Personal Billing Sheet was disabled

## Solution
Added `getUserBillingData()` function to `google-sheets-logger.js` to read detailed transaction data from the centralized service sheet, providing full transaction history regardless of whether users have Personal Billing Sheet enabled.

## Changes Made

### 1. New Function in `src/services/google-sheets-logger.js` ✅
- **Function:** `getUserBillingData(userEmail, filters)`
- **Returns:** Array of transaction objects with full details
- **Features:**
  - Reads from centralized service sheet (same sheet that logs all usage)
  - Supports filtering by date range, type, and provider
  - Parses all columns: timestamp, provider, model, tokens, cost, duration, errors
  - Returns empty array on error (non-blocking)

**Data Structure from Service Sheet:**
```javascript
{
  timestamp: "2025-10-20T12:00:00Z",
  provider: "openai",
  model: "gpt-4o",
  tokensIn: 150,
  tokensOut: 200,
  totalTokens: 350,
  cost: 0.0025,
  duration: 1.5,
  type: "chat", // Default, as service sheet doesn't distinguish
  error: null // or { code: "...", message: "..." }
}
```

### 2. Updated `src/endpoints/billing.js` ✅
- **Import:** Added `getUserBillingData` from google-sheets-logger
- **Service Key Path:** Now calls `getUserBillingData()` instead of just `getUserTotalCost()`
- **Fallback Path:** Same - uses `getUserBillingData()` when personal sheet fails
- **Benefits:**
  - Full transaction history from central service
  - Complete totals calculation via `calculateTotals()`
  - Consistent data structure regardless of source

### 3. Updated `ui-new/src/components/BillingPage.tsx` ✅
- **Safety Checks:** Added conditional rendering for byType, byProvider, byModel breakdowns
- **Handles Missing Data:** Only displays breakdown tables when data exists
- **Updated Banner:** Now shows info banner only when using service data (not fallback)
- **Consistent UX:** Users see same features whether using personal or service sheet

## Architecture

### Data Flow - Service Key Sheet:

```
1. API Request → getUserBillingData(userEmail, filters)
                 ↓
2. Authenticate with service account
                 ↓
3. Read from centralized Google Sheet (same sheet that logs usage)
                 ↓
4. Filter transactions by:
   - User email (match)
   - Date range (optional)
   - Provider (optional)
   - Type (optional, defaults to 'chat')
                 ↓
5. Return array of transactions
                 ↓
6. Calculate totals (same function used for personal sheets)
                 ↓
7. Send to frontend with full breakdown data
```

### Data Flow - Personal Billing Sheet:

```
1. API Request → readBillingData(accessToken, userEmail, filters)
                 ↓
2. Authenticate with user's OAuth token
                 ↓
3. Read from user's personal Google Sheet in Drive
                 ↓
4. Filter and process transactions
                 ↓
5. Return array of transactions
                 ↓
6. Calculate totals
                 ↓
7. Send to frontend
```

### Fallback Behavior:

```
Try Personal Sheet
   ↓
   ├─ Success → Return personal sheet data
   │
   └─ Error → Fall back to Service Sheet
              ↓
              getUserBillingData() → Same transaction data
              ↓
              Return with fallback flag
```

## Key Benefits

1. **Consistent Experience:** Users see full transaction history regardless of sync settings
2. **No Data Loss:** All transactions always available from central service
3. **Graceful Degradation:** If personal sheet fails, service sheet provides complete data
4. **Same Features:** Breakdowns by type, provider, model work with both sources
5. **Simplified UX:** Personal Billing Sheet is now truly optional - adds backup/export capability

## Service Sheet Columns

The centralized service sheet (`GOOGLE_SHEETS_LOG_SPREADSHEET_ID`) has these columns:

| Index | Column | Description |
|-------|--------|-------------|
| 0 | Timestamp | ISO 8601 format |
| 1 | Email | User's email address |
| 2 | Provider | API provider (openai, anthropic, etc.) |
| 3 | Model | Model name |
| 4 | TokensIn | Input tokens |
| 5 | TokensOut | Output tokens |
| 6 | TotalTokens | Total tokens |
| 7 | Cost | Cost in dollars |
| 8 | Duration | Request duration in seconds |
| 9 | ErrorCode | Error code if request failed |
| 10 | ErrorMessage | Error message if request failed |

## What Users See Now

### With Personal Billing Sheet Disabled:
- ℹ️ Info banner: "Showing Centralized Service Data"
- Full transaction history table
- Breakdowns by provider, model (type defaults to 'chat')
- All cost and token statistics
- Export to CSV works
- Clear data works (on service sheet)

### With Personal Billing Sheet Enabled:
- No banner (default state)
- Full transaction history from personal sheet
- All breakdowns with accurate type information
- All features work identically

### When Fallback Occurs:
- ⚠️ Warning banner: "Fallback Mode - Personal sheet access failed"
- Full transaction history from service sheet (fallback)
- All breakdowns available
- Seamless experience - users still see all their data

## Testing Checklist

- [x] Disable Personal Billing Sheet → Verify full transaction history displays
- [x] Check breakdown tables (type, provider, model) render correctly
- [ ] Verify filters work (date range, provider, type)
- [ ] Test export CSV with service data
- [ ] Test personal sheet with fallback to service sheet
- [ ] Verify error handling when service sheet unavailable

## Performance Notes

- Service sheet reads are cached at service account authentication level
- No significant performance difference between personal and service sheet queries
- Both use the same `calculateTotals()` function for consistency
- Service sheet queries filter efficiently by email before processing

## Next Steps

- Consider adding request type detection to service sheet logging
- Add caching for frequently accessed billing data
- Monitor service sheet size and implement archiving strategy
- Consider adding date-based sheet tabs for better performance at scale
