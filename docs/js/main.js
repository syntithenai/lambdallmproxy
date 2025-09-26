// main.js - Main application initialization and coordination

// Global request state
let currentRequest = null;

// Initialize the application
function initializeApp() {
    // Check for OAuth redirect first, then initialize Google services
    if (!handleOAuthRedirect()) {
        // Initialize Google OAuth when the page loads
        setTimeout(initializeGoogleOAuth, 1000); // Delay to ensure Google script is loaded
    }
    
    // Initialize settings
    initializeSettings();
    
    // Initialize sample queries
    initializeSampleQueries();
    
    // Set up login button handler
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }
    
    // Update UI state
    updateModelAvailability();
    updateSubmitButton();
    
    console.log('Application initialized');
}

// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}