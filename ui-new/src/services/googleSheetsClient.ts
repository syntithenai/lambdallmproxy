/**
 * Client-side Google Sheets API integration
 * NOTE: OAuth is now handled by centralized googleAuth service
 * This module provides Sheets-specific API wrappers
 */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface TokenClient {
  callback: (response: TokenResponse | { error: string }) => void;
  requestAccessToken: (options?: { prompt?: string }) => void;
}

// GIS token client (kept for backward compatibility but unused)
let gisTokenClient: TokenClient | null = null;

// Rate limiting to avoid Google Sheets quota issues
// Google Sheets API: 60 write requests per minute per user
const RATE_LIMIT = {
  maxRequests: 50, // Stay under 60/min limit
  windowMs: 60000, // 1 minute window
  requests: [] as number[], // Timestamps of recent requests
};

/**
 * Rate limiting helper - waits if needed to avoid quota
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  
  // Remove old requests outside the window
  RATE_LIMIT.requests = RATE_LIMIT.requests.filter(
    timestamp => now - timestamp < RATE_LIMIT.windowMs
  );
  
  // If at limit, wait until oldest request expires
  if (RATE_LIMIT.requests.length >= RATE_LIMIT.maxRequests) {
    const oldestRequest = RATE_LIMIT.requests[0];
    const waitTime = RATE_LIMIT.windowMs - (now - oldestRequest) + 100; // +100ms buffer
    console.log(`⏳ Rate limit reached, waiting ${Math.round(waitTime / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Clean up again after waiting
    const newNow = Date.now();
    RATE_LIMIT.requests = RATE_LIMIT.requests.filter(
      timestamp => newNow - timestamp < RATE_LIMIT.windowMs
    );
  }
  
  // Record this request
  RATE_LIMIT.requests.push(Date.now());
}

/**
 * Initialize Google Identity Services
 * Call this once on app startup after GIS script loads
 */
export function initGoogleIdentity(clientId: string): void {
  if (!clientId) {
    console.warn('⚠️ VITE_GGL_CID not configured - client-side Sheets sync disabled');
    return;
  }

  // Check if GIS is loaded
  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    console.warn('⚠️ Google Identity Services not loaded - include GIS script in index.html');
    return;
  }

  if (gisTokenClient) {
    console.log('✅ Google Identity already initialized');
    return;
  }

  try {
    gisTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file', // Only files created by this app
      callback: () => {
        // Callback is overridden per-request in getAccessToken()
        console.log('🔐 Token response received');
      },
    });
    console.log('✅ Google Identity Services initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Google Identity Services:', error);
  }
}

/**
 * Check if Google Identity is available and initialized
 */
export function isGoogleIdentityAvailable(): boolean {
  return gisTokenClient !== null;
}

/**
 * Get a valid access token (requests from user if needed)
 * NOTE: This function is now a wrapper around the centralized googleAuth service
 * to maintain backward compatibility with existing callers.
 */
export async function getAccessToken(_options?: { prompt?: string }): Promise<string> {
  console.log('🔑 googleSheetsClient.getAccessToken() called - redirecting to centralized googleAuth service');
  
  const { googleAuth } = await import('./googleAuth');
  
  if (!googleAuth.isAuthenticated()) {
    throw new Error('Please log in with Google Drive first (Settings → Cloud Sync)');
  }
  
  const token = googleAuth.getAccessToken();
  if (!token) {
    throw new Error('No access token available - please reconnect Google Drive');
  }
  
  console.log('✅ Using access token from centralized googleAuth service');
  return token;
}

/**
 * Clear cached token (useful for logout or re-auth)
 * NOTE: Now a no-op since we use centralized googleAuth service
 */
export function clearAccessToken(): void {
  console.log('🔐 clearAccessToken() called - token managed by centralized googleAuth service');
}

/**
 * Append rows to a Google Sheet
 * @param spreadsheetId - The Google Sheet ID (from URL)
 * @param range - Sheet name and range (e.g., "embeddings!A:Z" or "Sheet1!A1:D1")
 * @param values - 2D array of values to append
 */
export async function appendRows(
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<any> {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID is required');
  }

  if (!values || values.length === 0) {
    throw new Error('No values to append');
  }

  // Wait for rate limit before proceeding
  await waitForRateLimit();

  const token = await getAccessToken();

  // Google Sheets API append endpoint
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`;

  const body = {
    values,
  };

  console.log(`📤 Appending ${values.length} rows to sheet: ${range}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Sheets API error:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });
    throw new Error(`Sheets API error: ${response.status} ${response.statusText}. ${errorText}`);
  }

  const result = await response.json();
  console.log(`✅ Appended ${result.updates.updatedRows} rows to Google Sheets`);

  return result;
}

/**
 * Get values from a Google Sheet
 * @param spreadsheetId - The Google Sheet ID
 * @param range - Sheet name and range (e.g., "Sheet1!A1:D10")
 */
