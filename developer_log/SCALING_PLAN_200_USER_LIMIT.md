# Scaling Plan: Google Sheets with Transaction Summary Aggregation

**Date**: 2024-10-25  
**Updated**: 2024-10-25 (Summary aggregation strategy - NO separate archive spreadsheets)  
**Strategy**: Optimize Google Sheets usage with transaction summary aggregation  
**Current Architecture**: One tab per user email for billing/usage logs  
**Goal**: Support unlimited users while maintaining Google Sheets as primary data store  
**Archive Strategy**: Aggregate old transactions into summary entries (NO separate spreadsheets needed)

## Table of Contents

1. [Current System Analysis](#current-system-analysis)
2. [Google Sheets Limits Research](#google-sheets-limits-research)
3. [Recommended Solution: Transaction Summary Aggregation](#recommended-solution-transaction-summary-aggregation)
4. [Implementation Plan](#implementation-plan)
5. [Code Changes Required](#code-changes-required)
6. [Migration & Rollout](#migration--rollout)

---

## Current System Analysis

### Architecture

**File**: `src/services/google-sheets-logger.js`

**Design Pattern**: One tab per user
- Each user gets a dedicated sheet/tab named after their email (sanitized)
- Example: `user@example.com` → tab named `user_at_example_dot_com`
- Each tab contains: timestamp, email, type, model, provider, tokens_in, tokens_out, cost, duration_ms, status
- Balance calculated by summing all transactions in user's tab

**Current Code Structure**:
- Line 1: Module documentation and architecture notes
- Line 24: `sanitizeEmailForSheetName()` - converts email to valid sheet name
- Line 53: `getUserSheetName()` - wrapper for sanitization
- Line 62: `PRICING` - token pricing for all models
- Line ~1283: `logToGoogleSheets()` - main logging function
- Line ~1931: `getUserCreditBalance()` - balance calculation function

**Key Environment Variables**:
- `GOOGLE_SHEETS_LOG_SPREADSHEET_ID` - Current single spreadsheet ID (will become SHARD_0)
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY` - Service account JSON key
- `GOOGLE_SHEETS_ARCHIVE_AFTER_DAYS` - Days before summarizing (default: 90)

### Data Flow

1. **User makes request** → Chat endpoint (`src/endpoints/chat.js`)
2. **Credit check** → `getUserCreditBalance()` reads user's tab
3. **Request processed** → LLM generates response
4. **Log transaction** → `logToGoogleSheets()` appends row to user's tab
5. **Balance updated** → Next request recalculates from all rows

### Current Queries

**Balance Calculation** (`getUserCreditBalance`, Line ~1931):
- Read all rows from user's tab
- Sum: (credits purchased - costs incurred)
- Currently reads EVERY transaction ever made

**Transaction Logging** (`logToGoogleSheets`, Line ~1283):
- Append single row to user's tab
- Includes: timestamp, email, type, model, provider, tokens_in, tokens_out, cost, duration_ms, status

---

## Google Sheets Limits Research

### Hard Limits (from Google Documentation)

| Limit Type | Value | Impact |
|------------|-------|--------|
| **Tabs per workbook** | **200 tabs** | ❌ **CURRENT BLOCKER** - limits to 200 users per spreadsheet |
| **Cells per workbook** | 10,000,000 cells | ⚠️ Potential future issue with unlimited retention |
| **Columns per sheet** | 18,278 columns | ✅ Not a concern (we use ~13 columns) |
| **Rows per sheet** | No explicit limit | ✅ Limited by cell count |
| **Characters per cell** | 50,000 characters | ✅ Not a concern |
| **Spreadsheet size** | No explicit limit | ⚠️ Performance degrades >5MB |

**Source**: https://support.google.com/drive/answer/37603

### API Quotas (from Google Sheets API Documentation)

| Quota Type | Limit | Impact |
|------------|-------|--------|
| **Read requests** | 300/min per project | ⚠️ Could hit with >100 concurrent users |
| **Read requests** | 60/min per user per project | ✅ Service account = 1 user |
| **Write requests** | 300/min per project | ⚠️ Could hit with high traffic |
| **Write requests** | 60/min per user per project | ✅ Service account = 1 user |
| **Request timeout** | 180 seconds max | ⚠️ Large batch operations risky |
| **Payload size** | 2 MB recommended max | ✅ Our rows are ~500 bytes |

**Source**: https://developers.google.com/sheets/api/limits

**Key Insight**: API quotas are **per project**, not per spreadsheet. Multiple spreadsheets share the same quota pool.

### Cell Count Analysis

**Current Usage (200 users, 1 year, unlimited retention)**:
- Columns per user tab: 13 (timestamp, email, type, model, provider, tokens_in, tokens_out, cost, duration_ms, status, period_start, period_end, transaction_count)
- Rows per user per day: ~10 requests/day (average user)
- Rows per user per year: ~3,650 rows
- Cells per user per year: 3,650 × 13 = **47,450 cells**
- **Total cells (200 users)**: 200 × 47,450 = **9,490,000 cells**

**Result**: Current architecture hits 10M cell limit after ~1 year with 200 active users.

**With Summary Aggregation (90-day retention)**:
- Recent transactions (90 days): 900 rows × 13 columns = 11,700 cells per user
- Summary entries (historical): ~12 summaries/year × 13 columns = 156 cells per user
- **Total per user**: 11,856 cells (75% reduction)
- **Total (200 users)**: 200 × 11,856 = **2,371,200 cells** (76% reduction)
- **Remaining capacity**: 7.6M cells for growth or longer retention

---

## Recommended Solution: Transaction Summary Aggregation

### Strategy Overview

Keep only the **most recent 90 days** of detailed transactions in each user's tab. Automatically aggregate older transactions into **summary entries** that preserve totals but discard individual transaction details.

**Key Benefits**:
- ✅ **Stays within limits**: 76% reduction in cell count
- ✅ **Fast queries**: Fewer rows = faster balance calculations
- ✅ **Zero cost**: No new infrastructure needed
- ✅ **Simple**: No separate spreadsheets to manage
- ✅ **Automatic**: Summarization triggered on balance checks
- ✅ **Accurate**: Preserves exact totals (costs, tokens, durations)

**What's Preserved in Summaries**:
- ✅ Total cost (exact to the cent)
- ✅ Total tokens in/out (exact counts)
- ✅ Total duration (milliseconds)
- ✅ Date range (period_start, period_end)
- ✅ Transaction count (number aggregated)



**Why This Works**:
- Users only need accurate current balance (preserved ✅)
- Recent activity (<90 days) available for analysis (preserved ✅)
- Historical totals sufficient for accounting (preserved ✅)
- Individual old transactions rarely needed (acceptable loss)

## Table of Contents

1. [Current System Analysis](#current-system-analysis)
2. [Google Sheets Limits Research](#google-sheets-limits-research)
3. [Recommended Solution: 3-Month Retention](#recommended-solution-3-month-retention)
4. [Implementation Plan](#implementation-plan)
5. [Archive Strategy](#archive-strategy)
6. [Migration & Rollout](#migration--rollout)

---

## Current System Analysis

### Architecture

**File**: `src/services/google-sheets-logger.js`

**Design Pattern**: One tab per user
- Each user gets a dedicated sheet/tab named after their email (sanitized)
- Example: `user@example.com` → tab named `user_at_example_dot_com`
- Each tab contains: timestamp, model, tokens_in, tokens_out, cost, duration
- Balance calculated by summing all transactions in user's tab

**Limit Check** (Line 378):
```javascript
if (currentSheetCount >= 200) {
    console.error(`❌ Google Sheets limit reached: ${currentSheetCount}/200 sheets`);
    const error = new Error('System capacity reached: Maximum 200 users supported.');
    error.code = 'SHEET_LIMIT_REACHED';
    reject(error);
}
```

### Data Flow

1. **User makes request** → Chat endpoint (`src/endpoints/chat.js`)
2. **Credit check** → `getUserCreditBalance()` reads user's tab
3. **Request processed** → LLM generates response
4. **Log transaction** → `logToGoogleSheets()` appends row to user's tab
5. **Balance updated** → Next request recalculates from all rows

### Current Queries

**Balance Calculation** (`getUserCreditBalance`, Line 1467):
- Read all rows from user's tab
- Sum: (credits purchased - costs incurred)
- Cached for 30 seconds to reduce API calls

**Transaction Logging** (`logToGoogleSheets`, Line 819):
- Append single row to user's tab
- Includes: timestamp, model, tokens, cost, duration

---

## Google Sheets Limits Research

### Hard Limits (from Google Documentation)

| Limit Type | Value | Impact |
|------------|-------|--------|
| **Tabs per workbook** | **200 tabs** | ❌ **CURRENT BLOCKER** |
| **Cells per workbook** | 10,000,000 cells | ⚠️ Potential future issue |
| **Columns per sheet** | 18,278 columns | ✅ Not a concern (we use ~10 columns) |
| **Rows per sheet** | No explicit limit | ✅ Limited by cell count |
| **Characters per cell** | 50,000 characters | ✅ Not a concern |
| **Spreadsheet size** | No explicit limit | ⚠️ Performance degrades >5MB |

**Source**: https://support.google.com/drive/answer/37603

### API Quotas (from Google Sheets API Documentation)

| Quota Type | Limit | Impact |
|------------|-------|--------|
| **Read requests** | 300/min per project | ⚠️ Could hit with >100 concurrent users |
| **Read requests** | 60/min per user per project | ✅ Service account = 1 user |
| **Write requests** | 300/min per project | ⚠️ Could hit with high traffic |
| **Write requests** | 60/min per user per project | ✅ Service account = 1 user |
| **Request timeout** | 180 seconds max | ⚠️ Large batch operations risky |
| **Payload size** | 2 MB recommended max | ✅ Our rows are ~500 bytes |

**Source**: https://developers.google.com/sheets/api/limits

**Key Insight**: API quotas are **per project**, not per spreadsheet. Multiple spreadsheets share the same quota pool.

### Cell Count Analysis

**Current Usage (200 users, 1 year)**:
- Columns per user tab: 10 (timestamp, email, model, tokens_in, tokens_out, cost, duration, etc.)
- Rows per user per day: ~10 requests/day (average user)
- Rows per user per year: ~3,650 rows
- Cells per user per year: 3,650 × 10 = 36,500 cells
- **Total cells (200 users)**: 200 × 36,500 = **7,300,000 cells**

**Result**: Current architecture would hit 10M cell limit after ~1.4 years with 200 active users.

---

## Recommended Solution: 3-Month Retention with On-Demand Archiving

### Strategy Overview

Keep only the **most recent 3 months** of transactions in the active Google Sheet. Archive older data **on-demand when users check their balance** to reduce cell count and improve performance.

**Key Benefits**:
- ✅ **Stays within limits**: Dramatically reduces cell count per user
- ✅ **Fast queries**: Smaller sheets = faster balance calculations
- ✅ **Zero cost**: No new infrastructure needed
- ✅ **Preserves history**: Nothing deleted, just archived to separate spreadsheets
- ✅ **Simple implementation**: No cron jobs, triggers on user activity
- ✅ **Separate spreadsheets**: Archives don't count against active sheet tab limits

**Key Differences from Previous Plan**:
- ⚡ **On-demand**: Archiving happens when user hits balance endpoint (not monthly cron)
- 📁 **Separate spreadsheets**: Each archive period gets its own Google Spreadsheet
- 🔐 **Service account permissions**: Needs `drive.file` scope to create spreadsheets
- 📊 **Sharding**: Multiple active spreadsheets to maximize capacity within Google limits

### Cell Count Analysis

**Current Usage (unlimited retention)**:
- 200 users × 10 requests/day × 365 days = 730,000 rows/year
- 730,000 rows × 10 columns = **7,300,000 cells/year**
- **Problem**: Hits 10M cell limit after ~1.4 years

**With 3-Month Retention**:
- 200 users × 10 requests/day × 90 days = 180,000 rows
- 180,000 rows × 10 columns = **1,800,000 cells total**
- **Result**: 75% reduction, 8.2M cells remaining for growth

**Scaling Capacity**:
- 10M cell limit ÷ 1.8M cells = **5.5x current capacity**
- **Supports**: 1,100 users (200 × 5.5) with 3-month retention
- **Or**: Can extend retention to 12 months and support 200 users indefinitely

### Architecture

**Active Spreadsheets** (Hot Data):
- Multiple spreadsheets, each with up to 200 user tabs
- Contains last 90 days of transactions per user
- Used for balance calculations and recent history
- Cleaned automatically when user hits balance endpoint

**Archive Spreadsheets** (Cold Data):
- One spreadsheet per month per shard: `archive_shard0_2024_10`, `archive_shard1_2024_10`, etc.
- Created on-demand when first user in that shard needs archiving in that month
- Readonly after month ends
- Queried only for historical reports or audit requests
- Never deleted (permanent historical record)

**Sharding Strategy** (Maximize Capacity):
- Hash user email to determine which active spreadsheet they belong to
- Each active spreadsheet supports 200 users (Google Sheets tab limit)
- Archives are also sharded (maintains same shard assignment)
- Total capacity = (Number of active spreadsheets) × 200 users

**Example with 5 Active Spreadsheets**:
```
Active Spreadsheets:
- shard0: 200 users (emails hashing to index 0)
- shard1: 200 users (emails hashing to index 1)
- shard2: 200 users (emails hashing to index 2)
- shard3: 200 users (emails hashing to index 3)
- shard4: 200 users (emails hashing to index 4)
Total: 1,000 users

Archive Spreadsheets (created on-demand):
- archive_shard0_2024_10 (October 2024 archives from shard0)
- archive_shard0_2024_11 (November 2024 archives from shard0)
- archive_shard1_2024_10 (October 2024 archives from shard1)
- ... (created as needed)
```

**Balance Calculation Strategy**:
```javascript
async function getUserCreditBalance(email) {
    // 1. Determine which shard this user belongs to
    const shardIndex = hashEmail(email) % NUM_ACTIVE_SHARDS;
    const activeSpreadsheetId = ACTIVE_SPREADSHEET_IDS[shardIndex];
    
    // 2. Check if archiving needed (on-demand, during balance check)
    await archiveOldTransactionsIfNeeded(email, shardIndex, activeSpreadsheetId);
    
    // 3. Fast path: Query active spreadsheet (last 90 days)
    const recentTransactions = await getRecentTransactions(email, activeSpreadsheetId);
    
    // 4. Calculate balance from recent data
    const balance = recentTransactions.reduce((sum, tx) => {
        if (tx.type === 'credit_added') return sum + tx.amount;
        return sum - tx.cost;
    }, 0);
    
    return balance;
}
```

**Key Insight**: Since credit purchases are always recent (users buy credits when needed), we don't need to query archives for balance calculations in most cases. Archives are only needed for historical reports.

---

## Implementation Plan

### Phase 1: Service Account Permissions Setup

**CRITICAL**: The service account needs permission to create Google Spreadsheets.

**Current Permissions** (read/write to existing spreadsheet):
- Scope: `https://www.googleapis.com/auth/spreadsheets`
- Access: Read/write to spreadsheets explicitly shared with service account

**Required Permissions** (create new spreadsheets):
- Scope: `https://www.googleapis.com/auth/drive.file`
- Access: Create and manage files created by this app

**Setup Instructions**:

1. **Enable Google Drive API** in Google Cloud Console:
   ```bash
   # Go to: https://console.cloud.google.com/apis/library
   # Search for: "Google Drive API"
   # Click: "Enable"
   # Note: The project should already exist (abc2book-7ba987c44a16)
   ```

2. **Update Service Account Permissions**:
   - The service account email is already in your `.json` key file: `client_email`
   - No additional permissions needed in Google Cloud Console
   - The `drive.file` scope allows creating spreadsheets programmatically

3. **Update Code to Request Drive Scope**:

   **File**: `src/services/google-sheets-logger.js`
   
   Find the OAuth scope configuration (where JWT is created):
   ```javascript
   // BEFORE (current):
   const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
   
   // AFTER (with Drive API access):
   const SCOPES = [
       'https://www.googleapis.com/auth/spreadsheets',
       'https://www.googleapis.com/auth/drive.file'  // Allows creating spreadsheets
   ];
   ```

4. **Test Drive API Access**:
   ```javascript
   // Test function to verify permissions
   async function testDrivePermissions() {
       const accessToken = await getAccessToken();
       
       // Try to create a test spreadsheet
       const response = await fetch('https://www.googleapis.com/drive/v3/files', {
           method: 'POST',
           headers: {
               'Authorization': `Bearer ${accessToken}`,
               'Content-Type': 'application/json'
           },
           body: JSON.stringify({
               name: 'Test Archive Spreadsheet',
               mimeType: 'application/vnd.google-apps.spreadsheet'
           })
       });
       
       if (response.ok) {
           const data = await response.json();
           console.log('✅ Drive API access confirmed. Test spreadsheet ID:', data.id);
           
           // Clean up test file
           await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}`, {
               method: 'DELETE',
               headers: { 'Authorization': `Bearer ${accessToken}` }
           });
           
           return true;
       } else {
           console.error('❌ Drive API access denied:', await response.text());
           return false;
       }
   }
   ```

5. **Verify Existing Service Account**:
   - The service account JSON key is stored in your `.env` file as `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY`
   - This same key will work for Drive API once the scope is added
   - No need to create a new service account

**What This Allows**:
- ✅ Create new Google Spreadsheets programmatically
- ✅ Set spreadsheet title and properties
- ✅ Add sheets/tabs to newly created spreadsheets
- ✅ Share created spreadsheets with other users (optional)
- ❌ Cannot access or modify spreadsheets NOT created by this service account (security feature)

**Security Note**: The `drive.file` scope is more restrictive than `drive` (which would access ALL files). It only allows the app to create and manage its own files, not access files created by users.

---

### Phase 2: Add Sharding and Archive Functionality

**File**: `src/services/google-sheets-logger.js`

**Configuration** (add to `.env`):
```bash
# Active spreadsheets (sharding)
GOOGLE_SHEETS_ACTIVE_SHARD_0=<existing_spreadsheet_id>
GOOGLE_SHEETS_ACTIVE_SHARD_1=<new_spreadsheet_id_1>
GOOGLE_SHEETS_ACTIVE_SHARD_2=<new_spreadsheet_id_2>
GOOGLE_SHEETS_ACTIVE_SHARD_3=<new_spreadsheet_id_3>
GOOGLE_SHEETS_ACTIVE_SHARD_4=<new_spreadsheet_id_4>

# Number of active shards (adjust based on capacity needs)
GOOGLE_SHEETS_NUM_SHARDS=5

# Archive retention (days)
GOOGLE_SHEETS_ARCHIVE_AFTER_DAYS=90
```

**New Functions**:

```javascript
/**
 * Hash email to determine shard assignment
 * Uses SHA256 for even distribution
 */
function getShardIndexForUser(email) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const numShards = parseInt(process.env.GOOGLE_SHEETS_NUM_SHARDS || '1');
    return hashInt % numShards;
}

/**
 * Get active spreadsheet ID for a user
 */
function getActiveSpreadsheetId(email) {
    const shardIndex = getShardIndexForUser(email);
    const envKey = `GOOGLE_SHEETS_ACTIVE_SHARD_${shardIndex}`;
    const spreadsheetId = process.env[envKey];
    
    if (!spreadsheetId) {
        throw new Error(`Missing environment variable: ${envKey}`);
    }
    
    console.log(`📊 User ${email} → Shard ${shardIndex} → ${spreadsheetId}`);
    return { spreadsheetId, shardIndex };
}

/**
 * Create archive spreadsheet for a specific month and shard
 * Returns spreadsheet ID (creates if doesn't exist)
 */
async function getOrCreateArchiveSpreadsheet(shardIndex, year, month) {
    const archiveName = `archive_shard${shardIndex}_${year}_${String(month).padStart(2, '0')}`;
    
    // Check if archive spreadsheet already exists (cache in memory)
    if (archiveSpreadsheetCache[archiveName]) {
        return archiveSpreadsheetCache[archiveName];
    }
    
    // Search for existing archive spreadsheet
    const accessToken = await getAccessToken();
    const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${archiveName}' and mimeType='application/vnd.google-apps.spreadsheet'`,
        {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );
    
    const searchData = await searchResponse.json();
    
    if (searchData.files && searchData.files.length > 0) {
        // Archive spreadsheet exists
        const spreadsheetId = searchData.files[0].id;
        console.log(`✅ Found existing archive: ${archiveName} (${spreadsheetId})`);
        archiveSpreadsheetCache[archiveName] = spreadsheetId;
        return spreadsheetId;
    }
    
    // Create new archive spreadsheet
    console.log(`📦 Creating new archive spreadsheet: ${archiveName}`);
    
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: archiveName,
            mimeType: 'application/vnd.google-apps.spreadsheet'
        })
    });
    
    if (!createResponse.ok) {
        throw new Error(`Failed to create archive spreadsheet: ${await createResponse.text()}`);
    }
    
    const createData = await createResponse.json();
    const spreadsheetId = createData.id;
    
    console.log(`✅ Created archive spreadsheet: ${archiveName} (${spreadsheetId})`);
    
    // Cache the spreadsheet ID
    archiveSpreadsheetCache[archiveName] = spreadsheetId;
    
    return spreadsheetId;
}

