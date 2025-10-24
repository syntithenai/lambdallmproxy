# Duplicate Sheet Prevention & Merging

## Overview

This system prevents and resolves duplicate billing sheets for the same user email address in the Google Sheets logging system.

## Problem

Previously, if the same email address was written with different capitalization or formatting, multiple sheets could be created:
- `syntithenai_at_gmail_dot_com`
- `Syntithenai_at_gmail_dot_com`

This caused:
- Fragmented billing data across multiple sheets
- Inaccurate credit balance calculations
- Confusion when viewing billing history

## Solution

### 1. Prevention (Automatic)

**File**: `src/services/google-sheets-logger.js`

The `ensureSheetExists()` function now includes duplicate prevention:
- Checks for exact sheet name match first
- If not found, checks for case-insensitive match
- If similar sheet exists, uses the existing sheet instead of creating duplicate
- Logs warning when using existing similar sheet

**Code**:
```javascript
// DUPLICATE PREVENTION: Check for similar sheet names (case-insensitive)
const normalizedSheetName = sheetName.toLowerCase();
const existingSheets = spreadsheet.sheets?.map(s => s.properties.title) || [];
const similarSheet = existingSheets.find(
    name => name.toLowerCase() === normalizedSheetName
);

if (similarSheet) {
    console.log(`⚠️  Found similar sheet "${similarSheet}" for requested "${sheetName}", using existing sheet`);
    resolve(true);
    return;
}
```

### 2. Detection & Listing

**Script**: `scripts/list-sheets.js`

List all sheets and detect potential duplicates:

```bash
node scripts/list-sheets.js
```

**Output**:
```
📊 All sheets in spreadsheet:

  - stever_at_gmail_dot_com
  - syntithenai_at_gmail_dot_com

🔍 Checking for potential duplicates...

✅ Only one sheet for syntithenai: syntithenai_at_gmail_dot_com
```

### 3. Merging Duplicates

**Script**: `scripts/merge-duplicate-sheets.js`

Automatically merges duplicate sheets for the same email address.

#### Features
- Detects all sheets for the same email (case-insensitive)
- Combines all transaction rows from duplicate sheets
- Removes duplicate transactions (same timestamp + email + model + type)
- Sorts by timestamp (oldest first)
- Keeps the oldest sheet (lowest sheet ID)
- Deletes duplicate sheets after merging

#### Usage

**Dry run (safe, no changes)**:
```bash
node scripts/merge-duplicate-sheets.js --dry-run
```

**Dry run for specific email**:
```bash
node scripts/merge-duplicate-sheets.js --dry-run --email=syntithenai@gmail.com
```

**Live merge (makes changes)**:
```bash
node scripts/merge-duplicate-sheets.js
```

**Live merge for specific email**:
```bash
node scripts/merge-duplicate-sheets.js --email=syntithenai@gmail.com
```

#### Example Output

```
🔧 Duplicate Sheet Merger

Mode: LIVE (will make changes)

📊 Fetching spreadsheet metadata...

⚠️  Found 1 email(s) with duplicate sheets:

📧 Email: syntithenai@gmail.com
   Duplicate sheets (2):
     - syntithenai_at_gmail_dot_com (ID: 123)
     - Syntithenai_at_gmail_dot_com (ID: 456)

   ✅ Primary sheet (keeping): syntithenai_at_gmail_dot_com
   🗑️  Merging from: Syntithenai_at_gmail_dot_com

   📥 Fetching data from: syntithenai_at_gmail_dot_com
      Found 50 transaction(s)

   📥 Fetching data from: Syntithenai_at_gmail_dot_com
      Found 10 transaction(s)

   🔄 Total unique transactions: 58
   (Removed 2 duplicate rows)

   🧹 Clearing primary sheet: syntithenai_at_gmail_dot_com
   📝 Writing 58 transactions to primary sheet
   🗑️  Deleting duplicate sheet: Syntithenai_at_gmail_dot_com

   ✅ Successfully merged all sheets for syntithenai@gmail.com

✨ Merge complete!
```

