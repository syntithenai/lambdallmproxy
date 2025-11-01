/**
 * Unified Sync Endpoint
 * Synchronizes all user data types: quizzes, snippets, feed items, config, embeddings
 * 
 * This endpoint handles bidirectional sync between frontend IndexedDB and backend Google Sheets
 * Pattern: Frontend sends local data, backend merges with remote data, returns merged result
 */

const { authenticateRequest } = require('../auth');
const { extractProjectId } = require('../services/user-isolation');

// Import all sync services
const quizService = require('../services/google-sheets-quiz');
const snippetsService = require('../services/google-sheets-snippets');
const feedService = require('../services/google-sheets-feed');

/**
 * Unified sync handler - synchronizes all data types
 * 
 * Request body format:
 * {
 *   quizzes?: { local: Quiz[], lastSyncTime?: string },
 *   snippets?: { local: Snippet[], lastSyncTime?: string },
 *   feedItems?: { local: FeedItem[], lastSyncTime?: string },
 *   config?: { local: Config, lastSyncTime?: string },
 *   embeddings?: { local: Embedding[], lastSyncTime?: string }
 * }
 * 
 * Response format:
 * {
 *   quizzes: { remote: Quiz[], merged: Quiz[], conflicts: [] },
 *   snippets: { remote: Snippet[], merged: Snippet[], conflicts: [] },
 *   feedItems: { remote: FeedItem[], merged: FeedItem[], conflicts: [] },
 *   config: { remote: Config, merged: Config },
 *   embeddings: { remote: Embedding[], merged: Embedding[], conflicts: [] },
 *   syncTime: string
 * }
 */
