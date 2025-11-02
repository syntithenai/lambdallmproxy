/**
 * Google Sheets Quiz Service
 * Manages user's quiz data in their Google Drive
 * 
 * Spreadsheet location: "Research Agent/Research Agent Swag"
 * Sheet name: "Quizzes"
 * 
 * Schema (A:L, 12 columns):
 * - id (unique identifier)
 * - user_email (owner email - for multi-tenancy)
 * - project_id (optional project filter - for multi-tenancy)
 * - created_at (ISO timestamp)
 * - updated_at (ISO timestamp)
 * - quiz_title (string)
 * - source_content (text - original content used to generate quiz)
 * - questions (JSON array of question objects)
 * - total_questions (number)
 * - completed (boolean)
 * - score (percentage 0-100 or null)
 * - completed_at (ISO timestamp or empty)
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
    console.log(`📁 Quiz: Found existing folder "${folderName}"`);
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
  
  console.log(`📁 Quiz: Created new folder "${folderName}"`);
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
    console.log(`📊 Quiz: Found existing spreadsheet "${fileName}"`);
    return response.data.files[0].id;
  }
  
  return null;
}

/**
 * Create quiz spreadsheet with proper schema
 * @param {string} folderId - Parent folder ID
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<string>} Spreadsheet ID
 */
async function createQuizSpreadsheet(folderId, accessToken) {
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'Research Agent Swag'
      },
      sheets: [{
        properties: {
          title: 'Quizzes'
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
              { userEnteredValue: { stringValue: 'quiz_title' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'source_content' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'questions' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'total_questions' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'completed' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'score' }, userEnteredFormat: { textFormat: { bold: true } } },
              { userEnteredValue: { stringValue: 'completed_at' }, userEnteredFormat: { textFormat: { bold: true } } }
            ]
          }]
        }]
      }]
    },
    fields: 'spreadsheetId'
  });
  
  const spreadsheetId = spreadsheet.data.spreadsheetId;
  
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
  
  console.log(`📊 Quiz: Created new spreadsheet "Research Agent Swag" with ID ${spreadsheetId}`);
  return spreadsheetId;
}

/**
 * Ensure Quizzes sheet exists in the spreadsheet
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} accessToken - User's OAuth access token
 */
async function ensureQuizzesSheetExists(spreadsheetId, accessToken) {
  const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.OAuth2()
  });
  
  sheets.context._options.auth.setCredentials({ access_token: accessToken });
  
  // Get existing sheets
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties'
  });
  
  const sheetExists = spreadsheet.data.sheets.some(
    sheet => sheet.properties.title === 'Quizzes'
  );
  
  if (sheetExists) {
    console.log('📊 Quiz: Sheet "Quizzes" already exists');
    return;
  }
  
  // Create Quizzes sheet with headers
  console.log('📊 Quiz: Creating "Quizzes" sheet...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: {
            title: 'Quizzes'
          }
        }
      }]
    }
  });
  
  // Add headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Quizzes!A1:L1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        'id',
        'user_email',
        'project_id',
        'created_at',
        'updated_at',
        'quiz_title',
        'source_content',
        'questions',
        'total_questions',
        'completed',
        'score',
        'completed_at'
      ]]
    }
  });
  
  console.log('✅ Quiz: Created "Quizzes" sheet with headers');
}

/**
 * Get or create the quiz spreadsheet
 * @param {string} userEmail - User's email
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} { spreadsheetId, folderId }
 */
