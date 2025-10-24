# Per-User Sheets Logging Feature

**Status**: ✅ Implemented  
**Date**: October 24, 2025  
**Author**: AI Assistant

## Overview

Modified the Google Sheets logging system to store each user's log entries in separate sheets (tabs) to avoid hitting Google Sheets' 10 million cell limit per workbook.

## Problem Statement

Google Sheets has the following limits:
- **10 million cells** per workbook maximum
- **18,278 columns** maximum per sheet
- **200 sheets (tabs)** maximum per workbook
- **40,000 rows** per import operation

With a single shared sheet logging all users' API requests, the system would quickly hit the 10M cell limit as usage scaled. For example:
- 16 columns per row × 625,000 rows = 10,000,000 cells (LIMIT REACHED)
- A single high-volume user could fill the entire spreadsheet

## Solution Architecture

### Per-User Sheet Design

Instead of one shared sheet, each user gets their own dedicated sheet (tab):

**Old Architecture** (Shared Sheet):
```
Spreadsheet: "LLM Usage Log"
└── Sheet: "LLM Usage Log"
    ├── Row 1: Headers
    ├── Row 2: user1@example.com request
    ├── Row 3: user2@example.com request
    ├── Row 4: user1@example.com request
    └── ... (ALL users mixed together)
```

**New Architecture** (Per-User Sheets):
```
Spreadsheet: "LLM Usage Log"
├── Sheet: "user1_at_example_dot_com"
│   ├── Row 1: Headers
│   ├── Row 2: user1 request #1
│   ├── Row 3: user1 request #2
│   └── Row 4: user1 request #3
├── Sheet: "user2_at_example_dot_com"
│   ├── Row 1: Headers
│   ├── Row 2: user2 request #1
│   └── Row 3: user2 request #2
└── Sheet: "admin_at_company_dot_com"
    └── ... (admin's logs)
```

### Capacity Limits

- **Maximum users**: **200** (Google Sheets tab limit)
- **Rows per user**: **625,000 rows** (10M cells ÷ 16 columns)
- **Total capacity**: 200 users × 625,000 rows = **125 million requests**

This is a **62.5x improvement** over the shared sheet design.

### Email Sanitization

