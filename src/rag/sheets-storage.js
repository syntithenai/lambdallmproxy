/**
 * Google Sheets Storage Module for RAG System
 * 
 * Provides cloud backup and sync of embeddings to Google Sheets.
 * Enables cross-device access and data ownership.
 */

const { google } = require('googleapis');

const SHEET_NAME = 'RAG_Embeddings_v1';
const METADATA_SHEET = 'RAG_Metadata';

// Schema for embeddings sheet
const EMBEDDINGS_HEADERS = [
  'id',
  'snippet_id',
  'snippet_name',
  'chunk_index',
  'chunk_text',
  'embedding_json',
  'embedding_model',
  'embedding_provider',
  'embedding_dimensions',
  'token_count',
  'source_type',          // NEW: 'file' | 'url' | 'text'
  'source_url',           // NEW: Original URL if provided
  'source_file_path',     // NEW: File path if uploaded
  'source_file_name',     // NEW: Original filename
  'source_mime_type',     // NEW: MIME type
  'created_at',
  'updated_at',
  'synced_at',
];

// Schema for metadata sheet
const METADATA_HEADERS = [
  'key',
  'value',
  'updated_at',
];

/**
 * Initialize Google Sheets API client
 * @param {object} credentials - Google API credentials
 * @returns {object} Sheets API client
 */
function initSheetsClient(credentials) {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  
  return google.sheets({ version: 'v4', auth });
}

/**
 * Create RAG sheets in a spreadsheet
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @returns {Promise<void>}
 */
async function createRAGSheets(sheets, spreadsheetId) {
  try {
    // Check if sheets already exist
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
    
    const sheetsToCreate = [];
    
    if (!existingSheets.includes(SHEET_NAME)) {
      sheetsToCreate.push({
        properties: { title: SHEET_NAME },
      });
    }
    
    if (!existingSheets.includes(METADATA_SHEET)) {
      sheetsToCreate.push({
        properties: { title: METADATA_SHEET },
      });
    }
    
    if (sheetsToCreate.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: sheetsToCreate.map(sheet => ({
            addSheet: { properties: sheet.properties },
          })),
        },
      });
      
      console.log(`Created ${sheetsToCreate.length} RAG sheets`);
    }
    
    // Initialize headers if sheets are new
    await initializeSheetHeaders(sheets, spreadsheetId);
    
  } catch (error) {
    console.error('Error creating RAG sheets:', error);
    throw error;
  }
}

/**
 * Initialize sheet headers
 */
async function initializeSheetHeaders(sheets, spreadsheetId) {
  try {
    // Check if headers already exist
    const embeddingsData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:M1`,
    });
    
    if (!embeddingsData.data.values || embeddingsData.data.values.length === 0) {
      // Write embeddings headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        resource: {
          values: [EMBEDDINGS_HEADERS],
        },
      });
    }
    
    // Check metadata headers
    const metadataData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${METADATA_SHEET}!A1:C1`,
    });
    
    if (!metadataData.data.values || metadataData.data.values.length === 0) {
      // Write metadata headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${METADATA_SHEET}!A1`,
        valueInputOption: 'RAW',
        resource: {
          values: [METADATA_HEADERS],
        },
      });
    }
    
  } catch (error) {
    console.error('Error initializing headers:', error);
    throw error;
  }
}

/**
 * Sync chunks to Google Sheets
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {Array} chunks - Chunks to sync
 * @param {object} options - Sync options
 * @returns {Promise<{synced: number, skipped: number}>}
 */
