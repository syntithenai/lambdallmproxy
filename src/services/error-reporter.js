/**
 * Error Reporter Service
 * 
 * Logs user-reported LLM response errors to Google Sheets with automatic data sharding
 * for large conversations (>50K characters per cell limit).
 * 
 * Uses service account authentication (same as google-sheets-logger.js)
 */

const https = require('https');
const crypto = require('crypto');

// Use first spreadsheet from GS_SHEET_IDS for error reporting
const SPREADSHEET_ID = (process.env.GS_SHEET_IDS || process.env.GS_SHEET_ID || '').split(',')[0].trim();
const SHEET_NAME = 'Reported Errors';
const MAX_CELL_LENGTH = 5000; // Google Sheets limit per cell

/**
 * Get OAuth2 access token using Service Account JWT
 * @param {string} serviceAccountEmail - Service account email
 * @param {string} privateKey - Service account private key
 * @returns {Promise<string>} Access token
 */
async function getAccessToken(serviceAccountEmail, privateKey) {
  const jwt = require('jsonwebtoken');
  
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  
  const token = jwt.sign(claim, privateKey, { algorithm: 'RS256' });
  
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token
    }).toString();
    
    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 60000,
      family: 4
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(data);
          resolve(response.access_token);
        } else {
          reject(new Error(`OAuth failed: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('OAuth request timeout after 60 seconds'));
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Generate unique report ID (UUID v4)
 * @returns {string} UUID
 */
function generateReportId() {
  return crypto.randomUUID();
}

/**
 * Ensure "Reported Errors" sheet exists in the spreadsheet
 * @param {string} accessToken - Google OAuth access token
 */
async function ensureErrorReportSheetExists(accessToken) {
  // 1. Get spreadsheet metadata
  const metadata = await getSpreadsheetMetadata(accessToken);
  
  // 2. Check if "Reported Errors" sheet exists
  const sheetExists = metadata.sheets.some(
    sheet => sheet.properties.title === SHEET_NAME
  );
  
  if (!sheetExists) {
    console.log(`📋 Creating "${SHEET_NAME}" sheet...`);
    
    // 3. Create the sheet
    await createSheet(SHEET_NAME, accessToken);
    
    // 4. Add header row
    await addHeaderRow(accessToken);
    
    console.log(`✅ Created "${SHEET_NAME}" sheet with headers`);
  }
}

/**
 * Get spreadsheet metadata
 * @param {string} accessToken - Google OAuth access token
 * @returns {Promise<object>} Spreadsheet metadata
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
          reject(new Error(`Failed to get metadata: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

/**
 * Create a new sheet tab
 * @param {string} sheetName - Name of the sheet to create
 * @param {string} accessToken - Google OAuth access token
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
          reject(new Error(`Failed to create sheet: ${res.statusCode} - ${data}`));
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
 * @param {string} accessToken - Google OAuth access token
 */
async function addHeaderRow(accessToken) {
  const headers = [
    'Report ID',
    'Row Type',
    'Timestamp',
    'User Email',
    'Feedback Type',
    'Explanation',
    'Message Content',
    'Data Chunk'
  ];
  
  return appendToSheet([headers], accessToken);
}

/**
 * Append rows to sheet
 * @param {Array<Array>} rows - Rows to append
 * @param {string} accessToken - Google OAuth access token
 */
async function appendToSheet(rows, accessToken) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      values: rows
    });
    
    const range = encodeURIComponent(`${SHEET_NAME}!A:H`);
    
    const options = {
      hostname: 'sheets.googleapis.com',
      // eslint-disable-next-line no-secrets/no-secrets
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
 * Shard large data into multiple chunks if needed
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
 * @param {object} report - Error report data
 * @returns {Promise<string>} Report ID
 */
async function logErrorReport(report) {
  // Get service account credentials
  const serviceAccountEmail = process.env.GS_EMAIL;
  const privateKey = (process.env.GS_KEY || '').replace(/\\n/g, '\n');
  
  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Missing service account credentials (GS_EMAIL or GS_KEY)');
  }
  
  // Get access token using service account
  const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
  
  // Ensure sheet exists
  await ensureErrorReportSheetExists(accessToken);
  
  // Generate unique report ID
  const reportId = generateReportId();
  
  // Determine feedback type (default to 'negative' for backward compatibility)
  const feedbackType = report.feedbackType || 'negative';
  
  // Combine conversation thread and debug data into single JSON
  const combinedData = JSON.stringify({
    conversationThread: report.messageData.conversationThread,
    debugData: {
      llmApiCalls: report.messageData.llmApiCalls,
      evaluations: report.messageData.evaluations || []
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
    feedbackType,                // E: Feedback Type (positive/negative)
    report.explanation || '',    // F: Explanation (empty for positive feedback)
    messageContent,              // G: Message Content (truncated if needed)
    dataChunks[0]                // H: First chunk of data
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
      '',                        // G: Empty
      dataChunks[i]              // H: Continuation of data
    ]);
  }
  
  // Append all rows at once
  await appendToSheet(rows, accessToken);
  
  console.log(`✅ Logged ${feedbackType} feedback from ${report.userEmail} (${rows.length} row${rows.length > 1 ? 's' : ''})`);
  
  return reportId;
}

module.exports = {
  logErrorReport,
  ensureErrorReportSheetExists,
  shardLargeData,
  generateReportId
};
