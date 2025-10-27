/**
 * User Spreadsheet Management
 * 
 * Manages per-user "Research Agent Swag" spreadsheets in Google Drive
 * Each user gets their own spreadsheet created in their Drive on first use
 */

const https = require('https');

const SPREADSHEET_NAME = 'Research Agent Swag';
const FOLDER_NAME = 'research agent';

/**
 * Search Google Drive for a folder by name
 * @param {string} accessToken - User's OAuth access token
 * @param {string} folderName - Folder name to search for
 * @returns {Promise<Array>} - Array of matching folders
 */
async function searchDriveFolders(accessToken, folderName) {
    return new Promise((resolve, reject) => {
        const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        const options = {
            hostname: 'www.googleapis.com',
            path: `/drive/v3/files?q=${query}&fields=files(id,name,createdTime)`,
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
                    const response = JSON.parse(data);
                    resolve(response.files || []);
                } else {
                    reject(new Error(`Drive folder search failed: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

/**
 * Create a folder in Google Drive
 * @param {string} accessToken - User's OAuth access token
 * @param {string} folderName - Name for the folder
 * @returns {Promise<string>} - Created folder ID
 */
async function createDriveFolder(accessToken, folderName) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        });
        
        const options = {
            hostname: 'www.googleapis.com',
            path: '/drive/v3/files',
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
                    const response = JSON.parse(data);
                    resolve(response.id);
                } else {
                    reject(new Error(`Failed to create folder: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Search Google Drive for a file by name
 * @param {string} accessToken - User's OAuth access token
 * @param {string} fileName - Name to search for
 * @param {string} [folderId] - Optional folder ID to search within
 * @returns {Promise<Array>} - Array of matching files
 */
async function searchDriveFiles(accessToken, fileName, folderId = null) {
    return new Promise((resolve, reject) => {
        let queryParts = [`name='${fileName}'`, `mimeType='application/vnd.google-apps.spreadsheet'`, `trashed=false`];
        if (folderId) {
            queryParts.push(`'${folderId}' in parents`);
        }
        const query = encodeURIComponent(queryParts.join(' and '));
        const options = {
            hostname: 'www.googleapis.com',
            path: `/drive/v3/files?q=${query}&fields=files(id,name,createdTime)`,
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
                    const response = JSON.parse(data);
                    resolve(response.files || []);
                } else {
                    reject(new Error(`Drive search failed: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

/**
 * Move a file to a folder in Google Drive
 * @param {string} accessToken - User's OAuth access token
 * @param {string} fileId - File ID to move
 * @param {string} folderId - Destination folder ID
 * @returns {Promise<void>}
 */
async function moveFileToFolder(accessToken, fileId, folderId) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.googleapis.com',
            path: `/drive/v3/files/${fileId}?addParents=${folderId}&fields=id,parents`,
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error(`Failed to move file: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

/**
 * Create a new Google Spreadsheet
 * @param {string} accessToken - User's OAuth access token
 * @param {string} title - Spreadsheet title
 * @param {string} [folderId] - Optional parent folder ID
 * @returns {Promise<Object>} - Created spreadsheet info
 */
async function createSpreadsheet(accessToken, title, folderId = null) {
    return new Promise((resolve, reject) => {
        const spreadsheetData = {
            properties: {
                title: title
            },
            sheets: [
                {
                    properties: {
                        title: 'RAG_Snippets_v1',
                        gridProperties: {
                            frozenRowCount: 1
                        }
                    }
                },
                {
                    properties: {
                        title: 'RAG_Embeddings_v1',
                        gridProperties: {
                            frozenRowCount: 1
                        }
                    }
                },
                {
                    properties: {
                        title: 'RAG_Search_Cache',
                        gridProperties: {
                            frozenRowCount: 1
                        }
                    }
                }
            ]
        };
        
        const payload = JSON.stringify(spreadsheetData);
        
        const options = {
            hostname: 'sheets.googleapis.com',
            path: '/v4/spreadsheets',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };
        
        const req = https.request(options, async (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                if (res.statusCode === 200) {
                    const response = JSON.parse(data);
                    
                    // Move to folder if specified
                    if (folderId) {
                        try {
                            await moveFileToFolder(accessToken, response.spreadsheetId, folderId);
                            console.log(`📁 Moved spreadsheet to folder ${folderId}`);
                        } catch (error) {
                            console.error('Failed to move spreadsheet to folder:', error);
                            // Don't reject - spreadsheet was created successfully
                        }
                    }
                    
                    resolve(response);
                } else {
                    reject(new Error(`Failed to create spreadsheet: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Initialize spreadsheet headers
 * @param {string} accessToken - User's OAuth access token
 * @param {string} spreadsheetId - Spreadsheet ID
 */
async function initializeSheetHeaders(accessToken, spreadsheetId) {
    const headers = {
        'RAG_Snippets_v1': [
            ['id', 'title', 'content', 'source', 'tags', 'created_at', 'updated_at', 'source_type', 'chunk_index', 'total_chunks']
        ],
        'RAG_Embeddings_v1': [
            ['id', 'snippet_id', 'chunk_index', 'chunk_text', 'embedding', 'embedding_model', 'created_at']
        ],
        'RAG_Search_Cache': [
            ['query', 'embedding', 'model', 'created_at']
        ]
    };
    
    return new Promise((resolve, reject) => {
        const requests = Object.entries(headers).map(([sheetName, headerRow]) => ({
            updateCells: {
                range: {
                    sheetId: 0, // Will be updated based on actual sheet IDs
                },
                rows: [
                    {
                        values: headerRow[0].map(header => ({
                            userEnteredValue: { stringValue: header },
                            userEnteredFormat: {
                                textFormat: { bold: true },
                                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                            }
                        }))
                    }
                ],
                fields: 'userEnteredValue,userEnteredFormat'
            }
        }));
        
        // For simplicity, use append to add headers
        const promises = Object.entries(headers).map(([sheetName, headerRow]) => {
            return appendToSheet(accessToken, spreadsheetId, sheetName, headerRow);
        });
        
        Promise.all(promises)
            .then(() => resolve())
            .catch(reject);
    });
}

/**
 * Append rows to a sheet
 */
async function appendToSheet(accessToken, spreadsheetId, sheetName, rows) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            values: rows
        });
        
        const range = encodeURIComponent(`${sheetName}!A1`);
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`,
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
 * Get or create user's RAG spreadsheet
 * @param {string} accessToken - User's OAuth access token
 * @returns {Promise<Object>} - { spreadsheetId, spreadsheetUrl, created }
 */
async function getUserSpreadsheet(accessToken) {
    try {
        // Find or create "research agent" folder
        console.log(`📁 Looking for "${FOLDER_NAME}" folder...`);
        let folderId = null;
        const folders = await searchDriveFolders(accessToken, FOLDER_NAME);
        
        if (folders.length > 0) {
            folderId = folders[0].id;
            console.log(`✅ Found folder: ${folderId}`);
        } else {
            console.log(`📁 Creating "${FOLDER_NAME}" folder...`);
            folderId = await createDriveFolder(accessToken, FOLDER_NAME);
            console.log(`✅ Created folder: ${folderId}`);
        }
        
        // Search for existing spreadsheet in the folder
        console.log(`🔍 Searching for "${SPREADSHEET_NAME}" spreadsheet in folder...`);
        const files = await searchDriveFiles(accessToken, SPREADSHEET_NAME, folderId);
        
        if (files.length > 0) {
            // Found existing spreadsheet
            const file = files[0]; // Use the first match
            console.log(`✅ Found existing spreadsheet: ${file.id}`);
            return {
                spreadsheetId: file.id,
                spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${file.id}`,
                created: false
            };
        }
        
        // Create new spreadsheet in the folder
        console.log(`📝 Creating new "${SPREADSHEET_NAME}" spreadsheet in folder...`);
        const spreadsheet = await createSpreadsheet(accessToken, SPREADSHEET_NAME, folderId);
        
        // Initialize headers
        console.log(`📋 Initializing sheet headers...`);
        await initializeSheetHeaders(accessToken, spreadsheet.spreadsheetId);
        
        console.log(`✅ Created spreadsheet: ${spreadsheet.spreadsheetId}`);
        return {
            spreadsheetId: spreadsheet.spreadsheetId,
            spreadsheetUrl: spreadsheet.spreadsheetUrl,
            created: true
        };
    } catch (error) {
        console.error('Error managing user spreadsheet:', error);
        throw error;
    }
}

module.exports = {
    getUserSpreadsheet,
    searchDriveFiles,
    createSpreadsheet,
    SPREADSHEET_NAME
};
