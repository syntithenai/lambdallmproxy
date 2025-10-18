/**
 * RAG Sync Endpoint
 * 
 * Handles bidirectional sync between client and Google Sheets
 * for RAG snippets and embeddings.
 */

const { initSheetsClient, saveSnippetToSheets, loadSnippetsFromSheets, bulkSaveSnippetsToSheets, deleteSnippetFromSheets } = require('../rag/sheets-storage');

/**
 * Lambda handler for RAG sync operations
 * @param {object} event - Lambda event
 * @param {object} responseStream - Response stream
 * @returns {Promise<void>}
 */
exports.handler = async (event, responseStream) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { operation, userEmail, deviceId, data, lastSync } = body;
    
    if (!userEmail) {
      const errorResponse = {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'userEmail is required' }),
      };
      responseStream.write(JSON.stringify(errorResponse));
      responseStream.end();
      return;
    }

    // Initialize Google Sheets client
    const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS || '{}');
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!credentials.client_email || !spreadsheetId) {
      const errorResponse = {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Google Sheets not configured' }),
      };
      responseStream.write(JSON.stringify(errorResponse));
      responseStream.end();
      return;
    }

    const sheets = initSheetsClient(credentials);
    
    // Route to appropriate handler
    let result;
    
    switch (operation) {
      case 'push-snippets':
        result = await handlePushSnippets(sheets, spreadsheetId, data, userEmail, deviceId);
        break;
        
      case 'pull-snippets':
        result = await handlePullSnippets(sheets, spreadsheetId, userEmail);
        break;
        
      case 'delete-snippet':
        result = await handleDeleteSnippet(sheets, spreadsheetId, data.snippetId, userEmail);
        break;
        
      case 'full-sync':
        result = await handleFullSync(sheets, spreadsheetId, data, userEmail, deviceId, lastSync);
        break;
        
      case 'get-sync-status':
        result = await handleGetSyncStatus(sheets, spreadsheetId, userEmail);
        break;
        
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
    
    // Send success response
    const successResponse = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(result),
    };
    
    responseStream.write(JSON.stringify(successResponse));
    responseStream.end();
    
  } catch (error) {
    console.error('RAG Sync Error:', error);
    
    const errorResponse = {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: error.message || 'Internal server error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
    };
    
    responseStream.write(JSON.stringify(errorResponse));
    responseStream.end();
  }
};

/**
 * Push snippets to Google Sheets
 */
async function handlePushSnippets(sheets, spreadsheetId, snippets, userEmail, deviceId) {
  if (!Array.isArray(snippets) || snippets.length === 0) {
    return { count: 0, message: 'No snippets to push' };
  }
  
  console.log(`📤 Pushing ${snippets.length} snippets for ${userEmail}...`);
  
  // Use bulk save for efficiency
  const count = await bulkSaveSnippetsToSheets(sheets, spreadsheetId, snippets, userEmail, deviceId);
  
  return {
    count,
    message: `Successfully pushed ${count} snippets`,
  };
}

/**
 * Pull snippets from Google Sheets
 */
async function handlePullSnippets(sheets, spreadsheetId, userEmail) {
  console.log(`📥 Pulling snippets for ${userEmail}...`);
  
  const snippets = await loadSnippetsFromSheets(sheets, spreadsheetId, userEmail);
  
  return {
    snippets,
    count: snippets.length,
    message: `Successfully pulled ${snippets.length} snippets`,
  };
}

/**
 * Delete a snippet from Google Sheets
 */
async function handleDeleteSnippet(sheets, spreadsheetId, snippetId, userEmail) {
  console.log(`🗑️ Deleting snippet ${snippetId} for ${userEmail}...`);
  
  const deleted = await deleteSnippetFromSheets(sheets, spreadsheetId, snippetId, userEmail);
  
  return {
    deleted,
    message: deleted ? 'Snippet deleted successfully' : 'Snippet not found',
  };
}

/**
 * Full bidirectional sync
 */
async function handleFullSync(sheets, spreadsheetId, localSnippets, userEmail, deviceId, lastSync) {
  console.log(`🔄 Full sync for ${userEmail}...`);
  
  // Get remote snippets
  const remoteSnippets = await loadSnippetsFromSheets(sheets, spreadsheetId, userEmail);
  
  // Determine what needs to be synced
  const localMap = new Map(localSnippets.map(s => [s.id, s]));
  const remoteMap = new Map(remoteSnippets.map(s => [s.id, s]));
  
  const toUpload = [];
  const toDownload = [];
  
  // Check local snippets
  for (const snippet of localSnippets) {
    const remoteSnippet = remoteMap.get(snippet.id);
    
    if (!remoteSnippet) {
      // New local snippet - upload it
      toUpload.push(snippet);
    } else {
      // Exists in both - check timestamps
      const localTime = snippet.updateDate || snippet.timestamp;
      const remoteTime = remoteSnippet.updateDate || remoteSnippet.timestamp;
      
      if (localTime > remoteTime) {
        // Local is newer - upload
        toUpload.push(snippet);
      } else if (remoteTime > localTime) {
        // Remote is newer - download
        toDownload.push(remoteSnippet);
      }
    }
  }
  
  // Check remote snippets for new ones
  for (const snippet of remoteSnippets) {
    if (!localMap.has(snippet.id)) {
      // New remote snippet - download it
      toDownload.push(snippet);
    }
  }
  
  // Upload new/updated snippets
  if (toUpload.length > 0) {
    await bulkSaveSnippetsToSheets(sheets, spreadsheetId, toUpload, userEmail, deviceId);
  }
  
  return {
    snippetsPushed: toUpload.length,
    snippetsPulled: toDownload.length,
    toDownload, // Return snippets to download
    message: `Sync complete: ${toUpload.length} pushed, ${toDownload.length} pulled`,
  };
}

/**
 * Get sync status
 */
async function handleGetSyncStatus(sheets, spreadsheetId, userEmail) {
  const { getLastSyncTimestamp } = require('../rag/sheets-storage');
  
  const lastSync = await getLastSyncTimestamp(sheets, spreadsheetId, userEmail, 'snippet');
  const snippets = await loadSnippetsFromSheets(sheets, spreadsheetId, userEmail);
  
  return {
    lastSync,
    snippetCount: snippets.length,
    message: 'Sync status retrieved successfully',
  };
}