export async function getValues(
  spreadsheetId: string,
  range: string
): Promise<any[][]> {
  const token = await getAccessToken();

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error: ${response.status} ${response.statusText}. ${errorText}`);
  }

  const result = await response.json();
  return result.values || [];
}

/**
 * Create a new sheet tab in an existing spreadsheet
 * @param spreadsheetId - The Google Sheet ID
 * @param title - Title for the new sheet
 */
export async function createSheet(
  spreadsheetId: string,
  title: string
): Promise<any> {
  const token = await getAccessToken();

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;

  const body = {
    requests: [
      {
        addSheet: {
          properties: {
            title,
          },
        },
      },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error: ${response.status} ${response.statusText}. ${errorText}`);
  }

  return response.json();
}

/**
 * Batch update operations (create sheets, format headers, etc.)
 * @param spreadsheetId - The Google Sheet ID
 * @param requests - Array of batch update requests
 */
export async function batchUpdate(
  spreadsheetId: string,
  requests: any[]
): Promise<any> {
  const token = await getAccessToken();

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error: ${response.status} ${response.statusText}. ${errorText}`);
  }

  return response.json();
}

/**
 * Format embeddings chunks for Google Sheets
 * Converts chunk objects to row arrays matching the schema
 */
export function formatChunksForSheets(chunks: any[]): any[][] {
  return chunks.map(chunk => [
    chunk.id || '',
    chunk.snippet_id || '',
    chunk.snippet_name || '',
    chunk.chunk_text || '',
    // Store embedding as JSON string (Sheets cells support up to ~50K chars)
    JSON.stringify(chunk.embedding || []),
    chunk.chunk_index ?? 0,
    chunk.embedding_model || '',
    chunk.embedding_provider || '',
    chunk.embedding_dimensions || 0,
    chunk.source_type || 'text',
    chunk.created_at || new Date().toISOString(),
  ]);
}

/**
 * Format snippets for Google Sheets
 */
export function formatSnippetsForSheets(snippets: any[]): any[][] {
  return snippets.map(snippet => [
    snippet.id || '',
    snippet.content || '',
    snippet.title || '',
    snippet.sourceType || 'manual',
    snippet.timestamp || Date.now(),
    snippet.updateDate || snippet.timestamp || Date.now(),
    JSON.stringify(snippet.tags || []),
    snippet.projectId || '',
    snippet.selected ? 'true' : 'false',
  ]);
}

/**
 * Sync snippets to Google Sheets (client-side)
 * Batches multiple snippets into fewer API calls to avoid rate limits
 * @param spreadsheetId - The Google Sheet ID
 * @param snippets - Array of snippets to sync
 */
export async function syncSnippetsToSheets(
  spreadsheetId: string,
  snippets: any[]
): Promise<void> {
  if (snippets.length === 0) {
    console.log('⚠️ No snippets to sync');
    return;
  }

  try {
    console.log(`📤 Syncing ${snippets.length} snippets to Google Sheets (client-side)...`);
    
    // Batch into groups of 10 to reduce API calls
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < snippets.length; i += batchSize) {
      batches.push(snippets.slice(i, i + batchSize));
    }
    
    console.log(`📦 Split into ${batches.length} batches of up to ${batchSize} items`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const rows = formatSnippetsForSheets(batch);
      await appendRows(spreadsheetId, 'snippets!A:I', rows);
      console.log(`✅ Synced batch ${i + 1}/${batches.length} (${batch.length} snippets)`);
    }
    
    console.log(`✅ Synced all ${snippets.length} snippets to Google Sheets`);
  } catch (error) {
    console.error('❌ Failed to sync snippets:', error);
    throw error;
  }
}

/**
 * Format feed items for Google Sheets
 */
export function formatFeedItemsForSheets(items: any[]): any[][] {
  return items.map(item => [
    item.id || '',
    item.title || '',
    item.content || '',
    item.url || '',
    item.category || '',
    JSON.stringify(item.tags || []),
    item.imageUrl || '',
    item.generatedAt || Date.now(),
    item.viewedAt || '',
    item.stashed ? 'true' : 'false',
    item.projectId || '',
  ]);
}

/**
 * Sync feed items to Google Sheets (client-side)
 */
export async function syncFeedItemsToSheets(
  spreadsheetId: string,
  items: any[]
): Promise<void> {
  if (items.length === 0) return;

  try {
    console.log(`📤 Syncing ${items.length} feed items to Google Sheets (client-side)...`);
    const rows = formatFeedItemsForSheets(items);
    await appendRows(spreadsheetId, 'feed!A:K', rows);
    console.log(`✅ Synced ${items.length} feed items to Google Sheets`);
  } catch (error) {
    console.error('❌ Failed to sync feed items:', error);
    throw error;
  }
}

/**
 * Format quiz statistics for Google Sheets
 */
export function formatQuizzesForSheets(quizzes: any[]): any[][] {
  return quizzes.map(quiz => [
    quiz.id || '',
    quiz.quizTitle || '',
    JSON.stringify(quiz.snippetIds || []),
    quiz.score || 0,
    quiz.totalQuestions || 0,
    quiz.percentage || 0,
    quiz.timeTaken || 0,
    quiz.completedAt || '',
    JSON.stringify(quiz.answers || []),
    quiz.enrichment ? 'true' : 'false',
    quiz.completed ? 'true' : 'false',
    quiz.projectId || '',
    JSON.stringify(quiz.quizData || null),
  ]);
}

/**
 * Sync quiz statistics to Google Sheets (client-side)
 */
export async function syncQuizzesToSheets(
  spreadsheetId: string,
  quizzes: any[]
): Promise<void> {
  if (quizzes.length === 0) return;

  try {
    console.log(`📤 Syncing ${quizzes.length} quiz statistics to Google Sheets (client-side)...`);
    const rows = formatQuizzesForSheets(quizzes);
    await appendRows(spreadsheetId, 'quizzes!A:M', rows);
    console.log(`✅ Synced ${quizzes.length} quizzes to Google Sheets`);
  } catch (error) {
    console.error('❌ Failed to sync quizzes:', error);
    throw error;
  }
}

/**
 * Find row index by ID in first column
 * @param spreadsheetId - The Google Sheet ID
 * @param sheetName - Name of the sheet tab
 * @param id - ID to search for in first column
 * @returns Row index (0-based) or -1 if not found
 */
async function findRowByIdInternal(
  spreadsheetId: string,
  sheetName: string,
  id: string
): Promise<number> {
  await waitForRateLimit();
  
  const values = await getValues(spreadsheetId, `${sheetName}!A:A`);
  
  // Find the row (values are 0-indexed, but row numbers are 1-indexed)
  const rowIndex = values.findIndex(row => row[0] === id);
  return rowIndex;
}

/**
 * Delete rows by ID from Google Sheets
 * @param spreadsheetId - The Google Sheet ID
 * @param sheetName - Name of the sheet tab (without range)
 * @param ids - Array of IDs to delete (searches in column A)
 */
export async function deleteRowsByIds(
  spreadsheetId: string,
  sheetName: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) {
    console.log('⚠️ No IDs to delete');
    return 0;
  }

  try {
    console.log(`🗑️  Deleting ${ids.length} rows from ${sheetName}...`);
    
    // Get sheet ID (needed for batch delete)
    await waitForRateLimit();
    const token = await getAccessToken();
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!metadataResponse.ok) {
      throw new Error(`Failed to get sheet metadata: ${metadataResponse.statusText}`);
    }
    
    const metadata = await metadataResponse.json();
    const sheet = metadata.sheets.find((s: any) => s.properties.title === sheetName);
    
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Find all row indices for the given IDs
    const rowsToDelete: number[] = [];
    for (const id of ids) {
      const rowIndex = await findRowByIdInternal(spreadsheetId, sheetName, id);
      if (rowIndex >= 0) {
        rowsToDelete.push(rowIndex);
      } else {
        console.warn(`⚠️ ID not found in sheet: ${id}`);
      }
    }
    
    if (rowsToDelete.length === 0) {
      console.log('⚠️ No matching rows found to delete');
      return 0;
    }
    
    // Sort in descending order (delete from bottom to top to maintain indices)
    rowsToDelete.sort((a, b) => b - a);
    
    // Create batch delete requests
    const deleteRequests = rowsToDelete.map(rowIndex => ({
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex, // 0-indexed, inclusive
          endIndex: rowIndex + 1, // 0-indexed, exclusive
        },
      },
    }));
    
    // Execute batch delete
    await waitForRateLimit();
    await batchUpdate(spreadsheetId, deleteRequests);
    
    console.log(`✅ Deleted ${rowsToDelete.length} rows from Google Sheets`);
    return rowsToDelete.length;
  } catch (error) {
    console.error('❌ Failed to delete rows:', error);
    throw error;
  }
}

/**
 * Delete snippets from Google Sheets by ID
 */
export async function deleteSnippetsFromSheets(
  spreadsheetId: string,
  snippetIds: string[]
): Promise<number> {
  return deleteRowsByIds(spreadsheetId, 'snippets', snippetIds);
}

/**
 * Delete feed items from Google Sheets by ID
 */
export async function deleteFeedItemsFromSheets(
  spreadsheetId: string,
  itemIds: string[]
): Promise<number> {
  return deleteRowsByIds(spreadsheetId, 'feed', itemIds);
}

/**
 * Delete quizzes from Google Sheets by ID
 */
export async function deleteQuizzesFromSheets(
  spreadsheetId: string,
  quizIds: string[]
): Promise<number> {
  return deleteRowsByIds(spreadsheetId, 'quizzes', quizIds);
}
