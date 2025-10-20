/**
 * User Billing Sheet Service
 * Manages user's personal "Research Agent Billing" sheet in their Google Drive
 * 
 * This service creates and maintains a billing sheet in the user's own Google Drive,
 * giving them direct access to their API usage and cost data.
 */

const { google } = require('googleapis');

/**
 * Create a configured OAuth2 client with an access token
 * @param {string} accessToken - The Google OAuth2 access token
 * @returns {google.auth.OAuth2} Configured OAuth2 client
 */
function createOAuth2Client(accessToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage' // Special redirect URI for client-side OAuth
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}


/**
 * Find or create a folder in user's Google Drive
 * @param {string} folderName - Name of the folder
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string>} Folder ID
 */
async function findOrCreateFolder(folderName, accessToken) {
  console.log('🔑🔑🔑 findOrCreateFolder CALLED - folderName:', folderName);
  console.log('🔑🔑🔑 accessToken type:', typeof accessToken);
  console.log('🔑🔑🔑 accessToken present:', !!accessToken);
  console.log('🔑🔑🔑 accessToken length:', accessToken?.length || 0);
  if (accessToken) {
    console.log('🔑🔑🔑 accessToken preview:', accessToken.substring(0, 30) + '...');
  }
  
  // Create OAuth2 client with proper credentials
  console.log('🔑🔑🔑 Creating OAuth2 client with client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...');
  const oauth2Client = createOAuth2Client(accessToken);
  
  console.log('🔑🔑🔑 OAuth2 credentials set:', JSON.stringify(oauth2Client.credentials));
  
  const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
  });
  
  console.log('🔑🔑🔑 Drive client created, about to make API call...');
  
  // Search for existing folder
  const searchResponse = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });
  
  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    console.log(`📁 Found existing folder: ${folderName}`);
    return searchResponse.data.files[0].id;
  }
  
  // Create new folder
  const createResponse = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id'
  });
  
  console.log(`📁 Created new folder: ${folderName}`);
  return createResponse.data.id;
}

/**
 * Find a spreadsheet in a specific folder
 * @param {string} fileName - Name of the spreadsheet
 * @param {string} folderId - Parent folder ID
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string|null>} Spreadsheet ID or null if not found
 */
async function findSheetInFolder(fileName, folderId, accessToken) {
  const oauth2Client = createOAuth2Client(accessToken);
  
  const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
  });
  
  const response = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });
  
  if (response.data.files && response.data.files.length > 0) {
    console.log(`📊 Found existing spreadsheet: ${fileName}`);
    return response.data.files[0].id;
  }
  
  return null;
}

/**
 * Create a new billing sheet with proper headers
 * @param {string} folderId - Parent folder ID
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string>} Spreadsheet ID
 */
async function createBillingSheet(folderId, accessToken) {
  const oauth2Client = createOAuth2Client(accessToken);
  
  const sheets = google.sheets({
    version: 'v4',
    auth: oauth2Client
  });
  
  // Create spreadsheet
  const createResponse = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'Research Agent Billing'
      },
      sheets: [{
        properties: {
          title: 'Transactions',
          gridProperties: {
            frozenRowCount: 1 // Freeze header row
          }
        }
      }]
    }
  });
  
  const spreadsheetId = createResponse.data.spreadsheetId;
  console.log(`📊 Created new billing spreadsheet: ${spreadsheetId}`);
  
  // Move to folder - reuse the same OAuth2 client
  const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
  });
  
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: folderId,
    fields: 'id, parents'
  });
  
  // Initialize with headers
  await initializeBillingSheet(spreadsheetId, accessToken);
  
  return spreadsheetId;
}

/**
 * Initialize billing sheet with headers
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} accessToken - User's OAuth access token
 */
async function initializeBillingSheet(spreadsheetId, accessToken) {
  const oauth2Client = createOAuth2Client(accessToken);
  
  const sheets = google.sheets({
    version: 'v4',
    auth: oauth2Client
  });
  
  const headers = [
    'Timestamp',
    'Type',
    'Provider',
    'Model',
    'Tokens In',
    'Tokens Out',
    'Total Tokens',
    'Cost ($)',
    'Duration (ms)',
    'Memory Limit (MB)',
    'Memory Used (MB)',
    'Request ID',
    'Status',
    'Error'
  ];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Transactions!A1:N1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers]
    }
  });
  
  // Format header row
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 0,
            endRowIndex: 1
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.3, blue: 0.5 },
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true
              },
              horizontalAlignment: 'CENTER'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
        }
      }]
    }
  });
  
  console.log('✅ Initialized billing sheet with headers');
}

