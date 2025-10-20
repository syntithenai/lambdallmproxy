/**
 * Sync snippets from Google Sheets "Research Agent Swag" spreadsheet
 * Used to sync backend-created snippets to frontend localStorage
 */

import { getValues } from './googleSheetsClient';
import type { ContentSnippet } from '../contexts/SwagContext';

const SNIPPETS_SHEET_NAME = 'Snippets';

interface GoogleDriveFile {
  id: string;
  name: string;
}

/**
 * Find the "Research Agent/Research Agent Swag" spreadsheet ID
 */
async function findSnippetsSpreadsheet(accessToken: string): Promise<string | null> {
  try {
    // Search for the spreadsheet by name using Google Drive API
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent('Research Agent Swag')}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Drive API error: ${response.statusText}`);
    }

    const data = await response.json();
    const files: GoogleDriveFile[] = data.files || [];

    if (files.length === 0) {
      console.warn('⚠️ "Research Agent Swag" spreadsheet not found');
      return null;
    }

    // Return the first match
    const spreadsheetId = files[0].id;
    console.log(`✅ Found "Research Agent Swag" spreadsheet: ${spreadsheetId}`);
    return spreadsheetId;
  } catch (error) {
    console.error('❌ Error finding snippets spreadsheet:', error);
    throw error;
  }
}

/**
 * Parse a row from Google Sheets into a ContentSnippet
 */
function parseSnippetRow(row: any[]): ContentSnippet | null {
  if (!row || row.length < 5) return null;

  const [id, createdAt, updatedAt, title, content, tagsStr, source] = row;

  // Skip header row or empty rows
  if (!id || id === 'id' || !content) return null;

  // Parse tags
  const tags = tagsStr ? tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

  // Convert Google Sheets timestamps to JS timestamps
  const timestamp = createdAt ? new Date(createdAt).getTime() : Date.now();
  const updateDate = updatedAt ? new Date(updatedAt).getTime() : timestamp;

  // Map source to sourceType
  const sourceType: ContentSnippet['sourceType'] = 
    source === 'chat' || source === 'assistant' ? 'assistant' :
    source === 'user' ? 'user' :
    'tool';

  return {
    id: `sheet-${id}`, // Prefix to distinguish from localStorage snippets
    content: content || '',
    title: title || undefined,
    timestamp,
    updateDate,
    sourceType,
    selected: false,
    tags,
    hasEmbedding: false,
  };
}

/**
 * Fetch a specific snippet by ID from Google Sheets
 */
export async function fetchSnippetById(
  snippetId: number,
  accessToken: string
): Promise<ContentSnippet | null> {
  try {
    const spreadsheetId = await findSnippetsSpreadsheet(accessToken);
    if (!spreadsheetId) {
      throw new Error('Snippets spreadsheet not found');
    }

    // Fetch all rows (we need to find the matching ID)
    const values = await getValues(
      spreadsheetId,
      `${SNIPPETS_SHEET_NAME}!A:H`
    );

    if (!values || values.length < 2) {
      console.warn('⚠️ No snippets found in spreadsheet');
      return null;
    }

    // Skip header row, find matching ID
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rowId = parseInt(row[0], 10);
      
      if (rowId === snippetId) {
        const snippet = parseSnippetRow(row);
        if (snippet) {
          console.log(`✅ Fetched snippet #${snippetId} from Google Sheets:`, snippet.title);
          return snippet;
        }
      }
    }

    console.warn(`⚠️ Snippet #${snippetId} not found in Google Sheets`);
    return null;
  } catch (error) {
    console.error(`❌ Error fetching snippet #${snippetId}:`, error);
    throw error;
  }
}

/**
 * Fetch all snippets from Google Sheets
 */
export async function fetchAllSnippets(
  accessToken: string
): Promise<ContentSnippet[]> {
  try {
    const spreadsheetId = await findSnippetsSpreadsheet(accessToken);
    if (!spreadsheetId) {
      console.warn('⚠️ Snippets spreadsheet not found, no snippets to sync');
      return [];
    }

    // Fetch all rows
    const values = await getValues(
      spreadsheetId,
      `${SNIPPETS_SHEET_NAME}!A:H`
    );

    if (!values || values.length < 2) {
      console.warn('⚠️ No snippets found in spreadsheet');
      return [];
    }

    // Parse rows (skip header)
    const snippets: ContentSnippet[] = [];
    for (let i = 1; i < values.length; i++) {
      const snippet = parseSnippetRow(values[i]);
      if (snippet) {
        snippets.push(snippet);
      }
    }

    console.log(`✅ Fetched ${snippets.length} snippets from Google Sheets`);
    return snippets;
  } catch (error) {
    console.error('❌ Error fetching snippets from Google Sheets:', error);
    throw error;
  }
}
