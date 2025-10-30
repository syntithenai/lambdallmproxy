/**
 * Environment Configuration Utility
 * 
 * Automatically detects whether running locally or in Lambda production
 * and provides environment-specific configuration values.
 */

/**
 * Detect if we're running locally (development server)
 * @returns {boolean} true if running locally, false if in Lambda
 */
function isLocalEnvironment() {
    // Check for common local environment indicators
    return !!(
        process.env.IS_LOCAL === 'true' ||
        process.env.LOCAL_PORT ||
        process.env.NODE_ENV === 'development' ||
        !process.env.AWS_EXECUTION_ENV // AWS Lambda sets this
    );
}

/**
 * Get the OAuth redirect URI based on environment
 * @returns {string} The appropriate OAuth redirect URI
 */
function getOAuthRedirectURI() {
    if (isLocalEnvironment()) {
        const localPort = process.env.LOCAL_PORT || 3000;
        return `http://localhost:${localPort}/oauth/callback`;
    }
    
    // Production Lambda URL
    return process.env.OAUTH_URI || 
           process.env.OAUTH_REDIRECT_URI || 
           'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback';
}

/**
 * Get the base URL for the API
 * @returns {string} The base URL
 */
function getBaseURL() {
    if (isLocalEnvironment()) {
        const localPort = process.env.LOCAL_PORT || 3000;
        return `http://localhost:${localPort}`;
    }
    
    return process.env.LAMBDA_URL || 
           'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';
}

/**
 * Get environment name
 * @returns {string} 'local' or 'production'
 */
function getEnvironmentName() {
    return isLocalEnvironment() ? 'local' : 'production';
}

/**
 * Log environment configuration on startup
 */
function logEnvironmentConfig() {
    const env = getEnvironmentName();
    const oauthUri = getOAuthRedirectURI();
    const baseUrl = getBaseURL();
    
    console.log('🌍 Environment Configuration:');
    console.log(`   Environment: ${env}`);
    console.log(`   Base URL: ${baseUrl}`);
    console.log(`   OAuth Redirect URI: ${oauthUri}`);
    console.log(`   AWS Execution Env: ${process.env.AWS_EXECUTION_ENV || 'none (local)'}`);
}

module.exports = {
    isLocalEnvironment,
    getOAuthRedirectURI,
    getBaseURL,
    getEnvironmentName,
    logEnvironmentConfig
};
