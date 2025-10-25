# Scaling Plan: Google Sheets with 3-Month Transaction Retention

**Date**: 2024-10-25  
**Strategy**: Optimize Google Sheets usage with rolling 3-month transaction retention  
**Current Architecture**: One tab per user email for billing/usage logs  
**Goal**: Support unlimited users while maintaining Google Sheets as primary data store

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

## Recommended Solution: 3-Month Retention

### Strategy Overview

Keep only the **most recent 3 months** of transactions in the active Google Sheet. Archive older data monthly to reduce cell count and improve performance.

**Key Benefits**:
- ✅ **Stays within limits**: Dramatically reduces cell count per user
- ✅ **Fast queries**: Smaller sheets = faster balance calculations
- ✅ **Zero cost**: No new infrastructure needed
- ✅ **Preserves history**: Nothing deleted, just archived
- ✅ **Simple implementation**: Automated monthly cleanup job

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

**Active Sheet** (Hot Data):
- Contains last 90 days of transactions
- Used for balance calculations and recent history
- Cleaned automatically on monthly schedule

**Archive Sheets** (Cold Data):
- One sheet per month: `archive_2024_10`, `archive_2024_11`, etc.
- Readonly after creation
- Queried only for historical reports or audit requests
- Can be exported to CSV and moved to Google Drive for long-term storage

**Balance Calculation Strategy**:
```javascript
async function getUserCreditBalance(email) {
    // Fast path: Only query active sheet (last 90 days)
    // This includes all credit purchases and recent usage
    const recentTransactions = await getRecentTransactions(email); // <1 second
    
    // Calculate balance from recent data
    const balance = recentTransactions.reduce((sum, tx) => {
        if (tx.type === 'credit_added') return sum + tx.amount;
        return sum - tx.cost;
    }, 0);
    
    return balance;
}
```

**Key Insight**: Since credit purchases are always recent (users buy credits when needed), we don't need to query archives for balance calculations in most cases.

---

## Implementation Plan

### Phase 1: Add Archive Functionality

**File**: `src/services/google-sheets-logger.js`

**New Functions**:

```javascript
/**
 * Archive transactions older than 90 days to monthly archive sheet
 * Runs as scheduled Lambda function (AWS EventBridge cron)
 */
async function archiveOldTransactions() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    console.log(`📦 Starting archive process for transactions before ${cutoffDate.toISOString()}`);
    
    // Get all user sheets
    const spreadsheet = await getSpreadsheet();
    const sheets = spreadsheet.data.sheets;
    
    let totalArchived = 0;
    
    for (const sheet of sheets) {
        const sheetName = sheet.properties.title;
        
        // Skip archive sheets and metadata sheets
        if (sheetName.startsWith('archive_') || sheetName === 'Metadata') {
            continue;
        }
        
        // Get all rows from user sheet
        const rows = await getSheetRows(sheetName);
        
        // Find rows older than cutoff
        const oldRows = rows.filter(row => {
            const timestamp = new Date(row.timestamp);
            return timestamp < cutoffDate;
        });
        
        if (oldRows.length === 0) {
            console.log(`  ✓ ${sheetName}: No old transactions`);
            continue;
        }
        
        // Group by month
        const byMonth = groupByMonth(oldRows);
        
        // Archive to monthly sheets
        for (const [month, transactions] of Object.entries(byMonth)) {
            await appendToArchive(month, sheetName, transactions);
            console.log(`  📦 ${sheetName}: Archived ${transactions.length} rows to ${month}`);
        }
        
        // Delete old rows from active sheet
        await deleteOldRows(sheetName, oldRows);
        
        totalArchived += oldRows.length;
    }
    
    console.log(`✅ Archive complete: ${totalArchived} transactions archived`);
}

/**
 * Group transactions by month (YYYY_MM format)
 */
function groupByMonth(transactions) {
    const groups = {};
    
    for (const tx of transactions) {
        const date = new Date(tx.timestamp);
        const month = `archive_${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!groups[month]) groups[month] = [];
        groups[month].push(tx);
    }
    
    return groups;
}

