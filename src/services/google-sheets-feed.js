/**
 * Google Sheets Feed Service
 * Manages user's personalized AI feed items in their Google Drive
 * 
 * Spreadsheet location: "Research Agent/Feed Items"
 * Sheet name: "Feed"
 * 
 * Schema:
 * - id (unique identifier)
 * - user_email (owner email - for multi-tenancy)
 * - project_id (optional project filter - for multi-tenancy)
 * - created_at (ISO timestamp)
 * - updated_at (ISO timestamp)
 * - title (string)
 * - content (text, can be multiline)
 * - url (source URL)
 * - source (string - e.g., 'ai_generated', 'user_saved', 'imported')
 * - topics (comma-separated string)
 * - upvote_count (number)
 * - downvote_count (number)
 * - user_vote (string: 'up', 'down', or empty)
 * - is_blocked (boolean - user blocked this topic)
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
    console.log(`📁 Feed: Found existing folder "${folderName}"`);
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
  
  console.log(`📁 Feed: Created new folder "${folderName}"`);
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
    console.log(`📊 Feed: Found existing spreadsheet "${fileName}"`);
    return response.data.files[0].id;
  }
  
  return null;
}

/**
 * Create feed spreadsheet with proper schema
 * @param {string} folderId - Parent folder ID
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string>} Spreadsheet ID
 */
async function createFeedSpreadsheet(folderId, accessToken) {
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'Feed Items'
      },
      sheets: [{
        properties: {
          title: 'Feed'
        },
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: [{
            values: [
              { userEnteredValue: { stringValue: 'id' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'user_email' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'project_id' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'created_at' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'updated_at' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'title' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'content' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'url' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'source' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'topics' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'upvote_count' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'downvote_count' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'user_vote' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'is_blocked' }, userEnteredFormat: { textFormat: { bold: true } } }
            ]
          }]
        }]
      }]
    },
    fields: 'spreadsheetId'
  });
  
  const spreadsheetId = spreadsheet.data.spreadsheetId;
  
  // Move spreadsheet to folder
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
  
  console.log(`📊 Feed: Created new spreadsheet "Feed Items"`);
  return spreadsheetId;
}

/**
 * Get or create the feed spreadsheet
 * @param {string} userEmail - User's email (for cache key)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<{spreadsheetId: string}>}
 */
async function getOrCreateFeedSheet(userEmail, accessToken) {
  validateUserEmail(userEmail);
  
  const cacheKey = `${userEmail}`;
  
  if (spreadsheetCache.has(cacheKey)) {
    console.log(`📊 Feed: Using cached spreadsheet ID for ${userEmail}`);
    return { spreadsheetId: spreadsheetCache.get(cacheKey) };
  }
  
  // Find or create "Research Agent" folder
  const folderId = await findOrCreateFolder('Research Agent', accessToken);
  
  // Find or create "Feed Items" spreadsheet
  let spreadsheetId = await findSheetInFolder('Feed Items', folderId, accessToken);
  
  if (!spreadsheetId) {
    spreadsheetId = await createFeedSpreadsheet(folderId, accessToken);
  }
  
  // Cache the spreadsheet ID
  spreadsheetCache.set(cacheKey, spreadsheetId);
  
  return { spreadsheetId };
}

/**
 * Insert a new feed item
 * @param {Object} feedItem - Feed item object
 * @param {string} feedItem.title - Title
 * @param {string} feedItem.content - Content
 * @param {string} feedItem.url - Source URL
 * @param {string} feedItem.source - Source type
 * @param {string[]} feedItem.topics - Array of topics
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} Created feed item with ID
 */
