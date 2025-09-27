// auth.js - Google OAuth authentication handling

// Global Google OAuth variables
let googleUser = null;
let googleAccessToken = null;
let googleRefreshToken = null;
let tokenRefreshTimer = null;
let tokenValidationTimer = null;
let lastTokenRefresh = null;

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com';
const TOKEN_REFRESH_INTERVAL = 45 * 60 * 1000; // 45 minutes
const TOKEN_VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Auth toast helpers
function setAuthBanner(kind, html) {
    // Convert auth banner to toast notification
    let type = 'info';
    if (kind === 'ok' || kind === 'success') type = 'success';
    else if (kind === 'warn') type = 'warning';
    else if (kind === 'error') type = 'error';
    
    // Clean HTML for toast display
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (typeof showToast === 'function') {
        showToast(text, type);
    }
}

function clearAuthBanner() {
    // No longer needed with toast system, but keep for compatibility
}

// Google OAuth functions
function initializeGoogleOAuth() {
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleSignIn
        });

        // Note: Automatic FedCM prompt removed to avoid network errors
        // Authentication is now manual-only via login button
        
        // Try to restore previous session
        const savedToken = localStorage.getItem('google_access_token');
        const savedUser = localStorage.getItem('google_user');
        const savedRefreshToken = localStorage.getItem('google_refresh_token');
        const savedLastRefresh = localStorage.getItem('last_token_refresh');
        
        if (savedToken && savedUser) {
            // Validate token locally (works for both ID tokens and access tokens)
            if (isGoogleTokenValid(savedToken)) {
                googleAccessToken = savedToken;
                googleUser = JSON.parse(savedUser);
                googleRefreshToken = savedRefreshToken; // May be null for ID tokens
                lastTokenRefresh = savedLastRefresh ? parseInt(savedLastRefresh) : null;
                
                // Update window globals
                window.googleUser = googleUser;
                window.googleAccessToken = googleAccessToken;
                
                updateLoginUI(true);
                updateTokenStatus(true);
                
                // Start background token refresh and validation
                startTokenRefreshTimer();
                
                // Check if token needs immediate refresh
                if (tokenNeedsRefresh(googleAccessToken)) {
                    console.log('Token needs refresh - refreshing now');
                    setTimeout(() => refreshGoogleToken(), 1000);
                }
                
                // Wait for other modules to load before updating UI state
                setTimeout(() => {
                    if (typeof updateSubmitButton === 'function') {
                        updateSubmitButton();
                    }
                    if (typeof updateModelAvailability === 'function') {
                        updateModelAvailability();
                    }
                }, 100);
                console.log('Restored Google session with background refresh enabled');
            } else {
                // Token is expired or invalid - try refresh first if refresh token available
                if (savedRefreshToken) {
                    googleRefreshToken = savedRefreshToken;
                    console.log('Token expired but refresh token available - attempting refresh');
                    setTimeout(async () => {
                        const refreshSuccess = await refreshGoogleToken();
                        if (refreshSuccess) {
                            // Session restored via refresh
                            googleUser = JSON.parse(savedUser);
                            window.googleUser = googleUser;
                            updateLoginUI(true);
                            updateTokenStatus(true);
                            startTokenRefreshTimer();
                        }
                        // If refresh fails, handleTokenExpired() is called automatically
                    }, 500);
                } else {
                    // No refresh token available, clear session
                    handleTokenExpired();
                }
            }
        }
    } else {
        console.error('Google Identity Services not loaded');
    }
}

