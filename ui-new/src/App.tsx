import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SearchResultsProvider } from './contexts/SearchResultsContext';
import { PlaylistProvider } from './contexts/PlaylistContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { SwagProvider } from './contexts/SwagContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { YouTubeAuthProvider } from './contexts/YouTubeAuthContext';
import { UsageProvider, useUsage } from './contexts/UsageContext';
import { CastProvider } from './contexts/CastContext';
import { LocationProvider } from './contexts/LocationContext';
import { TTSProvider } from './contexts/TTSContext';
import { TTS_FEATURE_ENABLED } from './types/tts';
import { ToastProvider } from './components/ToastManager';
import { chatHistoryDB } from './utils/chatHistoryDB';
import { getCachedApiBase } from './utils/api';
import { LoginScreen } from './components/LoginScreen';
import { GoogleLoginButton } from './components/GoogleLoginButton';
import { PlaylistButton } from './components/PlaylistButton';
import { BackgroundPlayer } from './components/BackgroundPlayer';
import { SettingsModal } from './components/SettingsModal';
import { ChatTab } from './components/ChatTab';
import { SwagPage } from './components/SwagPage';
import BillingPage from './components/BillingPage';
import { HelpPage } from './components/HelpPage';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import ProviderSetupGate from './components/ProviderSetupGate';
import { GlobalTTSStopButton } from './components/ReadButton';
import { GitHubLink } from './components/GitHubLink';
import { useLocalStorage } from './hooks/useLocalStorage';