async function getOrCreateQuizSheet(userEmail, accessToken) {
  validateUserEmail(userEmail);
  
  // Check cache
  const cacheKey = `quiz_${userEmail}`;
  if (spreadsheetCache.has(cacheKey)) {
    return spreadsheetCache.get(cacheKey);
  }
  
  try {
    // Find or create "Research Agent" folder
    const folderId = await findOrCreateFolder('Research Agent', accessToken);
    
    // Find or create "Research Agent Swag" spreadsheet
    let spreadsheetId = await findSheetInFolder('Research Agent Swag', folderId, accessToken);
    
    if (!spreadsheetId) {
      // Create new spreadsheet with Quizzes sheet
      spreadsheetId = await createQuizSpreadsheet(folderId, accessToken);
    } else {
      // Existing spreadsheet found - ensure "Quizzes" sheet exists
      await ensureQuizzesSheetExists(spreadsheetId, accessToken);
    }
    
    const result = { spreadsheetId, folderId };
    spreadsheetCache.set(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error('❌ Quiz: Error getting/creating sheet:', error.message);
    throw new Error(`Failed to access quiz storage: ${error.message}`);
  }
}

/**
 * Insert a new quiz
 * @param {Object} params - Quiz parameters
 * @param {string} params.quiz_title - Quiz title
 * @param {string} params.source_content - Original content
 * @param {Array} params.questions - Array of question objects
 * @param {boolean} params.completed - Completion status
 * @param {number} params.score - Score percentage (0-100) or null
 * @param {string} params.completed_at - Completion timestamp or empty
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} Created quiz object
 */
async function insertQuiz(params, userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  const { quiz_title, source_content, questions, completed = false, score = null, completed_at = '' } = params;
  
  if (!quiz_title || !questions || !Array.isArray(questions)) {
    throw new Error('quiz_title and questions (array) are required');
  }
  
  try {
    const { spreadsheetId } = await getOrCreateQuizSheet(userEmail, accessToken);
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    // Generate unique ID
    const id = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const total_questions = questions.length;
    
    // Prepare row data (A:L, 12 columns)
    const rowData = [
      id,                                    // A: id
      userEmail,                             // B: user_email
      projectId || '',                       // C: project_id
      now,                                   // D: created_at
      now,                                   // E: updated_at
      quiz_title,                            // F: quiz_title
      source_content || '',                  // G: source_content
      JSON.stringify(questions),             // H: questions (JSON)
      total_questions,                       // I: total_questions
      completed ? 'TRUE' : 'FALSE',          // J: completed
      score !== null ? score : '',           // K: score
      completed_at                           // L: completed_at
    ];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Quizzes!A:L',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData]
      }
    });
    
    console.log(`✅ Quiz: Inserted quiz "${quiz_title}" (ID: ${id}) for user ${userEmail}${projectId ? ` in project ${projectId}` : ''}`);
    
    logUserAccess('created', 'quiz', id, userEmail, projectId);
    
    return {
      id,
      user_email: userEmail,
      project_id: projectId || '',
      created_at: now,
      updated_at: now,
      quiz_title,
      source_content: source_content || '',
      questions,
      total_questions,
      completed,
      score,
      completed_at
    };
  } catch (error) {
    console.error('❌ Quiz: Error inserting quiz:', error.message);
    throw new Error(`Failed to save quiz: ${error.message}`);
  }
}

/**
 * Get all quizzes for a user (with optional project filter)
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional, for filtering)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Array>} Array of quiz objects
 */
async function getQuizzes(userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  try {
    const { spreadsheetId } = await getOrCreateQuizSheet(userEmail, accessToken);
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Quizzes!A:L'
    });
    
    if (!response.data.values || response.data.values.length < 2) {
      console.log(`📊 Quiz: No quizzes found for user ${userEmail}`);
      return [];
    }
    
    const dataRows = response.data.values.slice(1); // Skip header row
    
    // Parse rows into quiz objects
    const parsedRows = dataRows.map(row => ({
      id: row[0],
      user_email: row[1],
      project_id: row[2] || '',
      created_at: row[3],
      updated_at: row[4],
      quiz_title: row[5],
      source_content: row[6] || '',
      questions: row[7],
      total_questions: row[8],
      completed: row[9],
      score: row[10],
      completed_at: row[11] || ''
    }));
    
    // Filter by user and optional project
    const filtered = filterByUserAndProject(parsedRows, userEmail, projectId);
    
    // Parse JSON and booleans
    const quizzes = filtered.map(quiz => ({
      ...quiz,
      questions: quiz.questions ? JSON.parse(quiz.questions) : [],
      total_questions: parseInt(quiz.total_questions, 10) || 0,
      completed: quiz.completed === 'TRUE' || quiz.completed === true,
      score: quiz.score !== '' ? parseFloat(quiz.score) : null
    }));
    
    console.log(`📊 Quiz: Retrieved ${quizzes.length} quizzes for user ${userEmail}${projectId ? ` in project ${projectId}` : ''}`);
    
    logUserAccess('listed', 'quizzes', 'all', userEmail, projectId);
    
    return quizzes;
  } catch (error) {
    console.error('❌ Quiz: Error getting quizzes:', error.message);
    throw new Error(`Failed to retrieve quizzes: ${error.message}`);
  }
}

/**
 * Get a specific quiz by ID
 * @param {string} id - Quiz ID
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional, for filtering)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object|null>} Quiz object or null if not found
 */
async function getQuiz(id, userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  if (!id) {
    throw new Error('Quiz ID is required');
  }
  
  try {
    const quizzes = await getQuizzes(userEmail, projectId, accessToken);
    const quiz = quizzes.find(q => q.id === id);
    
    if (!quiz) {
      console.log(`📊 Quiz: Quiz ${id} not found for user ${userEmail}${projectId ? ` in project ${projectId}` : ''}`);
      return null;
    }
    
    logUserAccess('accessed', 'quiz', id, userEmail, projectId);
    
    return quiz;
  } catch (error) {
    console.error('❌ Quiz: Error getting quiz:', error.message);
    throw new Error(`Failed to retrieve quiz: ${error.message}`);
  }
}

/**
 * Update a quiz
 * @param {string} id - Quiz ID
 * @param {Object} updates - Fields to update
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional, for filtering)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} Updated quiz object
 */
