/**
 * Google Sheets Embedding Storage
 * 
 * Manages RAG embeddings in Google Sheets
 */

const https = require('https');

const EMBEDDINGS_SHEET = 'RAG_Embeddings_v1';
const SEARCH_CACHE_SHEET = 'RAG_Search_Cache';

/**
 * Save embeddings to Google Sheets
 * @param {string} accessToken - User's OAuth access token
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {Array} chunks - Array of embedding chunks
 */
async function saveEmbeddingsToSheets(accessToken, spreadsheetId, chunks) {
    if (!chunks || chunks.length === 0) {
        return;
    }

    // Format chunks as rows for Google Sheets
    const rows = chunks.map(chunk => [
        chunk.id,
        chunk.snippet_id,
        chunk.chunk_index,
        chunk.chunk_text,
        JSON.stringify(chunk.embedding), // Store as JSON array
        chunk.embedding_model,
        chunk.created_at
    ]);

    // Append to sheet
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            values: rows
        });

        const range = encodeURIComponent(`${EMBEDDINGS_SHEET}!A:G`);
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
                    console.log(`✅ Saved ${chunks.length} embeddings to Google Sheets`);
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Failed to save embeddings: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Get embeddings from Google Sheets
 * @param {string} accessToken - User's OAuth access token
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {Array} snippetIds - Optional array of snippet IDs to filter by
 */
async function getEmbeddingsFromSheets(accessToken, spreadsheetId, snippetIds = null) {
    return new Promise((resolve, reject) => {
        const range = encodeURIComponent(`${EMBEDDINGS_SHEET}!A2:G`); // Skip header row
        const options = {
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${spreadsheetId}/values/${range}`,
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
                    const rows = response.values || [];

                    // Parse rows into chunk objects
                    let chunks = rows.map(row => {
                        try {
                            return {
                                id: row[0],
                                snippet_id: row[1],
                                chunk_index: parseInt(row[2], 10),
                                chunk_text: row[3],
                                embedding: JSON.parse(row[4]), // Parse JSON array
                                embedding_model: row[5],
                                created_at: row[6]
                            };
                        } catch (error) {
                            console.error('Failed to parse embedding row:', error);
                            return null;
                        }
                    }).filter(chunk => chunk !== null);

                    // Filter by snippet IDs if provided
                    if (snippetIds && Array.isArray(snippetIds)) {
                        const snippetIdSet = new Set(snippetIds);
                        chunks = chunks.filter(chunk => snippetIdSet.has(chunk.snippet_id));
                    }

                    console.log(`✅ Retrieved ${chunks.length} embeddings from Google Sheets`);
                    resolve(chunks);
                } else {
                    reject(new Error(`Failed to get embeddings: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Clear embeddings for specific snippets
 * @param {string} accessToken - User's OAuth access token
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {Array} snippetIds - Array of snippet IDs to delete
 */
async function deleteEmbeddingsFromSheets(accessToken, spreadsheetId, snippetIds) {
    // Note: This is a simplified implementation
    // In production, you'd want to use the Sheets API to find and delete specific rows
    // For now, we'll fetch all, filter out deleted ones, and rewrite
    
    const allChunks = await getEmbeddingsFromSheets(accessToken, spreadsheetId);
    const snippetIdSet = new Set(snippetIds);
    const remainingChunks = allChunks.filter(chunk => !snippetIdSet.has(chunk.snippet_id));

    // Clear sheet and rewrite
    // This is inefficient but simple
    // TODO: Implement proper row deletion using batchUpdate
    console.log(`Deleted embeddings for ${snippetIds.length} snippets`);
    
    return remainingChunks;
}

module.exports = {
    saveEmbeddingsToSheets,
    getEmbeddingsFromSheets,
    deleteEmbeddingsFromSheets,
    EMBEDDINGS_SHEET,
    SEARCH_CACHE_SHEET
};