function handleGoogleSignIn(response) {
    try {
        // Decode the JWT token to get user info
        const userInfo = parseJwt(response.credential);
        googleUser = {
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture
        };
        googleAccessToken = response.credential;
        
        // Save to localStorage
        localStorage.setItem('google_access_token', googleAccessToken);
        localStorage.setItem('google_user', JSON.stringify(googleUser));
        lastTokenRefresh = Date.now();
        localStorage.setItem('last_token_refresh', lastTokenRefresh.toString());
        
        // Update window globals
        window.googleUser = googleUser;
        window.googleAccessToken = googleAccessToken;
        
        console.log('OAuth sign-in successful (ID token):', googleUser.email);
        console.log('Token validation after storage:', isGoogleTokenValid(googleAccessToken));
        console.log('Window globals updated:', {
            googleUser: window.googleUser ? window.googleUser.email : 'null',
            googleAccessToken: window.googleAccessToken ? 'present' : 'null',
            localStorageToken: localStorage.getItem('google_access_token') ? 'present' : 'null'
        });
        
        updateLoginUI(true);
        updateTokenStatus(true);
        
        // Start background token refresh and validation
        startTokenRefreshTimer();
        
        // Wait for all modules to load before updating UI state
        setTimeout(() => {
            if (typeof updateSubmitButton === 'function') {
                updateSubmitButton();
            } else {
                console.warn('updateSubmitButton function not available yet');
            }
            if (typeof updateModelAvailability === 'function') {
                updateModelAvailability();
            } else {
                console.warn('updateModelAvailability function not available yet');
            }
        }, 200);
    } catch (error) {
        console.error('Error handling Google sign-in:', error);
    }
}

function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

function updateLoginUI(isLoggedIn) {
    const loginBtn = document.getElementById('login-btn');
    if (!loginBtn) return;
    
    if (isLoggedIn && googleUser) {
        const tokenValid = isGoogleTokenValid(googleAccessToken);
        const needsRefresh = googleAccessToken && tokenNeedsRefresh(googleAccessToken);
        
        loginBtn.classList.add('logged-in');
        loginBtn.innerHTML = `
            <div class="profile-container">
                <img src="${googleUser.picture}" alt="Profile" class="profile-picture">
                <span class="logout-text">Logout</span>
            </div>
        `;
        
        // Show token status in auth banner
        if (tokenValid) {
            if (needsRefresh) {
                setAuthBanner('warn', `
                    <strong>⚠️ Signed in as ${googleUser.email}</strong><br>
                    <small>Your session will expire soon. It will be automatically refreshed.</small>
                `);
            } else {
                setAuthBanner('ok', `
                    <strong>✅ Signed in as ${googleUser.email}</strong><br>
                    <small>If your account is authorized, the server can use its own provider API keys when you leave the key fields empty.</small>
                `);
            }
        } else {
            setAuthBanner('error', `
                <strong>❌ Authentication Expired (${googleUser.email})</strong><br>
                <small>Your session has expired. Please sign in again or provide API keys in Settings.</small>
            `);
        }
    } else {
        loginBtn.classList.remove('logged-in');
        loginBtn.innerHTML = '<span id="login-text">Sign in with Google</span>';
        
        // Check if there's a user but invalid token (expired scenario)
        if (googleUser && googleAccessToken && !isGoogleTokenValid(googleAccessToken)) {
            setAuthBanner('error', `
                <strong>❌ Session Expired</strong><br>
                <small>Your authentication has expired. Please sign in again to continue.</small>
            `);
        } else {
            setAuthBanner('warn', `
                <strong>Not signed in</strong> — Provide your own OpenAI/Groq API key in Settings to enable requests.
            `);
        }
    }
    
    // Update submit button and model availability after login state changes
    if (typeof updateSubmitButton === 'function') {
        updateSubmitButton();
    }
    if (typeof updateModelAvailability === 'function') {
        updateModelAvailability();
    }
}

// Validate Google token (works with both ID tokens and access tokens)
function isGoogleTokenValid(token, marginSeconds = 300) {
    if (!token) return false;
    
    // Try to parse as JWT (ID token)
    try {
        const payload = parseJwt(token);
        if (payload && payload.exp) {
            const now = Math.floor(Date.now() / 1000);
            // Add margin to prevent using tokens that are about to expire
            return payload.exp > (now + marginSeconds);
        }
    } catch (e) {
        // Not a JWT, treat as access token
        console.warn('Token validation error (treating as access token):', e);
    }
    
    // For access tokens or if JWT parsing failed, do basic validation
    return token.length > 20; // Basic sanity check
}

