// auth.js - Google OAuth authentication handling

// Global Google OAuth variables
let googleUser = null;
let googleAccessToken = null;

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com'; // Replaced during build process

// Auth banner helpers
function setAuthBanner(kind, html) {
    const authBanner = document.getElementById('auth-banner');
    if (!authBanner) return;
    authBanner.className = `auth-banner ${kind}`;
    authBanner.innerHTML = html;
    authBanner.style.display = 'block';
}

function clearAuthBanner() {
    const authBanner = document.getElementById('auth-banner');
    if (!authBanner) return;
    authBanner.style.display = 'none';
    authBanner.className = 'auth-banner';
    authBanner.innerHTML = '';
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
        if (savedToken && savedUser) {
            // Validate token locally (works for both ID tokens and access tokens)
            if (isGoogleTokenValid(savedToken)) {
                googleAccessToken = savedToken;
                googleUser = JSON.parse(savedUser);
                updateLoginUI(true);
                updateSubmitButton();
                updateModelAvailability();
                console.log('Restored Google session');
            } else {
                // Token is expired or invalid, clear session
                localStorage.removeItem('google_access_token');
                localStorage.removeItem('google_user');
                googleAccessToken = null;
                googleUser = null;
                updateLoginUI(false);
                updateSubmitButton();
                updateModelAvailability();
                console.log('Cleared expired Google session; please sign in again');
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
        
        updateLoginUI(true);
        updateSubmitButton();
        updateModelAvailability();
        console.log('Google sign-in successful:', googleUser.email);
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
        loginBtn.classList.add('logged-in');
        loginBtn.innerHTML = `
            <div class="profile-container">
                <img src="${googleUser.picture}" alt="Profile" class="profile-picture">
                <span class="logout-text">Logout</span>
            </div>
        `;
        setAuthBanner('ok', `
            <strong>Signed in as ${googleUser.email}</strong><br>
            <small>If your account is authorized, the server can use its own provider API keys when you leave the key fields empty.</small>
        `);
    } else {
        loginBtn.classList.remove('logged-in');
        loginBtn.innerHTML = '<span id="login-text">Sign in with Google</span>';
        setAuthBanner('warn', `
            <strong>Not signed in</strong> — Provide your own OpenAI/Groq API key in Settings to enable requests.
        `);
    }
}

// Validate Google token (works with both ID tokens and access tokens)
function isGoogleTokenValid(token) {
    if (!token) return false;
    
    // Try to parse as JWT (ID token)
    try {
        const payload = parseJwt(token);
        if (payload && payload.exp) {
            const now = Math.floor(Date.now() / 1000);
            return payload.exp > now;
        }
    } catch (e) {
        // Not a JWT, treat as access token
    }
    
    // For access tokens or if JWT parsing failed, do basic validation
    return token.length > 20; // Basic sanity check
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
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_user');
    updateLoginUI(false);
    updateSubmitButton();
    updateModelAvailability();
    console.log('Logged out');
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
            console.log('Using ID token for server authentication');
        } else {
            localStorage.setItem('google_access_token', accessToken);
            googleAccessToken = accessToken;
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
                localStorage.setItem('google_user', JSON.stringify(googleUser));
                updateLoginUI(true);
                updateSubmitButton();
                updateModelAvailability();
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
                    localStorage.setItem('google_user', JSON.stringify(googleUser));
                    updateLoginUI(true);
                    updateSubmitButton();
                    updateModelAvailability();
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

// Expose globals
window.isGoogleTokenValid = isGoogleTokenValid;
window.googleUser = googleUser;
window.googleAccessToken = googleAccessToken;