// Cache for archive spreadsheet IDs (in-memory)
const archiveSpreadsheetCache = {};

/**
 * Archive old transactions for a user (called during balance check)
 * Only archives if user has transactions older than threshold
 */
async function archiveOldTransactionsIfNeeded(email, shardIndex, activeSpreadsheetId) {
    const cutoffDate = new Date();
    const archiveAfterDays = parseInt(process.env.GOOGLE_SHEETS_ARCHIVE_AFTER_DAYS || '90');
    cutoffDate.setDate(cutoffDate.getDate() - archiveAfterDays);
    
    console.log(`🔍 Checking archive need for ${email} (cutoff: ${cutoffDate.toISOString()})`);
    
    // Get user's sheet name
    const sheetName = email.replace(/@/g, '_at_').replace(/\./g, '_dot_');
    
    // Get all rows from user's tab in active spreadsheet
    const accessToken = await getAccessToken();
    const rows = await getSheetRows(activeSpreadsheetId, sheetName, accessToken);
    
    if (!rows || rows.length === 0) {
        console.log(`  ✓ No transactions for ${email}`);
        return;
    }
    
    // Find rows older than cutoff
    const oldRows = rows.filter(row => {
        if (!row.timestamp) return false;
        const timestamp = new Date(row.timestamp);
        return timestamp < cutoffDate;
    });
    
    if (oldRows.length === 0) {
        console.log(`  ✓ No old transactions for ${email}`);
        return;
    }
    
    console.log(`📦 Archiving ${oldRows.length} transactions for ${email}`);
    
    // Group by month
    const byMonth = {};
    for (const row of oldRows) {
        const date = new Date(row.timestamp);
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // 1-12
        const key = `${year}_${month}`;
        
        if (!byMonth[key]) byMonth[key] = { year, month, rows: [] };
        byMonth[key].rows.push(row);
    }
    
    // Archive to monthly spreadsheets
    for (const [key, { year, month, rows: monthRows }] of Object.entries(byMonth)) {
        const archiveSpreadsheetId = await getOrCreateArchiveSpreadsheet(shardIndex, year, month);
        await appendToArchiveSpreadsheet(archiveSpreadsheetId, email, monthRows, accessToken);
        console.log(`  📦 Archived ${monthRows.length} rows to ${year}/${month}`);
    }
    
    // Delete old rows from active spreadsheet
    await deleteOldRowsFromSheet(activeSpreadsheetId, sheetName, oldRows, accessToken);
    console.log(`  ✅ Deleted ${oldRows.length} old rows from active sheet`);
}