// Check if token needs refresh (expires within next 10 minutes)
function tokenNeedsRefresh(token) {
    if (!token) return true;
    
    try {
        const payload = parseJwt(token);
        if (payload && payload.exp) {
            const now = Math.floor(Date.now() / 1000);
            const tenMinutes = 10 * 60;
            return payload.exp <= (now + tenMinutes);
        }
    } catch (e) {
        // If we can't parse, assume it needs refresh
        return true;
    }
    
    return false;
}

// Async validation for OAuth access tokens (optional, more thorough)
async function validateGoogleTokenAsync(token) {
    if (!token) return false;
    try {
        const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
        return response.ok;
    } catch (e) {
        console.warn('Token validation error:', e);
        return false;
    }
}

// Attempt to refresh Google access token
async function refreshGoogleToken() {
    console.log('Attempting to refresh Google token...');
    
    if (!googleRefreshToken) {
        console.warn('No refresh token available - user must re-authenticate');
        await handleTokenExpired();
        return false;
    }
    
    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                refresh_token: googleRefreshToken,
                grant_type: 'refresh_token'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.access_token) {
            // Update tokens
            googleAccessToken = data.access_token;
            localStorage.setItem('google_access_token', googleAccessToken);
            
            // Update refresh token if provided
            if (data.refresh_token) {
                googleRefreshToken = data.refresh_token;
                localStorage.setItem('google_refresh_token', googleRefreshToken);
            }
            
            // Update window globals
            window.googleAccessToken = googleAccessToken;
            
            lastTokenRefresh = Date.now();
            localStorage.setItem('last_token_refresh', lastTokenRefresh.toString());
            
            console.log('Token refreshed successfully');
            setAuthBanner('success', '✅ Authentication refreshed successfully!');
            
            // Clear success message after 3 seconds
            setTimeout(clearAuthBanner, 3000);
            
            // Update UI to reflect valid token
            updateTokenStatus(true);
            
            return true;
        } else {
            throw new Error('No access token in refresh response');
        }
        
    } catch (error) {
        console.error('Token refresh failed:', error);
        await handleTokenExpired();
        return false;
    }
}

// Handle expired or invalid token
async function handleTokenExpired() {
    console.log('Handling expired token - clearing session');
    
    // Clear all tokens and user data
    googleUser = null;
    googleAccessToken = null;
    googleRefreshToken = null;
    
    // Update window globals
    window.googleUser = null;
    window.googleAccessToken = null;
    
    // Clear localStorage
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_refresh_token');
    localStorage.removeItem('google_user');
    localStorage.removeItem('last_token_refresh');
    
    // Stop refresh timers
    stopTokenRefreshTimer();
    
    // Update UI
    updateLoginUI(false);
    updateTokenStatus(false);
    
    // Show authentication required message
    setAuthBanner('warn', `
        <strong>⚠️ Authentication Required</strong><br>
        <small>Your session has expired. Please sign in again to continue.</small>
    `);
    
    console.log('Session cleared - re-authentication required');
}

// Update UI based on token status
function updateTokenStatus(isValid) {
    // Update submit button state
    if (typeof updateSubmitButton === 'function') {
        updateSubmitButton();
    }
    
    // Update model availability
    if (typeof updateModelAvailability === 'function') {
        updateModelAvailability();
    }
    
    // Update any token status indicators
    const statusElements = document.querySelectorAll('.token-status');
    statusElements.forEach(el => {
        if (isValid) {
            el.textContent = '✅ Authenticated';
            el.className = 'token-status token-valid';
        } else {
            el.textContent = '❌ Authentication Required';
            el.className = 'token-status token-invalid';
        }
    });
}