## How It Works

### Sheet Name Normalization

**Email to Sheet Name**:
```javascript
function emailToSheetName(email) {
  return email
    .toLowerCase()                    // syntithenai@gmail.com
    .replace(/@/g, '_at_')           // syntithenai_at_gmail.com
    .replace(/\./g, '_dot_')         // syntithenai_at_gmail_dot_com
    .replace(/[:/\?*\[\]\\]/g, '_')  // Remove invalid chars
    .substring(0, 100);              // Limit to 100 chars
}
```

**Sheet Name to Email** (best effort):
```javascript
function sheetNameToEmail(sheetName) {
  return sheetName
    .replace(/_at_/g, '@')
    .replace(/_dot_/g, '.');
}
```

### Merge Algorithm

1. **Group sheets by normalized email** (case-insensitive)
2. **Find duplicates** (more than 1 sheet for same email)
3. **Sort by sheet ID** (older sheets have lower IDs)
4. **Designate primary sheet** (oldest sheet becomes primary)
5. **Fetch all transaction rows** from all duplicate sheets
6. **Deduplicate rows** using key: `timestamp_email_model_type`
7. **Sort by timestamp** (chronological order)
8. **Clear primary sheet** (keep header row)
9. **Write merged data** to primary sheet
10. **Delete duplicate sheets**

### Deduplication Key

Transactions are considered duplicates if they have the same:
- Timestamp (column A)
- Email (column B)
- Model (column D)
- Type (column E)

Example duplicate:
```
2025-10-24T03:31:29.050Z | syntithenai@gmail.com | groq-free | llama-3.1-8b | chat_iteration
2025-10-24T03:31:29.050Z | syntithenai@gmail.com | groq-free | llama-3.1-8b | chat_iteration
```

## Maintenance

### Regular Checks

Run weekly to check for duplicates:
```bash
# Check if any duplicates exist
node scripts/list-sheets.js

# If duplicates found, review with dry-run
node scripts/merge-duplicate-sheets.js --dry-run

# If everything looks correct, merge
node scripts/merge-duplicate-sheets.js
```

### Add to Cron (Optional)

Add to `crontab -e`:
```bash
# Check for duplicate sheets every Sunday at 2 AM
0 2 * * 0 cd /path/to/lambdallmproxy && node scripts/merge-duplicate-sheets.js >> /var/log/sheet-merge.log 2>&1
```

## Safety Features

1. **Dry Run Mode**: Test merges without making changes
2. **Email Filter**: Process only specific emails
3. **Deduplication**: Prevents data loss from duplicate rows
4. **Oldest Sheet Priority**: Preserves the original sheet
5. **Timestamp Sorting**: Maintains chronological order
6. **Detailed Logging**: All actions logged to console

## Troubleshooting

### "No duplicate sheets found" but I see duplicates

Check sheet names exactly - they must have the same email when normalized:
- `syntithenai_at_gmail_dot_com` ✅
- `syntithenai_gmail_com` ❌ (different format)

### Merge script fails with permission error

Check that service account has edit permissions on the spreadsheet:
```bash
# Verify .env has correct credentials
grep GOOGLE_SHEETS .env
```

### Data missing after merge

Check the merge log for "Removed N duplicate rows" - these were true duplicates (same timestamp + email + model + type). Original data is still in Google Sheets revision history.

### Want to restore deleted sheet

1. Open spreadsheet in browser
2. File → Version History → See version history
3. Find version before merge
4. Restore or copy data manually

## Future Enhancements

- [ ] Automatic merge on sheet creation (prevent duplicates entirely)
- [ ] Email notification after successful merge
- [ ] Backup duplicate sheets before deleting (export to separate spreadsheet)
- [ ] Web UI for viewing and managing duplicates
- [ ] Scheduled automatic merges via CloudWatch Events

---

**Created**: 2025-10-24  
**Last Updated**: 2025-10-24  
**Maintainer**: Steve Ryan (syntithenai@gmail.com)