async function updateQuiz(id, updates, userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  if (!id) {
    throw new Error('Quiz ID is required');
  }
  
  try {
    const { spreadsheetId } = await getOrCreateQuizSheet(userEmail, accessToken);
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    // Get all rows
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Quizzes!A:L'
    });
    
    if (!response.data.values || response.data.values.length < 2) {
      throw new Error('Quiz not found');
    }
    
    const dataRows = response.data.values.slice(1);
    
    // Parse and filter by user/project
    const parsedRows = dataRows.map(row => ({
      id: row[0],
      user_email: row[1],
      project_id: row[2] || '',
      created_at: row[3],
      updated_at: row[4],
      quiz_title: row[5],
      source_content: row[6] || '',
      questions: row[7],
      total_questions: row[8],
      completed: row[9],
      score: row[10],
      completed_at: row[11] || ''
    }));
    
    const filtered = filterByUserAndProject(parsedRows, userEmail, projectId);
    const quizIndex = filtered.findIndex(q => q.id === id);
    
    if (quizIndex === -1) {
      throw new Error('Quiz not found or access denied');
    }
    
    const quiz = filtered[quizIndex];
    const now = new Date().toISOString();
    
    // Apply updates (preserve ownership fields)
    const updated = {
      ...quiz,
      ...updates,
      user_email: quiz.user_email, // Never change owner
      project_id: quiz.project_id, // Never change project
      updated_at: now
    };
    
    // Find actual row index in sheet (accounting for header + all rows before filtering)
    const actualRowIndex = dataRows.findIndex(row => row[0] === id);
    if (actualRowIndex === -1) {
      throw new Error('Quiz not found in sheet');
    }
    
    // Prepare updated row data
    const rowData = [
      updated.id,
      updated.user_email,
      updated.project_id,
      updated.created_at,
      updated.updated_at,
      updated.quiz_title,
      updated.source_content,
      typeof updated.questions === 'string' ? updated.questions : JSON.stringify(updated.questions),
      updated.total_questions,
      updated.completed === true || updated.completed === 'TRUE' ? 'TRUE' : 'FALSE',
      updated.score !== null && updated.score !== '' ? updated.score : '',
      updated.completed_at || ''
    ];
    
    // Update the row (add 2 to actualRowIndex: 1 for 1-based indexing, 1 for header)
    const rowNumber = actualRowIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Quizzes!A${rowNumber}:L${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData]
      }
    });
    
    console.log(`✅ Quiz: Updated quiz ${id} for user ${userEmail}`);
    
    logUserAccess('updated', 'quiz', id, userEmail, projectId);
    
    // Return parsed object
    return {
      ...updated,
      questions: typeof updated.questions === 'string' ? JSON.parse(updated.questions) : updated.questions,
      total_questions: parseInt(updated.total_questions, 10) || 0,
      completed: updated.completed === 'TRUE' || updated.completed === true,
      score: updated.score !== null && updated.score !== '' ? parseFloat(updated.score) : null
    };
  } catch (error) {
    console.error('❌ Quiz: Error updating quiz:', error.message);
    throw new Error(`Failed to update quiz: ${error.message}`);
  }
}

/**
 * Delete a quiz
 * @param {string} id - Quiz ID
 * @param {string} userEmail - User's email
 * @param {string|null} projectId - Project ID (optional, for filtering)
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} Deleted quiz object
 */
async function deleteQuiz(id, userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  if (!id) {
    throw new Error('Quiz ID is required');
  }
  
  try {
    const { spreadsheetId } = await getOrCreateQuizSheet(userEmail, accessToken);
    const sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.OAuth2()
    });
    
    sheets.context._options.auth.setCredentials({ access_token: accessToken });
    
    // Get all rows
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Quizzes!A:L'
    });
    
    if (!response.data.values || response.data.values.length < 2) {
      throw new Error('Quiz not found');
    }
    
    const dataRows = response.data.values.slice(1);
    
    // Parse and filter by user/project
    const parsedRows = dataRows.map(row => ({
      id: row[0],
      user_email: row[1],
      project_id: row[2] || ''
    }));
    
    const filtered = filterByUserAndProject(parsedRows, userEmail, projectId);
    const quiz = filtered.find(q => q.id === id);
    
    if (!quiz) {
      throw new Error('Quiz not found or access denied');
    }
    
    // Find actual row index
    const actualRowIndex = dataRows.findIndex(row => row[0] === id);
    if (actualRowIndex === -1) {
      throw new Error('Quiz not found in sheet');
    }
    
    // Delete the row (add 2: 1 for 1-based, 1 for header)
    const rowNumber = actualRowIndex + 2;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0,
              dimension: 'ROWS',
              startIndex: rowNumber - 1, // 0-based for API
              endIndex: rowNumber
            }
          }
        }]
      }
    });
    
    console.log(`✅ Quiz: Deleted quiz ${id} for user ${userEmail}`);
    
    logUserAccess('deleted', 'quiz', id, userEmail, projectId);
    
    return { id, quiz_title: quiz.quiz_title };
  } catch (error) {
    console.error('❌ Quiz: Error deleting quiz:', error.message);
    throw new Error(`Failed to delete quiz: ${error.message}`);
  }
}

module.exports = {
  getOrCreateQuizSheet,
  insertQuiz,
  getQuizzes,
  getQuiz,
  updateQuiz,
  deleteQuiz
};