/**
 * Get or create user's billing sheet
 * @param {string} userEmail - User's email (for logging)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string>} Spreadsheet ID
 */
async function getOrCreateBillingSheet(userEmail, accessToken) {
  try {
    // 1. Find or create "Research Agent" folder
    const folderId = await findOrCreateFolder('Research Agent', accessToken);
    
    // 2. Find or create "Research Agent Billing" sheet
    let sheetId = await findSheetInFolder('Research Agent Billing', folderId, accessToken);
    
    if (!sheetId) {
      sheetId = await createBillingSheet(folderId, accessToken);
      console.log(`✅ Created billing sheet for user: ${userEmail}`);
    } else {
      console.log(`✅ Using existing billing sheet for user: ${userEmail}`);
    }
    
    return sheetId;
  } catch (error) {
    console.error('❌ Error getting/creating billing sheet:', error);
    throw error;
  }
}

/**
 * Log transaction to user's billing sheet
 * @param {string} accessToken - User's OAuth access token
 * @param {object} logData - Transaction data
 * @param {string} logData.timestamp - ISO timestamp
 * @param {string} logData.type - Type: chat, embedding, guardrail, planning
 * @param {string} logData.provider - Provider name
 * @param {string} logData.model - Model name
 * @param {number} logData.promptTokens - Input tokens
 * @param {number} logData.completionTokens - Output tokens
 * @param {number} logData.totalTokens - Total tokens
 * @param {number} logData.cost - Cost in USD
 * @param {number} logData.durationMs - Duration in milliseconds
 * @param {number} logData.memoryLimitMB - Lambda memory limit
 * @param {number} logData.memoryUsedMB - Memory used
 * @param {string} logData.requestId - Lambda request ID
 * @param {string} logData.status - success or error
 * @param {string} logData.error - Error message if any
 * @param {string} logData.userEmail - User email for sheet lookup
 */
async function logToBillingSheet(accessToken, logData) {
  try {
    // Get user's billing sheet
    const spreadsheetId = await getOrCreateBillingSheet(logData.userEmail, accessToken);
    
    const oauth2Client = createOAuth2Client(accessToken);
    
    const sheets = google.sheets({
      version: 'v4',
      auth: oauth2Client
    });
    
    // Prepare row data
    const rowData = [
      logData.timestamp || new Date().toISOString(),
      logData.type || 'chat',
      logData.provider || 'unknown',
      logData.model || 'unknown',
      logData.promptTokens || 0,
      logData.completionTokens || 0,
      logData.totalTokens || 0,
      logData.cost ? logData.cost.toFixed(6) : '0.000000',
      logData.durationMs || 0,
      logData.memoryLimitMB || '',
      logData.memoryUsedMB || '',
      logData.requestId || '',
      logData.status || 'success',
      logData.error || ''
    ];
    
    // Append to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Transactions!A:N',
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData]
      }
    });
    
    console.log(`✅ Logged transaction to user billing sheet: ${logData.type} - ${logData.provider}/${logData.model}`);
  } catch (error) {
    console.error('❌ Error logging to billing sheet:', error);
    // Don't throw - logging should not break the main flow
  }
}

/**
 * Read billing data from user's sheet
 * @param {string} accessToken - User's OAuth access token
 * @param {string} userEmail - User email for sheet lookup
 * @param {object} filters - Optional filters
 * @param {string} filters.startDate - Start date (ISO string)
 * @param {string} filters.endDate - End date (ISO string)
 * @param {string} filters.type - Transaction type filter
 * @param {string} filters.provider - Provider filter
 * @returns {Promise<Array>} Array of transactions
 */
