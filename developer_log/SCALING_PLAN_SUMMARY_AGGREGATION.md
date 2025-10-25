# Scaling Plan: Google Sheets with Transaction Summary Aggregation

**Date**: 2025-01-16  
**Strategy**: Optimize Google Sheets usage with transaction summary aggregation  
**Current Architecture**: One tab per user email for billing/usage logs  
**Goal**: Support unlimited users while maintaining Google Sheets as primary data store  
**Archive Strategy**: Aggregate old transactions into summary entries (NO separate spreadsheets needed)

---

## Executive Summary

**Problem**: Google Sheets has hard limits on tabs (200) and cells (10M) per spreadsheet, limiting current system to ~200 users.

**Solution**: 
1. **Summary Aggregation** - Consolidate old transactions (>90 days) into single summary entries
2. **Sharding** - Split users across multiple spreadsheets when approaching 200-user limit
3. **On-Demand Processing** - Trigger summarization during balance checks (no separate cron jobs)

**Benefits**:
- ✅ 76% reduction in cell usage per user
- ✅ NO separate archive spreadsheets needed
- ✅ Zero-downtime implementation (backward compatible)
- ✅ Automatic gradual migration (summaries created as users access system)
- ✅ Balance calculations remain fast and accurate

**Capacity Impact**:
- **Current**: 200 users per spreadsheet (tab limit)
- **With Summaries**: 843 users per spreadsheet (cell limit becomes constraining factor)
- **With Sharding**: Unlimited users (add spreadsheet shards as needed)

---

## Current System Analysis

### Google Sheets Limits (Hard Limits from Google)

