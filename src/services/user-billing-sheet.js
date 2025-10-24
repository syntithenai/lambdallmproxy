/**
 * User Billing Sheet Service
 * Manages user's personal "Research Agent Billing" sheet in their Google Drive
 * 
 * This service creates and maintains a billing sheet in the user's own Google Drive,
 * giving them direct access to their API usage and cost data.
 */

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { OAuth2Client } = require('google-auth-library');

/**
 * Create a configured OAuth2 client with an access token
 * @param {string} accessToken - The Google OAuth2 access token
 * @returns {OAuth2Client} Configured OAuth2 client
 */
function createOAuth2Client(accessToken) {
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage' // Special redirect URI for client-side OAuth
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

/**
 * Helper to call Google Drive REST API
 * @param {string} accessToken - OAuth access token
 * @param {string} endpoint - API endpoint path
 * @param {object} options - Fetch options
 * @returns {Promise<object>} API response
 */
async function callDriveAPI(accessToken, endpoint, options = {}) {
  const url = `https://www.googleapis.com/drive/v3${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Drive API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}


/**
 * Find or create a folder in user's Google Drive
 * @param {string} folderName - Name of the folder
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string>} Folder ID
 */
async function findOrCreateFolder(folderName, accessToken) {
  console.log('🔑🔑🔑 findOrCreateFolder CALLED - folderName:', folderName);
  console.log('🔑🔑🔑 accessToken present:', !!accessToken);
  
  // Search for existing folder
  const searchQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchResponse = await callDriveAPI(
    accessToken,
    `/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name)&spaces=drive`
  );
  
  if (searchResponse.files && searchResponse.files.length > 0) {
    console.log(`📁 Found existing folder: ${folderName}`);
    return searchResponse.files[0].id;
  }
  
  // Create new folder
  const createResponse = await callDriveAPI(
    accessToken,
    '/files',
    {
      method: 'POST',
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    }
  );
  
  console.log(`📁 Created new folder: ${folderName}`);
  return createResponse.id;
}

/**
 * Find a spreadsheet in a specific folder
 * @param {string} fileName - Name of the spreadsheet
 * @param {string} folderId - Parent folder ID
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string|null>} Spreadsheet ID or null if not found
 */
async function findSheetInFolder(fileName, folderId, accessToken) {
  const searchQuery = `name='${fileName}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const response = await callDriveAPI(
    accessToken,
    `/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name)&spaces=drive`
  );
  
  if (response.files && response.files.length > 0) {
    console.log(`📊 Found existing spreadsheet: ${fileName}`);
    return response.files[0].id;
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
  // Create OAuth2 client
  const auth = createOAuth2Client(accessToken);
  
  // Create new spreadsheet using google-spreadsheet
  const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(auth, {
    title: 'Research Agent Billing'
  });
  
  const spreadsheetId = doc.spreadsheetId;
  console.log(`📊 Created new billing spreadsheet: ${spreadsheetId}`);
  
  // Move to folder using Drive API
  await callDriveAPI(
    accessToken,
    `/files/${spreadsheetId}?addParents=${folderId}&fields=id,parents`,
    { method: 'PATCH' }
  );
  
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
  const auth = createOAuth2Client(accessToken);
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();
  
  // Get first sheet and rename to "Transactions"
  const sheet = doc.sheetsByIndex[0];
  await sheet.updateProperties({ title: 'Transactions' });
  
  // Set frozen rows
  await sheet.updateGridProperties({ frozenRowCount: 1 });
  
  // Add header row
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
  
  await sheet.setHeaderRow(headers);
  
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
    
    const auth = createOAuth2Client(accessToken);
    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    await doc.loadInfo();
    
    // Get Transactions sheet
    const sheet = doc.sheetsByTitle['Transactions'];
    if (!sheet) {
      throw new Error('Transactions sheet not found');
    }
    
    // Prepare row data
    const rowData = {
      'Timestamp': logData.timestamp || new Date().toISOString(),
      'Type': logData.type || 'chat',
      'Provider': logData.provider || 'unknown',
      'Model': logData.model || 'unknown',
      'Tokens In': logData.promptTokens || 0,
      'Tokens Out': logData.completionTokens || 0,
      'Total Tokens': logData.totalTokens || 0,
      'Cost ($)': logData.cost ? logData.cost.toFixed(6) : '0.000000',
      'Duration (ms)': logData.durationMs || 0,
      'Memory Limit (MB)': logData.memoryLimitMB || '',
      'Memory Used (MB)': logData.memoryUsedMB || '',
      'Request ID': logData.requestId || '',
      'Status': logData.status || 'success',
      'Error': logData.error || ''
    };
    
    // Add row
    await sheet.addRow(rowData);
    
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
    
    const auth = createOAuth2Client(accessToken);
    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    await doc.loadInfo();
    
    // Get Transactions sheet
    const sheet = doc.sheetsByTitle['Transactions'];
    if (!sheet) {
      return [];
    }
    
    // Get all rows
    const rows = await sheet.getRows();
    
    if (rows.length === 0) {
      return [];
    }
    
    // Parse rows into transaction objects
    let transactions = rows.map((row, index) => ({
      rowIndex: row.rowNumber,
      timestamp: row.get('Timestamp') || '',
      type: row.get('Type') || 'chat',
      provider: row.get('Provider') || 'unknown',
      model: row.get('Model') || 'unknown',
      tokensIn: parseInt(row.get('Tokens In')) || 0,
      tokensOut: parseInt(row.get('Tokens Out')) || 0,
      totalTokens: parseInt(row.get('Total Tokens')) || 0,
      cost: parseFloat(row.get('Cost ($)')) || 0,
      durationMs: parseInt(row.get('Duration (ms)')) || 0,
      memoryLimitMB: parseInt(row.get('Memory Limit (MB)')) || 0,
      memoryUsedMB: parseInt(row.get('Memory Used (MB)')) || 0,
      requestId: row.get('Request ID') || '',
      status: row.get('Status') || 'success',
      error: row.get('Error') || ''
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
    
    const auth = createOAuth2Client(accessToken);
    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    await doc.loadInfo();
    
    // Get Transactions sheet
    const sheet = doc.sheetsByTitle['Transactions'];
    if (!sheet) {
      throw new Error('Transactions sheet not found');
    }
    
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
    
    // Clear all data rows
    await sheet.clearRows();
    
    // Write back kept rows
    if (toKeep.length > 0) {
      const rowsToAdd = toKeep.map(t => ({
        'Timestamp': t.timestamp,
        'Type': t.type,
        'Provider': t.provider,
        'Model': t.model,
        'Tokens In': t.tokensIn,
        'Tokens Out': t.tokensOut,
        'Total Tokens': t.totalTokens,
        'Cost ($)': t.cost,
        'Duration (ms)': t.durationMs,
        'Memory Limit (MB)': t.memoryLimitMB || '',
        'Memory Used (MB)': t.memoryUsedMB || '',
        'Request ID': t.requestId || '',
        'Status': t.status,
        'Error': t.error || ''
      }));
      
      await sheet.addRows(rowsToAdd);
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
