/**
 * Google Sheets Service
 * 
 * Handles synchronization of tabular data to Google Sheets
 * Uses sharding for large content
 * 
 * NOTE: Requires gapi library and OAuth setup
 */

/// <reference types="gapi" />
/// <reference types="gapi.client.sheets" />

import { shardContent, reassembleShards } from './sharding';
import type { Snippet, RAGData, Quiz, QuizAnalytics } from '../types/persistence';

/**
 * Spreadsheet name in Google Drive
 */
const SPREADSHEET_NAME = 'Research Agent Data';

/**
 * Sheet tab names
 */
const SHEET_TABS = {
  SNIPPETS: 'Snippets',
  RAG: 'RAG',
  QUIZZES: 'Quizzes',
  QUIZ_ANALYTICS: 'QuizAnalytics',
};

/**
 * Find a spreadsheet by name
 */
async function findSpreadsheet(name: string): Promise<string | null> {
  const response = await gapi.client.drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  const files = response.result.files;
  return files && files.length > 0 ? files[0].id! : null;
}

/**
 * Find or create the Research Agent Data spreadsheet
 * 
 * @returns Spreadsheet ID
 */
export async function ensureSpreadsheet(): Promise<string> {
  console.log('[GoogleSheets] Ensuring spreadsheet...');
  
  let spreadsheetId = await findSpreadsheet(SPREADSHEET_NAME);
  
  if (!spreadsheetId) {
    console.log('[GoogleSheets] Creating new spreadsheet...');
    
    // Create new spreadsheet with all sheets
    const response = await gapi.client.sheets.spreadsheets.create({
      resource: {
        properties: {
          title: SPREADSHEET_NAME
        },
        sheets: [
          { properties: { title: SHEET_TABS.SNIPPETS } },
          { properties: { title: SHEET_TABS.RAG } },
          { properties: { title: SHEET_TABS.QUIZZES } },
          { properties: { title: SHEET_TABS.QUIZ_ANALYTICS } }
        ]
      }
    });
    
    spreadsheetId = response.result.spreadsheetId!;
  }
  
  console.log('[GoogleSheets] Spreadsheet ID:', spreadsheetId);
  return spreadsheetId;
}

/**
 * Sync snippets to Google Sheets
 * 
 * @param snippets - Array of snippets to sync
 */
export async function syncSnippetsToSheets(snippets: Snippet[]): Promise<void> {
  console.log(`[GoogleSheets] Syncing ${snippets.length} snippets...`);
  
  const spreadsheetId = await ensureSpreadsheet();
  
  // Strip userId and shard content
  const rows: any[][] = [
    // Header row
    ['id', 'content', 'tags', 'type', 'title', 'projectId', 'source', 'language', 'createdAt', 'updatedAt', '_shardCount', '_shardIndex']
  ];
  
  for (const snippet of snippets) {
    const { userId, ...snippetWithoutUserId } = snippet;
    const shardedRows = shardContent(snippetWithoutUserId, 45000);
    
    for (const shard of shardedRows) {
      rows.push([
        shard.id,
        shard.content || '',
        Array.isArray(shard.tags) ? shard.tags.join(',') : '',
        shard.type || '',
        shard.title || '',
        shard.projectId || '',
        shard.source || '',
        shard.language || '',
        shard.createdAt || '',
        shard.updatedAt || '',
        shard._shardCount || '',
        shard._shardIndex || '',
      ]);
    }
  }
  
  console.log(`[GoogleSheets] Prepared ${rows.length} rows (including header and shards)`);
  
  // Clear existing data
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_TABS.SNIPPETS}!A:Z`,
    resource: {}
  });
  
  // Write all rows
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TABS.SNIPPETS}!A1`,
    valueInputOption: 'RAW',
    resource: {
      values: rows
    }
  });
  
  console.log(`[GoogleSheets] ✅ Synced ${snippets.length} snippets to Google Sheets`);
}

