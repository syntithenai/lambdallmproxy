/**
 * Google Sheets Snippets Service
 * Manages user's personal "Research Agent Swag" snippets in their Google Drive
 * 
 * Spreadsheet location: "Research Agent/Research Agent Swag"
 * Sheet name: "Snippets"
 * 
 * Schema:
 * - id (auto-incrementing number)
 * - user_email (owner email - for multi-tenancy)
 * - project_id (optional project filter - for multi-tenancy)
 * - created_at (ISO timestamp)
 * - updated_at (ISO timestamp)
 * - title (string)
 * - content (text, can be multiline)
 * - tags (comma-separated string)
 * - source ('chat', 'url', 'file', 'manual')
 * - url (optional URL if source='url')
 */

const { google } = require('googleapis');
const { validateUserEmail, filterByUserAndProject, logUserAccess } = require('./user-isolation');

// In-memory cache for spreadsheet ID (per user/session)
const spreadsheetCache = new Map();

/**
 * Find or create a folder in user's Google Drive
 * @param {string} folderName - Name of the folder
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string>} Folder ID
 */
async function findOrCreateFolder(folderName, accessToken) {
  const drive = google.drive({
    version: 'v3',
    auth: new google.auth.OAuth2()
  });
  
  drive.context._options.auth.setCredentials({ access_token: accessToken });
  
  // Search for existing folder
  const searchResponse = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });
  
  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    console.log(`📁 Snippets: Found existing folder "${folderName}"`);
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
  
  console.log(`📁 Snippets: Created new folder "${folderName}"`);
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
  const drive = google.drive({
    version: 'v3',
    auth: new google.auth.OAuth2()
  });
  
  drive.context._options.auth.setCredentials({ access_token: accessToken });
  
  const response = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });
  
  if (response.data.files && response.data.files.length > 0) {
    console.log(`📊 Snippets: Found existing spreadsheet "${fileName}"`);
    return response.data.files[0].id;
  }
  
  return null;
}

/**
 * Create snippets spreadsheet with proper schema
 * @param {string} folderId - Parent folder ID
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string>} Spreadsheet ID
 */
async function createSnippetsSpreadsheet(folderId, accessToken) {
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  // Create spreadsheet
  const createResponse = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'Research Agent Swag'
      },
      sheets: [{
        properties: {
          title: 'Snippets',
          gridProperties: {
            frozenRowCount: 1,
            columnCount: 8
          }
        }
      }]
    }
  });
  
  const spreadsheetId = createResponse.data.spreadsheetId;
  console.log(`📊 Snippets: Created new spreadsheet with ID: ${spreadsheetId}`);
  
  // Move to folder
  const drive = google.drive({
    version: 'v3',
    auth: new google.auth.OAuth2()
  });
  drive.context._options.auth.setCredentials({ access_token: accessToken });
  
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: folderId,
    fields: 'id, parents'
  });
  
  // Initialize headers and formatting
  await initializeSnippetsSheet(spreadsheetId, accessToken);
  
  return spreadsheetId;
}

/**
 * Initialize snippets sheet with headers and formatting
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} accessToken - User's OAuth access token
 */
async function initializeSnippetsSheet(spreadsheetId, accessToken) {
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  // Get the actual sheet ID for "Snippets" sheet
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties'
  });
  
  const snippetsSheet = spreadsheet.data.sheets?.find(
    sheet => sheet.properties?.title === 'Snippets'
  );
  
  if (!snippetsSheet || !snippetsSheet.properties) {
    throw new Error('Snippets sheet not found');
  }
  
  const sheetId = snippetsSheet.properties.sheetId;
  console.log(`📊 Snippets: Found sheet with ID ${sheetId}`);
  
  const headers = [
    'ID',
    'User Email',
    'Project ID',
    'Created At',
    'Updated At',
    'Title',
    'Content',
    'Tags',
    'Source',
    'URL'
  ];
  
  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Snippets!A1:J1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers]
    }
  });
  
  // Format headers: bold, blue background, frozen
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetId, // Use actual sheet ID
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 8
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.26, green: 0.52, blue: 0.96 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                horizontalAlignment: 'LEFT'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        }
      ]
    }
  });
  
  console.log('📊 Snippets: Initialized sheet with headers and formatting');
}

/**
 * Ensure "Snippets" sheet exists in spreadsheet, create if missing
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} accessToken - User's OAuth access token
 */