async function syncChunksToSheets(sheets, spreadsheetId, chunks, options = {}) {
  const { batchSize = 100, onProgress = () => {} } = options;
  
  if (chunks.length === 0) {
    return { synced: 0, skipped: 0 };
  }
  
  try {
    // Ensure sheets exist
    await createRAGSheets(sheets, spreadsheetId);
    
    // Load existing chunks from sheets
    const existingChunks = await loadChunksFromSheets(sheets, spreadsheetId);
    const existingIds = new Set(existingChunks.map(c => c.id));
    
    // Filter new chunks
    const newChunks = chunks.filter(c => !existingIds.has(c.id));
    
    if (newChunks.length === 0) {
      console.log('No new chunks to sync');
      return { synced: 0, skipped: chunks.length };
    }
    
    // Prepare rows
    const syncTime = new Date().toISOString();
    const rows = newChunks.map(chunk => [
      chunk.id,
      chunk.snippet_id,
      chunk.snippet_name || '',
      chunk.chunk_index,
      chunk.chunk_text,
      JSON.stringify(Array.from(chunk.embedding)), // Convert Float32Array to JSON
      chunk.embedding_model,
      chunk.embedding_provider,
      chunk.embedding_dimensions,
      chunk.token_count,
      chunk.source_type || 'text',           // NEW: Source type
      chunk.source_url || '',                // NEW: Source URL
      chunk.source_file_path || '',          // NEW: File path
      chunk.source_file_name || '',          // NEW: Filename
      chunk.source_mime_type || '',          // NEW: MIME type
      chunk.created_at,
      chunk.updated_at,
      syncTime,
    ]);
    
    // Batch append to avoid rate limits
    let synced = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: 'RAW',
        resource: {
          values: batch,
        },
      });
      
      synced += batch.length;
      onProgress({ synced, total: rows.length });
      
      // Rate limiting
      if (i + batchSize < rows.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Synced ${synced} chunks to Google Sheets`);
    
    return {
      synced,
      skipped: chunks.length - newChunks.length,
    };
    
  } catch (error) {
    console.error('Error syncing to Google Sheets:', error);
    throw error;
  }
}

/**
 * Load chunks from Google Sheets
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @returns {Promise<Array>} Chunks
 */
async function loadChunksFromSheets(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A2:R`,  // Extended to column R for new fields
    });
    
    const rows = response.data.values || [];
    
    const chunks = rows.map(row => {
      try {
        return {
          id: row[0],
          snippet_id: row[1],
          snippet_name: row[2],
          chunk_index: parseInt(row[3]),
          chunk_text: row[4],
          embedding: new Float32Array(JSON.parse(row[5])),
          embedding_model: row[6],
          embedding_provider: row[7],
          embedding_dimensions: parseInt(row[8]),
          token_count: parseInt(row[9]),
          source_type: row[10] || 'text',        // NEW
          source_url: row[11] || '',             // NEW
          source_file_path: row[12] || '',       // NEW
          source_file_name: row[13] || '',       // NEW
          source_mime_type: row[14] || '',       // NEW
          created_at: row[15],
          updated_at: row[16],
          synced_at: row[17],
        };
      } catch (error) {
        console.error('Error parsing row:', error, row);
        return null;
      }
    }).filter(chunk => chunk !== null);
    
    console.log(`Loaded ${chunks.length} chunks from Google Sheets`);
    return chunks;
    
  } catch (error) {
    // Sheet might not exist yet
    if (error.code === 400) {
      return [];
    }
    console.error('Error loading from Google Sheets:', error);
    throw error;
  }
}

/**
 * Sync chunks from Google Sheets to IndexedDB
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @returns {Promise<{imported: number, updated: number}>}
 */
async function syncChunksFromSheets(sheets, spreadsheetId) {
  const { loadChunks, saveChunks } = require('./indexeddb-storage');
  
  try {
    // Load chunks from sheets
    const cloudChunks = await loadChunksFromSheets(sheets, spreadsheetId);
    
    if (cloudChunks.length === 0) {
      return { imported: 0, updated: 0 };
    }
    
    // Load local chunks
    const localChunks = await loadChunks();
    const localById = new Map(localChunks.map(c => [c.id, c]));
    
    let imported = 0;
    let updated = 0;
    
    const toSave = [];
    
    for (const cloudChunk of cloudChunks) {
      const localChunk = localById.get(cloudChunk.id);
      
      if (!localChunk) {
        // New chunk from cloud
        toSave.push(cloudChunk);
        imported++;
      } else {
        // Check if cloud version is newer
        const cloudTime = new Date(cloudChunk.updated_at).getTime();
        const localTime = new Date(localChunk.updated_at).getTime();
        
        if (cloudTime > localTime) {
          toSave.push(cloudChunk);
          updated++;
        }
      }
    }
    
    if (toSave.length > 0) {
      await saveChunks(toSave);
    }
    
    console.log(`Synced ${imported} new, ${updated} updated chunks from Google Sheets`);
    
    return { imported, updated };
    
  } catch (error) {
    console.error('Error syncing from Google Sheets:', error);
    throw error;
  }
}

/**
 * Bidirectional sync (smart merge)
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @returns {Promise<object>} Sync results
 */