Email addresses are sanitized for use as sheet names:
- Replace `@` with `_at_`
- Replace `.` with `_dot_`
- Remove invalid characters: `: / ? * [ ] \`
- Truncate to 100 characters (Google Sheets tab name limit)

**Examples**:
- `user@example.com` → `user_at_example_dot_com`
- `admin.user@company.co.uk` → `admin_dot_user_at_company_dot_co_dot_uk`
- `very.long.email.address.with.many.dots@subdomain.example.com` → `very_dot_long_dot_email_dot_address_dot_with_dot_many_dot_dots_at_subdomain_dot_example_dot_com` (truncated if > 100 chars)

## Implementation Details

### Modified Functions

#### 1. `sanitizeEmailForSheetName(email)`
**Purpose**: Convert email address to valid Google Sheets tab name

**Logic**:
```javascript
function sanitizeEmailForSheetName(email) {
    if (!email || typeof email !== 'string') {
        return 'unknown_user';
    }
    
    let sanitized = email
        .toLowerCase()
        .replace(/@/g, '_at_')
        .replace(/\./g, '_dot_')
        .replace(/[:/\?*\[\]\\]/g, '_');
    
    if (sanitized.length > 100) {
        sanitized = sanitized.substring(0, 100);
    }
    
    return sanitized;
}
```

#### 2. `getUserSheetName(userEmail)`
**Purpose**: Get the sheet name for a specific user

**Logic**:
```javascript
function getUserSheetName(userEmail) {
    return sanitizeEmailForSheetName(userEmail);
}
```

#### 3. `logToGoogleSheets(logData)` (MODIFIED)
**Changes**:
- Derives sheet name from `logData.userEmail` using `getUserSheetName()`
- Creates user-specific sheet if it doesn't exist
- Appends log entry to user's sheet instead of shared sheet
- Logs include sheet name in success messages

**Before**:
```javascript
const sheetName = process.env.GOOGLE_SHEETS_LOG_SHEET_NAME || 'LLM Usage Log';
await appendToSheet(spreadsheetId, `${sheetName}!A:P`, rowData, accessToken);
```

**After**:
```javascript
const userEmail = logData.userEmail || 'unknown';
const sheetName = getUserSheetName(userEmail);
await appendToSheet(spreadsheetId, `${sheetName}!A:P`, rowData, accessToken);
console.log(`✅ Logged to Google Sheets [${sheetName}]: ...`);
```

#### 4. `logLambdaInvocation(logData)` (MODIFIED)
**Changes**: Same as `logToGoogleSheets()` - uses per-user sheets

#### 5. `getUserTotalCost(userEmail)` (MODIFIED)
**Changes**:
- Reads from user-specific sheet instead of filtering shared sheet
- Much faster (no filtering needed)
- Returns 0 if user's sheet doesn't exist (new user)

**Before** (Slow - filters ALL rows):
```javascript
const sheetData = await getSheetData(spreadsheetId, `${sheetName}!A2:P`, accessToken);
for (const row of sheetData.values) {
    if (row[1] === userEmail) {  // Filter by email
        totalCost += parseFloat(row[8]) || 0;
    }
}
```

**After** (Fast - reads only user's rows):
```javascript
const sheetName = getUserSheetName(userEmail);
const sheetData = await getSheetData(spreadsheetId, `${sheetName}!A2:P`, accessToken);
for (const row of sheetData.values) {
    totalCost += parseFloat(row[8]) || 0;  // No filtering needed!
}
```

#### 6. `getUserBillingData(userEmail, filters)` (MODIFIED)
**Changes**: Same as `getUserTotalCost()` - reads from user-specific sheet

### Error Handling

**Sheet doesn't exist** (new user):
- `getUserTotalCost()`: Returns `0`
- `getUserBillingData()`: Returns `[]`
- Both functions catch 404 errors and handle gracefully

**Invalid email**:
- Falls back to sheet name `unknown_user`
- All invalid/missing emails log to same fallback sheet

**200 sheet limit reached** (NEW USER REJECTED):
- Google Sheets API returns error when trying to create 201st sheet
- System checks sheet count before creating new sheet (proactive check)
- Error propagated to chat endpoint with code `SHEET_LIMIT_REACHED`
- User receives error message: `"System at full capacity. Unable to create new user account. Please try again later."`
- Error returned via SSE with event type `error` and code `SYSTEM_CAPACITY_REACHED`
- No logging attempted (prevents infinite loop)
- System continues serving existing users (graceful degradation)

**Error Flow for New User at Capacity**:
1. New user sends first request
2. `logToGoogleSheets()` called with user's email
3. `ensureSheetExists()` checks current sheet count (200 sheets already exist)
4. `ensureSheetExists()` throws error with code `SHEET_LIMIT_REACHED`
5. `logToGoogleSheets()` re-throws SHEET_LIMIT_REACHED error
6. `logToBothSheets()` catches and re-throws SHEET_LIMIT_REACHED error
7. Chat endpoint catches error and returns user-friendly message via SSE
8. User sees: "System at full capacity. Unable to create new user account. Please try again later."
9. Request terminates without completing

**Error Message Displayed to User**:
```json
{
  "error": "System at full capacity. Unable to create new user account. Please try again later.",
  "code": "SYSTEM_CAPACITY_REACHED",
  "timestamp": "2025-10-24T12:00:00.000Z",
  "message": "The system has reached its maximum user capacity (200 users). Please try again later or contact support."
}
```

## Schema (Unchanged)

Each user sheet has the same 16-column schema:

| Column | Name | Description |
|--------|------|-------------|
| A | Timestamp | ISO 8601 timestamp |
| B | User Email | User's email (redundant in per-user design) |
| C | Provider | LLM provider (openai, groq, gemini, aws-lambda) |
| D | Model | Model name or endpoint |
| E | Type | Request type (chat, embedding, guardrail, planning, lambda_invocation) |
| F | Tokens In | Input tokens |
| G | Tokens Out | Output tokens |
| H | Total Tokens | Total tokens |
| I | Cost | Cost in USD |
| J | Duration (s) | Duration in seconds |
| K | Memory Limit (MB) | Lambda memory limit |
| L | Memory Used (MB) | Lambda memory used |
| M | Request ID | Lambda request ID |
| N | Error Code | Error code (if failed) |
| O | Error Message | Error message (if failed) |
| P | Hostname | Server hostname or Lambda function name |

**Note**: Column B (User Email) is now redundant since each user has their own sheet, but keeping it maintains backward compatibility with existing analysis tools.

## Benefits

### Performance
- ✅ **Faster cost lookups**: No need to filter millions of rows by email
- ✅ **Faster billing queries**: Only read one user's data
- ✅ **Parallel writes**: Multiple users can append to different sheets simultaneously

### Scalability
- ✅ **62.5x capacity increase**: 125M total requests vs 2M in shared design
- ✅ **625K rows per user**: Each user can have 625K requests before hitting cell limit
- ✅ **200 users supported**: Clear upper limit (Google Sheets tab limit)

### Data Isolation
- ✅ **User privacy**: Each user's data is in a separate tab
- ✅ **Easier debugging**: Can inspect one user's sheet without noise from others
- ✅ **Selective sharing**: Can share individual user sheets without exposing all data

## Backward Compatibility

### Migration Strategy

**Old logs in shared sheet**:
- Existing logs in `LLM Usage Log` sheet remain intact
- Old `getUserTotalCost()` code still works for historical data
- Can migrate old data to per-user sheets with a script (not implemented)

**New logs**:
- All new logs go to per-user sheets
- `getUserTotalCost()` only reads new per-user sheet (historical data lost unless migrated)

**Migration Script** (Future Enhancement):
```javascript
// Pseudocode for migrating old shared sheet to per-user sheets
async function migrateToPerUserSheets() {
    const oldSheetData = await getSheetData(spreadsheetId, 'LLM Usage Log!A2:P');
    const userGroups = groupByEmail(oldSheetData.values);
    
    for (const [email, rows] of Object.entries(userGroups)) {
        const sheetName = getUserSheetName(email);
        await ensureSheetExists(spreadsheetId, sheetName, accessToken);
        await addHeaderRow(spreadsheetId, sheetName, accessToken);
        await batchAppend(spreadsheetId, sheetName, rows, accessToken);
    }
}
```

## Testing

### Manual Testing Steps

1. **Create test user log entries**:
   ```bash
   # Send chat requests as different users
   curl -X POST https://your-lambda-url/chat \
     -H "Authorization: Bearer <user1-token>" \
     -d '{"messages": [{"role": "user", "content": "test"}]}'
   
   curl -X POST https://your-lambda-url/chat \
     -H "Authorization: Bearer <user2-token>" \
     -d '{"messages": [{"role": "user", "content": "test"}]}'
   ```

2. **Verify per-user sheets created**:
   - Open Google Sheets workbook
   - Check for tabs named `user1_at_example_dot_com`, `user2_at_example_dot_com`
   - Verify each sheet has header row
   - Verify each sheet contains only that user's logs

3. **Test cost aggregation**:
   ```bash
   curl https://your-lambda-url/usage \
     -H "Authorization: Bearer <user1-token>"
   
   # Should return total cost from user1's sheet only
   ```

4. **Test billing data retrieval**:
   ```bash
   curl https://your-lambda-url/billing/transactions \
     -H "Authorization: Bearer <user1-token>"
   
   # Should return transactions from user1's sheet only
   ```

### Unit Tests (TODO)

```javascript
describe('Per-User Sheets Logging', () => {
    test('sanitizeEmailForSheetName handles @ and .', () => {
        expect(sanitizeEmailForSheetName('user@example.com'))
            .toBe('user_at_example_dot_com');
    });
    
    test('sanitizeEmailForSheetName truncates long emails', () => {
        const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(60) + '.com';
        const result = sanitizeEmailForSheetName(longEmail);
        expect(result.length).toBeLessThanOrEqual(100);
    });
    
    test('getUserSheetName returns sanitized name', () => {
        expect(getUserSheetName('admin@company.co.uk'))
            .toBe('admin_at_company_dot_co_dot_uk');
    });
    
    test('getUserTotalCost reads from user sheet', async () => {
        // Mock getSheetData to return user1's data
        const cost = await getUserTotalCost('user1@example.com');
        expect(cost).toBeGreaterThan(0);
    });
    
    test('getUserTotalCost returns 0 for new user', async () => {
        // Mock getSheetData to throw 404
        const cost = await getUserTotalCost('newuser@example.com');
        expect(cost).toBe(0);
    });
});
```

## Deployment

### Environment Variables (No Changes)

The following environment variables remain the same:
- `GOOGLE_SHEETS_LOG_SPREADSHEET_ID`: Spreadsheet ID
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`: Service account email
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY`: Service account private key

**Removed**:
- `GOOGLE_SHEETS_LOG_SHEET_NAME`: No longer used (sheet name derived from user email)

### Deployment Steps

1. **Deploy code changes**:
   ```bash
   make deploy-lambda-fast
   ```

2. **No configuration changes needed** (environment variables unchanged)

3. **Monitor logs** for sheet creation:
   ```bash
   make logs-tail
   # Look for: "Created sheet tab: "user_at_example_dot_com""
   ```

4. **Verify in Google Sheets**:
   - Open spreadsheet in browser
   - Check for new per-user sheets appearing as users make requests

## Limitations

### Hard Limits
- **200 users maximum** (Google Sheets tab limit)
- **625,000 rows per user** (10M cells ÷ 16 columns per user sheet)
- **100 character sheet names** (tab name length limit)

### Future Considerations

**When approaching 200 users**:
- Option 1: Migrate to multiple spreadsheets (e.g., spreadsheet per 200 users)
- Option 2: Migrate to database (PostgreSQL, DynamoDB)
- Option 3: Archive old user sheets and create new workbook

**When user exceeds 625K rows**:
- Option 1: Archive old logs to separate sheet (e.g., `user_at_example_dot_com_archive_2025`)
- Option 2: Partition by date (e.g., `user_at_example_dot_com_2025_01`)
- Option 3: Migrate user to database backend

## Monitoring

### Key Metrics to Track

1. **Number of sheets in workbook**:
   - Alert when approaching 180 sheets (90% of 200 limit)
   - **CRITICAL**: Alert when approaching 195 sheets (97.5% of 200 limit)
   - Script to count sheets via Sheets API

2. **Rows per user sheet**:
   - Alert when any user exceeds 500K rows (80% of 625K limit)
   - Script to check row counts via Sheets API

3. **Sheet creation failures**:
   - Monitor CloudWatch logs for "SHEET_LIMIT_REACHED" errors
   - Indicates 200-sheet limit reached
   - **ACTION REQUIRED**: System cannot accept new users

4. **SYSTEM_CAPACITY_REACHED errors**:
   - Monitor user-facing errors via application logs
   - Track how many new users are being rejected
   - **HIGH PRIORITY**: Indicates system is turning away users

### Alerts to Configure

**Warning Level (180 sheets - 90% capacity)**:
- Alert: "Approaching Google Sheets user limit"
- Action: Begin planning migration strategy
- Timeline: ~20 users remaining before limit

**Critical Level (195 sheets - 97.5% capacity)**:
- Alert: "CRITICAL: Near Google Sheets user limit"
- Action: Immediate migration planning required
- Timeline: ~5 users remaining before limit

**Emergency Level (200 sheets - 100% capacity)**:
- Alert: "EMERGENCY: Google Sheets user limit reached - rejecting new users"
- Action: Immediate intervention required
- Impact: New users cannot use system
- Response: Deploy migration solution or create new spreadsheet

### Monitoring Script (Example)

```javascript
// scripts/monitor-sheets-usage.js
const { getAccessToken } = require('../src/services/google-sheets-logger');