async function readBillingData(accessToken, userEmail, filters = {}) {
  try {
    const spreadsheetId = await getOrCreateBillingSheet(userEmail, accessToken);
    
    const oauth2Client = createOAuth2Client(accessToken);
    
    const sheets = google.sheets({
      version: 'v4',
      auth: oauth2Client
    });
    
    // Read all data (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Transactions!A2:N'
    });
    
    if (!response.data.values || response.data.values.length === 0) {
      return [];
    }
    
    // Parse rows into transaction objects
    let transactions = response.data.values.map((row, index) => ({
      rowIndex: index + 2, // +2 because A2 is first data row
      timestamp: row[0] || '',
      type: row[1] || 'chat',
      provider: row[2] || 'unknown',
      model: row[3] || 'unknown',
      tokensIn: parseInt(row[4]) || 0,
      tokensOut: parseInt(row[5]) || 0,
      totalTokens: parseInt(row[6]) || 0,
      cost: parseFloat(row[7]) || 0,
      durationMs: parseInt(row[8]) || 0,
      memoryLimitMB: parseInt(row[9]) || 0,
      memoryUsedMB: parseInt(row[10]) || 0,
      requestId: row[11] || '',
      status: row[12] || 'success',
      error: row[13] || ''
    }));
    
    // Apply filters
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      transactions = transactions.filter(t => new Date(t.timestamp) >= startDate);
    }
    
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      transactions = transactions.filter(t => new Date(t.timestamp) <= endDate);
    }
    
    if (filters.type) {
      transactions = transactions.filter(t => t.type === filters.type);
    }
    
    if (filters.provider) {
      transactions = transactions.filter(t => t.provider === filters.provider);
    }
    
    return transactions;
  } catch (error) {
    console.error('❌ Error reading billing data:', error);
    throw error;
  }
}

/**
 * Clear billing data from user's sheet
 * @param {string} accessToken - User's OAuth access token
 * @param {string} userEmail - User email for sheet lookup
 * @param {object} options - Clear options
 * @param {string} options.mode - 'all', 'provider', or 'dateRange'
 * @param {string} options.provider - Provider name (for mode='provider')
 * @param {string} options.startDate - Start date (for mode='dateRange')
 * @param {string} options.endDate - End date (for mode='dateRange')
 * @returns {Promise<object>} Result with deletedCount and remainingCount
 */
async function clearBillingData(accessToken, userEmail, options = {}) {
  try {
    const spreadsheetId = await getOrCreateBillingSheet(userEmail, accessToken);
    
    const oauth2Client = createOAuth2Client(accessToken);
    
    const sheets = google.sheets({
      version: 'v4',
      auth: oauth2Client
    });
    
    // Read all current data
    const transactions = await readBillingData(accessToken, userEmail);
    
    let toDelete = [];
    let toKeep = [];
    
    if (options.mode === 'all') {
      // Delete everything
      toDelete = transactions;
      toKeep = [];
    } else if (options.mode === 'provider' && options.provider) {
      // Delete specific provider
      toDelete = transactions.filter(t => t.provider === options.provider);
      toKeep = transactions.filter(t => t.provider !== options.provider);
    } else if (options.mode === 'dateRange' && (options.startDate || options.endDate)) {
      // Delete date range
      toDelete = transactions.filter(t => {
        const txDate = new Date(t.timestamp);
        const afterStart = !options.startDate || txDate >= new Date(options.startDate);
        const beforeEnd = !options.endDate || txDate <= new Date(options.endDate);
        return afterStart && beforeEnd;
      });
      toKeep = transactions.filter(t => {
        const txDate = new Date(t.timestamp);
        const afterStart = !options.startDate || txDate >= new Date(options.startDate);
        const beforeEnd = !options.endDate || txDate <= new Date(options.endDate);
        return !(afterStart && beforeEnd);
      });
    } else {
      throw new Error('Invalid clear mode or missing parameters');
    }
    
    // Clear all data rows (keep headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Transactions!A2:N'
    });
    
    // Write back kept rows
    if (toKeep.length > 0) {
      const values = toKeep.map(t => [
        t.timestamp,
        t.type,
        t.provider,
        t.model,
        t.tokensIn,
        t.tokensOut,
        t.totalTokens,
        t.cost,
        t.durationMs,
        t.memoryLimitMB || '',
        t.memoryUsedMB || '',
        t.requestId || '',
        t.status,
        t.error || ''
      ]);
      
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Transactions!A2:N',
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }
    
    console.log(`✅ Cleared ${toDelete.length} transactions, kept ${toKeep.length}`);
    
    return {
      deletedCount: toDelete.length,
      remainingCount: toKeep.length
    };
  } catch (error) {
    console.error('❌ Error clearing billing data:', error);
    throw error;
  }
}

module.exports = {
  getOrCreateBillingSheet,
  logToBillingSheet,
  readBillingData,
  clearBillingData
};
