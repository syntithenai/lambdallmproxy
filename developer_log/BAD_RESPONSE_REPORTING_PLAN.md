# Bad Response Reporting Feature - Implementation Plan

## Overview

Enable users to report poor LLM responses with explanations, logged to Google Sheets for Copilot review and analysis. This creates a feedback loop for continuous improvement and debugging.

**Key Features**:
- 🚩 One-click reporting from LLM Info dialog
- 📊 **Automatic data sharding** for large conversations (>50K characters)
- 🔍 Full conversation context + LLM debug data
- 📋 Review tools for developer analysis
- 🔒 OAuth authentication and validation
- 🤖 Export for Copilot-assisted pattern detection

## Table of Contents

1. [User Flow](#user-flow)
2. [UI Components](#ui-components)
3. [Data Structure](#data-structure)
4. [Google Sheets Integration](#google-sheets-integration)
5. [Backend API](#backend-api)
6. [Review Infrastructure](#review-infrastructure)
7. [Security & Privacy](#security--privacy)
8. [Implementation Steps](#implementation-steps)
9. [Testing Plan](#testing-plan)
10. [Future Enhancements](#future-enhancements)

---

## User Flow

### Current State: LLM Info Dialog

**Location**: LLM Info button appears on assistant messages with token counts  
**Access**: Click "Info (↓1234/↑567)" button → Opens full-screen dialog  
**Features**:
- View LLM API call details
- See request/response JSON
- Copy individual sections
- Copy all calls combined (existing "Copy All JSON" button)

### New Flow: Report Bad Response

```
1. User opens LLM Info dialog (existing)
2. User clicks new "🚩 Fix Response" button (added to header)
3. Fix Response dialog opens (modal over modal)
4. User types explanation in textarea
5. User clicks "Send Report"
6. System logs to Google Sheets "Reported Errors" tab
7. Success toast appears: "✅ Response reported. Thank you for the feedback!"
8. Dialog closes, returns to LLM Info dialog
```

**User Intent**:
- Report incorrect, incomplete, or unhelpful responses
- Provide context on what went wrong
- Help improve the system

---

## UI Components

### 1. Fix Response Button (LLM Info Dialog Header)

**Location**: LlmInfoDialogNew.tsx header, next to existing "Copy All JSON" button

**Visual Design**:
```tsx
<button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">
  <span>🚩</span>
  <span>Fix Response</span>
</button>
```

**Behavior**:
- Opens FixResponseDialog modal
- Passes current message data (apiCalls, evaluations, conversation context)
- Available for all LLM responses (assistant messages with llmApiCalls)

---

### 2. Fix Response Dialog Component

**Component**: `FixResponseDialog.tsx` (new file)

**Props**:
```typescript
interface FixResponseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  messageData: {
    messageId: string;
    messageContent: string;
    llmApiCalls: LLMApiCall[];
    evaluations?: Evaluation[];
    conversationThread: Message[];  // Full conversation for debug context
    userEmail: string;
  };
}
```

**Layout**:

```
┌─────────────────────────────────────────────────────┐
│  🚩 Report Response Issue                     [×]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Help us improve! Describe what went wrong:        │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │                                               │ │
│  │  [User types explanation here]                │ │
│  │                                               │ │
│  │  Examples:                                    │ │
│  │  • "Response was factually incorrect..."     │ │
│  │  • "Did not answer my actual question..."    │ │
│  │  • "Hallucinated information about..."       │ │
│  │  • "Ignored my previous context..."          │ │
│  │                                               │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  Character count: 0 / 2000                          │
│                                                     │
│  [Cancel]                      [📤 Send Report]    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Component Code**:

```tsx
// ui-new/src/components/FixResponseDialog.tsx

import { useState } from 'react';
import { useToast } from '../hooks/useToast';

interface FixResponseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  messageData: {
    messageId: string;
    messageContent: string;
    llmApiCalls: any[];
    evaluations?: any[];
    conversationThread: any[];
    userEmail: string;
  };
}

export function FixResponseDialog({ isOpen, onClose, messageData }: FixResponseDialogProps) {
  const [explanation, setExplanation] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { showSuccess, showError } = useToast();
  
  const MAX_LENGTH = 2000;
  const remainingChars = MAX_LENGTH - explanation.length;
  
  const handleSend = async () => {
    if (!explanation.trim()) {
      showError('Please provide an explanation');
      return;
    }
    
    setIsSending(true);
    
    try {
      // Call backend API to log report
      const response = await fetch(`${API_ENDPOINT}/report-error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          userEmail: messageData.userEmail,
          explanation: explanation.trim(),
          messageData: {
            messageId: messageData.messageId,
            messageContent: messageData.messageContent,
            llmApiCalls: messageData.llmApiCalls,
            evaluations: messageData.evaluations,
            conversationThread: messageData.conversationThread
          },
          timestamp: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit report');
      }
      
      showSuccess('✅ Response reported. Thank you for the feedback!');
      setExplanation('');
      onClose();
      
    } catch (error) {
      console.error('Failed to submit error report:', error);
      showError('Failed to submit report. Please try again.');
    } finally {
      setIsSending(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚩</span>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Report Response Issue
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl"
          >
            ×
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Help us improve! Describe what went wrong with this response:
          </p>
          
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="Examples:&#10;• Response was factually incorrect about...&#10;• Did not answer my actual question&#10;• Hallucinated information&#10;• Ignored previous context&#10;• Missing important details"
            className="w-full h-48 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
          
          <div className="flex justify-between items-center text-sm">
            <span className={`${
              remainingChars < 100 
                ? 'text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              {remainingChars} characters remaining
            </span>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !explanation.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSending ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>📤</span>
                <span>Send Report</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### 3. Integration into LlmInfoDialogNew.tsx

**Modifications**:

```tsx
// ui-new/src/components/LlmInfoDialogNew.tsx

import { FixResponseDialog } from './FixResponseDialog';

// Add state
const [showFixDialog, setShowFixDialog] = useState(false);

// Add button in header (next to "Copy All JSON")
<div className="flex items-center gap-3">
  <button
    onClick={handleCopyAll}
    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
  >
    {copiedAll ? '✅ Copied All!' : '📋 Copy All JSON'}
  </button>
  
  {/* NEW: Fix Response button */}
  <button
    onClick={() => setShowFixDialog(true)}
    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
  >
    <span>🚩</span>
    <span>Fix Response</span>
  </button>
  
  <button onClick={onClose}>×</button>
</div>

// Add dialog component (before closing tag)
<FixResponseDialog
  isOpen={showFixDialog}
  onClose={() => setShowFixDialog(false)}
  messageData={{
    messageId: apiCalls[0]?.metadata?.messageId || generateId(),
    messageContent: apiCalls[0]?.response?.choices?.[0]?.message?.content || '',
    llmApiCalls: apiCalls,
    evaluations: evaluations,
    conversationThread: conversationThread, // Need to pass this from ChatTab
    userEmail: userEmail // From auth context
  }}
/>
```

**Note**: Need to thread `conversationThread` and `userEmail` through props from ChatTab → LlmInfoDialogNew → FixResponseDialog

---

## Data Structure

### Report Payload

```typescript
interface ErrorReport {
  // Metadata
  timestamp: string;              // ISO 8601 timestamp
  userEmail: string;              // User who reported
  
  // User input
  explanation: string;            // User's description of the issue (max 2000 chars)
  
  // Message context
  messageData: {
    messageId: string;            // Unique message identifier
    messageContent: string;       // Assistant's response text (truncated to 50K if needed)
    
    // LLM calls (same format as "Copy All JSON")
    llmApiCalls: Array<{
      callNumber: number;
      type: string;
      provider: string;
      model: string;
      timestamp: string;
      request: any;
      response: any;
      httpHeaders?: any;
      httpStatus?: number;
      cost?: number;
      durationMs?: number;
      metadata?: any;
    }>;
    
    // Evaluations (if any)
    evaluations?: Array<{
      type: string;
      result: any;
    }>;
    
    // Full conversation thread (for debugging context)
    // NOTE: May be very large (>50K chars) and require sharding
    conversationThread: Message[];
  };
}
```

**Note on Data Size**: The combined conversation thread and debug data may exceed Google Sheets' 50,000 character cell limit. The backend automatically shards large payloads across multiple rows.

### Google Sheets Row Format

**Sheet Name**: "Reported Errors"

**Schema**: Multi-row format to handle Google Sheets 50,000 character cell limit

**Primary Row Columns** (A-G):

| Column | Field | Type | Description |
|--------|-------|------|-------------|
| A | Report ID | String | Unique identifier (UUID) for grouping sharded rows |
| B | Row Type | String | "PRIMARY" or "SHARD_{N}" (e.g., "SHARD_1", "SHARD_2") |
| C | Timestamp | DateTime | When report was submitted (ISO 8601) |
| D | User Email | String | User who reported the issue |
| E | Explanation | String | User's description (max 2000 chars, never sharded) |
| F | Message Content | String | Assistant's response text (may be truncated if >50K) |
| G | Data Chunk | JSON String | Conversation/debug data (sharded if >50K chars) |

**Sharding Strategy**:

When conversation thread JSON or debug data exceeds 50,000 characters:
1. **Primary row** contains: Report ID, "PRIMARY", timestamp, user, explanation, message content, first 50K of data
2. **Shard rows** contain: Same Report ID, "SHARD_1"/"SHARD_2"/etc., empty fields except Data Chunk with continuation

**Example - Normal Report (fits in one row)**:

```
A: 550e8400-e29b-41d4-a716-446655440000
B: PRIMARY
C: 2025-10-27T14:32:15.123Z
D: user@example.com
E: Response was factually incorrect about the capital of France...
F: The capital of France is Lyon, which is known for its cuisine...
G: {"conversationThread":[...],"debugData":{...}}
```

**Example - Large Report (3 rows total)**:

```
Row 1 (Primary):
A: 550e8400-e29b-41d4-a716-446655440001
B: PRIMARY
C: 2025-10-27T14:32:15.123Z
D: user@example.com
E: Very long conversation context was ignored...
F: [Assistant response text, truncated to 50K if needed]
G: {"conversationThread":[... first 50K chars of JSON ...]

Row 2 (Shard 1):
A: 550e8400-e29b-41d4-a716-446655440001
B: SHARD_1
C: [empty]
D: [empty]
E: [empty]
F: [empty]
G: [... next 50K chars of JSON ...]

Row 3 (Shard 2):
A: 550e8400-e29b-41d4-a716-446655440001
B: SHARD_2
C: [empty]
D: [empty]
E: [empty]
F: [empty]
G: [... remaining JSON ...]"}
```

**Reassembly**:

When reading reports, group rows by Report ID and concatenate Data Chunk values in order:
```javascript
const fullData = primaryRow.dataChunk + shard1Row.dataChunk + shard2Row.dataChunk;
const parsed = JSON.parse(fullData);
```

---

## Google Sheets Integration

### Backend Implementation

**File**: `src/services/error-reporter.js` (new file)

```javascript
// src/services/error-reporter.js

const https = require('https');
const { v4: uuidv4 } = require('uuid'); // Add to package.json dependencies

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SHEET_NAME = 'Reported Errors';
const MAX_CELL_LENGTH = 50000; // Google Sheets limit per cell

/**
 * Ensure "Reported Errors" sheet exists in the spreadsheet
 */
async function ensureErrorReportSheetExists(accessToken) {
  // 1. Get spreadsheet metadata
  const metadata = await getSpreadsheetMetadata(accessToken);
  
  // 2. Check if "Reported Errors" sheet exists
  const sheetExists = metadata.sheets.some(
    sheet => sheet.properties.title === SHEET_NAME
  );
  
  if (!sheetExists) {
    // 3. Create the sheet
    await createSheet(SHEET_NAME, accessToken);
    
    // 4. Add header row
    await addHeaderRow(accessToken);
  }
}

/**
 * Get spreadsheet metadata
 */
async function getSpreadsheetMetadata(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sheets.googleapis.com',
      path: `/v4/spreadsheets/${SPREADSHEET_ID}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Failed to get metadata: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

/**
 * Create a new sheet tab
 */
async function createSheet(sheetName, accessToken) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      requests: [{
        addSheet: {
          properties: {
            title: sheetName
          }
        }
      }]
    });
    
    const options = {
      hostname: 'sheets.googleapis.com',
      path: `/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ Created sheet: ${sheetName}`);
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Failed to create sheet: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Add header row to Reported Errors sheet
 */
async function addHeaderRow(accessToken) {
  const headers = [
    'Report ID',
    'Row Type',
    'Timestamp',
    'User Email',
    'Explanation',
    'Message Content',
    'Data Chunk'
  ];
  
  return appendToSheet([headers], accessToken);
}

/**
 * Append rows to sheet
 */
async function appendToSheet(rows, accessToken) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      values: rows
    });
    
    const range = encodeURIComponent(`${SHEET_NAME}!A:F`);
    
    const options = {
      hostname: 'sheets.googleapis.com',
      path: `/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ Appended ${rows.length} row(s) to ${SHEET_NAME}`);
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Failed to append: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Shard large data into multiple rows if needed
 * @param {string} data - JSON string that may exceed cell limit
 * @returns {Array<string>} Array of data chunks (each ≤ 50K chars)
 */
function shardLargeData(data) {
  const chunks = [];
  let remainingData = data;
  
  while (remainingData.length > 0) {
    const chunk = remainingData.slice(0, MAX_CELL_LENGTH);
    chunks.push(chunk);
    remainingData = remainingData.slice(MAX_CELL_LENGTH);
  }
  
  return chunks;
}

/**
 * Log error report to Google Sheets (with sharding support)
 */
async function logErrorReport(report, accessToken) {
  // Ensure sheet exists
  await ensureErrorReportSheetExists(accessToken);
  
  // Generate unique report ID
  const reportId = uuidv4();
  
  // Combine conversation thread and debug data into single JSON
  const combinedData = JSON.stringify({
    conversationThread: report.messageData.conversationThread,
    debugData: {
      llmApiCalls: report.messageData.llmApiCalls,
      evaluations: report.messageData.evaluations
    }
  });
  
  // Truncate message content if too long
  const messageContent = report.messageData.messageContent.length > MAX_CELL_LENGTH
    ? report.messageData.messageContent.slice(0, MAX_CELL_LENGTH - 100) + '... [TRUNCATED]'
    : report.messageData.messageContent;
  
  // Shard combined data if needed
  const dataChunks = shardLargeData(combinedData);
  
  console.log(`📊 Report data size: ${combinedData.length} chars, shards: ${dataChunks.length}`);
  
  // Prepare rows
  const rows = [];
  
  // Primary row (always includes metadata)
  rows.push([
    reportId,                    // A: Report ID
    'PRIMARY',                   // B: Row Type
    report.timestamp,            // C: Timestamp
    report.userEmail,            // D: User Email
    report.explanation,          // E: Explanation
    messageContent,              // F: Message Content (truncated if needed)
    dataChunks[0]                // G: First chunk of data
  ]);
  
  // Shard rows (if data was split)
  for (let i = 1; i < dataChunks.length; i++) {
    rows.push([
      reportId,                  // A: Same Report ID
      `SHARD_${i}`,              // B: Row Type (SHARD_1, SHARD_2, etc.)
      '',                        // C: Empty
      '',                        // D: Empty
      '',                        // E: Empty
      '',                        // F: Empty
      dataChunks[i]              // G: Continuation of data
    ]);
  }
  
  // Append all rows at once
  await appendToSheet(rows, accessToken);
  
  console.log(`✅ Logged error report from ${report.userEmail} (${rows.length} row${rows.length > 1 ? 's' : ''})`);
  
  return reportId;
}

module.exports = {
  logErrorReport,
  ensureErrorReportSheetExists
};
```

---

### Backend API Endpoint

**File**: `src/index.js` (add new endpoint)

```javascript
// src/index.js

const { logErrorReport } = require('./services/error-reporter');

// Add to route handling
if (event.path === '/report-error' && event.httpMethod === 'POST') {
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    
    // Validate required fields
    if (!body.userEmail || !body.explanation || !body.messageData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Missing required fields: userEmail, explanation, messageData'
        })
      };
    }
    
    // Get OAuth token from Authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing or invalid authorization' })
      };
    }
    
    const accessToken = authHeader.substring(7);
    
    // Verify token (use existing verifyGoogleToken function)
    const userData = await verifyGoogleToken(accessToken);
    
    // Ensure user email matches (prevent spoofing)
    if (userData.email !== body.userEmail) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User email mismatch' })
      };
    }
    
    // Log to Google Sheets
    await logErrorReport(body, accessToken);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Error report logged successfully'
      })
    };
    
  } catch (error) {
    console.error('Error logging report:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to log error report',
        details: error.message
      })
    };
  }
}
```

---

## Review Infrastructure

### 1. Manual Review Access

**Direct Link to Sheet**:
```
https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit#gid={REPORTED_ERRORS_SHEET_ID}
```

**Bookmark**: Save in browser for quick access

### 2. Review Script (Node.js)

**File**: `scripts/review-reported-errors.js` (new file)

```javascript
#!/usr/bin/env node