/**
 * Append transactions to archive spreadsheet
 * Creates user tab if it doesn't exist
 */
async function appendToArchiveSpreadsheet(archiveSpreadsheetId, userEmail, transactions, accessToken) {
    const sheetName = userEmail.replace(/@/g, '_at_').replace(/\./g, '_dot_');
    
    // Ensure sheet exists in archive spreadsheet
    await ensureSheetExistsInSpreadsheet(archiveSpreadsheetId, sheetName, accessToken);
    
    // Append rows
    const rows = transactions.map(tx => [
        tx.timestamp,
        tx.email,
        tx.type,
        tx.model,
        tx.provider,
        tx.tokensIn || '',
        tx.tokensOut || '',
        tx.cost || '',
        tx.durationMs || '',
        tx.status || ''
    ]);
    
    await appendRowsToSheet(archiveSpreadsheetId, sheetName, rows, accessToken);
}

/**
 * Ensure a sheet/tab exists in a specific spreadsheet
 */
async function ensureSheetExistsInSpreadsheet(spreadsheetId, sheetName, accessToken) {
    // Get spreadsheet metadata
    const metaResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );
    
    const metadata = await metaResponse.json();
    const existingSheets = metadata.sheets || [];
    
    // Check if sheet exists
    const sheetExists = existingSheets.some(s => s.properties.title === sheetName);
    
    if (sheetExists) {
        console.log(`  ✓ Sheet "${sheetName}" exists in ${spreadsheetId}`);
        return;
    }
    
    // Create sheet
    console.log(`  📄 Creating sheet "${sheetName}" in ${spreadsheetId}`);
    
    const createResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [{
                    addSheet: {
                        properties: {
                            title: sheetName,
                            gridProperties: { frozenRowCount: 1 }
                        }
                    }
                }]
            })
        }
    );
    
    if (!createResponse.ok) {
        throw new Error(`Failed to create sheet: ${await createResponse.text()}`);
    }
    
    // Add header row
    const headers = [[
        'Timestamp', 'Email', 'Type', 'Model', 'Provider',
        'Tokens In', 'Tokens Out', 'Cost', 'Duration (ms)', 'Status'
    ]];
    
    await appendRowsToSheet(spreadsheetId, sheetName, headers, accessToken);
    console.log(`  ✅ Created sheet "${sheetName}" with headers`);
}

/**
 * Delete old rows from active sheet
 */
async function deleteOldRowsFromSheet(spreadsheetId, sheetName, oldRows, accessToken) {
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
        console.error(`❌ Sheet "${sheetName}" not found in ${spreadsheetId}`);
        return;
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Build delete requests (delete from bottom up to avoid index shifting)
    const rowIndices = oldRows
        .map(row => row.rowIndex)
        .filter(idx => idx !== undefined)
        .sort((a, b) => b - a); // Descending order
    
    // Batch delete in chunks of 100
    for (let i = 0; i < rowIndices.length; i += 100) {
        const chunk = rowIndices.slice(i, i + 100);
        
        const requests = chunk.map(rowIndex => ({
            deleteDimension: {
                range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: rowIndex,
                    endIndex: rowIndex + 1
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

/**
 * Get all rows from a sheet
 */
async function getSheetRows(spreadsheetId, sheetName, accessToken) {
    const range = `${sheetName}!A:J`; // All columns
    
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
        status: row[9]
    }));
}

/**
 * Append rows to a sheet
 */
async function appendRowsToSheet(spreadsheetId, sheetName, rows, accessToken) {
    const range = `${sheetName}!A:J`;
    
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: rows
            })
        }
    );
    
    if (!response.ok) {
        throw new Error(`Failed to append rows: ${await response.text()}`);
    }
}
```

---

### Phase 3: Update Balance Endpoint to Trigger Archiving

**File**: `src/endpoints/balance.js` (or wherever balance is checked)

```javascript
const { getUserCreditBalance } = require('../services/google-sheets-logger');

async function handleBalanceRequest(email) {
    try {
        // getUserCreditBalance now automatically triggers archiving if needed
        const balance = await getUserCreditBalance(email);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                email: email,
                balance: balance,
                currency: 'USD'
            })
        };
    } catch (error) {
        console.error('❌ Balance check failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to check balance' })
        };
    }
}
```

**Key Changes**:
- No changes needed in balance endpoint - archiving happens automatically
- `getUserCreditBalance()` checks for old transactions and archives them before returning balance
- Archiving is transparent to the endpoint consumer

---

### Phase 4: Update Existing Functions to Use Sharding

**File**: `src/services/google-sheets-logger.js`

**Modify `logToGoogleSheets()`**:
```javascript
async function logToGoogleSheets(logData) {
    const { email } = logData;
    
    // Get active spreadsheet for this user's shard
    const { spreadsheetId, shardIndex } = getActiveSpreadsheetId(email);
    
    // Rest of the function stays the same, but uses dynamic spreadsheetId
    // instead of hardcoded process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID
    
    // ...existing logging logic...
}
```

**Modify `getUserCreditBalance()`**:
```javascript
async function getUserCreditBalance(email) {
    // Get active spreadsheet for this user's shard
    const { spreadsheetId, shardIndex } = getActiveSpreadsheetId(email);
    
    // Trigger archiving if needed (on-demand)
    await archiveOldTransactionsIfNeeded(email, shardIndex, spreadsheetId);
    
    // Get user's sheet name
    const sheetName = email.replace(/@/g, '_at_').replace(/\./g, '_dot_');
    
    // Read recent transactions (last 90 days)
    const accessToken = await getAccessToken();
    const rows = await getSheetRows(spreadsheetId, sheetName, accessToken);
    
    // Calculate balance
    let balance = 0;
    for (const row of rows) {
        if (row.type === 'credit_added') {
            balance += parseFloat(row.cost || 0);
        } else {
            balance -= parseFloat(row.cost || 0);
        }
    }
    
    return balance;
}
```

---

### Phase 5: Manual Archive Trigger (Admin Tool)

For testing or manual cleanup, add an admin endpoint:

**File**: `src/index.js`

```javascript
// Admin endpoint to manually trigger archive for a specific user
if (path === '/admin/archive-user' && method === 'POST') {
    // Verify admin token
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'Forbidden' })
        };
    }
    
    const { email } = JSON.parse(event.body || '{}');
    if (!email) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Email required' })
        };
    }
    
    const { spreadsheetId, shardIndex } = getActiveSpreadsheetId(email);
    await archiveOldTransactionsIfNeeded(email, shardIndex, spreadsheetId);
    
    return {
        statusCode: 200,
        body: JSON.stringify({ message: `Archive triggered for ${email}` })
    };
}