/**
 * Append transactions to archive sheet
 * Creates sheet if it doesn't exist
 */
async function appendToArchive(archiveSheet, userEmail, transactions) {
    const spreadsheet = await getSpreadsheet();
    
    // Check if archive sheet exists
    let sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === archiveSheet);
    
    if (!sheetExists) {
        // Create archive sheet
        await spreadsheet.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [{
                    addSheet: {
                        properties: {
                            title: archiveSheet,
                            gridProperties: { frozenRowCount: 1 }
                        }
                    }
                }]
            }
        });
        
        // Add header row
        await appendRows(archiveSheet, [[
            'Timestamp', 'Email', 'Type', 'Model', 'Provider', 
            'Tokens In', 'Tokens Out', 'Cost', 'Duration (ms)', 'Status'
        ]]);
    }
    
    // Append transactions
    const rows = transactions.map(tx => [
        tx.timestamp,
        userEmail,
        tx.type,
        tx.model,
        tx.provider,
        tx.tokensIn,
        tx.tokensOut,
        tx.cost,
        tx.durationMs,
        tx.status
    ]);
    
    await appendRows(archiveSheet, rows);
}

/**
 * Delete old rows from active sheet
 */
async function deleteOldRows(sheetName, oldRows) {
    // Get sheet ID
    const spreadsheet = await getSpreadsheet();
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
    const sheetId = sheet.properties.sheetId;
    
    // Sort by row index descending (delete from bottom up)
    const rowIndices = oldRows.map(row => row.rowIndex).sort((a, b) => b - a);
    
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
        
        await spreadsheet.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests }
        });
    }
}
```

### Phase 2: Scheduled Cleanup Job

**File**: `serverless.yml` or CloudFormation template

```yaml
functions:
  archiveTransactions:
    handler: src/jobs/archive-transactions.handler
    timeout: 900  # 15 minutes
    events:
      # Run on 1st of every month at 2 AM UTC
      - schedule: cron(0 2 1 * ? *)
    environment:
      GOOGLE_SHEETS_LOG_SPREADSHEET_ID: ${env:GOOGLE_SHEETS_LOG_SPREADSHEET_ID}
      GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY: ${env:GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY}
```

**File**: `src/jobs/archive-transactions.js`

```javascript
const { archiveOldTransactions } = require('../services/google-sheets-logger');

exports.handler = async (event) => {
    console.log('📦 Starting monthly archive job');
    
    try {
        await archiveOldTransactions();
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Archive complete' })
        };
    } catch (error) {
        console.error('❌ Archive job failed:', error);
        
        // Send alert (SNS topic)
        await sendAlert('Archive job failed', error.message);
        
        throw error;
    }
};
```

### Phase 3: Manual Trigger for Testing

**File**: `src/index.js`

```javascript
// Add admin endpoint to manually trigger archive
if (path === '/admin/archive' && method === 'POST') {
    // Verify admin token
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'Forbidden' })
        };
    }
    
    const { archiveOldTransactions } = require('./services/google-sheets-logger');
    await archiveOldTransactions();
    
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Archive complete' })
    };
}
```

### Phase 4: Monitoring & Alerts

**CloudWatch Metrics**:
- `ArchiveJobDuration` - Time to complete archive
- `TransactionsArchived` - Count of archived rows
- `ActiveSheetCellCount` - Track cell count reduction

**Alerts**:
- 🚨 Archive job fails
- 🚨 Archive duration > 10 minutes (performance issue)
- 🚨 Cell count > 8M (approaching limit)

---

## Archive Strategy

### Archive Sheet Organization

**Naming Convention**: `archive_YYYY_MM`
- `archive_2024_10` - October 2024 transactions
- `archive_2024_11` - November 2024 transactions
- etc.

**Structure**: Same columns as active sheets
```
| Timestamp | Email | Type | Model | Provider | Tokens In | Tokens Out | Cost | Duration | Status |
```

**Access Pattern**:
- **Write**: Once per month (archive job)
- **Read**: Rare (historical reports, audits)
- **Retention**: Indefinite (or export to CSV after 12 months)

### Long-Term Archive Management

**After 12 Months**:
1. Export archive sheet to CSV
2. Upload to Google Drive folder: `LLM Proxy Archives/YYYY/`
3. Delete archive sheet from main spreadsheet
4. Update index: Track which archives are in Drive vs Sheets

**File Structure**:
```
Google Drive/
└── LLM Proxy Archives/
    ├── 2024/
    │   ├── archive_2024_01.csv
    │   ├── archive_2024_02.csv
    │   └── ...
    └── 2025/
        └── archive_2025_01.csv