/**
 * Review Reported Errors Script
 * 
 * Fetch and display reported errors from Google Sheets for Copilot review
 * 
 * Usage:
 *   node scripts/review-reported-errors.js
 *   node scripts/review-reported-errors.js --limit 10
 *   node scripts/review-reported-errors.js --user user@example.com
 *   node scripts/review-reported-errors.js --since 2025-10-20
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SHEET_NAME = 'Reported Errors';

async function fetchReportedErrors(accessToken, options = {}) {
  const range = `${SHEET_NAME}!A:G`; // Updated to 7 columns
  
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: 'sheets.googleapis.com',
      path: `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };
    
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          const rows = result.values || [];
          
          // Skip header row and group by Report ID
          const reports = assembleShardedReports(rows.slice(1));
          
          resolve(applyFilters(reports, options));
        } else {
          reject(new Error(`Failed to fetch: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

/**
 * Assemble sharded rows back into complete reports
 * @param {Array} rows - All rows from sheet (excluding header)
 * @returns {Array} Complete reports with reassembled data
 */
function assembleShardedReports(rows) {
  // Group rows by Report ID
  const reportGroups = {};
  
  rows.forEach((row, index) => {
    const reportId = row[0];
    const rowType = row[1];
    
    if (!reportGroups[reportId]) {
      reportGroups[reportId] = {
        primary: null,
        shards: []
      };
    }
    
    if (rowType === 'PRIMARY') {
      reportGroups[reportId].primary = {
        rowIndex: index + 2, // +2 for header and 0-based index
        reportId: reportId,
        timestamp: row[2],
        userEmail: row[3],
        explanation: row[4],
        messageContent: row[5],
        dataChunk: row[6] || ''
      };
    } else if (rowType && rowType.startsWith('SHARD_')) {
      reportGroups[reportId].shards.push({
        shardNumber: parseInt(rowType.split('_')[1]),
        dataChunk: row[6] || ''
      });
    }
  });
  
  // Reassemble complete reports
  const reports = [];
  
  Object.values(reportGroups).forEach(group => {
    if (!group.primary) {
      console.warn('⚠️ Found shards without primary row, skipping');
      return;
    }
    
    // Sort shards by number
    group.shards.sort((a, b) => a.shardNumber - b.shardNumber);
    
    // Concatenate data chunks
    let fullData = group.primary.dataChunk;
    group.shards.forEach(shard => {
      fullData += shard.dataChunk;
    });
    
    // Parse combined JSON
    let conversationThread = [];
    let debugData = {};
    
    try {
      const parsed = JSON.parse(fullData);
      conversationThread = parsed.conversationThread || [];
      debugData = parsed.debugData || {};
    } catch (error) {
      console.error(`❌ Failed to parse data for report ${group.primary.reportId}:`, error.message);
      console.error(`   Data length: ${fullData.length} chars`);
    }
    
    reports.push({
      rowIndex: group.primary.rowIndex,
      reportId: group.primary.reportId,
      timestamp: group.primary.timestamp,
      userEmail: group.primary.userEmail,
      explanation: group.primary.explanation,
      messageContent: group.primary.messageContent,
      conversationThread: conversationThread,
      debugData: debugData,
      shardCount: 1 + group.shards.length // Primary + shards
    });
  });
  
  return reports;
}

