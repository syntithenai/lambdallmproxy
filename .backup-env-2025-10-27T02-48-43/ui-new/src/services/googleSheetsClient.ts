/**
 * Client-side Google Sheets API integration
 * Uses Google Identity Services (GIS) for OAuth 2.0 token flow
 * Allows direct browser → Sheets API calls (no backend Lambda needed)
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

// GIS token client (initialized once)
let gisTokenClient: TokenClient | null = null;
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Initialize Google Identity Services
 * Call this once on app startup after GIS script loads
 */
export function initGoogleIdentity(clientId: string): void {
  if (!clientId) {
    console.warn('⚠️ GOOGLE_CLIENT_ID not configured - client-side Sheets sync disabled');
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
 * Caches token and reuses until near expiration
 */
export async function getAccessToken(options?: { prompt?: string }): Promise<string> {
  if (!gisTokenClient) {
    throw new Error('Google Identity Services not initialized. Call initGoogleIdentity() first.');
  }

  // Return cached token if still valid (with 1 minute buffer)
  const now = Date.now();
  if (cachedAccessToken && tokenExpiresAt > now + 60000) {
    console.log('🔐 Using cached access token');
    return cachedAccessToken;
  }

  // Request new token
  return new Promise<string>((resolve, reject) => {
    if (!gisTokenClient) {
      return reject(new Error('Token client not initialized'));
    }

    // Set callback for this specific request
    gisTokenClient.callback = (response: TokenResponse | { error: string }) => {
      if ('error' in response) {
        console.error('❌ OAuth error:', response.error);
        return reject(new Error(`OAuth error: ${response.error}`));
      }

      if (!response.access_token) {
        return reject(new Error('No access token received'));
      }

      // Cache token
      cachedAccessToken = response.access_token;
      tokenExpiresAt = Date.now() + (response.expires_in * 1000);
      
      console.log('✅ Access token obtained (expires in', response.expires_in, 'seconds)');
      resolve(response.access_token);
    };

    // Trigger OAuth consent flow
    gisTokenClient.requestAccessToken(options);
  });
}

/**
 * Clear cached token (useful for logout or re-auth)
 */
export function clearAccessToken(): void {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  console.log('🔐 Access token cleared');
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