/**
 * Load snippets from Google Sheets
 * 
 * @param userId - User's email (restored after download)
 * @returns Array of snippets
 */
export async function loadSnippetsFromSheets(userId: string): Promise<Snippet[]> {
  console.log(`[GoogleSheets] Loading snippets for ${userId}...`);
  
  const spreadsheetId = await ensureSpreadsheet();
  
  // Read all rows
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TABS.SNIPPETS}!A:Z`
  });
  
  const rows = response.result.values;
  
  if (!rows || rows.length <= 1) {
    console.log('[GoogleSheets] No snippet data found');
    return [];
  }
  
  // Parse rows (skip header)
  const shardedSnippets = rows.slice(1).map(row => ({
    id: row[0],
    content: row[1] || '',
    tags: row[2] ? row[2].split(',') : [],
    type: row[3] || 'manual',
    title: row[4] || '',
    projectId: row[5] || '',
    source: row[6] || '',
    language: row[7] || '',
    createdAt: row[8] || new Date().toISOString(),
    updatedAt: row[9] || new Date().toISOString(),
    _shardCount: row[10] ? parseInt(row[10]) : undefined,
    _shardIndex: row[11] ? parseInt(row[11]) : undefined,
  }));
  
  // Reassemble shards
  const snippetsWithoutUserId = reassembleShards(shardedSnippets);
  
  // Add userId back
  return snippetsWithoutUserId.map(snippet => ({ ...snippet, userId } as Snippet));
}

/**
 * Sync RAG data to Google Sheets
 * 
 * @param ragData - Array of RAG data to sync
 */
export async function syncRAGToSheets(ragData: RAGData[]): Promise<void> {
  console.log(`[GoogleSheets] Syncing ${ragData.length} RAG entries...`);
  
  const spreadsheetId = await ensureSpreadsheet();
  
  const rows: any[][] = [
    // Header row
    ['id', 'content', 'embedding', 'source', 'metadata', 'createdAt', 'updatedAt', '_shardCount', '_shardIndex']
  ];
  
  for (const rag of ragData) {
    const { userId, ...ragWithoutUserId } = rag;
    const shardedRows = shardContent(ragWithoutUserId, 45000);
    
    for (const shard of shardedRows) {
      rows.push([
        shard.id,
        shard.content || '',
        shard.embedding ? JSON.stringify(shard.embedding) : '',
        shard.source || '',
        shard.metadata ? JSON.stringify(shard.metadata) : '',
        shard.createdAt || '',
        shard.updatedAt || '',
        shard._shardCount || '',
        shard._shardIndex || '',
      ]);
    }
  }
  
  console.log(`[GoogleSheets] Prepared ${rows.length} RAG rows (including header and shards)`);
  
  // Clear existing data
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_TABS.RAG}!A:Z`,
    resource: {}
  });
  
  // Write all rows
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TABS.RAG}!A1`,
    valueInputOption: 'RAW',
    resource: {
      values: rows
    }
  });
  
  console.log(`[GoogleSheets] ✅ Synced ${ragData.length} RAG entries to Google Sheets`);
}

/**
 * Load RAG data from Google Sheets
 * 
 * @param userId - User's email
 * @returns Array of RAG data
 */
export async function loadRAGFromSheets(userId: string): Promise<RAGData[]> {
  console.log(`[GoogleSheets] Loading RAG data for ${userId}...`);
  
  const spreadsheetId = await ensureSpreadsheet();
  
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TABS.RAG}!A:Z`
  });
  
  const rows = response.result.values;
  
  if (!rows || rows.length <= 1) {
    console.log('[GoogleSheets] No RAG data found');
    return [];
  }
  
  // Parse rows (skip header)
  const shardedRAG = rows.slice(1).map(row => ({
    id: row[0],
    content: row[1] || '',
    embedding: row[2] ? JSON.parse(row[2]) : undefined,
    source: row[3] || '',
    metadata: row[4] ? JSON.parse(row[4]) : undefined,
    createdAt: row[5] || new Date().toISOString(),
    updatedAt: row[6] || new Date().toISOString(),
    _shardCount: row[7] ? parseInt(row[7]) : undefined,
    _shardIndex: row[8] ? parseInt(row[8]) : undefined,
  }));
  
  // Reassemble shards
  const ragWithoutUserId = reassembleShards(shardedRAG);
  
  // Add userId back
  return ragWithoutUserId.map(rag => ({ ...rag, userId } as RAGData));
}