async function handleUnifiedSync(event) {
    try {
        const authHeader = event.headers?.authorization || event.headers?.Authorization;
        const user = await authenticateRequest(authHeader);
        
        // Get user's Google Drive OAuth token
        const accessToken = event.headers['x-drive-token'] || event.headers['X-Drive-Token'];
        
        if (!accessToken) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Google Drive connection required',
                    message: 'Please connect to Google Drive in Settings → Cloud Sync'
                })
            };
        }
        
        // Extract project ID from headers (optional filter)
        const projectId = extractProjectId(event);
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { quizzes, snippets, feedItems, config, embeddings } = body;
        
        const syncTime = new Date().toISOString();
        const result = {
            syncTime,
            quizzes: null,
            snippets: null,
            feedItems: null,
            config: null,
            embeddings: null
        };
        
        console.log('🔄 Starting unified sync for user:', user.email);
        if (projectId) console.log('   Project filter:', projectId);
        
        // Sync quizzes
        if (quizzes) {
            try {
                result.quizzes = await syncQuizzes(
                    quizzes.local || [],
                    user.email,
                    projectId,
                    accessToken
                );
                console.log(`✅ Quizzes synced: ${result.quizzes.merged.length} items`);
            } catch (error) {
                console.error('❌ Quiz sync error:', error.message);
                result.quizzes = { error: error.message, remote: [], merged: [], conflicts: [] };
            }
        }
        
        // Sync snippets
        if (snippets) {
            try {
                result.snippets = await syncSnippets(
                    snippets.local || [],
                    user.email,
                    projectId,
                    accessToken
                );
                console.log(`✅ Snippets synced: ${result.snippets.merged.length} items`);
            } catch (error) {
                console.error('❌ Snippet sync error:', error.message);
                result.snippets = { error: error.message, remote: [], merged: [], conflicts: [] };
            }
        }
        
        // Sync feed items
        if (feedItems) {
            try {
                result.feedItems = await syncFeedItems(
                    feedItems.local || [],
                    user.email,
                    projectId,
                    accessToken
                );
                console.log(`✅ Feed items synced: ${result.feedItems.merged.length} items`);
            } catch (error) {
                console.error('❌ Feed sync error:', error.message);
                result.feedItems = { error: error.message, remote: [], merged: [], conflicts: [] };
            }
        }
        
        // Sync config (future implementation)
        if (config) {
            try {
                result.config = await syncConfig(
                    config.local || {},
                    user.email,
                    projectId,
                    accessToken
                );
                console.log('✅ Config synced');
            } catch (error) {
                console.error('❌ Config sync error:', error.message);
                result.config = { error: error.message, remote: {}, merged: {} };
            }
        }
        
        // Sync embeddings (future implementation)
        if (embeddings) {
            try {
                result.embeddings = await syncEmbeddings(
                    embeddings.local || [],
                    user.email,
                    projectId,
                    accessToken
                );
                console.log(`✅ Embeddings synced: ${result.embeddings.merged.length} items`);
            } catch (error) {
                console.error('❌ Embeddings sync error:', error.message);
                result.embeddings = { error: error.message, remote: [], merged: [], conflicts: [] };
            }
        }
        
        console.log('✅ Unified sync complete for user:', user.email);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        };
        
    } catch (error) {
        console.error('❌ Unified sync error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: error.message || 'Failed to sync data',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
}

/**
 * Sync quizzes with merge logic
 * Strategy: Backend as source of truth, upload local-only items
 */
async function syncQuizzes(localQuizzes, userEmail, projectId, accessToken) {
    // Get remote quizzes
    const remoteQuizzes = await quizService.getQuizzes(userEmail, projectId, accessToken);
    
    // Create maps for efficient lookup
    const remoteMap = new Map(remoteQuizzes.map(q => [q.id, q]));
    const localMap = new Map(localQuizzes.map(q => [q.id, q]));
    
    const merged = [];
    const conflicts = [];
    
    // Add all remote items (backend is source of truth)
    for (const remote of remoteQuizzes) {
        const local = localMap.get(remote.id);
        
        if (local && local.updated_at > remote.updated_at) {
            // Local is newer - update remote
            try {
                const updated = await quizService.updateQuiz(
                    remote.id,
                    {
                        quiz_title: local.quiz_title,
                        questions: local.questions,
                        completed: local.completed,
                        score: local.score,
                        completed_at: local.completed_at
                    },
                    userEmail,
                    projectId,
                    accessToken
                );
                merged.push(updated);
            } catch (error) {
                console.error(`Failed to update quiz ${remote.id}:`, error.message);
                merged.push(remote); // Keep remote version on error
                conflicts.push({ id: remote.id, reason: 'update_failed', error: error.message });
            }
        } else {
            // Remote is newer or same - use remote
            merged.push(remote);
        }
    }
    
    // Upload local-only items (not in remote)
    for (const local of localQuizzes) {
        if (!remoteMap.has(local.id)) {
            try {
                const inserted = await quizService.insertQuiz(
                    {
                        quiz_title: local.quiz_title,
                        source_content: local.source_content || '',
                        questions: local.questions,
                        completed: local.completed || false,
                        score: local.score || null,
                        completed_at: local.completed_at || ''
                    },
                    userEmail,
                    projectId,
                    accessToken
                );
                merged.push(inserted);
            } catch (error) {
                console.error(`Failed to insert quiz ${local.id}:`, error.message);
                conflicts.push({ id: local.id, reason: 'insert_failed', error: error.message });
            }
        }
    }
    
    return {
        remote: remoteQuizzes,
        merged,
        conflicts
    };
}

/**
 * Sync snippets with merge logic
 * Strategy: Backend as source of truth, upload local-only items
 */
async function syncSnippets(localSnippets, userEmail, projectId, accessToken) {
    // Get remote snippets
    const remoteSnippets = await snippetsService.searchSnippets(
        { query: '', tags: [] },
        userEmail,
        projectId,
        accessToken
    );
    
    const remoteMap = new Map(remoteSnippets.map(s => [s.id, s]));
    const localMap = new Map(localSnippets.map(s => [s.id, s]));
    
    const merged = [];
    const conflicts = [];
    
    // Add all remote items
    for (const remote of remoteSnippets) {
        const local = localMap.get(remote.id);
        
        if (local && local.updated_at > remote.updated_at) {
            // Local is newer - update remote
            try {
                const updated = await snippetsService.updateSnippet(
                    remote.id,
                    {
                        title: local.title,
                        content: local.content,
                        tags: local.tags,
                        source: local.source,
                        url: local.url
                    },
                    userEmail,
                    projectId,
                    accessToken
                );
                merged.push(updated);
            } catch (error) {
                console.error(`Failed to update snippet ${remote.id}:`, error.message);
                merged.push(remote);
                conflicts.push({ id: remote.id, reason: 'update_failed', error: error.message });
            }
        } else {
            merged.push(remote);
        }
    }
    
    // Upload local-only items
    for (const local of localSnippets) {
        if (!remoteMap.has(local.id)) {
            try {
                const inserted = await snippetsService.insertSnippet(
                    {
                        title: local.title,
                        content: local.content,
                        tags: local.tags || [],
                        source: local.source || 'manual',
                        url: local.url || ''
                    },
                    userEmail,
                    projectId,
                    accessToken
                );
                merged.push(inserted);
            } catch (error) {
                console.error(`Failed to insert snippet ${local.id}:`, error.message);
                conflicts.push({ id: local.id, reason: 'insert_failed', error: error.message });
            }
        }
    }
    
    return {
        remote: remoteSnippets,
        merged,
        conflicts
    };
}

/**
 * Sync feed items with merge logic
 * Strategy: Backend as source of truth, upload local-only items
 */
async function syncFeedItems(localItems, userEmail, projectId, accessToken) {
    // Get remote feed items
    const remoteItems = await feedService.getFeedItems(userEmail, projectId, accessToken);
    
    const remoteMap = new Map(remoteItems.map(f => [f.id, f]));
    const localMap = new Map(localItems.map(f => [f.id, f]));
    
    const merged = [];
    const conflicts = [];
    
    // Add all remote items
    for (const remote of remoteItems) {
        const local = localMap.get(remote.id);
        
        if (local && local.updated_at > remote.updated_at) {
            // Local is newer - update remote
            try {
                const updated = await feedService.updateFeedItem(
                    remote.id,
                    {
                        title: local.title,
                        content: local.content,
                        url: local.url,
                        source: local.source,
                        topics: local.topics,
                        is_blocked: local.is_blocked
                    },
                    userEmail,
                    projectId,
                    accessToken
                );
                merged.push(updated);
            } catch (error) {
                console.error(`Failed to update feed item ${remote.id}:`, error.message);
                merged.push(remote);
                conflicts.push({ id: remote.id, reason: 'update_failed', error: error.message });
            }
        } else {
            merged.push(remote);
        }
    }
    
    // Upload local-only items
    for (const local of localItems) {
        if (!remoteMap.has(local.id)) {
            try {
                const inserted = await feedService.insertFeedItem(
                    {
                        title: local.title,
                        content: local.content,
                        url: local.url || '',
                        source: local.source || 'user_saved',
                        topics: local.topics || []
                    },
                    userEmail,
                    projectId,
                    accessToken
                );
                merged.push(inserted);
            } catch (error) {
                console.error(`Failed to insert feed item ${local.id}:`, error.message);
                conflicts.push({ id: local.id, reason: 'insert_failed', error: error.message });
            }
        }
    }
    
    return {
        remote: remoteItems,
        merged,
        conflicts
    };
}

/**
 * Sync config with merge logic
 * Strategy: Backend as source of truth, but merge non-conflicting keys
 * 
 * TODO: Implement config storage service
 */
async function syncConfig(localConfig, userEmail, projectId, accessToken) {
    // Placeholder - to be implemented when config storage is added
    console.log('⚠️ Config sync not yet implemented');
    
    return {
        remote: {},
        merged: localConfig,
        note: 'Config sync not yet implemented - using local config'
    };
}

/**
 * Sync embeddings with merge logic
 * Strategy: Backend as source of truth, upload local-only embeddings
 * 
 * TODO: Implement embeddings storage service
 */
async function syncEmbeddings(localEmbeddings, userEmail, projectId, accessToken) {
    // Placeholder - to be implemented when embeddings storage is added
    console.log('⚠️ Embeddings sync not yet implemented');
    
    return {
        remote: [],
        merged: localEmbeddings,
        conflicts: [],
        note: 'Embeddings sync not yet implemented - using local embeddings'
    };
}

module.exports = {
    handleUnifiedSync
};