// Admin endpoint to archive all users in a shard
if (path === '/admin/archive-shard' && method === 'POST') {
    // Verify admin token
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'Forbidden' })
        };
    }
    
    const { shardIndex } = JSON.parse(event.body || '{}');
    const envKey = `GOOGLE_SHEETS_ACTIVE_SHARD_${shardIndex}`;
    const spreadsheetId = process.env[envKey];
    
    if (!spreadsheetId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: `Invalid shard index: ${shardIndex}` })
        };
    }
    
    // Get all user sheets in this shard
    const accessToken = await getAccessToken();
    const metaResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );
    
    const metadata = await metaResponse.json();
    const sheets = metadata.sheets || [];
    
    let archivedCount = 0;
    
    for (const sheet of sheets) {
        const sheetName = sheet.properties.title;
        
        // Convert sheet name back to email
        const email = sheetName.replace(/_at_/g, '@').replace(/_dot_/g, '.');
        
        try {
            await archiveOldTransactionsIfNeeded(email, shardIndex, spreadsheetId);
            archivedCount++;
        } catch (error) {
            console.error(`Failed to archive ${email}:`, error);
        }
    }
    
    return {
        statusCode: 200,
        body: JSON.stringify({ 
            message: `Archive complete for shard ${shardIndex}`,
            processedUsers: archivedCount
        })
    };
}
```

---

### Phase 6: Monitoring & Alerts

**CloudWatch Metrics**:
- `ArchiveOperationDuration` - Time to archive per user
- `TransactionsArchived` - Count of archived rows per operation
- `ActiveSheetCellCount` - Track cell count per shard
- `ArchiveSpreadsheetsCreated` - Count of new archive spreadsheets

**Alerts**:
- 🚨 Archive operation fails for user
- 🚨 Archive duration > 30 seconds (performance issue)
- 🚨 Cell count > 8M in any shard (approaching limit)
- 🚨 Drive API quota exceeded (spreadsheet creation limit)

---

## Archive Strategy

### Archive Spreadsheet Organization

**Naming Convention**: `archive_shard{N}_{YYYY}_{MM}`
- `archive_shard0_2024_10` - October 2024 archives from shard 0
- `archive_shard0_2024_11` - November 2024 archives from shard 0
- `archive_shard1_2024_10` - October 2024 archives from shard 1
- etc.

**Structure**: One spreadsheet per month per shard
- Each archive spreadsheet contains tabs for each user (same format as active)
- Structure within tabs: Same columns as active sheets
  ```
  | Timestamp | Email | Type | Model | Provider | Tokens In | Tokens Out | Cost | Duration | Status |
  ```

**Access Pattern**:
- **Write**: On-demand when user checks balance (first time per month)
- **Read**: Rare (historical reports, audits)
- **Retention**: Permanent (archives never deleted)

### Sharding Benefits for Archives

**Problem with Single Archive**: If all users archived to one spreadsheet per month, you'd hit the 200-tab limit after 200 users archive in the same month.

**Solution with Sharding**: Each shard gets its own archive spreadsheet per month.

**Example with 1,000 users (5 shards)**:
- October 2024 archiving:
  - `archive_shard0_2024_10`: 200 users from shard 0
  - `archive_shard1_2024_10`: 200 users from shard 1
  - `archive_shard2_2024_10`: 200 users from shard 2
  - `archive_shard3_2024_10`: 200 users from shard 3
  - `archive_shard4_2024_10`: 200 users from shard 4
- **Total**: 5 archive spreadsheets, each with up to 200 tabs (within Google limit)

### Long-Term Archive Management

**Summary Aggregation Strategy** (Replaces Permanent Storage):
- Instead of keeping full archived transaction records, create monthly summary entries
- Sum tokens (tokens_in + tokens_out), sum prices (total cost), sum durations
- Create single summary entry with type: "summary"
- Date summary with timestamp of last summarized transaction
- Ingest previous summaries into new tallies (roll up old summaries)
- Save sheet in chronological date order

**Summary Entry Format**:
```javascript
{
    timestamp: lastTransactionDate,         // Date of most recent transaction included
    email: "user@example.com",
    type: "summary",                        // Mark as summary entry
    model: "AGGREGATED",                    // Indicates multiple models
    provider: "AGGREGATED",
    tokensIn: 125000,                       // Sum of all tokens_in for period
    tokensOut: 45000,                       // Sum of all tokens_out for period
    cost: 12.50,                            // Total cost for period
    durationMs: 567800,                     // Total duration for period
    status: "ARCHIVED",
    periodStart: "2024-10-01T00:00:00Z",   // First transaction in summary
    periodEnd: "2024-10-31T23:59:59Z",     // Last transaction in summary
    transactionCount: 450                   // Number of transactions summarized
}
```

**Archiving Process** (Modified):
```javascript
async function archiveOldTransactionsWithSummary(email, shardIndex, activeSpreadsheetId) {
    const cutoffDate = new Date();
    const archiveAfterDays = parseInt(process.env.GOOGLE_SHEETS_ARCHIVE_AFTER_DAYS || '90');
    cutoffDate.setDate(cutoffDate.getDate() - archiveAfterDays);
    
    // Get user's sheet
    const sheetName = email.replace(/@/g, '_at_').replace(/\./g, '_dot_');
    const accessToken = await getAccessToken();
    const rows = await getSheetRows(activeSpreadsheetId, sheetName, accessToken);
    
    // Find rows older than cutoff
    const oldRows = rows.filter(row => {
        const timestamp = new Date(row.timestamp);
        return timestamp < cutoffDate;
    });
    
    if (oldRows.length === 0) {
        console.log(`  ✓ No old transactions for ${email}`);
        return;
    }
    
    // Check for existing summary entries to include in aggregation
    const existingSummaries = oldRows.filter(row => row.type === 'summary');
    const regularTransactions = oldRows.filter(row => row.type !== 'summary');
    
    console.log(`📊 Creating summary for ${email}: ${regularTransactions.length} transactions + ${existingSummaries.length} summaries`);
    
    // Aggregate all transactions AND existing summaries
    const summary = {
        timestamp: new Date(Math.max(...oldRows.map(r => new Date(r.timestamp)))).toISOString(),
        email: email,
        type: 'summary',
        model: 'AGGREGATED',
        provider: 'AGGREGATED',
        tokensIn: oldRows.reduce((sum, r) => sum + (parseInt(r.tokensIn) || 0), 0),
        tokensOut: oldRows.reduce((sum, r) => sum + (parseInt(r.tokensOut) || 0), 0),
        cost: oldRows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0),
        durationMs: oldRows.reduce((sum, r) => sum + (parseInt(r.durationMs) || 0), 0),
        status: 'ARCHIVED',
        periodStart: new Date(Math.min(...oldRows.map(r => new Date(r.timestamp)))).toISOString(),
        periodEnd: new Date(Math.max(...oldRows.map(r => new Date(r.timestamp)))).toISOString(),
        transactionCount: oldRows.length
    };
    
    // Delete all old rows (including old summaries)
    await deleteOldRowsFromSheet(activeSpreadsheetId, sheetName, oldRows, accessToken);
    console.log(`  ✅ Deleted ${oldRows.length} old rows from active sheet`);
    
    // Append single summary entry
    await appendSummaryToSheet(activeSpreadsheetId, sheetName, summary, accessToken);
    console.log(`  📊 Added summary entry (${summary.transactionCount} transactions aggregated)`);
    
    // Sort sheet by timestamp to maintain chronological order
    await sortSheetByTimestamp(activeSpreadsheetId, sheetName, accessToken);
    console.log(`  ✅ Sheet sorted chronologically`);
}