async function ensureSnippetsSheetExists(spreadsheetId, accessToken) {
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  try {
    // Get spreadsheet metadata to check existing sheets
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });
    
    // Check if "Snippets" sheet exists
    const snippetsSheet = spreadsheet.data.sheets?.find(
      sheet => sheet.properties?.title === 'Snippets'
    );
    
    if (snippetsSheet) {
      console.log('📊 Snippets: "Snippets" sheet already exists');
      return;
    }
    
    // Create "Snippets" sheet
    console.log('📊 Snippets: Creating missing "Snippets" sheet in existing spreadsheet');
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: 'Snippets',
              gridProperties: {
                frozenRowCount: 1,
                columnCount: 8
              }
            }
          }
        }]
      }
    });
    
    // Initialize the new sheet with headers and formatting
    await initializeSnippetsSheet(spreadsheetId, accessToken);
    
    console.log('📊 Snippets: Successfully created and initialized "Snippets" sheet');
  } catch (error) {
    console.error('❌ Snippets: Error ensuring sheet exists:', error.message);
    throw error;
  }
}

/**
 * Get or create snippets spreadsheet for user
 * @param {string} userEmail - User's email (for cache key)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} { spreadsheetId, spreadsheetUrl }
 */
async function getOrCreateSnippetsSheet(userEmail, accessToken) {
  // Check cache
  const cacheKey = `${userEmail}`;
  if (spreadsheetCache.has(cacheKey)) {
    const cached = spreadsheetCache.get(cacheKey);
    console.log(`📊 Snippets: Using cached spreadsheet ID for ${userEmail}`);
    return cached;
  }
  
  try {
    // Find or create "Research Agent" folder
    const folderId = await findOrCreateFolder('Research Agent', accessToken);
    
    // Find or create "Research Agent Swag" spreadsheet
    let spreadsheetId = await findSheetInFolder('Research Agent Swag', folderId, accessToken);
    
    if (!spreadsheetId) {
      // Create new spreadsheet with Snippets sheet
      spreadsheetId = await createSnippetsSpreadsheet(folderId, accessToken);
    } else {
      // Existing spreadsheet found - ensure "Snippets" sheet exists
      await ensureSnippetsSheetExists(spreadsheetId, accessToken);
    }
    
    const result = {
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    };
    
    // Cache result
    spreadsheetCache.set(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error('❌ Snippets: Error getting/creating spreadsheet:', error.message);
    throw error;
  }
}

/**
 * Get next available ID from sheet
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<number>} Next ID
 */
async function getNextId(spreadsheetId, accessToken) {
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  // Read all IDs (column A)
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Snippets!A2:A'
  });
  
  if (!response.data.values || response.data.values.length === 0) {
    return 1; // First snippet
  }
  
  // Find max ID
  const ids = response.data.values
    .map(row => parseInt(row[0], 10))
    .filter(id => !isNaN(id));
  
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

/**
 * Insert a new snippet
 * @param {Object} params - Snippet parameters
 * @param {string} params.title - Snippet title
 * @param {string} params.content - Snippet content
 * @param {string[]} params.tags - Array of tags
 * @param {string} params.source - Source type ('chat', 'url', 'file', 'manual')
 * @param {string} params.url - Optional URL
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} Created snippet
 */
async function insertSnippet({ title, content, tags = [], source = 'manual', url = '' }, userEmail, projectId, accessToken) {
  try {
    validateUserEmail(userEmail);
    
    const { spreadsheetId } = await getOrCreateSnippetsSheet(userEmail, accessToken);
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    const id = await getNextId(spreadsheetId, accessToken);
    const now = new Date().toISOString();
    const tagsStr = Array.isArray(tags) ? tags.map(t => t.toLowerCase()).sort().join(', ') : '';
    
    const row = [
      id,
      userEmail,
      projectId || '',
      now,
      now,
      title || '',
      content || '',
      tagsStr,
      source,
      url || ''
    ];
    
    // Append row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Snippets!A:J',
      valueInputOption: 'RAW',
      requestBody: {
        values: [row]
      }
    });
    
    logUserAccess('created', 'snippet', id.toString(), userEmail, projectId);
    console.log(`✅ Snippets: Inserted snippet #${id}: "${title}" for ${userEmail}${projectId ? ` (project: ${projectId})` : ''}`);
    
    return {
      id,
      user_email: userEmail,
      project_id: projectId,
      created_at: now,
      updated_at: now,
      title,
      content,
      tags,
      source,
      url
    };
  } catch (error) {
    console.error('❌ Snippets: Error inserting snippet:', error.message);
    throw new Error(`Failed to insert snippet: ${error.message}`);
  }
}

/**
 * Update an existing snippet
 * @param {number} id - Snippet ID
 * @param {Object} updates - Fields to update
 * @param {string} userEmail - User's email
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} Updated snippet
 */
