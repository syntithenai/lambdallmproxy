/**
 * User Isolation Utilities
 * 
 * Centralized utilities for enforcing user data isolation and multi-tenancy.
 * All user-generated content must be restricted to the user who created it.
 * 
 * Features:
 * - User email validation
 * - User/project filter building
 * - Project ID extraction from requests
 */

/**
 * Validate user email from authentication
 * Ensures the email is valid and not a placeholder value
 * 
 * @param {string} userEmail - User email from authentication
 * @throws {Error} If email is invalid or missing
 * @returns {string} Validated user email
 */
function validateUserEmail(userEmail) {
    if (!userEmail || 
        userEmail === 'unknown' || 
        userEmail === 'anonymous' || 
        userEmail.trim() === '') {
        throw new Error('User authentication required');
    }
    return userEmail;
}

/**
 * Build filter object for user/project data queries
 * Creates a filter that restricts data access to the current user and optionally project
 * 
 * @param {string} userEmail - User email (required)
 * @param {string|null} projectId - Project ID (optional)
 * @returns {Object} Filter object with user_email and optionally project_id
 */
function buildUserFilter(userEmail, projectId = null) {
    const filter = {
        user_email: userEmail
    };
    
    if (projectId && projectId.trim() !== '') {
        filter.project_id = projectId;
    }
    
    return filter;
}

/**
 * Extract project ID from Lambda event headers
 * Checks both X-Project-ID and x-project-id headers
 * 
 * @param {Object} event - AWS Lambda event object
 * @returns {string|null} Project ID or null if not provided
 */
function extractProjectId(event) {
    if (!event || !event.headers) {
        return null;
    }
    
    return event.headers['x-project-id'] || 
           event.headers['X-Project-ID'] || 
           null;
}

/**
 * Filter array of data rows by user email and optional project ID
 * Used for filtering Google Sheets data after retrieval
 * 
 * @param {Array} rows - Array of data rows (objects with user_email and project_id properties)
 * @param {string} userEmail - User email to filter by
 * @param {string|null} projectId - Project ID to filter by (optional)
 * @returns {Array} Filtered rows belonging to user (and project if specified)
 */
function filterByUserAndProject(rows, userEmail, projectId = null) {
    validateUserEmail(userEmail);
    
    return rows.filter(row => {
        // Must match user email
        if (row.user_email !== userEmail) {
            return false;
        }
        
        // If project ID specified, must match
        if (projectId && row.project_id !== projectId) {
            return false;
        }
        
        return true;
    });
}

/**
 * Check if a row belongs to the current user
 * 
 * @param {Object} row - Data row with user_email property
 * @param {string} userEmail - User email to check
 * @returns {boolean} True if row belongs to user
 */
function belongsToUser(row, userEmail) {
    return row && row.user_email === userEmail;
}

/**
 * Create error response for unauthorized access
 * 
 * @param {string} message - Error message
 * @returns {Object} Lambda response object with 403 status
 */
function createUnauthorizedResponse(message = 'Access denied') {
    return {
        statusCode: 403,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Project-ID, X-Requested-With'
        },
        body: JSON.stringify({
            error: message
        })
    };
}

/**
 * Create error response for missing authentication
 * 
 * @param {string} message - Error message
 * @returns {Object} Lambda response object with 401 status
 */
function createUnauthenticatedResponse(message = 'Authentication required') {
    return {
        statusCode: 401,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Project-ID, X-Requested-With'
        },
        body: JSON.stringify({
            error: message
        })
    };
}

/**
 * Log user data access for security monitoring
 * 
 * @param {string} action - Action performed (e.g., 'created', 'updated', 'deleted', 'accessed')
 * @param {string} resourceType - Type of resource (e.g., 'feed_item', 'snippet', 'quiz')
 * @param {string} resourceId - ID of the resource
 * @param {string} userEmail - User email
 * @param {string|null} projectId - Project ID (optional)
 */
function logUserAccess(action, resourceType, resourceId, userEmail, projectId = null) {
    const timestamp = new Date().toISOString();
    const projectInfo = projectId ? ` (project: ${projectId})` : '';
    console.log(`🔐 [${timestamp}] User ${userEmail} ${action} ${resourceType} ${resourceId}${projectInfo}`);
}

module.exports = {
    validateUserEmail,
    buildUserFilter,
    extractProjectId,
    filterByUserAndProject,
    belongsToUser,
    createUnauthorizedResponse,
    createUnauthenticatedResponse,
    logUserAccess
};