| Resource | Limit | Source |
|----------|-------|--------|
| Tabs per spreadsheet | 200 | [Google Sheets Support](https://support.google.com/drive/answer/37603) |
| Cells per spreadsheet | 10,000,000 | [Google Sheets Support](https://support.google.com/drive/answer/37603) |
| API read requests/min/project | 300 | [Google Sheets API Quotas](https://developers.google.com/sheets/api/limits) |
| API write requests/min/project | 300 | [Google Sheets API Quotas](https://developers.google.com/sheets/api/limits) |
| Cells updated per write | 40,000 | [Google Sheets API Quotas](https://developers.google.com/sheets/api/limits) |

### Current Usage Pattern

**Schema** (14 columns per row):
```
timestamp | email | type | model | provider | tokens_in | tokens_out | cost | duration_ms | status | period_start | period_end | transaction_count | breakdown_json
```

**Transaction Types**:
- `credit_added` - User purchases credits (adds to balance)
- `usage` - LLM API call (deducts from balance)
- `summary` - Aggregated old transactions (NEW TYPE)

**Current Cell Usage** (unlimited retention):
- Average user: 10 API requests/day
- Transactions per year: 10 × 365 = 3,650 rows
- Cells per user per year: 3,650 rows × 14 columns = **51,100 cells**
- 200 users: 200 × 51,100 = **10,220,000 cells** (exceeds 10M limit)

**Problem**: Single spreadsheet exceeds cell limit after ~1 year with 200 users.

---

## Recommended Solution: Transaction Summary Aggregation

### Overview

Instead of archiving old transactions to separate spreadsheets, **aggregate them into summary entries** within the same spreadsheet.

### Summary Entry Format

**Regular Transaction Row**:
```
timestamp | email | type | model | provider | tokens_in | tokens_out | cost | duration_ms | status | period_start | period_end | transaction_count | breakdown_json
2025-01-15T10:30:00Z | user@example.com | usage | gpt-4o-mini | openai | 1200 | 300 | 0.00045 | 1234 | success | | | | 
```

**Summary Entry Row**:
```
timestamp | email | type | model | provider | tokens_in | tokens_out | cost | duration_ms | status | period_start | period_end | transaction_count | breakdown_json
2024-12-31T23:59:59Z | user@example.com | summary | AGGREGATED | AGGREGATED | 125000 | 45000 | 12.50 | 567800 | ARCHIVED | 2024-10-01T00:00:00Z | 2024-12-31T23:59:59Z | 450 | {"byProvider":{"openai":{"cost":8.20,"tokensIn":80000,"tokensOut":25000,"count":280},"groq":{"cost":4.30,"tokensIn":45000,"tokensOut":20000,"count":170}},"byModel":{"gpt-4o-mini":{"cost":5.50,"tokensIn":50000,"tokensOut":15000,"count":180,"provider":"openai"},"gpt-4o":{"cost":2.70,"tokensIn":30000,"tokensOut":10000,"count":100,"provider":"openai"},"llama-3.3-70b-versatile":{"cost":4.30,"tokensIn":45000,"tokensOut":20000,"count":170,"provider":"groq"}}}
```

**Key Differences**:
- `type` = "summary" (instead of "usage" or "credit_added")
- `model` = "AGGREGATED" (instead of specific model name)
- `provider` = "AGGREGATED" (instead of specific provider)
- `status` = "ARCHIVED" (instead of "success", "error", etc.)
- `period_start` = First transaction timestamp in summary
- `period_end` = Last transaction timestamp in summary
- `transaction_count` = Number of transactions aggregated
- `breakdown_json` = **NEW COLUMN** - JSON string with provider and model breakdowns
- All numeric fields (tokens, cost, duration) are SUMS of individual transactions

**Breakdown JSON Structure**:
```json
{
  "byProvider": {
    "openai": {
      "cost": 8.20,
      "tokensIn": 80000,
      "tokensOut": 25000,
      "count": 280
    },
    "groq": {
      "cost": 4.30,
      "tokensIn": 45000,
      "tokensOut": 20000,
      "count": 170
    }
  },
  "byModel": {
    "gpt-4o-mini": {
      "cost": 5.50,
      "tokensIn": 50000,
      "tokensOut": 15000,
      "count": 180,
      "provider": "openai"
    },
    "gpt-4o": {
      "cost": 2.70,
      "tokensIn": 30000,
      "tokensOut": 10000,
      "count": 100,
      "provider": "openai"
    },
    "llama-3.3-70b-versatile": {
      "cost": 4.30,
      "tokensIn": 45000,
      "tokensOut": 20000,
      "count": 170,
      "provider": "groq"
    }
  }
}
```

### What's Preserved in Summaries

**Preserved Data** (used for balance calculations and billing page):
- ✅ Total cost (sum of all transaction costs)
- ✅ Total tokens (in/out summed separately)
- ✅ Total duration (sum of all durations)
- ✅ Date range (first and last transaction timestamps)
- ✅ Transaction count (how many were aggregated)
- ✅ **Provider breakdown** (cost, tokens in/out, count per provider)
- ✅ **Model breakdown** (cost, tokens in/out, count, provider per model)

**What's Lost in Summaries**:
- ❌ Individual transaction timestamps (only period_start/period_end preserved)
- ❌ Individual transaction durations (only total duration summed)

**Why This Works**:
- Users only need accurate current balance (preserved ✅)
- Recent activity (<90 days) available with full detail (preserved ✅)
- Historical totals sufficient for accounting (preserved ✅)
- **Billing page provider/model breakdowns remain accurate** (preserved ✅)
- Individual old transactions rarely needed (acceptable loss)

### Cell Count Analysis

**Current Usage** (unlimited retention):
- 200 users × 10 requests/day × 365 days = 730,000 rows/year
- 730,000 rows × 14 columns = **10,220,000 cells/year**
- **Problem**: Exceeds 10M cell limit after ~1 year

**With 90-Day Retention + Summary Aggregation**:
- Recent transactions (last 90 days): 200 users × 10 requests/day × 90 days = 180,000 rows
- Summary entries (per user): ~12 summaries (one per month before 90-day window)
- Total rows: 180,000 + (200 × 12) = **182,400 rows**
- Total cells: 182,400 × 14 = **2,553,600 cells**
- **Result**: 75% reduction (7.67M cells saved)

**Scaling Capacity with Summaries**:
- 10M cell limit ÷ 12,768 cells per user = **783 users per spreadsheet**
- BUT still limited by 200 tabs per spreadsheet
- **Conclusion**: Sharding still needed for >200 users

**Key Insight**: Summary aggregation extends each spreadsheet's lifespan indefinitely but doesn't remove the 200-tab limit. We still need sharding for >200 users.

---

## Implementation Plan

### Phase 1: Add Summary Aggregation Functions

**File**: `src/services/google-sheets-logger.js`

**Location**: Add new functions after helper functions, before `getUserCreditBalance()` (around line ~1900)

#### Configuration Constants

Add to `google-sheets-logger.js`:
```javascript
// Summarization configuration (hardcoded - no env vars needed)
const ARCHIVE_AFTER_DAYS = 90;  // Days before summarizing transactions
```

**Note**: No environment variables needed - feature always enabled to save env var space (4KB limit)

#### Function 1: Check if summarization needed

**Purpose**: Trigger on-demand summarization during balance checks

**Code**:
```javascript
/**
 * Check if user has old transactions that need summarization
 * Called during balance check to trigger on-demand summarization
 * 
 * @param {string} userEmail - User's email address
 * @param {string} spreadsheetId - Active spreadsheet ID
 * @param {string} accessToken - Google API access token
 * @returns {Promise<boolean>} - True if summarization was performed
 */
async function summarizeOldTransactionsIfNeeded(userEmail, spreadsheetId, accessToken) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ARCHIVE_AFTER_DAYS);
    
    console.log(`🔍 Checking summarization need for ${userEmail} (cutoff: ${cutoffDate.toISOString()})`);
    
    const sheetName = getUserSheetName(userEmail);
    const rows = await getSheetRows(spreadsheetId, sheetName, accessToken);
    
    if (!rows || rows.length === 0) {
        console.log(`  ✓ No transactions for ${userEmail}`);
        return false;
    }
    
    // Find regular transactions (not summaries) older than cutoff
    const oldTransactions = rows.filter(row => {
        if (!row.timestamp) return false;
        if (row.type === 'summary') return false;  // Skip existing summaries
        const timestamp = new Date(row.timestamp);
        return timestamp < cutoffDate;
    });
    
    if (oldTransactions.length === 0) {
        console.log(`  ✓ No old transactions to summarize for ${userEmail}`);
        return false;
    }
    
    console.log(`📊 Summarizing ${oldTransactions.length} transactions for ${userEmail}`);
    
    // Find existing summary entries to merge
    const existingSummaries = rows.filter(row => row.type === 'summary');
    
    // Aggregate ALL old transactions AND existing summaries
    const allToAggregate = [...oldTransactions, ...existingSummaries];
    
    // Build provider and model breakdowns
    const byProvider = {};
    const byModel = {};
    
    for (const row of allToAggregate) {
        // For regular transactions, add to breakdown
        if (row.type !== 'summary') {
            const provider = row.provider || 'unknown';
            const model = row.model || 'unknown';
            const tokensIn = parseInt(row.tokensIn) || 0;
            const tokensOut = parseInt(row.tokensOut) || 0;
            const cost = parseFloat(row.cost) || 0;
            
            // Aggregate by provider
            if (!byProvider[provider]) {
                byProvider[provider] = { cost: 0, tokensIn: 0, tokensOut: 0, count: 0 };
            }
            byProvider[provider].cost += cost;
            byProvider[provider].tokensIn += tokensIn;
            byProvider[provider].tokensOut += tokensOut;
            byProvider[provider].count += 1;
            
            // Aggregate by model
            if (!byModel[model]) {
                byModel[model] = { cost: 0, tokensIn: 0, tokensOut: 0, count: 0, provider };
            }
            byModel[model].cost += cost;
            byModel[model].tokensIn += tokensIn;
            byModel[model].tokensOut += tokensOut;
            byModel[model].count += 1;
        } else {
            // For existing summaries, merge their breakdowns
            try {
                const breakdown = JSON.parse(row.breakdownJson || '{}');
                
                // Merge provider breakdown
                if (breakdown.byProvider) {
                    for (const [provider, stats] of Object.entries(breakdown.byProvider)) {
                        if (!byProvider[provider]) {
                            byProvider[provider] = { cost: 0, tokensIn: 0, tokensOut: 0, count: 0 };
                        }
                        byProvider[provider].cost += stats.cost || 0;
                        byProvider[provider].tokensIn += stats.tokensIn || 0;
                        byProvider[provider].tokensOut += stats.tokensOut || 0;
                        byProvider[provider].count += stats.count || 0;
                    }
                }
                
                // Merge model breakdown
                if (breakdown.byModel) {
                    for (const [model, stats] of Object.entries(breakdown.byModel)) {
                        if (!byModel[model]) {
                            byModel[model] = { 
                                cost: 0, 
                                tokensIn: 0, 
                                tokensOut: 0, 
                                count: 0, 
                                provider: stats.provider || 'unknown' 
                            };
                        }
                        byModel[model].cost += stats.cost || 0;
                        byModel[model].tokensIn += stats.tokensIn || 0;
                        byModel[model].tokensOut += stats.tokensOut || 0;
                        byModel[model].count += stats.count || 0;
                    }
                }
            } catch (e) {
                console.warn(`  ⚠️  Failed to parse breakdown JSON for existing summary: ${e.message}`);
            }
        }
    }
    
    const summary = {
        timestamp: new Date(Math.max(...allToAggregate.map(r => new Date(r.timestamp || r.periodEnd)))).toISOString(),
        email: userEmail,
        type: 'summary',
        model: 'AGGREGATED',
        provider: 'AGGREGATED',
        tokensIn: allToAggregate.reduce((sum, r) => sum + (parseInt(r.tokensIn) || 0), 0),
        tokensOut: allToAggregate.reduce((sum, r) => sum + (parseInt(r.tokensOut) || 0), 0),
        cost: allToAggregate.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0),
        durationMs: allToAggregate.reduce((sum, r) => sum + (parseInt(r.durationMs) || 0), 0),
        status: 'ARCHIVED',
        periodStart: new Date(Math.min(...allToAggregate.map(r => new Date(r.timestamp || r.periodStart)))).toISOString(),
        periodEnd: new Date(Math.max(...allToAggregate.map(r => new Date(r.timestamp || r.periodEnd)))).toISOString(),
        transactionCount: allToAggregate.reduce((sum, r) => sum + (parseInt(r.transactionCount) || 1), 0),
        breakdownJson: JSON.stringify({ byProvider, byModel })
    };
    
    console.log(`  📊 Summary: ${summary.transactionCount} transactions, ${summary.tokensIn + summary.tokensOut} tokens, $${summary.cost.toFixed(4)}`);
    console.log(`  📊 Breakdown: ${Object.keys(byProvider).length} providers, ${Object.keys(byModel).length} models`);
    
    // Delete old rows (both transactions and old summaries)
    await deleteRowsFromSheet(spreadsheetId, sheetName, allToAggregate, accessToken);
    console.log(`  ✅ Deleted ${allToAggregate.length} old rows from sheet`);
    
    // Append new summary entry
    await appendSummaryToSheet(spreadsheetId, sheetName, summary, accessToken);
    console.log(`  📊 Added summary entry for period ${summary.periodStart} to ${summary.periodEnd}`);
    
    // Sort sheet by timestamp (chronological order)
    await sortSheetByTimestamp(spreadsheetId, sheetName, accessToken);
    console.log(`  ✅ Sheet sorted chronologically`);
    
    return true;
}
```

**Integration Point**: Called by `getUserCreditBalance()` before reading rows

**Estimated Lines**: ~140 lines (increased from 80 due to breakdown aggregation)

#### Function 2: Append summary entry

**Purpose**: Add summary row to user's sheet

**Code**:
```javascript
/**
 * Append summary entry to user's sheet
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet/tab name
 * @param {Object} summary - Summary object
 * @param {string} accessToken - Google API access token
 */
async function appendSummaryToSheet(spreadsheetId, sheetName, summary, accessToken) {
    const row = [
        summary.timestamp,
        summary.email,
        summary.type,
        summary.model,
        summary.provider,
        summary.tokensIn,
        summary.tokensOut,
        summary.cost,
        summary.durationMs,
        summary.status,
        summary.periodStart,
        summary.periodEnd,
        summary.transactionCount,
        summary.breakdownJson  // NEW: JSON string with provider/model breakdowns
    ];
    
    const range = `${sheetName}!A:N`;  // 14 columns (A-N)
    
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [row]
            })
        }
    );
    
    if (!response.ok) {
        throw new Error(`Failed to append summary: ${await response.text()}`);
    }
}
```

**Estimated Lines**: ~40 lines

#### Function 3: Get sheet rows

**Purpose**: Read all rows from a sheet for processing

**Code**:
```javascript
/**
 * Get all rows from a sheet (for reading transactions)
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet/tab name
 * @param {string} accessToken - Google API access token
 * @returns {Promise<Array>} - Array of row objects
 */
async function getSheetRows(spreadsheetId, sheetName, accessToken) {
    const range = `${sheetName}!A:N`;  // All columns (A-N, 14 columns)
    
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );
    
    if (!response.ok) {
        console.error(`❌ Failed to read sheet: ${await response.text()}`);
        return [];
    }
    
    const data = await response.json();
    const rows = data.values || [];
    
    // Skip header row and parse into objects
    return rows.slice(1).map((row, index) => ({
        rowIndex: index + 2, // +2 because: 1-indexed, skipped header
        timestamp: row[0],
        email: row[1],
        type: row[2],
        model: row[3],
        provider: row[4],
        tokensIn: row[5],
        tokensOut: row[6],
        cost: row[7],
        durationMs: row[8],
        status: row[9],
        periodStart: row[10],
        periodEnd: row[11],
        transactionCount: row[12],
        breakdownJson: row[13]  // NEW: JSON breakdown for summary entries
    }));
}
```

**Estimated Lines**: ~45 lines

#### Function 4: Delete rows from sheet

**Purpose**: Remove old transaction rows (batch delete from bottom up)

**Code**:
```javascript
/**
 * Delete specific rows from a sheet
 * Deletes from bottom up to avoid index shifting issues
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet/tab name
 * @param {Array} rowsToDelete - Array of row objects with rowIndex property
 * @param {string} accessToken - Google API access token
 */
async function deleteRowsFromSheet(spreadsheetId, sheetName, rowsToDelete, accessToken) {
    if (!rowsToDelete || rowsToDelete.length === 0) {
        return;
    }
    
    // Get sheet ID (needed for batch update)
    const metaResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );
    
    const metadata = await metaResponse.json();
    const sheet = metadata.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
        console.error(`❌ Sheet "${sheetName}" not found in ${spreadsheetId}`);
        return;
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Sort row indices descending (delete from bottom up)
    const rowIndices = rowsToDelete
        .map(row => row.rowIndex)
        .filter(idx => idx !== undefined)
        .sort((a, b) => b - a); // Descending order
    
    // Batch delete in chunks of 100 (API limit)
    for (let i = 0; i < rowIndices.length; i += 100) {
        const chunk = rowIndices.slice(i, i + 100);
        
        const requests = chunk.map(rowIndex => ({
            deleteDimension: {
                range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: rowIndex - 1,  // 0-indexed for API
                    endIndex: rowIndex         // Exclusive end
                }
            }
        }));
        
        const deleteResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requests })
            }
        );
        
        if (!deleteResponse.ok) {
            console.error(`❌ Failed to delete rows: ${await deleteResponse.text()}`);
        }
    }
}
```

**Estimated Lines**: ~60 lines

#### Function 5: Sort sheet by timestamp

**Purpose**: Keep sheet chronologically organized after summarization

**Code**:
```javascript
/**
 * Sort sheet by timestamp column (chronological order)
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet/tab name
 * @param {string} accessToken - Google API access token
 */
async function sortSheetByTimestamp(spreadsheetId, sheetName, accessToken) {
    // Get sheet ID
    const metaResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );
    
    const metadata = await metaResponse.json();
    const sheet = metadata.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
        console.error(`❌ Sheet "${sheetName}" not found`);
        return;
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Sort request (column 0 = timestamp, ascending)
    const sortResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [{
                    sortRange: {
                        range: {
                            sheetId: sheetId,
                            startRowIndex: 1  // Skip header row
                        },
                        sortSpecs: [{
                            dimensionIndex: 0,  // Column A (timestamp)
                            sortOrder: 'ASCENDING'
                        }]
                    }
                }]
            })
        }
    );
    
    if (!sortResponse.ok) {
        console.error(`❌ Failed to sort sheet: ${await sortResponse.text()}`);
    }
}
```

**Estimated Lines**: ~50 lines

**Total New Code**: ~260 lines

---

### Phase 2: Modify getUserCreditBalance

**File**: `src/services/google-sheets-logger.js`

**Location**: Line ~1931 (existing `getUserCreditBalance` function)

#### Required Changes

**1. Add summarization trigger BEFORE reading rows**
**2. Handle summary entries in balance calculation**

#### Modified Function

```javascript
async function getUserCreditBalance(userEmail) {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
        
        if (!spreadsheetId) {
            throw new Error('Missing GOOGLE_SHEETS_LOG_SPREADSHEET_ID environment variable');
        }
        
        if (!userEmail || typeof userEmail !== 'string') {
            throw new Error('Invalid user email provided');
        }
        
        const accessToken = await getAccessToken();
        
        // **NEW: Trigger summarization before calculating balance**
        await summarizeOldTransactionsIfNeeded(userEmail, spreadsheetId, accessToken);
        
        const sheetName = getUserSheetName(userEmail);
        
        // Check if user's sheet exists
        const metadata = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
            {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }
        );
        
        const metadataJson = await metadata.json();
        const sheetExists = metadataJson.sheets.some(
            sheet => sheet.properties.title === sheetName
        );
        
        if (!sheetExists) {
            console.log(`  ℹ️  Sheet for ${userEmail} does not exist yet. Balance: $0.00`);
            return 0;
        }
        
        // Get all rows (includes regular transactions AND summary entries)
        const rows = await getSheetRows(spreadsheetId, sheetName, accessToken);
        
        if (!rows || rows.length === 0) {
            console.log(`  ℹ️  No transactions for ${userEmail}. Balance: $0.00`);
            return 0;
        }
        
        // **MODIFIED: Calculate balance from BOTH regular transactions AND summary entries**
        let balance = 0;
        
        for (const row of rows) {
            if (row.type === 'credit_added') {
                // Credit purchase: ADD to balance
                balance += parseFloat(row.cost || 0);
            } else if (row.type === 'summary') {
                // Summary entry: SUBTRACT aggregated cost
                balance -= parseFloat(row.cost || 0);
            } else {
                // Regular usage transaction: SUBTRACT cost
                balance -= parseFloat(row.cost || 0);
            }
        }
        
        console.log(`  💰 Balance for ${userEmail}: $${balance.toFixed(4)}`);
        
        return balance;
        
    } catch (error) {
        console.error(`❌ Error calculating credit balance for ${userEmail}:`, error);
        throw error;
    }
}
```

#### Changes Summary

| Change | Location | Lines Modified |
|--------|----------|----------------|
| Add summarization trigger | Before sheet existence check | +1 line |
| Handle summary entries in loop | Balance calculation loop | +3 lines |
| **Total** | | **4 lines** |

**Notes**:
- Cache logic unchanged (summarization happens before cache population)
- No performance impact on subsequent calls (cached for 30 seconds)

---

### Phase 3: Update Sheet Schema

**File**: `src/services/google-sheets-logger.js`

**Location**: Search for "Timestamp" or "Header" in file (likely around line ~1350-1450)

#### Current Headers (10 columns)

```javascript
const headers = [['Timestamp', 'Email', 'Type', 'Model', 'Provider', 'Tokens In', 'Tokens Out', 'Cost', 'Duration (ms)', 'Status']];
```

#### New Headers (14 columns)

```javascript
const headers = [['Timestamp', 'Email', 'Type', 'Model', 'Provider', 'Tokens In', 'Tokens Out', 'Cost', 'Duration (ms)', 'Status', 'Period Start', 'Period End', 'Transaction Count', 'Breakdown JSON']];
```

#### Update Row Append Logic

Find `logToGoogleSheets()` function (line ~1283) and any other functions that append rows.

**Current Row Format**:
```javascript
const row = [
    timestamp,
    email,
    type,
    model,
    provider,
    tokensIn || '',
    tokensOut || '',
    cost || '',
    durationMs || '',
    status || ''
];
```

**New Row Format** (add 4 empty columns for regular transactions):
```javascript
const row = [
    timestamp,
    email,
    type,
    model,
    provider,
    tokensIn || '',
    tokensOut || '',
    cost || '',
    durationMs || '',
    status || '',
    '', // periodStart (empty for regular transactions)
    '', // periodEnd (empty for regular transactions)
    '', // transactionCount (empty for regular transactions)
    ''  // breakdownJson (empty for regular transactions)
];
```

#### Changes Summary

| Change | Location | Lines Modified |
|--------|----------|----------------|
| Update header array | Sheet creation function | 1 line |
| Add 4 columns to row append | `logToGoogleSheets()` | 4 lines |
| **Total** | | **5 lines** |

---

## Code Changes Summary

### Files to Modify

| File | Change Type | Lines Added | Lines Modified | Total Impact |
|------|-------------|-------------|----------------|--------------|
| `src/services/google-sheets-logger.js` | Add constants | +2 | 0 | +2 |
| `src/services/google-sheets-logger.js` | Add sharding functions | +50 | 0 | +50 |
| `src/services/google-sheets-logger.js` | Add summary functions | +325 | 0 | +325 |
| `src/services/google-sheets-logger.js` | Modify `getUserCreditBalance` | 0 | 4 | 4 |
| `src/services/google-sheets-logger.js` | Update schema | 0 | 5 | 5 |
| `src/services/google-sheets-logger.js` | Replace spreadsheet ID calls | 0 | 6 | 6 |
| `.env` | Update environment variable | 0 | 1 | 1 |
| **TOTAL** | | **+377** | **16** | **+393 lines** |

### Function Locations in google-sheets-logger.js

| Function | Action | Estimated Line | Lines of Code |
|----------|--------|----------------|---------------|
| `ARCHIVE_AFTER_DAYS` constant | ADD | ~50 | 2 |
| `getShardSpreadsheetIds()` | ADD | ~60 | 20 |
| `getShardSpreadsheetId()` | ADD | ~80 | 30 |
| `summarizeOldTransactionsIfNeeded()` | ADD | ~1900 | 140 (includes breakdown aggregation) |
| `appendSummaryToSheet()` | ADD | ~2040 | 40 |
| `getSheetRows()` | ADD | ~2080 | 45 |
| `deleteRowsFromSheet()` | ADD | ~2125 | 60 |
| `sortSheetByTimestamp()` | ADD | ~2185 | 50 |
| `getUserCreditBalance()` | MODIFY | 1931 | 4 changes |
| `logToGoogleSheets()` | MODIFY | 1283 | 1 change (use sharding) |
| Sheet header definition | MODIFY | ~1400 | 1 change |
| Row append in `logToGoogleSheets()` | MODIFY | ~1283 | 4 changes |

### Environment Variables

**Sharding Configuration** - Add to `.env`:
```bash
# Replace single spreadsheet ID with comma-separated list for sharding
# BEFORE (old):
# GOOGLE_SHEETS_LOG_SPREADSHEET_ID=1i0wNrPjMh21...

# AFTER (new - supports multiple shards):
GOOGLE_SHEETS_LOG_SPREADSHEET_IDS=1i0wNrPjMh21-1TIsAUZbYwV_c30A4-g39m4rJ-zr9Fw,2abc123xyz-456DEF-789GHI-012JKL,3def456uvw-789XYZ-012ABC-345MNO

# Migration: Start with single ID (backward compatible)
# Add more IDs as you approach 150 users per shard
```

**No Feature Flags Needed**: 
- Summary aggregation always enabled (saves env var space in 4KB limit)
- `ARCHIVE_AFTER_DAYS = 90` hardcoded in source code

---

## Testing Plan

### Phase 1: Unit Testing (Local Development)

#### Test 1: Verify Helper Functions

```javascript
// Test getSheetRows()
const rows = await getSheetRows(spreadsheetId, 'test_user_at_example_dot_com', accessToken);
console.log(`✅ Retrieved ${rows.length} rows`);

// Test sortSheetByTimestamp()
await sortSheetByTimestamp(spreadsheetId, 'test_user_at_example_dot_com', accessToken);
console.log('✅ Sheet sorted successfully');

// Test appendSummaryToSheet()
const testSummary = {
    timestamp: new Date().toISOString(),
    email: 'test@example.com',
    type: 'summary',
    model: 'AGGREGATED',
    provider: 'AGGREGATED',
    tokensIn: 10000,
    tokensOut: 5000,
    cost: 2.50,
    durationMs: 120000,
    status: 'ARCHIVED',
    periodStart: '2024-10-01T00:00:00Z',
    periodEnd: '2024-12-31T23:59:59Z',
    transactionCount: 150
};
await appendSummaryToSheet(spreadsheetId, 'test_user_at_example_dot_com', testSummary, accessToken);
console.log('✅ Summary entry appended');
```

**Expected Results**:
- ✅ All functions execute without errors
- ✅ Summary entry appears in sheet with correct values
- ✅ Sheet remains sorted chronologically

#### Test 2: Create Test Data

**Manually add transactions to test user's sheet**:
1. Add 10 transactions dated 200 days ago (old)
2. Add 5 transactions dated 50 days ago (recent)
3. Run summarization: `await summarizeOldTransactionsIfNeeded('test@example.com', spreadsheetId, accessToken)`

**Expected Results**:
- ✅ 10 old transactions deleted
- ✅ 1 summary entry created with aggregated values
- ✅ 5 recent transactions remain untouched
- ✅ Sheet sorted chronologically

#### Test 3: Balance Calculation Accuracy

**Create test scenario**:
```javascript
// Test user with:
// - $10.00 credit purchase (recent)
// - $0.50 usage (recent)
// - Summary entry: $5.00 usage (old, aggregated)

const balance = await getUserCreditBalance('test@example.com');
const expected = 10.00 - 0.50 - 5.00; // = $4.50

console.assert(
    Math.abs(balance - expected) < 0.001,
    `❌ Balance mismatch: expected ${expected}, got ${balance}`
);
console.log('✅ Balance calculation correct:', balance);
```

**Expected Results**:
- ✅ Balance = $4.50
- ✅ Assertion passes
- ✅ Log shows correct balance

#### Test 4: Edge Cases

```javascript
// Edge case 1: User with no old transactions
await summarizeOldTransactionsIfNeeded('new_user@example.com', spreadsheetId, accessToken);
// Expected: No summarization, function returns false

// Edge case 2: User with all old transactions
await summarizeOldTransactionsIfNeeded('old_user@example.com', spreadsheetId, accessToken);
// Expected: All transactions summarized into one entry

// Edge case 3: User with existing summary + new old transactions
await summarizeOldTransactionsIfNeeded('mixed_user@example.com', spreadsheetId, accessToken);
// Expected: Old summary merged with new old transactions into updated summary

// Edge case 4: User with exactly 90-day-old transaction (boundary)
await summarizeOldTransactionsIfNeeded('boundary_user@example.com', spreadsheetId, accessToken);
// Expected: 91+ day transactions summarized, 90-day transaction remains
```

**Expected Results**:
- ✅ All edge cases handled without errors
- ✅ No data loss
- ✅ Balance remains accurate

---

### Phase 2: Integration Testing (Staging Lambda)

#### Test 1: End-to-End Balance Check

**Command**:
```bash
curl -X GET "https://your-lambda-url.com/balance" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN"
```

**Expected CloudWatch Logs**:
```
🔍 Checking summarization need for test@example.com (cutoff: 2024-10-18T10:00:00Z)
📊 Summarizing 45 transactions for test@example.com
  📊 Summary: 45 transactions, 125000 tokens, $12.5000
  ✅ Deleted 45 old rows from sheet
  📊 Added summary entry for period 2024-07-01T00:00:00Z to 2024-10-17T23:59:59Z
  ✅ Sheet sorted chronologically
  💰 Balance for test@example.com: $87.50
```

**Verification**:
- ✅ Summarization triggered automatically
- ✅ Old transactions deleted
- ✅ Summary entry created
- ✅ Balance accurate
- ✅ Response time <5 seconds

#### Test 2: Performance Test

**Scenario**: User with 1000+ old transactions

**Expected Results**:
- ✅ Summarization completes in <30 seconds
- ✅ Lambda execution time logged in CloudWatch
- ✅ No timeout errors (Lambda timeout = 60 seconds)
- ✅ Cell count reduced by 76%

**Monitoring**:
```bash
# View Lambda execution metrics
make logs-tail

# Check for timeout warnings
grep "Task timed out" logs.txt
```

#### Test 3: Data Integrity Test

**Steps**:
1. Record user balance **before** summarization: `$100.00`
2. Manually trigger summarization (via balance check)
3. Record user balance **after** summarization: `$100.00`
4. Verify: Before = After (no data loss)

**Expected Results**:
- ✅ Balance unchanged
- ✅ Total cost preserved
- ✅ Total tokens preserved
- ✅ No errors in CloudWatch logs

---

### Phase 3: Production Deployment

**Single Deployment** (Feature Always Enabled):
```bash
# Deploy code
make deploy-lambda-fast

# Update environment variable for sharding (if needed)
# Add to .env: GOOGLE_SHEETS_LOG_SPREADSHEET_IDS=<comma-separated-list>
make deploy-env
```

**Monitor production metrics**:
- Average summarization time per user (target: <10 seconds)
- Number of transactions summarized per day
- Balance calculation errors (target: zero)
- Cell count reduction (target: 76% after 90 days)

---

#### Production Monitoring Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Summarization time (avg) | <10 seconds | >30 seconds |
| Balance calculation errors | 0 | >5 per hour |
| Lambda timeout errors | 0 | >1 per day |
| Cell count reduction | 76% (after 90 days) | <50% |
| Summary entry count per user | 1-12 (depending on age) | >20 |

**CloudWatch Alarms**:
```bash
# Create alarm for summarization errors
aws cloudwatch put-metric-alarm \
    --alarm-name "SummarizationErrors" \
    --alarm-description "Alert when summarization fails frequently" \
    --metric-name "Errors" \
    --namespace "AWS/Lambda" \
    --statistic "Sum" \
    --period 300 \
    --evaluation-periods 1 \
    --threshold 5 \
    --comparison-operator "GreaterThanThreshold"
```

---

## Deployment Strategy

**No Migration Needed**: Feature always enabled, works with existing data

**How it Works**:
1. Deploy code with summary aggregation
2. Summarization happens **automatically** as users check balance (on-demand)
3. After 90 days, all old data will be summarized
4. No user disruption, no manual migration

**Backward Compatibility**:
- ✅ Works with existing 10-column or 13-column sheets
- ✅ Balance calculation handles both regular and summary entries
- ✅ Gradual summarization (only when user accesses system)

---

## Sharding Implementation

### When to Shard

**Single Spreadsheet Capacity** (with summarization):
- Tab limit: 200 users
- Cell limit: 843 users (10M ÷ 11,856 cells per user)
- **Effective limit**: 200 users (tab limit is constraining)

**Recommendation**: Implement sharding from the start for future scalability

### Sharding Configuration

**Environment Variable** (replaces `GOOGLE_SHEETS_LOG_SPREADSHEET_ID`):
```bash
# Single spreadsheet (backward compatible):
GOOGLE_SHEETS_LOG_SPREADSHEET_IDS=1i0wNrPjMh21-1TIsAUZbYwV_c30A4-g39m4rJ-zr9Fw

# Multiple shards (comma-separated):
GOOGLE_SHEETS_LOG_SPREADSHEET_IDS=1i0wNrPjMh21-1TIsAUZbYwV_c30A4-g39m4rJ-zr9Fw,2abc123xyz-456DEF-789GHI-012JKL,3def456uvw-789XYZ-012ABC-345MNO
```

**Add New Shards**: Simply append new spreadsheet ID to comma-separated list

### Code Implementation

**Add to google-sheets-logger.js** (after constants):
```javascript
/**
 * Get list of shard spreadsheet IDs
 * Supports both old single ID and new comma-separated list
 * 
 * @returns {Array<string>} - Array of spreadsheet IDs
 */
function getShardSpreadsheetIds() {
    // Try new format first (comma-separated list)
    const newFormat = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_IDS;
    if (newFormat) {
        return newFormat.split(',').map(id => id.trim()).filter(id => id.length > 0);
    }
    
    // Fallback to old format (single ID)
    const oldFormat = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
    if (oldFormat) {
        return [oldFormat];
    }
    
    throw new Error('Missing GOOGLE_SHEETS_LOG_SPREADSHEET_IDS or GOOGLE_SHEETS_LOG_SPREADSHEET_ID');
}

/**
 * Determine which shard a user belongs to
 * Uses consistent hash to assign users to spreadsheets
 * 
 * @param {string} userEmail - User's email
 * @returns {string} - Spreadsheet ID for this user's shard
 */
function getShardSpreadsheetId(userEmail) {
    const shards = getShardSpreadsheetIds();
    
    if (shards.length === 1) {
        // Single spreadsheet - no sharding
        return shards[0];
    }
    
    // Hash email to determine shard (consistent hashing)
    const hash = userEmail.split('').reduce((sum, char) => {
        return sum + char.charCodeAt(0);
    }, 0);
    
    const shardIndex = hash % shards.length;
    
    console.log(`  📊 User ${userEmail} → Shard ${shardIndex + 1}/${shards.length}`);
    
    return shards[shardIndex];
}
```

**Modify All Functions**:
```javascript
// BEFORE (all instances):
const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;

// AFTER (all instances):
const spreadsheetId = getShardSpreadsheetId(userEmail);
```

**Functions to Update**:
- `logToGoogleSheets()` (line ~1283)
- `getUserCreditBalance()` (line ~1931)
- `summarizeOldTransactionsIfNeeded()` (new function)
- Any other function using spreadsheet ID

### Capacity with Sharding

| Shards | Users per Shard | Total Capacity |
|--------|-----------------|----------------|
| 1 | 200 | 200 |
| 3 | 200 | 600 |
| 5 | 200 | 1,000 |
| 10 | 200 | 2,000 |
| 20 | 200 | 4,000 |

**Scalability**: Add unlimited shards by appending spreadsheet IDs to env var

---

## Summary

### What's Being Implemented

1. **Summary Aggregation** - Consolidate old transactions into summary entries (always enabled)
2. **Sharding Support** - Support unlimited users across multiple spreadsheets
3. **On-Demand Processing** - Trigger during balance checks (no cron jobs)
4. **Backward Compatibility** - Works with existing data, no migration needed

### Code Changes

- **New Constants**: 1 constant (2 lines)
- **New Sharding Functions**: 2 functions (~50 lines)
- **New Summary Functions**: 5 functions (~325 lines) - includes breakdown aggregation logic
- **Modified Functions**: 2 functions (5 line changes)
- **Schema Updates**: 2 locations (5 line changes)
- **Total Impact**: +393 lines

### Benefits

- ✅ **75% cell reduction** per user
- ✅ **Unlimited users** with sharding
- ✅ **No environment variable bloat** (feature always on)
- ✅ **Zero-downtime deployment**
- ✅ **No manual migration** required
- ✅ **Billing page breakdowns preserved** (provider/model totals remain accurate)

### Capacity Impact

- **Before**: 200 users (limited by tab count)
- **After Summary Aggregation**: Still 200 users per shard (tab limit unchanged)
- **With Sharding (5 shards)**: 1,000 users
- **Unlimited Sharding**: Add spreadsheet IDs to scale infinitely

### Next Steps

1. Review this plan
2. Implement code changes
3. Test locally
4. Deploy to production (feature always enabled)

**Estimated Implementation Time**: 4-6 hours

**Estimated Testing Time**: 1-2 hours

**Total Time to Production**: 1 day