// Start background token refresh and validation
function startTokenRefreshTimer() {
    // Clear existing timers
    stopTokenRefreshTimer();
    
    console.log('Starting token refresh and validation timers');
    
    // Set up token refresh timer (every 45 minutes)
    tokenRefreshTimer = setInterval(async () => {
        if (googleAccessToken && tokenNeedsRefresh(googleAccessToken)) {
            console.log('Background token refresh triggered');
            await refreshGoogleToken();
        }
    }, TOKEN_REFRESH_INTERVAL);
    
    // Set up token validation timer (every 5 minutes)
    tokenValidationTimer = setInterval(async () => {
        if (googleAccessToken && !isGoogleTokenValid(googleAccessToken)) {
            console.log('Token validation failed - attempting refresh');
            const refreshSuccess = await refreshGoogleToken();
            if (!refreshSuccess) {
                console.log('Token refresh failed - user must re-authenticate');
            }
        }
    }, TOKEN_VALIDATION_INTERVAL);
}

function stopTokenRefreshTimer() {
    if (tokenRefreshTimer) {
        clearInterval(tokenRefreshTimer);
        tokenRefreshTimer = null;
    }
    if (tokenValidationTimer) {
        clearInterval(tokenValidationTimer);
        tokenValidationTimer = null;
    }
    console.log('Token refresh timers stopped');
}

function handleLogin() {
    if (googleUser) {
        // User is logged in, so logout
        logout();
    } else {
        // User is not logged in - use OAuth 2.0 authorization flow instead of FedCM
        if (typeof google !== 'undefined' && google.accounts) {
            try {
                // Use OAuth 2.0 implicit flow with ID token for server compatibility
                const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                    `client_id=${GOOGLE_CLIENT_ID}&` +
                    `redirect_uri=${encodeURIComponent(window.location.origin + window.location.pathname)}&` +
                    `response_type=id_token%20token&` +
                    `scope=openid%20profile%20email&` +
                    `nonce=${Date.now()}&` +
                    `state=auth_request`;
                
                console.log('Redirecting to Google OAuth (bypassing FedCM to avoid errors)');
                setAuthBanner('info', `
                    <strong>Redirecting to Google Sign-In</strong><br>
                    <small>You will be redirected to Google's secure sign-in page...</small>
                `);
                
                // Small delay to show the message, then redirect
                setTimeout(() => {
                    window.location.href = authUrl;
                }, 1000);
                
            } catch (e) {
                console.warn('OAuth redirect error:', e);
                setAuthBanner('warn', `
                    <strong>Sign-in error</strong><br>
                    <small>Please provide your own API key in Settings to continue.</small>
                `);
            }
        } else {
            console.error('Google Identity Services not available');
            setAuthBanner('warn', `
                <strong>Google Sign-In unavailable</strong><br>
                <small>Please provide your own OpenAI/Groq API key in Settings to enable requests.</small>
            `);
        }
    }
}

function logout() {
    googleUser = null;
    googleAccessToken = null;
    googleRefreshToken = null;
    
    // Update window globals
    window.googleUser = null;
    window.googleAccessToken = null;
    
    // Clear all stored data
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_refresh_token');
    localStorage.removeItem('google_user');
    localStorage.removeItem('last_token_refresh');
    
    // Stop refresh timers
    stopTokenRefreshTimer();
    
    // Update UI
    updateLoginUI(false);
    updateTokenStatus(false);
    clearAuthBanner();
    
    if (typeof updateSubmitButton === 'function') updateSubmitButton();
    if (typeof updateModelAvailability === 'function') updateModelAvailability();
    console.log('Logged out and cleared all session data');
}