/**
 * Sync quizzes to Google Sheets
 * 
 * @param quizzes - Array of quizzes to sync
 */
export async function syncQuizzesToSheets(quizzes: Quiz[]): Promise<void> {
  console.log(`[GoogleSheets] Syncing ${quizzes.length} quizzes...`);
  
  const spreadsheetId = await ensureSpreadsheet();
  
  const rows: any[][] = [
    // Header row
    ['id', 'questions', 'title', 'projectId', 'createdAt', 'updatedAt', '_shardCount', '_shardIndex']
  ];
  
  for (const quiz of quizzes) {
    const { userId, questions, ...quizWithoutUserId } = quiz;
    
    // Serialize questions to JSON string
    const quizWithSerializedQuestions = {
      ...quizWithoutUserId,
      content: JSON.stringify(questions),
    };
    
    const shardedRows = shardContent(quizWithSerializedQuestions, 45000);
    
    for (const shard of shardedRows) {
      rows.push([
        shard.id,
        shard.content || '',
        shard.title || '',
        shard.projectId || '',
        shard.createdAt || '',
        shard.updatedAt || '',
        shard._shardCount || '',
        shard._shardIndex || '',
      ]);
    }
  }
  
  console.log(`[GoogleSheets] Prepared ${rows.length} quiz rows (including header and shards)`);
  
  // Clear existing data
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_TABS.QUIZZES}!A:Z`,
    resource: {}
  });
  
  // Write all rows
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TABS.QUIZZES}!A1`,
    valueInputOption: 'RAW',
    resource: {
      values: rows
    }
  });
  
  console.log(`[GoogleSheets] ✅ Synced ${quizzes.length} quizzes to Google Sheets`);
}

/**
 * Load quizzes from Google Sheets
 * 
 * @param userId - User's email
 * @returns Array of quizzes
 */