/**
 * Append summary entry to active sheet
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
        summary.transactionCount
    ];
    
    await appendRowsToSheet(spreadsheetId, sheetName, [row], accessToken);
}

/**
 * Sort sheet by timestamp column (chronological order)
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
                            startRowIndex: 1  // Skip header
                        },
                        sortSpecs: [{
                            dimensionIndex: 0,  // Timestamp column
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

**Balance Calculation** (Handles Summaries):
```javascript
async function getUserCreditBalance(email) {
    const { spreadsheetId, shardIndex } = getActiveSpreadsheetId(email);
    
    // Trigger archiving/summarization if needed
    await archiveOldTransactionsWithSummary(email, shardIndex, spreadsheetId);
    
    const sheetName = email.replace(/@/g, '_at_').replace(/\./g, '_dot_');
    const accessToken = await getAccessToken();
    const rows = await getSheetRows(spreadsheetId, sheetName, accessToken);
    
    // Calculate balance from BOTH regular transactions AND summary entries
    let balance = 0;
    for (const row of rows) {
        if (row.type === 'credit_added') {
            balance += parseFloat(row.cost || 0);
        } else if (row.type === 'summary') {
            // Summary entry: cost is already aggregated total
            balance -= parseFloat(row.cost || 0);
        } else {
            // Regular transaction
            balance -= parseFloat(row.cost || 0);
        }
    }
    
    return balance;
}
```

**Benefits of Summary Aggregation**:
- ✅ **Extreme cell reduction**: 10,000 transactions → 1 summary row (99.99% reduction)
- ✅ **No separate archive spreadsheets**: Everything stays in active sheet
- ✅ **Faster queries**: Fewer rows to process
- ✅ **Automatic roll-up**: Old summaries get merged into new summaries
- ✅ **Chronological order**: Sheet sorted by date for easy auditing
- ✅ **Zero storage overhead**: No additional spreadsheets created
- ✅ **Preserves essential data**: Token counts, costs, durations aggregated

**What's Lost**:
- ❌ Individual transaction history beyond 90 days
- ❌ Model-specific analytics for old data
- ❌ Exact timestamps for individual old requests

**What's Preserved**:
- ✅ Total cost (exact)
- ✅ Total tokens (exact)
- ✅ Total duration (exact)
- ✅ Date range of summarized period
- ✅ Count of transactions included
- ✅ Recent transactions (<90 days) remain detailed

**Archive Spreadsheet Elimination**:
- No separate archive spreadsheets created
- No Drive API usage for archive management
- No archive spreadsheet count limits to worry about
- All data consolidated in active sheet (summaries + recent transactions)

**Cost Analysis**:
- Google Sheets API: Free (same as before, fewer operations)
- Google Drive storage: Free (no archive spreadsheets)
- Processing overhead: Minimal (aggregation is simple arithmetic)
- **Total**: $0/month

---

## Migration & Rollout

### Phase 1: Preparation & Service Account Setup (Week 1)

**Tasks**:
- [ ] Add `drive.file` scope to service account JWT (see Phase 1 implementation above)
- [ ] Test Drive API permissions with `testDrivePermissions()` function
- [ ] Create additional active spreadsheets for sharding (if scaling beyond 200 users)
- [ ] Add environment variables for shard configuration
- [ ] Review current data: Identify users with >90 days of history
- [ ] Calculate expected archive size and spreadsheet count

**Validation**:
- ✅ Drive API test creates and deletes test spreadsheet successfully
- ✅ All active shard spreadsheets created and accessible
- ✅ Environment variables configured correctly

### Phase 2: Implement Archiving Logic (Week 2)

**Tasks**:
- [ ] Implement `getShardIndexForUser()` hash function
- [ ] Implement `getOrCreateArchiveSpreadsheet()` with Drive API
- [ ] Implement `archiveOldTransactionsIfNeeded()` on-demand archiving
- [ ] Implement archive helper functions (appendToArchiveSpreadsheet, etc.)
- [ ] Add archiving call to `getUserCreditBalance()`
- [ ] Test with 10 test users (varying transaction counts and ages)

**Validation**:
- ✅ Archive spreadsheets created automatically with correct naming
- ✅ Old transactions moved from active to archive
- ✅ Active sheet rows deleted after successful archive
- ✅ Balance calculations remain accurate
- ✅ No data loss (all rows preserved in archives)

### Phase 3: Deploy to Staging (Week 3)

**Tasks**:
- [ ] Deploy code changes to staging Lambda
- [ ] Run manual archiving test via admin endpoint
- [ ] Monitor CloudWatch logs for errors
- [ ] Test balance endpoint with users who need archiving
- [ ] Verify archive spreadsheet creation in Google Drive
- [ ] Compare before/after cell counts in active spreadsheets

**Success Criteria**:
- ✅ Zero data discrepancies
- ✅ Cell count reduced by expected amount
- ✅ No performance degradation (<1 second for balance checks)
- ✅ All user balances unchanged after archiving

### Phase 4: Production Rollout (Week 4)

**Tasks**:
- [ ] Deploy archiving code to production Lambda
- [ ] Enable archiving via feature flag (`ENABLE_ARCHIVING=true`)
- [ ] Monitor first 100 balance checks that trigger archiving
- [ ] Validate random sample of user balances
- [ ] Set up CloudWatch alarms for archiving failures
- [ ] Document archive access procedures for support team

**Rollback Plan**:
- Disable archiving feature flag (`ENABLE_ARCHIVING=false`)
- Archives remain in place (no data loss)
- System continues using active spreadsheets only
- No restoration needed (archiving is additive)

### Phase 5: Optimization & Monitoring (Ongoing)

**Tasks**:
- [ ] Monitor archive operation performance (target: <10 seconds per user)
- [ ] Optimize batch operations if needed (parallel archive writes)
- [ ] Create admin dashboard for archive stats
- [ ] Document troubleshooting procedures
- [ ] Set up monthly review of archive spreadsheet count

---

## Benefits Summary

### Immediate Benefits

**Performance**:
- ✅ 75% reduction in cell count per user (10,000 → 2,500 rows average)
- ✅ Faster balance queries (<500ms vs 1-2s)
- ✅ Reduced API quota usage (smaller spreadsheets)

**Scalability**:
- ✅ Support unlimited users with sharding (200 users per active spreadsheet)
- ✅ Archives don't count against active tab limits
- ✅ No infrastructure costs (Google Sheets + Drive both free)

**Reliability**:
- ✅ Smaller active spreadsheets = fewer Google API timeouts
- ✅ On-demand archiving = no cron job dependency
- ✅ Easier to troubleshoot issues (data segregated by time period)

### Long-Term Benefits

**Data Management**:
- ✅ Organized historical data by month and shard
- ✅ Permanent archive storage (never deleted)
- ✅ Easy audit trail access

**Cost Savings**:
- ✅ $0 infrastructure (vs $50-100/month for DynamoDB at scale)
- ✅ No migration costs to alternative databases
- ✅ Leverages existing Google Sheets investment

**Simplicity**:
- ✅ One technology stack (Google Sheets + Drive API)
- ✅ Familiar Google Sheets interface for debugging
- ✅ Easy data export for analytics (standard Google Sheets export)
- ✅ No scheduled jobs to maintain

**Sharding Advantages**:
- ✅ Distribute load across multiple spreadsheets
- ✅ Each shard operates independently (isolated failures)
- ✅ Easy to scale: add more shards as user count grows
- ✅ Archives automatically sharded (maintains isolation)

---

## Monitoring Plan

### Key Metrics

**Active Spreadsheet Health** (per shard):
```javascript
// Track in CloudWatch per shard
{
    ShardIndex: 0,
    ActiveSheetCellCount: 1_800_000,
    CellCountUtilization: 0.18,  // 18% of 10M limit
    AverageUserRows: 900,         // 90 days × 10 req/day
    UserCount: 200,
    TabCount: 200                 // Approaching 200-tab limit
}
```

**Archive Health**:
```javascript
{
    ArchiveOperationsToday: 15,        // Users archived today
    ArchiveSpreadsheetsCreated: 3,     // New archive spreadsheets this month
    TotalArchiveSpreadsheets: 47,      // All-time archive count
    AverageArchiveDuration: 8.5,       // seconds per user
    ArchiveFailures: 0
}
```

**Balance Calculation Performance**:
```javascript
{
    BalanceQueryDuration: 450,         // ms (with on-demand archiving)
    BalanceQueryWithArchive: 8200,     // ms (when archiving triggered)
    CacheHitRate: 0.95,                // 95% served from cache
    ArchiveTriggeredRate: 0.05         // 5% of balance checks trigger archiving
}
```

### Alerts

**Critical**:
- 🚨 Archive operation fails for user (immediate SNS alert)
- 🚨 Cell count > 9M in any shard (90% of limit)
- 🚨 Tab count > 190 in any shard (95% of 200-tab limit)
- 🚨 Drive API quota exceeded (can't create new archive spreadsheets)

**Warning**:
- ⚠️ Archive operation duration > 30 seconds for single user
- ⚠️ Cell count > 7M in any shard (70% of limit)
- ⚠️ Archive spreadsheet creation rate > 10/day (unusual activity)

**Info**:
- ℹ️ Daily archive summary (users archived, spreadsheets created)
- ℹ️ Weekly cell count report per shard
- ℹ️ Monthly archive spreadsheet inventory

---

## Cost Analysis

### Current System Costs

**Google Sheets API**:
- ✅ Free tier: Unlimited spreadsheets, 300 requests/min
- ✅ Current usage: ~100 req/min peak
- **Cost**: $0/month

**Google Drive API**:
- ✅ Free tier: Create files via API, 15GB storage
- ✅ Spreadsheet size: ~0.5MB each
- ✅ Expected archive count: 60 spreadsheets/year (5 shards × 12 months)
- ✅ Storage after 5 years: ~150MB (300 spreadsheets × 0.5MB)
- **Cost**: $0/month

**Lambda Execution**:
- Current: ~1M requests/month
- Archive operations: +10,000 balance checks/month trigger archiving
- Additional duration: +10 seconds per archive operation
- Cost: $0.20/month (well within free tier)

**Total**: **$0.21/month** (unchanged from current)

---

### With On-Demand Archiving + Sharding

**Google Sheets API**:
- Active spreadsheets: 5 shards (200 users each = 1,000 total)
- Archive operations: On-demand, ~10,000/month
- API calls per archive: ~10 (read rows, create spreadsheet if needed, append rows, delete rows)
- Total API calls: +100,000/month
- Still within free tier limits (300 req/min = 12.9M req/month)
- **Cost**: $0/month

**Google Drive API**:
- Create spreadsheet operations: ~5 per month (one per shard)
- Within free tier quotas
- **Cost**: $0/month

**Lambda Execution**:
- Archive operations: 10,000/month × 10 seconds avg
- Additional cost: $0.002/month
- **Cost**: $0.22/month

**CloudWatch Logs**:
- Archive logs: ~50 MB/month
- **Cost**: $0.02/month

**Total**: **$0.24/month** (+ $0.03 from current)

---

### Compared to Alternative Solutions

| Solution | Setup Cost | Monthly Cost (1000 users) | Notes |
|----------|-----------|--------------------------|-------|
| **On-Demand Archive + Sharding (Recommended)** | $0 | $0.24 | No infrastructure, scales infinitely |
| 3-Month Archive with Cron | $0 | $0.21 | Requires scheduled job, less flexible |
| DynamoDB | $4,000 dev time | $5-10 | Unlimited scale, managed service |
| PostgreSQL RDS | $2,000 dev time | $15-30 (after free tier) | SQL queries, higher cost |
| ElastiCache + Sheets | $3,000 dev time | $15+ | Complex, cache invalidation issues |

**Result**: On-demand archiving is **60x-120x cheaper** than database solutions while maintaining zero infrastructure costs.

---

## Success Criteria

### Technical Metrics

- ✅ Cell count reduced from 7.3M → <2M (72% reduction)
- ✅ Balance query time reduced from 1.5s → <500ms (67% improvement)
- ✅ Zero data loss during archive operations
- ✅ Archive job completes in <5 minutes
- ✅ Support 1,000+ users without hitting limits

### Operational Metrics

- ✅ Zero downtime during rollout
- ✅ Archive job runs successfully for 3 consecutive months
- ✅ No increase in support tickets related to billing
- ✅ Admin can access historical data on-demand

### Business Metrics

- ✅ Zero infrastructure costs added
- ✅ No performance degradation reported by users
- ✅ System ready for 5x user growth

---

## Timeline

| Week | Phase | Tasks | Deliverable |
|------|-------|-------|-------------|
| 1 | Preparation | Implement archive functions, test in staging | Tested code |
| 2 | Dry Run | Run archive in staging, validate results | Confidence in production |
| 3 | Production | Deploy to production, run first archive | Live archive system |
| 4 | Optimization | Monitor, tune performance, document | Production-ready docs |

**Total Time**: 4 weeks (part-time development)  
**Developer Effort**: ~20 hours  
**Risk Level**: Low (fully reversible, no data migration)

---

## Conclusion

### Summary

**Recommended Approach**: On-Demand 3-Month Retention with Sharding and Separate Archive Spreadsheets

**Why This Solution**:
1. ✅ **Zero cost** - No new infrastructure, leverages free Google APIs
2. ✅ **Simple** - Stays within Google Sheets ecosystem (Sheets + Drive)
3. ✅ **Scalable** - Supports unlimited users via sharding (200 per shard)
4. ✅ **Fast** - On-demand archiving only when needed
5. ✅ **Reliable** - No cron job dependencies, triggers during normal operations
6. ✅ **Flexible** - Archives isolated per shard and month for easy management
7. ✅ **Permanent** - Archives never deleted, accessible forever

**Key Design Decisions**:

**1. On-Demand vs Scheduled Archiving**:
- ✅ **On-Demand (Chosen)**: Triggers during balance checks, no cron job needed
- ❌ **Scheduled**: Requires EventBridge cron, processes all users at once

**2. Separate Spreadsheets vs Tabs in Same Spreadsheet**:
- ✅ **Separate Spreadsheets (Chosen)**: Archives don't count against active sheet tab limits
- ❌ **Tabs in Same Spreadsheet**: Would hit 200-tab limit quickly with archives

**3. Sharding Strategy**:
- ✅ **Hash-based sharding**: Even distribution, deterministic user assignment
- ✅ **Per-shard archives**: Maintains isolation, scales with user growth
- ✅ **Capacity**: 200 users per shard, add shards as needed

**Implementation Priority**: Medium
- Current system works fine for <200 users
- Implement archiving when user count approaches 100 (proactive)
- Implement sharding when approaching 150 users (75% capacity)

**Trigger Points**:
1. **Enable Archiving**: When oldest user data exceeds 90 days (proactive cleanup)
2. **Add Sharding**: When user count reaches 150 (prepare for 200-user limit)
3. **Add More Shards**: When any shard reaches 180 users (90% capacity)

---

## Next Steps

### Immediate (Current State: <50 users)
- ✅ Continue using current single-spreadsheet architecture
- ✅ Monitor user growth and transaction volume
- ✅ Set up CloudWatch metrics for cell count tracking

### Short-Term (50-150 users)
1. **Enable On-Demand Archiving**:
   - Add `drive.file` scope to service account
   - Implement `archiveOldTransactionsIfNeeded()` function
   - Deploy to production with feature flag
   - Monitor first 100 archive operations

### Medium-Term (150-1000 users)
2. **Implement Sharding**:
   - Create 4 additional active spreadsheets (total: 5 shards)
   - Implement `getShardIndexForUser()` hash function
   - Update logging and balance functions to use dynamic spreadsheet IDs
   - Migrate new users to appropriate shards (existing users stay in shard 0)

### Long-Term (1000+ users)
3. **Scale Sharding**:
   - Add more active spreadsheets as user count grows
   - Each new shard supports 200 additional users
   - Archives automatically shard alongside active data
   - Monitor shard distribution and rebalance if needed

---

## Success Criteria

### Technical Metrics

- ✅ Cell count per shard stays below 8M (80% of 10M limit)
- ✅ Balance query time stays below 1 second (including archive operations)
- ✅ Archive operation completes in <30 seconds per user
- ✅ Zero data loss during archive operations
- ✅ Support 1,000+ users across multiple shards

### Operational Metrics

- ✅ Zero downtime during archiving operations
- ✅ Archiving runs successfully for 3 consecutive months
- ✅ No increase in support tickets related to billing or balance checks
- ✅ Admin can access historical data on-demand from archives

### Business Metrics

- ✅ Zero infrastructure costs added
- ✅ No performance degradation reported by users
- ✅ System ready for 10x user growth (current → 1000+ users)

---

## Timeline

| Phase | User Count | Action | ETA | Effort | Cost/mo |
|-------|-----------|--------|-----|--------|---------|
| **Current** | 0-50 | Monitor growth | Now | 0h | $0.21 |
| **Phase 1** | 50-150 | Enable archiving | Week 1-4 | 16h | $0.24 |
| **Phase 2** | 150-1,000 | Add sharding (5 shards) | Week 5-8 | 12h | $0.24 |
| **Phase 3** | 1,000-2,000 | Add more shards (10 total) | Month 4+ | 4h | $0.24 |
| **Phase 4** | 2,000+ | Continue scaling | Ongoing | 2h/shard | $0.24 |

**Total Development Time**: ~34 hours (spread over 6-12 months)  
**Total Cost**: **$0.24/month** (regardless of user count)

---

**Status**: ✅ Plan Complete - Ready for Implementation  
**Next Review**: When user count reaches 50 OR when oldest data exceeds 60 days  
**Contact**: Review metrics quarterly or when approaching trigger points

---

## Appendix: Service Account Setup Guide

### Step-by-Step Instructions for Google Drive API Access

**1. Enable Google Drive API**:
```bash
# Navigate to Google Cloud Console
# URL: https://console.cloud.google.com/apis/library/drive.googleapis.com

# Select project: abc2book-7ba987c44a16
# Click "ENABLE" button
# Wait for API to be enabled (~30 seconds)
```

**2. Verify Service Account Scopes**:
```javascript
// In src/services/google-sheets-logger.js
// Find the SCOPES constant and update:

// BEFORE:
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// AFTER:
const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',  // Read/write spreadsheets
    'https://www.googleapis.com/auth/drive.file'      // Create spreadsheets
];
```

**3. Test Drive API Access**:
```bash
# Add admin endpoint to test Drive API permissions
# Make POST request to /admin/test-drive-permissions

curl -X POST https://your-lambda-url.com/admin/test-drive-permissions \
  -H "Authorization: Bearer ${ADMIN_SECRET}"

# Expected response:
# {
#   "success": true,
#   "message": "Drive API access confirmed",
#   "testSpreadsheetId": "1abc...xyz"
# }
```

**4. Verify No Additional Permissions Needed**:
- ✅ Same service account JSON key works for Drive API
- ✅ No new credentials needed
- ✅ `drive.file` scope only allows app to manage its own files (security)

**5. Deploy Updated Code**:
```bash
# Deploy Lambda function with updated scopes
make deploy-lambda-fast

# Verify deployment
make logs
```

**Important Notes**:
- The `drive.file` scope is restrictive: only allows managing files created by this app
- Cannot access or modify user-created files (security feature)
- No additional Google Cloud Console permissions required
- Service account email remains the same

---

**Documentation Version**: 2.0  
**Last Updated**: 2024-10-25  
**Author**: Scaling Plan Working Group
````

#### Implementation

**Hash Function** (email → spreadsheet ID):
```javascript
function getSpreadsheetForUser(email) {
    // Simple hash: Sum ASCII codes modulo N
    const hash = email.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const shardIndex = hash % NUM_SPREADSHEETS;
    return SPREADSHEET_IDS[shardIndex];
}
```

**Configuration**:
```javascript
// Environment variables
const NUM_SPREADSHEETS = 5; // 5 spreadsheets × 200 tabs = 1000 users
const SPREADSHEET_IDS = [
    process.env.GOOGLE_SHEETS_SHARD_0,
    process.env.GOOGLE_SHEETS_SHARD_1,
    process.env.GOOGLE_SHEETS_SHARD_2,
    process.env.GOOGLE_SHEETS_SHARD_3,
    process.env.GOOGLE_SHEETS_SHARD_4,
];
```

#### Advantages

✅ **One-hit lookup**: Hash function provides O(1) spreadsheet selection  
✅ **No external dependencies**: Pure Google Sheets  
✅ **Zero cost**: Google Sheets API is free  
✅ **Automatic distribution**: Hash ensures even load balancing  
✅ **Easy scaling**: Add more spreadsheets by increasing `NUM_SPREADSHEETS`  
✅ **Simple migration**: Existing users stay in original spreadsheet (index 0)

#### Disadvantages

⚠️ **Configuration overhead**: Need to create and configure N spreadsheets  
⚠️ **API quota sharing**: All spreadsheets share same 300 req/min quota  
⚠️ **Manual provisioning**: New spreadsheets require manual setup  
⚠️ **Backup complexity**: N spreadsheets to backup instead of 1  
⚠️ **Rebalancing difficulty**: Changing N requires data migration

#### Scaling Capacity

| Spreadsheets | Max Users | Total Cells (1 year) |
|--------------|-----------|---------------------|
| 1 (current) | 200 | 7,300,000 |
| 5 | 1,000 | 36,500,000 ⚠️ |
| 10 | 2,000 | 73,000,000 ⚠️ |

**Problem**: Multiple spreadsheets don't help with API quota limits (shared pool).

---

### Option 2: Single Sheet with Email Column (Shared Log)

**Concept**: All users share one tab, with email as a column. Use filtering for user-specific queries.

#### Implementation

**Schema**:
```
| Timestamp | Email | Model | Tokens_In | Tokens_Out | Cost | Duration |
```

**Balance Query** (with filtering):
```javascript
async function getUserCreditBalance(email) {
    // Fetch ALL rows (cached)
    const allRows = await fetchAllTransactions();
    
    // Filter client-side
    const userRows = allRows.filter(row => row.email === email);
    
    // Calculate balance
    const balance = userRows.reduce((sum, row) => sum + row.credit - row.cost, 0);
    return balance;
}
```

#### Advantages

✅ **No 200 tab limit**: Single tab can have millions of rows  
✅ **Simpler structure**: One tab to manage instead of 200+  
✅ **Easier backups**: Single tab export  
✅ **Better analytics**: Can query across all users  
✅ **No migration needed**: Can coexist with per-user tabs

#### Disadvantages

❌ **Slower queries**: Must filter all rows for each user  
❌ **10M cell limit still applies**: ~270,000 total user-years  
❌ **Privacy concerns**: All user data in one tab (same service account though)  
❌ **Performance degradation**: Google Sheets slows down with >100k rows  
❌ **API quota waste**: Fetches all users' data for each query

#### Scaling Capacity

**10M cells ÷ 7 columns = 1,428,571 rows**

At 10 requests/user/day:
- **39,000 user-years** of data before hitting limit
- **3,900 users for 10 years**

**Better than per-tab approach**, but performance degrades much earlier.

---

### Option 3: Hybrid - Archive Old Data to Separate Sheets

**Concept**: Keep recent data (last 30-90 days) in active sheet, archive older data monthly.

#### Implementation

**Active Sheet**: Last 90 days
- Hot data for balance checks
- Fast queries (<10k rows per user)

**Archive Sheets**: One per month
- `archive_2024_10`, `archive_2024_11`, etc.
- Readonly after creation
- Queried only for historical reports

**Monthly Cron Job**:
```javascript
async function archiveOldData() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    // For each user tab
    for (const userEmail of allUsers) {
        const oldRows = await fetchRowsOlderThan(userEmail, cutoffDate);
        
        if (oldRows.length > 0) {
            // Move to archive sheet
            await appendToArchive(`archive_${month}`, oldRows);
            await deleteFromActive(userEmail, oldRows);
        }
    }
}
```

**Balance Calculation**:
```javascript
async function getUserCreditBalance(email) {
    // 1. Get archived balance (cached, changes rarely)
    const archivedBalance = await getArchivedBalance(email); // Sum from archive sheets
    
    // 2. Get recent transactions (fast, <10k rows)
    const recentBalance = await getRecentBalance(email); // Last 90 days
    
    return archivedBalance + recentBalance;
}
```

#### Advantages

✅ **Maintains current architecture**: Still one tab per user  
✅ **Fast balance queries**: Only 90 days of data  
✅ **Preserves history**: Nothing deleted, just archived  
✅ **Scales cell count**: Moves old data to separate workbooks  
✅ **Gradual implementation**: Can start archiving anytime

#### Disadvantages

⚠️ **Complexity**: Requires archive management logic  
⚠️ **Cron dependency**: Needs scheduled job (AWS EventBridge)  
⚠️ **Multi-sheet queries**: Balance calculation spans multiple sheets  
⚠️ **Still hits 200 user limit**: Doesn't solve the core problem  

---

### Option 4: DynamoDB (AWS Native)

**Concept**: Migrate to DynamoDB for scalable, managed NoSQL storage.

#### Schema Design

**Table**: `llm-billing-logs`

**Primary Key**:
- Partition Key: `email` (string)
- Sort Key: `timestamp` (number, Unix milliseconds)

**Attributes**:
```json
{
  "email": "user@example.com",
  "timestamp": 1729872000000,
  "model": "gpt-4o-mini",
  "tokens_in": 1200,
  "tokens_out": 300,
  "cost": 0.00045,
  "duration_ms": 1234,
  "transaction_type": "usage" | "credit_purchase",
  "amount": 0 | 5.00
}
```

**Indexes**:
- GSI: `transaction_type-timestamp-index` (for analytics)

#### Queries

**Get Balance** (O(1) with aggregation):
```javascript
async function getUserCreditBalance(email) {
    const params = {
        TableName: 'llm-billing-logs',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email }
    };
    
    const result = await dynamoDB.query(params);
    
    // Calculate balance
    return result.Items.reduce((balance, item) => {
        return balance + (item.amount || 0) - (item.cost || 0);
    }, 0);
}
```

**Log Transaction** (O(1) write):
```javascript
async function logTransaction(data) {
    await dynamoDB.putItem({
        TableName: 'llm-billing-logs',
        Item: data
    });
}
```

#### Advantages

✅ **Unlimited scale**: No user limits  
✅ **Fast queries**: Single-digit millisecond latency  
✅ **Managed service**: No maintenance  
✅ **Built-in backups**: Point-in-time recovery  
✅ **Strong consistency**: No eventual consistency issues  
✅ **AWS native**: Integrates with Lambda seamlessly  
✅ **Auto-scaling**: Handles traffic spikes

#### Disadvantages

❌ **Cost**: $1.25/million write requests, $0.25/million reads  
❌ **Storage cost**: $0.25/GB/month  
❌ **Configuration overhead**: IAM roles, table setup  
❌ **Migration required**: Must export existing Google Sheets data  
❌ **No free tier**: Costs start immediately (though minimal)

#### Cost Estimation

**Assumptions**:
- 1,000 users
- 10 requests/user/day = 10,000 writes/day
- 10,000 balance checks/day = 10,000 reads/day
- 500 bytes/transaction
- 90 days retention (archive older to S3)

**Monthly Costs**:
```
Writes: 300,000/month ÷ 1,000,000 × $1.25 = $0.38
Reads:  300,000/month ÷ 1,000,000 × $0.25 = $0.08
Storage: 1000 users × 900 transactions × 500 bytes = 450 MB × $0.25/GB = $0.11

Total: ~$0.57/month for 1000 users
```

**At 10,000 users**: ~$5.70/month

**Comparison**: Google Sheets API is **free** but limited.

---

### Option 5: PostgreSQL on AWS RDS Free Tier

**Concept**: Use RDS PostgreSQL free tier (750 hours/month, 20GB storage).

#### Schema

```sql
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    timestamp BIGINT NOT NULL,
    model VARCHAR(100),
    tokens_in INT,
    tokens_out INT,
    cost DECIMAL(10, 6),
    duration_ms INT,
    transaction_type VARCHAR(20),
    amount DECIMAL(10, 2),
    INDEX idx_email_timestamp (email, timestamp)
);
```

#### Advantages

✅ **Free tier**: 750 hours/month (always running = 720 hours)  
✅ **SQL queries**: Powerful analytics  
✅ **Unlimited users**: No artificial limits  
✅ **Mature ecosystem**: Well-understood technology  
✅ **Backup**: Automated backups included

#### Disadvantages

❌ **Free tier expires**: After 12 months, costs $15-30/month  
❌ **Configuration overhead**: VPC, security groups, connection pooling  
❌ **Cold starts**: Lambda needs connection management  
❌ **Maintenance**: Software updates, monitoring  
❌ **VPC complexity**: Lambda must be in VPC to access RDS

---

### Option 6: SQLite on EFS (Elastic File System)

**Concept**: Use SQLite database stored on EFS, mounted to Lambda.

#### Advantages

✅ **Low cost**: EFS $0.30/GB/month (1GB = $0.30/month)  
✅ **Simple**: SQLite = single file, no server  
✅ **SQL queries**: Full SQL support  
✅ **Serverless**: No database server to manage

#### Disadvantages

❌ **Write concurrency**: SQLite locks database for writes  
❌ **EFS latency**: ~10-30ms (slower than DynamoDB)  
❌ **Lambda VPC**: Must run in VPC (slower cold starts)  
❌ **Backup complexity**: Need to backup EFS  

---

### Option 7: Google Sheets + Local Cache (Redis/ElastiCache)

**Concept**: Keep Google Sheets as source of truth, cache in Redis for fast reads.

#### Implementation

**Write Path**:
1. Log transaction to Google Sheets (source of truth)
2. Invalidate user's cache entry in Redis

**Read Path**:
1. Check Redis for cached balance
2. If miss, query Google Sheets and cache result
3. Cache TTL: 5 minutes

#### Advantages

✅ **Keeps Google Sheets**: Minimal migration  
✅ **Fast reads**: Redis = sub-millisecond latency  
✅ **Reduces API calls**: 99% cache hit rate  
✅ **Easy rollback**: Can disable Redis anytime

#### Disadvantages

❌ **Cost**: ElastiCache $15+/month  
❌ **Complexity**: Two systems to manage  
❌ **Cache invalidation**: Tricky to get right  
❌ **Doesn't solve 200 user limit**: Still capped at 200 users

---

## Recommended Solutions

### Phase 1: Immediate (0-200 users) - Current System

**Status**: ✅ **Already Implemented**

**Capacity**: 200 users  
**Cost**: $0/month  
**Effort**: 0 hours (already done)

**Action**: None needed until user count approaches 150.

---

### Phase 2: Short-term (200-1000 users) - Multiple Spreadsheets with Sharding

**Recommendation**: **Option 1 - Multiple Google Sheets with Deterministic Sharding**

**Why**:
- ✅ Zero cost (Google Sheets API free)
- ✅ Minimal code changes (hash function + config)
- ✅ One-hit lookup (no database queries)
- ✅ Proven technology (current system works well)
- ✅ Gradual rollout (new users go to shards, existing stay in main sheet)

**Implementation**:

1. **Create 4 additional spreadsheets** (total: 5)
   - Main sheet (existing): Shard 0 (200 users)
   - New sheets: Shard 1-4 (200 users each)
   - **Capacity**: 1,000 users

2. **Implement hash function**:
   ```javascript
   function getSpreadsheetIdForUser(email) {
       const existingSpreadsheet = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
       
       // Check if user exists in main spreadsheet (backward compatibility)
       if (await userExistsInSpreadsheet(email, existingSpreadsheet)) {
           return existingSpreadsheet;
       }
       
       // New users: Hash to shard
       const shards = [
           existingSpreadsheet, // Shard 0 (existing users)
           process.env.GOOGLE_SHEETS_SHARD_1,
           process.env.GOOGLE_SHEETS_SHARD_2,
           process.env.GOOGLE_SHEETS_SHARD_3,
           process.env.GOOGLE_SHEETS_SHARD_4,
       ];
       
       const hash = email.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
       const shardIndex = hash % shards.length;
       return shards[shardIndex];
   }
   ```

3. **Update logging functions**:
   - `logToGoogleSheets()`: Use `getSpreadsheetIdForUser()` instead of hardcoded ID
   - `getUserCreditBalance()`: Same
   - `ensureSheetExists()`: Same

**Effort**: ~8 hours development + testing  
**Cost**: $0/month  
**Risk**: Low (backward compatible)

**Limitations**:
- API quota still shared (300 req/min across all shards)
- Manual spreadsheet provisioning required

---

### Phase 3: Medium-term (1000-10,000 users) - DynamoDB Migration

**Recommendation**: **Option 4 - DynamoDB**

**Why**:
- ✅ Unlimited scale (millions of users)
- ✅ Fast queries (<10ms)
- ✅ Minimal cost (<$10/month for 10k users)
- ✅ AWS native (no VPC complexity)
- ✅ Managed service (no maintenance)

**Implementation**:

1. **Create DynamoDB table**:
   ```javascript
   {
       TableName: 'llm-billing-logs',
       KeySchema: [
           { AttributeName: 'email', KeyType: 'HASH' },
           { AttributeName: 'timestamp', KeyType: 'RANGE' }
       ],
       BillingMode: 'PAY_PER_REQUEST', // Auto-scaling
       PointInTimeRecoveryEnabled: true
   }
   ```

2. **Dual-write migration** (zero downtime):
   - Phase 3a: Write to both Google Sheets + DynamoDB
   - Phase 3b: Read from DynamoDB (fallback to Sheets)
   - Phase 3c: Backfill historical data from Sheets to DynamoDB
   - Phase 3d: Deprecate Google Sheets writes

3. **Update code**:
   - Replace `logToGoogleSheets()` with `logToDynamoDB()`
   - Replace `getUserCreditBalance()` with DynamoDB query
   - Keep Sheets as readonly archive

**Effort**: ~40 hours (development + migration + testing)  
**Cost**: ~$0.50-5/month (depends on traffic)  
**Risk**: Medium (requires careful migration)

**Trigger**: When approaching 800 users (80% of 5-shard capacity)

---

### Phase 4: Long-term (10,000+ users) - Advanced Optimizations

**Recommendations**:

1. **DynamoDB + DAX (cache)**: Sub-millisecond reads
2. **Archive to S3**: Move >90 day old transactions to S3 ($0.023/GB/month)
3. **Analytics**: Use DynamoDB Streams → Kinesis → Athena for BI
4. **Monitoring**: CloudWatch dashboards for usage patterns

**Cost at 100,000 users**: ~$50-100/month

---

## Implementation Roadmap

### Timeline

| Phase | User Count | Solution | ETA | Effort | Cost/mo |
|-------|-----------|----------|-----|--------|---------|
| **Phase 1** | 0-200 | Current (1 sheet) | ✅ Done | 0h | $0 |
| **Phase 2** | 200-1,000 | Multi-sheet sharding | Week 1-2 | 8h | $0 |
| **Phase 3** | 1,000-10,000 | DynamoDB migration | Month 2-3 | 40h | $0.50-5 |
| **Phase 4** | 10,000+ | DynamoDB + optimizations | Month 6+ | 80h | $50-100 |

### Decision Points

**Trigger for Phase 2** (Multi-sheet):
- ✅ User count reaches 150 (75% capacity)
- ✅ Or: 3 months before expected 200-user milestone

**Trigger for Phase 3** (DynamoDB):
- ✅ User count reaches 800 (80% of 5-sheet capacity)
- ✅ Or: API quota errors occurring regularly (>10/day)
- ✅ Or: Google Sheets performance degrading (queries >2 seconds)

**Trigger for Phase 4** (Advanced):
- ✅ User count reaches 8,000 (80% comfort zone)
- ✅ Or: Monthly AWS bill from DynamoDB exceeds $20

---

## Cost-Benefit Analysis

### 5-Year Projection

**Scenario**: Growth from 100 → 10,000 users over 5 years

| Year | Users | Solution | Dev Cost | Hosting Cost/yr | Total Cost/yr |
|------|-------|----------|----------|----------------|---------------|
| 1 | 100 | Current (1 sheet) | $0 | $0 | $0 |
| 2 | 500 | Multi-sheet (5 shards) | $800 | $0 | $800 |
| 3 | 2,000 | DynamoDB | $4,000 | $12 | $4,012 |
| 4 | 5,000 | DynamoDB | $0 | $30 | $30 |
| 5 | 10,000 | DynamoDB + DAX | $2,000 | $60 | $2,060 |
| **Total** | | | **$6,800** | **$102** | **$6,902** |

**Developer cost assumption**: $100/hour blended rate

### Alternative: Start with DynamoDB (Year 1)

| Year | Users | Solution | Dev Cost | Hosting Cost/yr | Total Cost/yr |
|------|-------|----------|----------|----------------|---------------|
| 1 | 100 | DynamoDB | $4,000 | $6 | $4,006 |
| 2 | 500 | DynamoDB | $0 | $6 | $6 |
| 3 | 2,000 | DynamoDB | $0 | $12 | $12 |
| 4 | 5,000 | DynamoDB | $0 | $30 | $30 |
| 5 | 10,000 | DynamoDB + DAX | $2,000 | $60 | $2,060 |
| **Total** | | | **$6,000** | **$114** | **$6,114** |

**Result**: Starting with DynamoDB saves ~$800 in total costs, but requires upfront investment.

### Recommendation

**Gradual approach is better**:
- Year 1-2: Validate product-market fit with free solution
- Year 3+: Invest in scalable infrastructure when growth is proven

---

## Risk Assessment

### Multi-Sheet Sharding Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Hash collision causes uneven distribution | Low | Medium | Use cryptographic hash (SHA256 first 8 chars) |
| API quota hit with 1000 concurrent users | Medium | High | Implement exponential backoff + caching |
| Manual spreadsheet provisioning error | Low | Medium | Automated setup script with validation |
| User migration bugs (wrong shard) | Low | High | Extensive testing + dry-run mode |

### DynamoDB Migration Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Data loss during migration | Low | Critical | Dual-write period + validation |
| Cost spike from misconfiguration | Medium | Medium | Start with on-demand pricing + alerts |
| Lambda timeout on large queries | Low | Medium | Pagination + caching |
| IAM permission issues | Medium | Low | Thorough testing in staging |

---

## Monitoring & Alerts

### Metrics to Track

**Current System** (Google Sheets):
- ✅ Already tracked: Sheet count (logged on new user)
- ⚠️ Missing: API quota usage
- ⚠️ Missing: Query latency

**Recommended CloudWatch Metrics**:
```javascript
// Log to CloudWatch
await cloudwatch.putMetricData({
    Namespace: 'LLMProxy',
    MetricData: [
        {
            MetricName: 'GoogleSheetsAPILatency',
            Value: duration,
            Unit: 'Milliseconds'
        },
        {
            MetricName: 'ActiveUserCount',
            Value: sheetCount,
            Unit: 'Count'
        }
    ]
});
```

**Alerts**:
- 🚨 Sheet count > 180 (90% capacity)
- 🚨 API latency > 2 seconds (performance issue)
- 🚨 API errors > 10/hour (quota or system issue)

---

## Conclusion

### Summary

**Current State**: 
- ✅ Working system with 0 users
- ✅ Can support up to 200 users with current architecture
- ✅ Zero hosting costs

**Recommended Path**:
1. **Phase 1** (Now - 150 users): Keep current system, add monitoring
2. **Phase 2** (150-800 users): Implement multi-sheet sharding (8 hours, $0/month)
3. **Phase 3** (800+ users): Migrate to DynamoDB (40 hours, $5/month)
4. **Phase 4** (10,000+ users): Add caching and analytics (80 hours, $50/month)

**Key Insight**: Google Sheets tab limit (200) is the only hard blocker. Multi-sheet sharding solves this with minimal effort and zero cost.

**Decision Point**: No action needed until user count reaches **150 users** (75% capacity warning threshold).

---

## Appendix: Hash Function Options

### Option A: Simple Modulo (Recommended for Phase 2)

**Pros**: Fast, simple, deterministic  
**Cons**: Not cryptographically secure (doesn't matter for this use case)

```javascript
function simpleHash(email) {
    return email.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
}
```

### Option B: SHA256 Prefix (Recommended for Phase 3+)

**Pros**: Cryptographically secure, even distribution  
**Cons**: Slightly slower (negligible)

```javascript
const crypto = require('crypto');

function cryptoHash(email) {
    const hash = crypto.createHash('sha256').update(email).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
}
```

### Option C: Consistent Hashing (Advanced)

**Pros**: Minimal rebalancing when adding shards  
**Cons**: Complex implementation

**Use case**: Only needed if frequently adding/removing shards.

---

## Appendix: Migration Checklist

### Multi-Sheet Migration (Phase 2)

- [ ] Create 4 new Google Sheets
- [ ] Configure service account access for all sheets
- [ ] Add sheet IDs to `.env` file
- [ ] Implement `getSpreadsheetIdForUser()` function
- [ ] Update `logToGoogleSheets()` to use dynamic sheet ID
- [ ] Update `getUserCreditBalance()` to use dynamic sheet ID
- [ ] Add unit tests for hash function
- [ ] Add integration tests for multi-sheet operations
- [ ] Deploy to staging and test with 10 test users
- [ ] Monitor for 1 week in staging
- [ ] Deploy to production (feature flag: `ENABLE_MULTI_SHEET=true`)
- [ ] Monitor for 1 week in production
- [ ] Document new configuration in README

### DynamoDB Migration (Phase 3)

- [ ] Create DynamoDB table in staging
- [ ] Configure IAM role for Lambda access
- [ ] Implement DynamoDB client module
- [ ] Implement `logToDynamoDB()` function
- [ ] Implement `getUserBalanceFromDynamoDB()` function
- [ ] Add dual-write logic (write to both Sheets + DynamoDB)
- [ ] Deploy dual-write mode to staging
- [ ] Monitor for data consistency (100% match required)
- [ ] Backfill historical data from Sheets to DynamoDB
- [ ] Validate backfill (query both sources, compare results)
- [ ] Enable read-from-DynamoDB mode (feature flag)
- [ ] Monitor for 1 week (performance, costs, errors)
- [ ] Disable writes to Google Sheets
- [ ] Archive Google Sheets as readonly backup
- [ ] Update documentation and runbooks

---

**Status**: ✅ Plan Complete - No Action Required Until 150 Users  
**Next Review**: When user count reaches 150 (or 3 months before projected milestone)