async function checkSheetsUsage() {
    const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
    const accessToken = await getAccessToken(/* ... */);
    
    // Get spreadsheet metadata
    const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    
    const sheetCount = data.sheets.length;
    const percentFull = (sheetCount / 200) * 100;
    
    console.log(`📊 Sheet Usage: ${sheetCount}/200 (${percentFull.toFixed(1)}%)`);
    
    // Alert levels
    if (sheetCount >= 200) {
        console.error(`🚨 EMERGENCY: At maximum capacity! New users will be rejected!`);
    } else if (sheetCount >= 195) {
        console.error(`⚠️ CRITICAL: ${sheetCount}/200 sheets used (${200 - sheetCount} remaining)`);
    } else if (sheetCount >= 180) {
        console.warn(`⚠️ WARNING: ${sheetCount}/200 sheets used (${200 - sheetCount} remaining)`);
    }
    
    // Check row counts
    for (const sheet of data.sheets) {
        const sheetName = sheet.properties.title;
        const rowCount = sheet.properties.gridProperties.rowCount;
        
        if (rowCount > 500000) {
            console.warn(`⚠️ ${sheetName} has ${rowCount} rows (approaching limit)`);
        }
    }
}

checkSheetsUsage().catch(console.error);
```

## References

- Google Sheets Limits: https://support.google.com/drive/answer/37603
- Google Sheets API: https://developers.google.com/sheets/api
- Implementation: `src/services/google-sheets-logger.js`

## Changelog

- **2025-10-24**: Initial implementation of per-user sheets architecture
- **Future**: Migration script for old shared sheet data
- **Future**: Monitoring dashboard for sheet usage metrics