async function insertFeedItem(feedItem, userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  const { spreadsheetId } = await getOrCreateFeedSheet(userEmail, accessToken);
  
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  // Generate ID (timestamp + random)
  const id = `feed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  
  const values = [[
    id,
    userEmail,
    projectId || '',
    now,
    now,
    feedItem.title || '',
    feedItem.content || '',
    feedItem.url || '',
    feedItem.source || 'user_saved',
    Array.isArray(feedItem.topics) ? feedItem.topics.join(', ') : '',
    0, // upvote_count
    0, // downvote_count
    '', // user_vote
    false // is_blocked
  ]];
  
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Feed!A:N',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
  
  logUserAccess('created', 'feed_item', id, userEmail, projectId);
  
  console.log(`✅ Feed: Inserted feed item ${id} for ${userEmail}${projectId ? ` (project: ${projectId})` : ''}`);
  
  return {
    id,
    user_email: userEmail,
    project_id: projectId,
    created_at: now,
    updated_at: now,
    ...feedItem,
    topics: Array.isArray(feedItem.topics) ? feedItem.topics : [],
    upvote_count: 0,
    downvote_count: 0,
    user_vote: '',
    is_blocked: false
  };
}

/**
 * Get all feed items for user (optionally filtered by project)
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Array>} Array of feed items
 */
async function getFeedItems(userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  try {
    const { spreadsheetId } = await getOrCreateFeedSheet(userEmail, accessToken);
    
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Feed!A:N'
    });
    
    const rows = response.data.values || [];
    
    if (rows.length <= 1) {
      // Only header or empty
      return [];
    }
    
    // Parse rows into objects
    const header = rows[0];
    const dataRows = rows.slice(1).map(row => {
      const obj = {};
      header.forEach((key, index) => {
        obj[key] = row[index] || '';
      });
      return obj;
    });
    
    // Filter by user email and optional project ID
    const filtered = filterByUserAndProject(dataRows, userEmail, projectId);
    
    // Parse topics back to array
    const feedItems = filtered.map(item => ({
      ...item,
      topics: item.topics ? item.topics.split(',').map(t => t.trim()).filter(Boolean) : [],
      upvote_count: parseInt(item.upvote_count) || 0,
      downvote_count: parseInt(item.downvote_count) || 0,
      is_blocked: item.is_blocked === 'true' || item.is_blocked === true
    }));
    
    logUserAccess('accessed', 'feed_items', `count:${feedItems.length}`, userEmail, projectId);
    
    return feedItems;
  } catch (error) {
    console.error('❌ Feed: Failed to get feed items:', error);
    // Return empty array if sheet doesn't exist yet
    return [];
  }
}

/**
 * Update a feed item (vote, block, etc.)
 * @param {string} itemId - Feed item ID
 * @param {Object} updates - Updates to apply
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} Updated feed item
 */
async function updateFeedItem(itemId, updates, userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  const { spreadsheetId } = await getOrCreateFeedSheet(userEmail, accessToken);
  
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  // Get all rows
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Feed!A:N'
  });
  
  const rows = response.data.values || [];
  
  if (rows.length <= 1) {
    throw new Error('Feed item not found');
  }
  
  const header = rows[0];
  const dataRows = rows.slice(1);
  
  // Find the item
  const rowIndex = dataRows.findIndex(row => row[0] === itemId && row[1] === userEmail);
  
  if (rowIndex === -1) {
    throw new Error('Feed item not found or access denied');
  }
  
  // Build updated row
  const row = dataRows[rowIndex];
  const updatedRow = [...row];
  
  // Apply updates
  header.forEach((key, index) => {
    if (updates.hasOwnProperty(key) && key !== 'id' && key !== 'user_email' && key !== 'created_at') {
      if (key === 'topics' && Array.isArray(updates[key])) {
        updatedRow[index] = updates[key].join(', ');
      } else {
        updatedRow[index] = updates[key];
      }
    }
  });
  
  // Update updated_at
  const updatedAtIndex = header.indexOf('updated_at');
  if (updatedAtIndex !== -1) {
    updatedRow[updatedAtIndex] = new Date().toISOString();
  }
  
  // Write back
  const sheetRowNumber = rowIndex + 2; // +1 for header, +1 for 1-based indexing
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Feed!A${sheetRowNumber}:N${sheetRowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [updatedRow]
    }
  });
  
  logUserAccess('updated', 'feed_item', itemId, userEmail, projectId);
  
  console.log(`✅ Feed: Updated feed item ${itemId} for ${userEmail}`);
  
  // Return updated item
  const updatedItem = {};
  header.forEach((key, index) => {
    updatedItem[key] = updatedRow[index];
  });
  
  return {
    ...updatedItem,
    topics: updatedItem.topics ? updatedItem.topics.split(',').map(t => t.trim()).filter(Boolean) : [],
    upvote_count: parseInt(updatedItem.upvote_count) || 0,
    downvote_count: parseInt(updatedItem.downvote_count) || 0,
    is_blocked: updatedItem.is_blocked === 'true' || updatedItem.is_blocked === true
  };
}

/**
 * Delete a feed item
 * @param {string} itemId - Feed item ID
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<void>}
 */
async function deleteFeedItem(itemId, userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  const { spreadsheetId } = await getOrCreateFeedSheet(userEmail, accessToken);
  
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  // Get all rows
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Feed!A:N'
  });
  
  const rows = response.data.values || [];
  
  if (rows.length <= 1) {
    throw new Error('Feed item not found');
  }
  
  const dataRows = rows.slice(1);
  
  // Find the item
  const rowIndex = dataRows.findIndex(row => row[0] === itemId && row[1] === userEmail);
  
  if (rowIndex === -1) {
    throw new Error('Feed item not found or access denied');
  }
  
  // Delete the row
  const sheetRowNumber = rowIndex + 2; // +1 for header, +1 for 1-based indexing
  
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: 0,
            dimension: 'ROWS',
            startIndex: sheetRowNumber - 1,
            endIndex: sheetRowNumber
          }
        }
      }]
    }
  });
  
  logUserAccess('deleted', 'feed_item', itemId, userEmail, projectId);
  
  console.log(`✅ Feed: Deleted feed item ${itemId} for ${userEmail}`);
}

/**
 * Vote on a feed item (upvote/downvote)
 * @param {string} itemId - Feed item ID
 * @param {string} vote - Vote type ('up', 'down', or '' to clear)
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} Updated feed item
 */
async function voteFeedItem(itemId, vote, userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  const { spreadsheetId } = await getOrCreateFeedSheet(userEmail, accessToken);
  
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  // Get all rows
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Feed!A:N'
  });
  
  const rows = response.data.values || [];
  
  if (rows.length <= 1) {
    throw new Error('Feed item not found');
  }
  
  const header = rows[0];
  const dataRows = rows.slice(1);
  
  // Find the item
  const rowIndex = dataRows.findIndex(row => row[0] === itemId && row[1] === userEmail);
  
  if (rowIndex === -1) {
    throw new Error('Feed item not found or access denied');
  }
  
  const row = dataRows[rowIndex];
  const updatedRow = [...row];
  
  // Get current vote counts
  const upvoteIndex = header.indexOf('upvote_count');
  const downvoteIndex = header.indexOf('downvote_count');
  const userVoteIndex = header.indexOf('user_vote');
  const updatedAtIndex = header.indexOf('updated_at');
  
  let upvoteCount = parseInt(row[upvoteIndex]) || 0;
  let downvoteCount = parseInt(row[downvoteIndex]) || 0;
  const currentVote = row[userVoteIndex] || '';
  
  // Remove previous vote
  if (currentVote === 'up') {
    upvoteCount = Math.max(0, upvoteCount - 1);
  } else if (currentVote === 'down') {
    downvoteCount = Math.max(0, downvoteCount - 1);
  }
  
  // Apply new vote
  if (vote === 'up') {
    upvoteCount++;
  } else if (vote === 'down') {
    downvoteCount++;
  }
  
  // Update row
  updatedRow[upvoteIndex] = upvoteCount.toString();
  updatedRow[downvoteIndex] = downvoteCount.toString();
  updatedRow[userVoteIndex] = vote;
  updatedRow[updatedAtIndex] = new Date().toISOString();
  
  // Write back
  const sheetRowNumber = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Feed!A${sheetRowNumber}:N${sheetRowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [updatedRow]
    }
  });
  
  logUserAccess(`voted_${vote || 'clear'}`, 'feed_item', itemId, userEmail, projectId);
  
  console.log(`✅ Feed: Vote ${vote || 'cleared'} on feed item ${itemId} for ${userEmail}`);
  
  // Return updated item
  const updatedItem = {};
  header.forEach((key, index) => {
    updatedItem[key] = updatedRow[index];
  });
  
  return {
    ...updatedItem,
    topics: updatedItem.topics ? updatedItem.topics.split(',').map(t => t.trim()).filter(Boolean) : [],
    upvote_count: parseInt(updatedItem.upvote_count) || 0,
    downvote_count: parseInt(updatedItem.downvote_count) || 0,
    is_blocked: updatedItem.is_blocked === 'true' || updatedItem.is_blocked === true
  };
}

module.exports = {
  getOrCreateFeedSheet,
  insertFeedItem,
  getFeedItems,
  updateFeedItem,
  deleteFeedItem,
  voteFeedItem
};