async function updateSnippet(id, updates, userEmail, accessToken) {
  try {
    const { spreadsheetId } = await getOrCreateSnippetsSheet(userEmail, accessToken);
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    // Find row by ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Snippets!A:H'
    });
    
    if (!response.data.values || response.data.values.length < 2) {
      throw new Error('Snippet not found');
    }
    
    const rowIndex = response.data.values.findIndex((row, idx) => 
      idx > 0 && parseInt(row[0], 10) === id
    );
    
    if (rowIndex === -1) {
      throw new Error(`Snippet with ID ${id} not found`);
    }
    
    const existingRow = response.data.values[rowIndex];
    const now = new Date().toISOString();
    
    // Build updated row
    const updatedRow = [
      id,
      existingRow[1], // Keep original created_at
      now, // Update updated_at
      updates.title !== undefined ? updates.title : existingRow[3],
      updates.content !== undefined ? updates.content : existingRow[4],
      updates.tags !== undefined ? (Array.isArray(updates.tags) ? updates.tags.map(t => t.toLowerCase()).sort().join(', ') : updates.tags) : existingRow[5],
      updates.source !== undefined ? updates.source : existingRow[6],
      updates.url !== undefined ? updates.url : existingRow[7]
    ];
    
    // Update row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Snippets!A${rowIndex + 1}:H${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [updatedRow]
      }
    });
    
    console.log(`✅ Snippets: Updated snippet #${id}`);
    
    return {
      id,
      created_at: updatedRow[1],
      updated_at: updatedRow[2],
      title: updatedRow[3],
      content: updatedRow[4],
      tags: updatedRow[5] ? updatedRow[5].split(', ').filter(Boolean) : [],
      source: updatedRow[6],
      url: updatedRow[7]
    };
  } catch (error) {
    console.error('❌ Snippets: Error updating snippet:', error.message);
    throw new Error(`Failed to update snippet: ${error.message}`);
  }
}

/**
 * Remove a snippet by ID or title
 * @param {Object} params - Deletion parameters
 * @param {number} params.id - Snippet ID (optional)
 * @param {string} params.title - Snippet title (optional)
 * @param {string} userEmail - User's email
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} Deleted snippet info
 */
async function removeSnippet({ id, title }, userEmail, accessToken) {
  try {
    const { spreadsheetId } = await getOrCreateSnippetsSheet(userEmail, accessToken);
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    // Read all snippets
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Snippets!A:H'
    });
    
    if (!response.data.values || response.data.values.length < 2) {
      throw new Error('No snippets found');
    }
    
    // Filter out the snippet to remove
    const headers = response.data.values[0];
    const rows = response.data.values.slice(1);
    
    const rowToRemove = rows.find(row => {
      if (id !== undefined) {
        return parseInt(row[0], 10) === id;
      }
      if (title !== undefined) {
        return row[3] === title;
      }
      return false;
    });
    
    if (!rowToRemove) {
      throw new Error('Snippet not found');
    }
    
    const filteredRows = rows.filter(row => row !== rowToRemove);
    
    // Clear and rewrite sheet
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Snippets!A2:H'
    });
    
    if (filteredRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Snippets!A2',
        valueInputOption: 'RAW',
        requestBody: {
          values: filteredRows
        }
      });
    }
    
    console.log(`✅ Snippets: Removed snippet #${rowToRemove[0]}: "${rowToRemove[3]}"`);
    
    return {
      id: parseInt(rowToRemove[0], 10),
      title: rowToRemove[3]
    };
  } catch (error) {
    console.error('❌ Snippets: Error removing snippet:', error.message);
    throw new Error(`Failed to remove snippet: ${error.message}`);
  }
}

/**
 * Get a snippet by ID or title
 * @param {Object} params - Query parameters
 * @param {number} params.id - Snippet ID (optional)
 * @param {string} params.title - Snippet title (optional)
 * @param {string} userEmail - User's email
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object|null>} Snippet or null
 */
async function getSnippet({ id, title }, userEmail, accessToken) {
  try {
    const { spreadsheetId } = await getOrCreateSnippetsSheet(userEmail, accessToken);
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Snippets!A:H'
    });
    
    if (!response.data.values || response.data.values.length < 2) {
      return null;
    }
    
    const rows = response.data.values.slice(1);
    const row = rows.find(r => {
      if (id !== undefined) {
        return parseInt(r[0], 10) === id;
      }
      if (title !== undefined) {
        return r[3] === title;
      }
      return false;
    });
    
    if (!row) {
      return null;
    }
    
    return {
      id: parseInt(row[0], 10),
      created_at: row[1],
      updated_at: row[2],
      title: row[3],
      content: row[4],
      tags: row[5] ? row[5].split(', ').filter(Boolean) : [],
      source: row[6],
      url: row[7] || ''
    };
  } catch (error) {
    console.error('❌ Snippets: Error getting snippet:', error.message);
    return null;
  }
}