function applyFilters(reports, options) {
  let filtered = reports;
  
  // Filter by user
  if (options.user) {
    filtered = filtered.filter(r => r.userEmail === options.user);
  }
  
  // Filter by date
  if (options.since) {
    const sinceDate = new Date(options.since);
    filtered = filtered.filter(r => new Date(r.timestamp) >= sinceDate);
  }
  
  // Limit results
  if (options.limit) {
    filtered = filtered.slice(0, parseInt(options.limit));
  }
  
  return filtered;
}

function displayReport(report, index) {
  console.log('\n' + '='.repeat(80));
  console.log(`REPORT #${index + 1} (Row ${report.rowIndex}${report.shardCount > 1 ? ` + ${report.shardCount - 1} shard rows` : ''})`);
  console.log('='.repeat(80));
  console.log(`🆔 Report ID: ${report.reportId}`);
  console.log(`📅 Date: ${report.timestamp}`);
  console.log(`👤 User: ${report.userEmail}`);
  if (report.shardCount > 1) {
    console.log(`📊 Data Shards: ${report.shardCount} rows (large conversation)`);
  }
  console.log(`\n🚩 User Explanation:\n${report.explanation}`);
  console.log(`\n💬 Assistant Response:\n${report.messageContent.substring(0, 500)}${report.messageContent.length > 500 ? '...' : ''}`);
  console.log(`\n🔍 LLM Calls: ${report.debugData.llmApiCalls?.length || 0}`);
  console.log(`📊 Conversation Messages: ${report.conversationThread.length}`);
  console.log('='.repeat(80));
}