// Create a wrapper component that can access auth context
function AppContent() {
  const { isAuthenticated, getToken } = useAuth();
  const { settings } = useSettings();
  const { usage, loading: usageLoading } = useUsage();
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [showMCPDialog, setShowMCPDialog] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // Tool configuration - shared between ChatTab and SettingsModal
  const [enabledTools, setEnabledTools] = useLocalStorage<{
    web_search: boolean;
    execute_js: boolean;
    scrape_url: boolean;
    youtube: boolean;
    transcribe: boolean;
    generate_chart: boolean;
    generate_image: boolean;
    search_knowledge_base: boolean;
    manage_todos: boolean;
    manage_snippets: boolean;
    ask_llm: boolean;
    generate_reasoning_chain: boolean;
  }>('chat_enabled_tools', {
    web_search: true,
    execute_js: true,
    scrape_url: true,
    youtube: true,
    transcribe: true,
    generate_chart: true,
    generate_image: true,
    search_knowledge_base: false, // Independent server-side knowledge base tool
    manage_todos: true, // Backend todo queue management
    manage_snippets: true, // Google Sheets snippets storage
    ask_llm: false, // Recursive LLM agent - DISABLED by default due to high token usage
    generate_reasoning_chain: false // Deep reasoning chains - DISABLED by default due to EXTREME token usage
  });
  
  // NOTE: search_knowledge_base is now independent from the local RAG system
  // Local RAG uses the "Use Knowledge Base Context" checkbox in chat
  // search_knowledge_base is a separate server-side tool enabled in Settings > Tools

  // Migrate chat history from localStorage to IndexedDB on mount
  useEffect(() => {
    const migrateData = async () => {
      try {
        console.log('Starting migration from localStorage to IndexedDB...');
        const migratedCount = await chatHistoryDB.migrateFromLocalStorage();
        console.log(`Migration complete: ${migratedCount} chats migrated`);
        
        // Cleanup old chats, keep 100 most recent
        await chatHistoryDB.cleanupOldChats(100);
        console.log('Cleanup complete: kept 100 most recent chats');
      } catch (error) {
        console.error('Error during migration:', error);
      }
    };
    
    migrateData();
  }, []);

  // Initialize Google Identity Services for client-side Sheets API
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (clientId && (window as any).google) {
      initGoogleIdentity(clientId);
    } else if (clientId) {
      // Wait for GIS script to load
      const checkGIS = setInterval(() => {
        if ((window as any).google) {
          initGoogleIdentity(clientId);
          clearInterval(checkGIS);
        }
      }, 100);
      // Timeout after 5 seconds
      setTimeout(() => clearInterval(checkGIS), 5000);
    }
  }, []);

  // Check authorization status on mount
  useEffect(() => {
    const checkAuthAndProviders = async () => {
      if (!isAuthenticated) {
        setHasCheckedAuth(true);
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          setHasCheckedAuth(true);
          return;
        }

        // Make a test request to check if user needs provider setup
        const lambdaUrl = await getCachedApiBase();
        const response = await fetch(`${lambdaUrl}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'test' }],
            providers: settings.providers || []
          })
        });

        if (response.status === 403) {
          const data = await response.json();
          if (data.requiresProviderSetup) {
            console.log('🔒 User needs to configure providers');
            setIsBlocked(true);
          }
        }
      } catch (error) {
        // Silently handle network errors - they're not critical for app functionality
        // The auth check is just for provider setup verification
        console.log('Unable to verify provider setup status (this is not critical)');
      } finally {
        setHasCheckedAuth(true);
      }
    };

    if (isAuthenticated && !hasCheckedAuth) {
      checkAuthAndProviders();
    }
  }, [isAuthenticated, getToken, settings.providers, hasCheckedAuth]);

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Show loading while checking auth
  if (!hasCheckedAuth) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Show provider setup gate if blocked OR if usage exceeded
  const isUsageExceeded = usage?.exceeded || false;
  
  if (isBlocked || isUsageExceeded) {
    return (
      <ProviderSetupGate 
        isBlocked={isBlocked || isUsageExceeded} 
        onUnblock={() => setIsBlocked(false)} 
      />
    );
  }

  // Show full app UI only when authenticated
  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header - Only visible when authenticated */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex justify-between items-center max-w-screen-2xl mx-auto">
          <img 
            src={`${import.meta.env.BASE_URL}agent.png`}
            alt="Research Agent" 
            className="h-12 w-auto object-contain"
          />
          <div className="flex items-center gap-3">
            <PlaylistButton />
            
            {/* Billing Button with Credit Info - Hide on billing page */}
            {location.pathname !== '/billing' && (
              <button
                onClick={() => navigate('/billing')}
                disabled={isChatLoading}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-sm font-medium ${
                  isChatLoading 
                    ? 'bg-gray-300 dark:bg-gray-800 text-gray-500 dark:text-gray-600 cursor-not-allowed opacity-50' 
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title={isChatLoading ? 'Cannot navigate during active chat request' : (usage ? `You have used $${usage.totalCost.toFixed(2)} of your $${usage.creditLimit.toFixed(2)} credit` : 'View billing and usage details')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                {usage && !usageLoading && typeof usage.totalCost === 'number' && typeof usage.creditLimit === 'number' && (
                  <span className={`text-xs font-medium ${
                    usage.exceeded 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-green-600 dark:text-green-400'
                  }`}>
                    ${usage.totalCost.toFixed(2)} / ${usage.creditLimit.toFixed(2)}
                  </span>
                )}
              </button>
            )}
            
            {location.pathname === '/billing' ? (
              <>
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors shadow-sm font-medium"
                  title="Back to Chat"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="text-sm">Back to Chat</span>
                </button>
                <button
                  onClick={() => navigate('/swag')}
                  disabled={isChatLoading}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-sm font-medium ${
                    isChatLoading
                      ? 'bg-blue-400 text-white cursor-not-allowed opacity-50'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  title={isChatLoading ? 'Cannot navigate during active chat request' : 'Content Swag - Save and manage snippets'}
                >
                  {/* Sack/bag icon */}
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 2C8 1.45 8.45 1 9 1h6c.55 0 1 .45 1 1v2h-8V2zm-1 4h10l1.5 13c.08.72-.48 1.32-1.2 1.32H6.7c-.72 0-1.28-.6-1.2-1.32L7 6zm5 2c-2.21 0-4 1.79-4 4v6h8v-6c0-2.21-1.79-4-4-4z"/>
                  </svg>
                  <span className="text-sm">Swag</span>
                </button>
              </>
            ) : location.pathname === '/swag' ? (
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors shadow-sm font-medium"
                title="Back to Chat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="text-sm">Back to Chat</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/swag')}
                disabled={isChatLoading}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-sm font-medium ${
                  isChatLoading
                    ? 'bg-blue-400 text-white cursor-not-allowed opacity-50'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
                title={isChatLoading ? 'Cannot navigate during active chat request' : 'Content Swag - Save and manage snippets'}
              >
                {/* Sack/bag icon */}
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 2C8 1.45 8.45 1 9 1h6c.55 0 1 .45 1 1v2h-8V2zm-1 4h10l1.5 13c.08.72-.48 1.32-1.2 1.32H6.7c-.72 0-1.28-.6-1.2-1.32L7 6zm5 2c-2.21 0-4 1.79-4 4v6h8v-6c0-2.21-1.79-4-4-4z"/>
                </svg>
                <span className="text-sm">Swag</span>
              </button>
            )}
            
            {/* Help Button - Always visible */}
            {(location.pathname === '/help' || location.pathname === '/privacy') ? null : (
              <button
                onClick={() => navigate('/help')}
                disabled={isChatLoading}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-sm font-medium ${
                  isChatLoading
                    ? 'bg-purple-400 text-white cursor-not-allowed opacity-50'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
                title={isChatLoading ? 'Cannot navigate during active chat request' : 'Help & Documentation'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">Help</span>
              </button>
            )}
            
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Settings"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <GoogleLoginButton />
          </div>
        </div>
      </header>

      {/* Global TTS Stop Button */}
      {TTS_FEATURE_ENABLED && <GlobalTTSStopButton />}

      {/* Background Player - Always mounted for continuous audio */}
      <BackgroundPlayer />

      {/* Main Content - Only visible when authenticated */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full max-w-screen-2xl mx-auto">
          <Routes>
            <Route 
              path="/" 
              element={
                <ChatTab 
                  enabledTools={enabledTools}
                  setEnabledTools={setEnabledTools}
                  showMCPDialog={showMCPDialog}
                  setShowMCPDialog={setShowMCPDialog}
                  onLoadingChange={setIsChatLoading}
                />
              } 
            />
            <Route path="/swag" element={<SwagPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
          </Routes>
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)}
        enabledTools={enabledTools}
        setEnabledTools={setEnabledTools}
        onOpenMCPDialog={() => setShowMCPDialog(true)}
      />

      {/* GitHub Link - Fixed bottom right */}
      <GitHubLink />
    </div>
  );
}

import './App.css';
import { initGoogleIdentity } from './services/googleSheetsClient';

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <AuthProvider>
          <UsageProvider>
            <SettingsProvider>
              <LocationProvider>
                {TTS_FEATURE_ENABLED ? (
                  <TTSProvider>
                    <CastProvider>
                      <YouTubeAuthProvider>
                        <PlaylistProvider>
                          <PlayerProvider>
                            <SearchResultsProvider>
                              <SwagProvider>
                                <AppContent />
                              </SwagProvider>
                            </SearchResultsProvider>
                          </PlayerProvider>
                        </PlaylistProvider>
                      </YouTubeAuthProvider>
                    </CastProvider>
                  </TTSProvider>
                ) : (
                  <CastProvider>
                    <YouTubeAuthProvider>
                      <PlaylistProvider>
                        <PlayerProvider>
                          <SearchResultsProvider>
                            <SwagProvider>
                              <AppContent />
                            </SwagProvider>
                          </SearchResultsProvider>
                        </PlayerProvider>
                      </PlaylistProvider>
                    </YouTubeAuthProvider>
                  </CastProvider>
                )}
              </LocationProvider>
            </SettingsProvider>
          </UsageProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