/**
 * Search snippets by query and/or tags
 * @param {Object} params - Search parameters
 * @param {string} params.query - Text query (searches title and content)
 * @param {string[]} params.tags - Tags filter (AND logic)
 * @param {string} userEmail - User's email
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Array>} Array of matching snippets
 */
async function searchSnippets({ query, tags = [] }, userEmail, accessToken) {
  try {
    console.log('🔍 Snippets: Starting search...', {
      query: query,
      tags: tags,
      userEmail: userEmail,
      hasAccessToken: !!accessToken
    });
    
    const { spreadsheetId } = await getOrCreateSnippetsSheet(userEmail, accessToken);
    console.log('📊 Snippets: Using spreadsheet:', spreadsheetId);
    
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Snippets!A:H'
    });
    
    console.log('📊 Snippets: Raw response:', {
      hasValues: !!response.data.values,
      rowCount: response.data.values?.length || 0
    });
    
    if (!response.data.values || response.data.values.length < 2) {
      console.log('⚠️ Snippets: No data rows found (only header or empty)');
      return [];
    }
    
    const rows = response.data.values.slice(1);
    console.log(`📊 Snippets: Processing ${rows.length} data rows`);
    
    // Log first 3 rows as examples
    if (rows.length > 0) {
      console.log('📝 Example rows (first 3):');
      rows.slice(0, 3).forEach((row, idx) => {
        console.log(`  Row ${idx + 1}:`, {
          id: row[0],
          title: row[3],
          tags_raw: row[5],
          source: row[6]
        });
      });
    }
    
    // Normalize search params
    const queryLower = query ? query.toLowerCase() : '';
    const tagsLower = tags.map(t => t.toLowerCase());
    
    console.log('🔍 Search parameters:', {
      queryLower: queryLower,
      tagsLower: tagsLower
    });
    
    const results = rows
      .map(row => {
        // Handle tags in both formats:
        // 1. Comma-separated string: "tag1, tag2, tag3"
        // 2. JSON array (from Swag UI): ["tag1","tag2","tag3"]
        // 3. Comma-separated without spaces: "tag1,tag2,tag3"
        let tags = [];
        if (row[5]) {
          const tagValue = row[5].trim();
          if (tagValue.startsWith('[')) {
            // JSON array format
            try {
              tags = JSON.parse(tagValue);
            } catch (e) {
              console.warn('Failed to parse tags JSON:', tagValue);
              tags = [];
            }
          } else {
            // Comma-separated format - split by comma and trim each tag
            tags = tagValue.split(',').map(t => t.trim()).filter(Boolean);
          }
        }
        
        return {
          id: parseInt(row[0], 10),
          created_at: row[1],
          updated_at: row[2],
          title: row[3] || '',
          content: row[4] || '',
          tags: tags,
          source: row[6] || 'manual',
          url: row[7] || ''
        };
      })
      .filter(snippet => {
        // Text query match (title or content contains query)
        const textMatch = !queryLower || 
          snippet.title.toLowerCase().includes(queryLower) ||
          snippet.content.toLowerCase().includes(queryLower);
        
        // Tags match (all specified tags must be present) - case-insensitive
        const snippetTagsLower = snippet.tags.map(t => String(t).toLowerCase());
        const tagsMatch = tagsLower.length === 0 ||
          tagsLower.every(tag => snippetTagsLower.includes(tag));
        
        const matches = textMatch && tagsMatch;
        
        // Debug log for all searches to help troubleshoot
        if (queryLower || tagsLower.length > 0) {
          console.log(`🔍 Snippet "${snippet.title}":`, {
            tags: snippet.tags,
            tagsLower: snippetTagsLower,
            searchingFor: tagsLower,
            textMatch: textMatch,
            tagsMatch: tagsMatch,
            finalMatch: matches
          });
        }
        
        return matches;
      });
    
    console.log(`🔍 Snippets: Search found ${results.length} results (query: "${query}", tags: [${tags.join(', ')}])`);
    
    return results;
  } catch (error) {
    console.error('❌ Snippets: Error searching snippets:', error.message);
    console.error('❌ Snippets: Error stack:', error.stack);
    return [];
  }
}

/**
 * Initialize service (can be called to pre-warm cache)
 * @param {string} userEmail - User's email
 * @param {string} accessToken - User's OAuth access token
 */
async function init(userEmail, accessToken) {
  try {
    await getOrCreateSnippetsSheet(userEmail, accessToken);
    console.log(`✅ Snippets: Service initialized for ${userEmail}`);
  } catch (error) {
    console.error('❌ Snippets: Error initializing service:', error.message);
    throw error;
  }
}

module.exports = {
  init,
  insertSnippet,
  updateSnippet,
  removeSnippet,
  getSnippet,
  searchSnippets,
  getOrCreateSnippetsSheet
};