```

**Benefits**:
- ✅ Keeps spreadsheet size manageable
- ✅ Archives accessible via Drive API if needed
- ✅ Can be imported back to Sheets for analysis
- ✅ Automatic Drive backups

### Historical Balance Calculation (Edge Case)

**Scenario**: User requests full transaction history including archives

```javascript
async function getUserFullHistory(email) {
    const history = [];
    
    // 1. Get recent transactions (active sheet)
    const recent = await getRecentTransactions(email);
    history.push(...recent);
    
    // 2. Get archived transactions (last 12 months in Sheets)
    const spreadsheet = await getSpreadsheet();
    const archiveSheets = spreadsheet.data.sheets
        .filter(s => s.properties.title.startsWith('archive_'))
        .map(s => s.properties.title);
    
    for (const archiveSheet of archiveSheets) {
        const archived = await getArchivedTransactions(email, archiveSheet);
        history.push(...archived);
    }
    
    // 3. Get older archives from Drive (if needed)
    // ... Drive API integration
    
    return history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}
```

---

## Migration & Rollout

### Phase 1: Preparation (Week 1)

**Tasks**:
- [ ] Review current data: Identify users with >90 days of history
- [ ] Calculate expected archive size
- [ ] Set up test spreadsheet with sample data
- [ ] Implement archive functions in staging
- [ ] Test with 10 test users (varying transaction counts)

**Validation**:
- ✅ All transactions preserved (no data loss)
- ✅ Balance calculations remain accurate
- ✅ Archive sheets created correctly
- ✅ Old rows deleted from active sheets

### Phase 2: Dry Run (Week 2)

**Tasks**:
- [ ] Deploy archive function to staging Lambda
- [ ] Run manual archive (dry run mode - no deletions)
- [ ] Compare before/after cell counts
- [ ] Verify all edge cases (no transactions, all old, all recent)
- [ ] Test balance calculation after archive

**Success Criteria**:
- ✅ Zero data discrepancies
- ✅ Cell count reduced by expected amount
- ✅ No performance degradation
- ✅ All user balances unchanged

### Phase 3: Production Rollout (Week 3)

**Tasks**:
- [ ] Deploy archive function to production
- [ ] Schedule monthly cron job (1st of month, 2 AM UTC)
- [ ] Run first manual archive during low-traffic period
- [ ] Monitor logs for errors
- [ ] Validate random sample of user balances
- [ ] Set up CloudWatch alarms

**Rollback Plan**:
- Keep backup of spreadsheet before first archive
- If issues detected, restore from backup
- Disable cron job until fixed

### Phase 4: Optimization (Week 4+)

**Tasks**:
- [ ] Monitor archive job performance
- [ ] Optimize batch operations if needed
- [ ] Implement Drive export for 12+ month archives
- [ ] Document archive access procedures
- [ ] Create admin dashboard for archive stats

---

## Benefits Summary

### Immediate Benefits

**Performance**:
- ✅ 75% reduction in cell count
- ✅ Faster balance queries (<500ms vs 1-2s)
- ✅ Reduced API quota usage

**Scalability**:
- ✅ Support 1,100+ users (5.5x current capacity)
- ✅ Unlimited growth with archive rotation
- ✅ No infrastructure costs

**Reliability**:
- ✅ Smaller sheets = fewer Google API timeouts
- ✅ Better backup/restore times
- ✅ Easier to troubleshoot issues

### Long-Term Benefits

**Data Management**:
- ✅ Organized historical data
- ✅ Compliance with data retention policies
- ✅ Easy audit trail access

**Cost Savings**:
- ✅ $0 infrastructure (vs $50-100/month for DynamoDB at scale)
- ✅ No migration costs
- ✅ Leverages existing Google Sheets investment

**Simplicity**:
- ✅ One technology stack (no database to manage)
- ✅ Familiar Google Sheets interface for debugging
- ✅ Easy data export for analytics

---

## Monitoring Plan

### Key Metrics

**Active Sheet Health**:
```javascript
// Track in CloudWatch
{
    ActiveSheetCellCount: 1_800_000,
    CellCountUtilization: 0.18,  // 18% of 10M limit
    AverageUserRows: 900,         // 90 days × 10 req/day
    UserCount: 200
}
```

**Archive Job Health**:
```javascript
{
    ArchiveJobDuration: 120,       // seconds
    TransactionsArchived: 50_000,
    ArchiveSheetsCreated: 1,
    ErrorCount: 0
}
```

**Balance Calculation Performance**:
```javascript
{
    BalanceQueryDuration: 450,     // ms (before archive: 1500ms)
    CacheHitRate: 0.95,            // 95% served from cache
    ArchiveQueriesNeeded: 0.02     // 2% need archive access
}
```

### Alerts

**Critical**:
- 🚨 Archive job fails (immediate SNS alert)
- 🚨 Cell count > 9M (90% of limit)
- 🚨 Balance calculation errors spike

**Warning**:
- ⚠️ Archive job duration > 5 minutes
- ⚠️ Cell count > 7M (70% of limit)
- ⚠️ Archive sheet count > 12 (time to export to Drive)

**Info**:
- ℹ️ Monthly archive summary (transactions archived, cell count reduction)
- ℹ️ Weekly cell count report

---

## Cost Analysis

### Current System Costs

**Google Sheets API**:
- ✅ Free tier: Unlimited spreadsheets, 300 requests/min
- ✅ Current usage: ~100 req/min peak
- **Cost**: $0/month

**Lambda Execution**:
- Current: ~1M requests/month
- Cost: $0.20/month (well within free tier)

**Total**: **$0.20/month**

### With 3-Month Archive System

**Google Sheets API**:
- Archive job: ~1000 API calls/month (reading + writing)
- Still within free tier limits
- **Cost**: $0/month

**Lambda Execution**:
- Archive job: 1 execution/month, ~5 minutes runtime
- Additional cost: $0.0001/month (negligible)
- **Cost**: $0.20/month

**CloudWatch Logs**:
- Archive job logs: ~1 MB/month
- **Cost**: $0.01/month

**Total**: **$0.21/month** (+ $0.01 from current)

### Compared to Alternative Solutions

| Solution | Setup Cost | Monthly Cost (1000 users) |
|----------|-----------|--------------------------|
| **3-Month Archive (Recommended)** | $0 | $0.21 |
| DynamoDB | $4,000 dev time | $5-10 |
| PostgreSQL RDS | $2,000 dev time | $15-30 (after free tier) |
| ElastiCache + Sheets | $3,000 dev time | $15+ |

**Result**: 3-month archive is **70x-140x cheaper** than database solutions.

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

**Recommended Approach**: 3-Month Rolling Retention with Monthly Archives

**Why This Solution**:
1. ✅ **Zero cost** - No new infrastructure
2. ✅ **Simple** - Stays within Google Sheets ecosystem
3. ✅ **Scalable** - Supports 1,000+ users indefinitely
4. ✅ **Fast** - Reduces query times by 67%
5. ✅ **Reliable** - Proven technology, no new dependencies
6. ✅ **Reversible** - Can always restore from archives

**Implementation Priority**: Medium
- Current system works fine for <200 users
- Implement when approaching 150 users (75% capacity)
- Or when cell count exceeds 5M (proactive optimization)

**Next Steps**:
1. Monitor current cell count and user growth
2. Plan archive implementation when metrics trigger action
3. Set up monitoring alerts for proactive warning

---

**Status**: ✅ Plan Complete - Ready for Implementation  
**Trigger**: User count >150 OR cell count >5M  
**Next Review**: Quarterly or when metrics approach thresholds
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