async function bidirectionalSync(sheets, spreadsheetId) {
  const { loadChunks, saveChunks } = require('./indexeddb-storage');
  
  try {
    // Load from both sources
    const cloudChunks = await loadChunksFromSheets(sheets, spreadsheetId);
    const localChunks = await loadChunks();
    
    const cloudById = new Map(cloudChunks.map(c => [c.id, c]));
    const localById = new Map(localChunks.map(c => [c.id, c]));
    
    const toCloud = [];
    const toLocal = [];
    
    // Find chunks to push to cloud
    for (const localChunk of localChunks) {
      const cloudChunk = cloudById.get(localChunk.id);
      
      if (!cloudChunk) {
        toCloud.push(localChunk);
      } else {
        const localTime = new Date(localChunk.updated_at).getTime();
        const cloudTime = new Date(cloudChunk.updated_at).getTime();
        
        if (localTime > cloudTime) {
          toCloud.push(localChunk);
        }
      }
    }
    
    // Find chunks to pull from cloud
    for (const cloudChunk of cloudChunks) {
      const localChunk = localById.get(cloudChunk.id);
      
      if (!localChunk) {
        toLocal.push(cloudChunk);
      } else {
        const cloudTime = new Date(cloudChunk.updated_at).getTime();
        const localTime = new Date(localChunk.updated_at).getTime();
        
        if (cloudTime > localTime) {
          toLocal.push(cloudChunk);
        }
      }
    }
    
    // Sync to cloud
    let pushedToCloud = 0;
    if (toCloud.length > 0) {
      const result = await syncChunksToSheets(sheets, spreadsheetId, toCloud);
      pushedToCloud = result.synced;
    }
    
    // Sync to local
    let pulledFromCloud = 0;
    if (toLocal.length > 0) {
      await saveChunks(toLocal);
      pulledFromCloud = toLocal.length;
    }
    
    console.log(`Bidirectional sync complete: ${pushedToCloud} pushed, ${pulledFromCloud} pulled`);
    
    return {
      pushedToCloud,
      pulledFromCloud,
      totalLocal: localChunks.length,
      totalCloud: cloudChunks.length,
    };
    
  } catch (error) {
    console.error('Bidirectional sync failed:', error);
    throw error;
  }
}

/**
 * Save metadata to Google Sheets
 */
async function saveMetadataToSheets(sheets, spreadsheetId, key, value) {
  try {
    await createRAGSheets(sheets, spreadsheetId);
    
    const timestamp = new Date().toISOString();
    const row = [key, JSON.stringify(value), timestamp];
    
    // Check if key exists
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${METADATA_SHEET}!A2:A`,
    });
    
    const existingKeys = (existing.data.values || []).map(r => r[0]);
    const keyIndex = existingKeys.indexOf(key);
    
    if (keyIndex >= 0) {
      // Update existing row
      const rowNum = keyIndex + 2; // +2 for header and 0-indexing
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${METADATA_SHEET}!A${rowNum}:C${rowNum}`,
        valueInputOption: 'RAW',
        resource: {
          values: [row],
        },
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${METADATA_SHEET}!A2`,
        valueInputOption: 'RAW',
        resource: {
          values: [row],
        },
      });
    }
    
  } catch (error) {
    console.error('Error saving metadata to sheets:', error);
    throw error;
  }
}

/**
 * Load metadata from Google Sheets
 */
async function loadMetadataFromSheets(sheets, spreadsheetId, key) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${METADATA_SHEET}!A2:C`,
    });
    
    const rows = response.data.values || [];
    const row = rows.find(r => r[0] === key);
    
    if (row) {
      return JSON.parse(row[1]);
    }
    
    return null;
    
  } catch (error) {
    console.error('Error loading metadata from sheets:', error);
    return null;
  }
}

/**
 * Delete chunks from Google Sheets
 */
async function deleteChunksFromSheets(sheets, spreadsheetId, snippetId) {
  try {
    // Load all data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A2:M`,
    });
    
    const rows = response.data.values || [];
    
    // Filter out chunks with matching snippet_id
    const filteredRows = rows.filter(row => row[1] !== snippetId);
    const deletedCount = rows.length - filteredRows.length;
    
    if (deletedCount > 0) {
      // Clear and rewrite
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${SHEET_NAME}!A2:M`,
      });
      
      if (filteredRows.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${SHEET_NAME}!A2`,
          valueInputOption: 'RAW',
          resource: {
            values: filteredRows,
          },
        });
      }
      
      console.log(`Deleted ${deletedCount} chunks for snippet ${snippetId} from Google Sheets`);
    }
    
    return deletedCount;
    
  } catch (error) {
    console.error('Error deleting chunks from sheets:', error);
    throw error;
  }
}

/**
 * RAG_Files Tab Functions
 * Store and retrieve uploaded files as base64 in Google Sheets
 */

const FILES_SHEET = 'RAG_Files';

const FILES_HEADERS = [
  'file_id',
  'snippet_id',
  'file_name',
  'mime_type',
  'file_size',
  'chunk_index',
  'total_chunks',
  'content_base64',
  'created_at',
  'updated_at',
];

/**
 * Save file to Google Sheets (with chunking for large files)
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {object} fileData - File data
 * @returns {Promise<{fileId: string, chunks: number}>}
 */