export async function loadQuizzesFromSheets(userId: string): Promise<Quiz[]> {
  console.log(`[GoogleSheets] Loading quizzes for ${userId}...`);
  
  const spreadsheetId = await ensureSpreadsheet();
  
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TABS.QUIZZES}!A:Z`
  });
  
  const rows = response.result.values;
  
  if (!rows || rows.length <= 1) {
    console.log('[GoogleSheets] No quiz data found');
    return [];
  }
  
  // Parse rows (skip header)
  const shardedQuizzes = rows.slice(1).map(row => ({
    id: row[0],
    content: row[1] || '',
    title: row[2] || '',
    projectId: row[3] || '',
    createdAt: row[4] || new Date().toISOString(),
    updatedAt: row[5] || new Date().toISOString(),
    _shardCount: row[6] ? parseInt(row[6]) : undefined,
    _shardIndex: row[7] ? parseInt(row[7]) : undefined,
  }));
  
  // Reassemble shards
  const quizzesWithSerializedQuestions = reassembleShards(shardedQuizzes);
  
  // Deserialize questions and add userId
  return quizzesWithSerializedQuestions.map(quiz => {
    const questions = quiz.content ? JSON.parse(quiz.content) : [];
    // Remove content field and add questions
    const { content, _shardCount, _shardIndex, ...quizData } = quiz;
    return {
      ...quizData,
      questions,
      userId
    } as Quiz;
  });
}

/**
 * Sync quiz analytics to Google Sheets
 * 
 * @param analytics - Array of quiz analytics to sync
 */
export async function syncQuizAnalyticsToSheets(analytics: QuizAnalytics[]): Promise<void> {
  console.log(`[GoogleSheets] Syncing ${analytics.length} quiz analytics...`);
  
  const spreadsheetId = await ensureSpreadsheet();
  
  const rows: any[][] = [
    // Header row
    ['id', 'quizId', 'totalAttempts', 'averageScore', 'questionStats', 'lastAttempt', 'createdAt', 'updatedAt']
  ];
  
  for (const analytic of analytics) {
    rows.push([
      analytic.id,
      analytic.quizId,
      analytic.totalAttempts,
      analytic.averageScore,
      JSON.stringify(analytic.questionStats),
      analytic.lastAttempt,
      analytic.createdAt,
      analytic.updatedAt,
    ]);
  }
  
  console.log(`[GoogleSheets] Prepared ${rows.length} analytics rows (including header)`);
  
  // Clear existing data
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_TABS.QUIZ_ANALYTICS}!A:Z`,
    resource: {}
  });
  
  // Write all rows
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TABS.QUIZ_ANALYTICS}!A1`,
    valueInputOption: 'RAW',
    resource: {
      values: rows
    }
  });
  
  console.log(`[GoogleSheets] ✅ Synced ${analytics.length} quiz analytics to Google Sheets`);
}

/**
 * Load quiz analytics from Google Sheets
 * 
 * @param userId - User's email
 * @returns Array of quiz analytics
 */
export async function loadQuizAnalyticsFromSheets(userId: string): Promise<QuizAnalytics[]> {
  console.log(`[GoogleSheets] Loading quiz analytics for ${userId}...`);
  
  const spreadsheetId = await ensureSpreadsheet();
  
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TABS.QUIZ_ANALYTICS}!A:Z`
  });
  
  const rows = response.result.values;
  
  if (!rows || rows.length <= 1) {
    console.log('[GoogleSheets] No quiz analytics data found');
    return [];
  }
  
  // Parse rows (skip header)
  return rows.slice(1).map(row => ({
    id: row[0],
    quizId: row[1],
    totalAttempts: parseInt(row[2]) || 0,
    averageScore: parseFloat(row[3]) || 0,
    questionStats: row[4] ? JSON.parse(row[4]) : {},
    lastAttempt: row[5] || new Date().toISOString(),
    createdAt: row[6] || new Date().toISOString(),
    updatedAt: row[7] || new Date().toISOString(),
    userId
  } as QuizAnalytics));
}

/**
 * Sync all data types to Google Sheets
 * 
 * @param data - Object containing all data types
 */
export async function syncAllToSheets(data: {
  snippets: Snippet[];
  ragData: RAGData[];
  quizzes: Quiz[];
  quizAnalytics: QuizAnalytics[];
}): Promise<void> {
  console.log('[GoogleSheets] Starting full sync...');
  
  await syncSnippetsToSheets(data.snippets);
  await syncRAGToSheets(data.ragData);
  await syncQuizzesToSheets(data.quizzes);
  await syncQuizAnalyticsToSheets(data.quizAnalytics);
  
  console.log('[GoogleSheets] Full sync complete');
}

/**
 * Load all data types from Google Sheets
 * 
 * @param userId - User's email
 * @returns Object containing all data types
 */
export async function loadAllFromSheets(userId: string): Promise<{
  snippets: Snippet[];
  ragData: RAGData[];
  quizzes: Quiz[];
  quizAnalytics: QuizAnalytics[];
}> {
  console.log('[GoogleSheets] Starting full load...');
  
  const [snippets, ragData, quizzes, quizAnalytics] = await Promise.all([
    loadSnippetsFromSheets(userId),
    loadRAGFromSheets(userId),
    loadQuizzesFromSheets(userId),
    loadQuizAnalyticsFromSheets(userId),
  ]);
  
  console.log('[GoogleSheets] Full load complete');
  
  return { snippets, ragData, quizzes, quizAnalytics };
}