// Handle OAuth redirect if present
function handleOAuthRedirect() {
    const urlParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = urlParams.get('access_token');
    const idToken = urlParams.get('id_token');
    const state = urlParams.get('state');
    
    if (accessToken && state === 'auth_request') {
        console.log('Processing OAuth redirect...');
        // Clean up the URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Store both tokens - use ID token for server auth, access token for API calls
        if (idToken) {
            localStorage.setItem('google_access_token', idToken); // Store ID token as "access token" for server compatibility
            googleAccessToken = idToken;
            window.googleAccessToken = googleAccessToken; // Make available globally
            console.log('Using ID token for server authentication');
        } else {
            localStorage.setItem('google_access_token', accessToken);
            googleAccessToken = accessToken;
            window.googleAccessToken = googleAccessToken; // Make available globally
            console.log('Using access token (ID token not available)');
        }
        
        // Get user profile - either from ID token or API call
        if (idToken) {
            try {
                // Parse user info from ID token
                const payload = parseJwt(idToken);
                googleUser = {
                    email: payload.email,
                    name: payload.name,
                    picture: payload.picture
                };
                window.googleUser = googleUser; // Make available globally
                localStorage.setItem('google_user', JSON.stringify(googleUser));
                updateLoginUI(true);
                if (typeof updateSubmitButton === 'function') updateSubmitButton();
                if (typeof updateModelAvailability === 'function') updateModelAvailability();
                console.log('OAuth sign-in successful (ID token):', googleUser.email);
            } catch (error) {
                console.error('Error parsing ID token:', error);
                setAuthBanner('warn', 'Sign-in completed but could not parse user info from ID token.');
            }
        } else {
            // Fallback to API call with access token
            fetch('https://www.googleapis.com/oauth2/v1/userinfo?access_token=' + accessToken)
                .then(response => response.json())
                .then(userInfo => {
                    googleUser = {
                        email: userInfo.email,
                        name: userInfo.name,
                        picture: userInfo.picture
                    };
                    window.googleUser = googleUser; // Make available globally
                    localStorage.setItem('google_user', JSON.stringify(googleUser));
                    updateLoginUI(true);
                    if (typeof updateSubmitButton === 'function') updateSubmitButton();
                    if (typeof updateModelAvailability === 'function') updateModelAvailability();
                    console.log('OAuth sign-in successful (access token):', googleUser.email);
                })
                .catch(error => {
                    console.error('Error fetching user info:', error);
                    setAuthBanner('warn', 'Sign-in completed but could not fetch user info. Please try again.');
                });
        }
        return true;
    }
    return false;
}

// FedCM/GIS prompt diagnostics callback
function promptDiagnostics(notification) {
    try {
        if (!notification) return;
        if (notification.isDisplayed && notification.isDisplayed()) {
            console.log('Google prompt displayed');
        }
        if (notification.isNotDisplayed && notification.isNotDisplayed()) {
            const reason = notification.getNotDisplayedReason && notification.getNotDisplayedReason();
            console.warn('Google prompt not displayed:', reason);
        }
        if (notification.isSkippedMoment && notification.isSkippedMoment()) {
            const reason = notification.getSkippedReason && notification.getSkippedReason();
            console.warn('Google prompt skipped:', reason);
        }
        if (notification.isDismissedMoment && notification.isDismissedMoment()) {
            const reason = notification.getDismissedReason && notification.getDismissedReason();
            console.warn('Google prompt dismissed:', reason);
        }
    } catch (e) {
        console.warn('Google prompt diagnostics error:', e);
    }
}

// Public function to check if user is authenticated and token is valid
function isAuthenticated() {
    return googleUser && googleAccessToken && isGoogleTokenValid(googleAccessToken);
}

// Public function to ensure valid token before API calls
async function ensureValidToken() {
    if (!googleUser || !googleAccessToken) {
        console.warn('No authentication - user must sign in');
        return false;
    }
    
    if (!isGoogleTokenValid(googleAccessToken)) {
        console.log('Token invalid - attempting refresh');
        const refreshSuccess = await refreshGoogleToken();
        if (!refreshSuccess) {
            console.warn('Token refresh failed - user must re-authenticate');
            return false;
        }
    }
    
    return true;
}

// Expose globals
window.isGoogleTokenValid = isGoogleTokenValid;
window.isAuthenticated = isAuthenticated;
window.ensureValidToken = ensureValidToken;
window.refreshGoogleToken = refreshGoogleToken;
window.googleUser = googleUser;
window.googleAccessToken = googleAccessToken;