function exportToFile(reports, filename) {
  const exportData = {
    exportDate: new Date().toISOString(),
    totalReports: reports.length,
    reports: reports
  };
  
  fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
  console.log(`\n✅ Exported ${reports.length} reports to ${filename}`);
}

async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = args[++i];
    } else if (args[i] === '--user' && args[i + 1]) {
      options.user = args[++i];
    } else if (args[i] === '--since' && args[i + 1]) {
      options.since = args[++i];
    } else if (args[i] === '--export' && args[i + 1]) {
      options.export = args[++i];
    }
  }
  
  // Get access token from environment
  const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('❌ Error: GOOGLE_OAUTH_ACCESS_TOKEN not set in .env');
    process.exit(1);
  }
  
  console.log('📥 Fetching reported errors...');
  
  try {
    const reports = await fetchReportedErrors(accessToken, options);
    
    console.log(`\n✅ Found ${reports.length} reported error(s)`);
    
    if (reports.length === 0) {
      console.log('No reports match the filters.');
      return;
    }
    
    // Display each report
    reports.forEach((report, index) => displayReport(report, index));
    
    // Export if requested
    if (options.export) {
      exportToFile(reports, options.export);
    }
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Reports: ${reports.length}`);
    
    const userCounts = {};
    reports.forEach(r => {
      userCounts[r.userEmail] = (userCounts[r.userEmail] || 0) + 1;
    });
    
    console.log('\nReports by User:');
    Object.entries(userCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([user, count]) => {
        console.log(`  ${user}: ${count}`);
      });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
```

**Make executable**:
```bash
chmod +x scripts/review-reported-errors.js
```

**Usage Examples**:

```bash
# View all reported errors
node scripts/review-reported-errors.js

# View last 10 reports
node scripts/review-reported-errors.js --limit 10

# View reports from specific user
node scripts/review-reported-errors.js --user user@example.com

# View reports since date
node scripts/review-reported-errors.js --since 2025-10-20

# Export to JSON file
node scripts/review-reported-errors.js --export reported-errors.json

# Combined filters
node scripts/review-reported-errors.js --since 2025-10-20 --limit 5 --export recent-errors.json
```

---

### 3. Copilot Review Workflow

**Recommended Workflow**:

1. **Daily Review**:
   ```bash
   node scripts/review-reported-errors.js --since $(date -d "yesterday" +%Y-%m-%d)
   ```

2. **Weekly Deep Dive**:
   ```bash
   node scripts/review-reported-errors.js --since $(date -d "7 days ago" +%Y-%m-%d) --export weekly-errors.json
   ```

3. **Ask Copilot to Analyze**:
   ```
   Prompt: "Review the reported errors in weekly-errors.json and identify:
   1. Common patterns or issues
   2. Specific bugs to fix
   3. Model selection problems
   4. Prompt engineering improvements
   5. Top 3 priority fixes"
   ```

4. **Pattern Detection**:
   - Group by error type (factual, context, hallucination, etc.)
   - Identify which models/providers have most issues
   - Track if errors correlate with specific prompts or tool usage

5. **Action Items**:
   - Create GitHub issues for bugs
   - Update system prompts based on patterns
   - Adjust model selection logic
   - Improve guardrails or validation

---

### 4. Makefile Commands

**Add to Makefile**:

```makefile
# View reported errors
.PHONY: review-errors
review-errors:
	@echo "📋 Reviewing reported errors..."
	node scripts/review-reported-errors.js

# View recent errors (last 24 hours)
.PHONY: review-errors-recent
review-errors-recent:
	@echo "📋 Reviewing recent errors (last 24h)..."
	node scripts/review-reported-errors.js --since $$(date -d "yesterday" +%Y-%m-%d)

# Export all errors to JSON
.PHONY: export-errors
export-errors:
	@echo "📤 Exporting all errors..."
	node scripts/review-reported-errors.js --export reported-errors-$$(date +%Y%m%d).json
	@echo "✅ Exported to reported-errors-$$(date +%Y%m%d).json"
```

**Usage**:
```bash
make review-errors         # View all errors
make review-errors-recent  # View last 24h
make export-errors         # Export to dated JSON file
```

---

## Security & Privacy

### 1. Authentication & Authorization

**Token Verification**:
- Verify OAuth token on every `/report-error` request
- Ensure `userEmail` in payload matches authenticated user
- Prevent spoofing or unauthorized reports

**Implementation** (already exists in `src/index.js`):
```javascript
const userData = await verifyGoogleToken(accessToken);

if (userData.email !== body.userEmail) {
  return {
    statusCode: 403,
    body: JSON.stringify({ error: 'User email mismatch' })
  };
}
```

---

### 2. Data Privacy

**What Gets Logged**:
- ✅ User's email (for tracking and follow-up)
- ✅ User's explanation (their input)
- ✅ Assistant's response content
- ✅ Full conversation thread (for context)
- ✅ LLM API calls (request/response data)

**Privacy Considerations**:
- Data stored in admin-controlled Google Sheets (not public)
- Only accessible by project maintainers
- No automatic sharing or third-party access
- Users should be aware reports include full conversation

**User Consent**:
Add notice in FixResponseDialog:

```tsx
<div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
  <p className="text-blue-900 dark:text-blue-100">
    ℹ️ <strong>Privacy Notice:</strong> Your report will include this conversation's 
    full context and will be reviewed by the development team to improve the system. 
    Please do not include sensitive personal information in your explanation.
  </p>
</div>
```

---

### 3. Rate Limiting

**Prevent Spam**:

**Frontend** (simple client-side throttle):
```typescript
// Track last report time per session
const REPORT_COOLDOWN_MS = 60000; // 1 minute
let lastReportTime = 0;

const handleSend = async () => {
  const now = Date.now();
  if (now - lastReportTime < REPORT_COOLDOWN_MS) {
    showError('Please wait before submitting another report');
    return;
  }
  
  lastReportTime = now;
  // ... rest of send logic
};
```

**Backend** (optional, more robust):
```javascript
// Track reports per user in memory (or DynamoDB for persistence)
const reportCounts = new Map(); // userEmail -> { count, resetTime }

function checkRateLimit(userEmail) {
  const now = Date.now();
  const userLimit = reportCounts.get(userEmail);
  
  if (!userLimit || now > userLimit.resetTime) {
    // Reset every hour
    reportCounts.set(userEmail, {
      count: 1,
      resetTime: now + 3600000 // 1 hour
    });
    return true;
  }
  
  if (userLimit.count >= 10) { // Max 10 reports per hour
    return false;
  }
  
  userLimit.count++;
  return true;
}
```

---

### 4. Input Validation

**Sanitize User Input**:

```javascript
function validateReportData(body) {
  const errors = [];
  
  // Validate userEmail
  if (!body.userEmail || !body.userEmail.includes('@')) {
    errors.push('Invalid user email');
  }
  
  // Validate explanation
  if (!body.explanation || body.explanation.trim().length === 0) {
    errors.push('Explanation is required');
  }
  
  if (body.explanation.length > 2000) {
    errors.push('Explanation too long (max 2000 characters)');
  }
  
  // Validate messageData structure
  if (!body.messageData || typeof body.messageData !== 'object') {
    errors.push('Invalid message data');
  }
  
  if (!Array.isArray(body.messageData.llmApiCalls)) {
    errors.push('Invalid LLM API calls data');
  }
  
  return errors;
}

// In /report-error endpoint:
const validationErrors = validateReportData(body);
if (validationErrors.length > 0) {
  return {
    statusCode: 400,
    body: JSON.stringify({ errors: validationErrors })
  };
}
```

---

## Implementation Steps

### Phase 1: Backend Foundation (2-3 hours)

1. **Install Dependencies** ✅
   ```bash
   npm install uuid  # For generating Report IDs
   ```

2. **Create Error Reporter Service** ✅
   - File: `src/services/error-reporter.js`
   - Functions: `ensureErrorReportSheetExists()`, `logErrorReport()`, `shardLargeData()`
   - Sheet creation, header setup, append logic with sharding support

3. **Add API Endpoint** ✅
   - Modify: `src/index.js`
   - Route: `POST /report-error`
   - Authentication, validation, logging

3. **Test Backend** ✅
   ```bash
   # Test with curl
   curl -X POST https://your-lambda-url.com/report-error \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "userEmail": "test@example.com",
       "explanation": "Test report",
       "messageData": {
         "messageContent": "Test response",
         "llmApiCalls": [],
         "conversationThread": []
       },
       "timestamp": "2025-10-27T14:00:00Z"
     }'
   ```

4. **Verify Google Sheets** ✅
   - Check "Reported Errors" sheet created
   - Verify header row
   - Confirm test data appears

---

### Phase 2: UI Components (3-4 hours)

5. **Create FixResponseDialog Component** ✅
   - File: `ui-new/src/components/FixResponseDialog.tsx`
   - Props interface, textarea, send button
   - Toast notifications, loading state

6. **Integrate into LlmInfoDialogNew** ✅
   - Add "Fix Response" button in header
   - Pass conversation context through props
   - State management for dialog visibility

7. **Thread Props from ChatTab** ✅
   - Modify: `ui-new/src/components/ChatTab.tsx`
   - Pass `conversationThread` to LlmInfoDialogNew
   - Pass `userEmail` from auth context

8. **Style and Polish** ✅
   - Dark mode support
   - Responsive layout
   - Loading animations
   - Error states

---

### Phase 3: Review Infrastructure (1-2 hours)

9. **Create Review Script** ✅
   - File: `scripts/review-reported-errors.js`
   - Fetch, filter, display functions
   - Export to JSON

10. **Add Makefile Commands** ✅
    - `make review-errors`
    - `make review-errors-recent`
    - `make export-errors`

11. **Test Review Workflow** ✅
    ```bash
    make review-errors
    make export-errors
    ```

12. **Document Usage** ✅
    - Update README with review instructions
    - Add to developer_log

---

### Phase 4: Testing & Deployment (1-2 hours)

13. **End-to-End Testing** ✅
    - Submit test report from UI
    - Verify appears in Google Sheets
    - Test review script retrieval
    - Verify all data fields populated correctly

14. **Error Handling Testing** ✅
    - Test with missing auth token
    - Test with invalid data
    - Test rate limiting
    - Test network failures

15. **Deploy Backend** ✅
    ```bash
    make deploy-lambda-fast
    ```

16. **Deploy Frontend** ✅
    ```bash
    make deploy-ui
    ```

---

## Testing Plan

### Unit Tests

**File**: `tests/unit/error-reporter.test.js`

```javascript
const { logErrorReport } = require('../../src/services/error-reporter');

describe('Error Reporter', () => {
  test('formats report data correctly', () => {
    const report = {
      timestamp: '2025-10-27T14:00:00Z',
      userEmail: 'test@example.com',
      explanation: 'Test explanation',
      messageData: {
        messageContent: 'Test response',
        llmApiCalls: [],
        conversationThread: []
      }
    };
    
    // Test that row data is formatted correctly
    // Mock appendToSheet and verify it's called with correct data
  });
  
  test('validates required fields', async () => {
    const invalidReport = {
      userEmail: 'test@example.com'
      // Missing explanation and messageData
    };
    
    await expect(logErrorReport(invalidReport, 'token'))
      .rejects.toThrow();
  });
});
```

---

### Integration Tests

**File**: `tests/integration/report-error-endpoint.test.js`

```javascript
describe('POST /report-error', () => {
  test('accepts valid report with auth', async () => {
    const response = await fetch(`${API_URL}/report-error`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(validReport)
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
  
  test('rejects report without auth', async () => {
    const response = await fetch(`${API_URL}/report-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validReport)
    });
    
    expect(response.status).toBe(401);
  });
  
  test('rejects mismatched user email', async () => {
    const report = {
      ...validReport,
      userEmail: 'different@example.com'
    };
    
    const response = await fetch(`${API_URL}/report-error`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenForUser1}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(report)
    });
    
    expect(response.status).toBe(403);
  });
});
```

---

### Manual Testing Checklist

- [ ] Open LLM Info dialog on assistant message
- [ ] Click "Fix Response" button
- [ ] Dialog opens with textarea
- [ ] Type explanation (test character counter)
- [ ] Click "Send Report"
- [ ] See loading state (spinning icon)
- [ ] Success toast appears
- [ ] Dialog closes
- [ ] Check Google Sheets - new row appears
- [ ] Verify all columns populated correctly
- [ ] **Test with large conversation** (>50K chars):
  - [ ] Verify multiple rows created (PRIMARY + SHARD_1, SHARD_2, etc.)
  - [ ] Verify Report ID is same across all shard rows
  - [ ] Verify Row Type column shows PRIMARY and SHARD_N
  - [ ] Run review script - data reassembles correctly
- [ ] Run `make review-errors` - report appears with correct data
- [ ] Verify shard count shown in display (e.g., "Row 5 + 2 shard rows")
- [ ] Test rate limiting (submit multiple quickly)
- [ ] Test without authentication (should fail)
- [ ] Test in dark mode (styling correct)
- [ ] Test on mobile (responsive layout)

---

## Future Enhancements

### 1. Report Categories

Add predefined categories for classification:

```tsx
<select className="...">
  <option value="factual_error">Factual Error</option>
  <option value="hallucination">Hallucination</option>
  <option value="missing_context">Missing Context</option>
  <option value="wrong_tone">Wrong Tone</option>
  <option value="incomplete">Incomplete Answer</option>
  <option value="other">Other</option>
