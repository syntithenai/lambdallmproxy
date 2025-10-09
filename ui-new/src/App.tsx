import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SearchResultsProvider } from './contexts/SearchResultsContext';
import { PlaylistProvider } from './contexts/PlaylistContext';
import { SwagProvider } from './contexts/SwagContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider } from './components/ToastManager';
import { LoginScreen } from './components/LoginScreen';
import { GoogleLoginButton } from './components/GoogleLoginButton';
import { PlaylistButton } from './components/PlaylistButton';
import { SettingsModal } from './components/SettingsModal';
import { ChatTab } from './components/ChatTab';
import { SwagPage } from './components/SwagPage';
import { useLocalStorage } from './hooks/useLocalStorage';

// Create a wrapper component that can access auth context
function AppContent() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [showMCPDialog, setShowMCPDialog] = useState(false);
  
  // Tool configuration - shared between ChatTab and SettingsModal
  const [enabledTools, setEnabledTools] = useLocalStorage<{
    web_search: boolean;
    execute_js: boolean;
    scrape_url: boolean;
    youtube: boolean;
    transcribe: boolean;
  }>('chat_enabled_tools', {
    web_search: true,
    execute_js: true,
    scrape_url: true,
    youtube: true,
    transcribe: true
  });

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Show full app UI only when authenticated
  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header - Only visible when authenticated */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex justify-between items-center max-w-screen-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Research Agent
          </h1>
          <div className="flex items-center gap-3">
            <PlaylistButton />
            {location.pathname === '/swag' ? (
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
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm font-medium"
                title="Content Swag - Save and manage snippets"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span className="text-sm">Swag</span>
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
                />
              } 
            />
            <Route path="/swag" element={<SwagPage />} />
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
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SettingsProvider>
            <PlaylistProvider>
              <SearchResultsProvider>
                <SwagProvider>
                  <AppContent />
                </SwagProvider>
              </SearchResultsProvider>
            </PlaylistProvider>
          </SettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