async function saveFileToSheets(sheets, spreadsheetId, fileData) {
  try {
    const { fileId, snippetId, fileName, mimeType, content } = fileData;
    
    // Ensure RAG_Files sheet exists
    await ensureFilesSheet(sheets, spreadsheetId);
    
    // Convert content to base64 if not already
    const base64Content = Buffer.isBuffer(content) 
      ? content.toString('base64') 
      : content;
    
    const fileSize = base64Content.length;
    
    // Split into chunks if needed (37 KB per chunk = ~50k chars)
    const chunkSize = 37000;
    const chunks = [];
    
    for (let i = 0; i < base64Content.length; i += chunkSize) {
      chunks.push(base64Content.substring(i, i + chunkSize));
    }
    
    // Prepare rows
    const timestamp = new Date().toISOString();
    const rows = chunks.map((chunk, index) => [
      fileId,
      snippetId || '',
      fileName,
      mimeType,
      fileSize,
      index,
      chunks.length,
      chunk,
      timestamp,
      timestamp,
    ]);
    
    // Append to RAG_Files sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${FILES_SHEET}!A2`,
      valueInputOption: 'RAW',
      resource: { values: rows },
    });
    
    console.log(`Saved file ${fileId} (${chunks.length} chunks) to Google Sheets`);
    
    return { fileId, chunks: chunks.length };
    
  } catch (error) {
    console.error('Error saving file to sheets:', error);
    throw error;
  }
}

/**
 * Load file from Google Sheets
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} fileId - File ID
 * @returns {Promise<object|null>} File data
 */
async function loadFileFromSheets(sheets, spreadsheetId, fileId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${FILES_SHEET}!A2:J`,
    });
    
    const rows = response.data.values || [];
    const fileChunks = rows
      .filter(row => row[0] === fileId)
      .sort((a, b) => parseInt(a[5]) - parseInt(b[5])); // Sort by chunk_index
    
    if (fileChunks.length === 0) {
      return null;
    }
    
    // Reconstruct file content
    const content = fileChunks.map(chunk => chunk[7]).join('');
    
    return {
      fileId,
      snippetId: fileChunks[0][1],
      originalName: fileChunks[0][2],
      mimeType: fileChunks[0][3],
      size: parseInt(fileChunks[0][4]),
      content, // Base64 string
      createdAt: fileChunks[0][8],
      updatedAt: fileChunks[0][9],
    };
    
  } catch (error) {
    if (error.code === 400) {
      return null; // Sheet doesn't exist yet
    }
    console.error('Error loading file from sheets:', error);
    throw error;
  }
}

/**
 * Delete file from Google Sheets
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} fileId - File ID
 * @returns {Promise<number>} Number of chunks deleted
 */
async function deleteFileFromSheets(sheets, spreadsheetId, fileId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${FILES_SHEET}!A2:J`,
    });
    
    const rows = response.data.values || [];
    const rowsToDelete = [];
    
    rows.forEach((row, index) => {
      if (row[0] === fileId) {
        rowsToDelete.push(index + 2); // +2 for header row and 0-index
      }
    });
    
    if (rowsToDelete.length === 0) {
      return 0;
    }
    
    // Get sheet ID
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const filesSheet = spreadsheet.data.sheets.find(s => s.properties.title === FILES_SHEET);
    
    if (!filesSheet) {
      return 0;
    }
    
    // Delete rows in reverse order to maintain indices
    for (const rowIndex of rowsToDelete.reverse()) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: filesSheet.properties.sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          }],
        },
      });
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`Deleted ${rowsToDelete.length} chunks for file ${fileId}`);
    
    return rowsToDelete.length;
    
  } catch (error) {
    console.error('Error deleting file from sheets:', error);
    throw error;
  }
}

/**
 * Ensure RAG_Files sheet exists
 * @param {object} sheets - Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 */
async function ensureFilesSheet(sheets, spreadsheetId) {
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
    
    if (!existingSheets.includes(FILES_SHEET)) {
      // Create sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: { title: FILES_SHEET },
            },
          }],
        },
      });
      
      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${FILES_SHEET}!A1:J1`,
        valueInputOption: 'RAW',
        resource: {
          values: [FILES_HEADERS],
        },
      });
      
      console.log(`Created ${FILES_SHEET} sheet`);
    }
  } catch (error) {
    console.error('Error ensuring files sheet:', error);
    throw error;
  }
}

module.exports = {
  initSheetsClient,
  createRAGSheets,
  syncChunksToSheets,
  loadChunksFromSheets,
  syncChunksFromSheets,
  bidirectionalSync,
  saveMetadataToSheets,
  loadMetadataFromSheets,
  deleteChunksFromSheets,
  // RAG_Files functions
  saveFileToSheets,
  loadFileFromSheets,
  deleteFileFromSheets,
};
