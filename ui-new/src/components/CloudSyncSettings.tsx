import React, { useState, useEffect } from 'react';
import './CloudSyncSettings.css';
import { useSettings } from '../contexts/SettingsContext';

interface CloudSyncSettingsProps {
  onClose?: () => void;
}

const CloudSyncSettings: React.FC<CloudSyncSettingsProps> = ({ onClose: _onClose }) => {
  const { settings, setSettings } = useSettings();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  // Sync preferences
  const [configSync, setConfigSync] = useState(false);
  const [swagSync, setSwagSync] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    const accessToken = localStorage.getItem('google_drive_access_token');
    const storedEmail = localStorage.getItem('user_email');
    
    if (accessToken && accessToken.length > 0) {
      setIsAuthenticated(true);
      setUserEmail(storedEmail);
    }

    // Load sync preferences from SettingsContext and localStorage
    // Config sync comes from SettingsContext.syncToGoogleDrive
    setConfigSync(settings.syncToGoogleDrive || false);
    
    // Swag sync comes from localStorage
    const swagPref = localStorage.getItem('cloud_sync_swag');
    
    setSwagSync(swagPref !== 'false'); // Default true
  }, [settings.syncToGoogleDrive]);

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if Google Identity Services is loaded
      if (!window.google?.accounts?.oauth2) {
        throw new Error('Google Identity Services not loaded. Please refresh the page.');
      }

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com';
      
      // Initialize the token client
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
        callback: (response: any) => {
          if (response.error) {
            setError(`Authentication failed: ${response.error}`);
            setIsLoading(false);
            return;
          }

          if (response.access_token) {
            // Store the access token
            localStorage.setItem('google_drive_access_token', response.access_token);
            
            // Decode the ID token if present to get user email
            if (response.id_token) {
              try {
                const base64Url = response.id_token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => 
                  '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                ).join(''));
                const payload = JSON.parse(jsonPayload);
                if (payload.email) {
                  localStorage.setItem('user_email', payload.email);
                  setUserEmail(payload.email);
                }
              } catch (e) {
                console.error('Failed to decode ID token:', e);
              }
            }

            setIsAuthenticated(true);
            setIsLoading(false);
            
            // Show success message
            console.log('✅ Successfully authenticated with Google Drive');
            
            // Notify billing page that authentication changed
            window.dispatchEvent(new CustomEvent('billing-settings-changed'));
          }
        },
        error_callback: (error: any) => {
          setError(`Authentication error: ${error.message || 'Unknown error'}`);
          setIsLoading(false);
        }
      });

      // Request access token
      tokenClient.requestAccessToken({ prompt: 'consent' });
      
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate with Google');
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    // Clear all Google-related data
    localStorage.removeItem('google_drive_access_token');
    localStorage.removeItem('user_email');
    localStorage.removeItem('cloud_sync_swag');
    
    // Disable config sync in SettingsContext
    setSettings({ ...settings, syncToGoogleDrive: false });
    
    setIsAuthenticated(false);
    setUserEmail(null);
    setConfigSync(false);
    setSwagSync(false);
    setError(null);
  };

  const handleConfigSyncChange = (enabled: boolean) => {
    setConfigSync(enabled);
    // Update SettingsContext which handles the actual sync
    setSettings({ ...settings, syncToGoogleDrive: enabled });
  };

  const handleSwagSyncChange = (enabled: boolean) => {
    setSwagSync(enabled);
    localStorage.setItem('cloud_sync_swag', enabled.toString());
  };

  return (
    <div className="cloud-sync-settings">
      <h2>Cloud Sync Settings</h2>
      
      <div className="auth-section">
        <h3>Google Drive Authentication</h3>
        
        {!isAuthenticated ? (
          <div className="auth-prompt">
            <p>Connect your Google account to enable cloud synchronization of your settings, API keys, and usage logs.</p>
            <button 
              onClick={handleGoogleAuth}
              disabled={isLoading}
              className="google-auth-button"
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Connecting...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                    <path fill="#34A853" d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z"/>
                    <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                    <path fill="#EA4335" d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.003 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z"/>
                  </svg>
                  Connect to Google Drive
                </>
              )}
            </button>
            
            {error && (
              <div className="error-message">
                <strong>Error:</strong> {error}
              </div>
            )}
          </div>
        ) : (
          <div className="auth-status">
            <div className="connected-info">
              <span className="status-indicator">✓</span>
              <div>
                <strong>Connected</strong>
                {userEmail && <div className="user-email">{userEmail}</div>}
              </div>
            </div>
            <button onClick={handleDisconnect} className="disconnect-button">
              Disconnect
            </button>
          </div>
        )}
      </div>

      {isAuthenticated && (
        <div className="sync-options">
          <h3>Sync Options</h3>
          <p className="sync-description">
            Choose which data to synchronize with your Google Drive. Each option can be enabled independently.
          </p>

          <div className="sync-option">
            <label>
              <input
                type="checkbox"
                checked={configSync}
                onChange={(e) => handleConfigSyncChange(e.target.checked)}
              />
              <div className="option-content">
                <strong>Configuration Sync</strong>
                <span className="option-description">
                  Sync app settings, preferences, and UI state across devices
                </span>
              </div>
            </label>
          </div>

          <div className="sync-option">
            <label>
              <input
                type="checkbox"
                checked={swagSync}
                onChange={(e) => handleSwagSyncChange(e.target.checked)}
              />
              <div className="option-content">
                <strong>API Keys Sync (SWAG)</strong>
                <span className="option-description">
                  Sync provider API keys securely to your Google Drive
                </span>
              </div>
            </label>
          </div>

        </div>
      )}
    </div>
  );
};

export default CloudSyncSettings;