</select>
```

Add category column to Google Sheets for easier filtering.

---

### 2. Severity Ratings

Allow users to rate severity:

```tsx
<div>
  <label>Severity:</label>
  <div className="flex gap-2">
    <button className={severity === 'low' ? 'selected' : ''}>
      Low
    </button>
    <button className={severity === 'medium' ? 'selected' : ''}>
      Medium
    </button>
    <button className={severity === 'high' ? 'selected' : ''}>
      High
    </button>
  </div>
</div>
```

---

### 3. Automated Analysis

Use LLM to analyze reported errors:

```javascript
// scripts/analyze-reported-errors.js

async function analyzeReports(reports) {
  // Group by similarity
  const clusters = await clusterByEmbedding(reports);
  
  // Summarize each cluster
  const summaries = await Promise.all(
    clusters.map(cluster => summarizeCluster(cluster))
  );
  
  // Generate recommendations
  const recommendations = await generateRecommendations(summaries);
  
  return { clusters, summaries, recommendations };
}
```

---

### 4. User Feedback Loop

After fixing an issue, notify users:

- Email notification: "We fixed the issue you reported!"
- In-app notification
- Show improvement metrics

---

### 5. Public Roadmap Integration

Add "Mark as Fixed" button in review script:
- Updates sheet with "Status" column
- Automatically creates GitHub issue
- Links to roadmap/changelog

---

### 6. Analytics Dashboard

Create visualization of error trends:
- Chart: Reports over time
- Heatmap: Error types by model
- Top users reporting (power users/testers)
- Resolution rate

---

## Success Metrics

**User Engagement**:
- Number of reports submitted per week
- Percentage of users who report at least one issue
- Average explanation length (quality indicator)

**Quality Improvement**:
- Time from report to fix
- Number of bugs identified through reports
- Reduction in similar reports over time

**System Health**:
- Which models generate most reports
- Which features/tools have most issues
- Pattern detection success rate

---

## Conclusion

This comprehensive bad response reporting system provides:

✅ **Easy User Feedback**: One-click reporting from LLM Info dialog  
✅ **Rich Context**: Full conversation + debug data for effective troubleshooting  
✅ **Centralized Logging**: Google Sheets integration for easy access  
✅ **Developer Tools**: Command-line scripts for efficient review  
✅ **Copilot Integration**: Export to JSON for AI-assisted analysis  
✅ **Privacy & Security**: Authentication, validation, rate limiting  
✅ **Scalability**: Extensible for future analytics and automation  

**Estimated Implementation Time**: 7-11 hours  
**Technical Complexity**: Medium  
**User Impact**: High (continuous improvement feedback loop)  

---

## Quick Reference

### Key Files

**Backend**:
- `src/services/error-reporter.js` - Sheet management and logging
- `src/index.js` - `/report-error` endpoint

**Frontend**:
- `ui-new/src/components/FixResponseDialog.tsx` - Report dialog
- `ui-new/src/components/LlmInfoDialogNew.tsx` - Integration point
- `ui-new/src/components/ChatTab.tsx` - Prop threading

**Scripts**:
- `scripts/review-reported-errors.js` - Review CLI tool
- `Makefile` - `review-errors`, `review-errors-recent`, `export-errors`

### Commands

```bash
# Review all errors
make review-errors

# Review recent errors
make review-errors-recent

# Export errors to JSON
make export-errors

# Deploy changes
make deploy-lambda-fast  # Backend
make deploy-ui           # Frontend
```

### Google Sheets Structure

**Sheet Name**: "Reported Errors"  
**Columns**: Timestamp | User Email | Explanation | Message Content | Conversation Thread JSON | Debug Data JSON

---

**END OF PLAN**
