import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SearchResultsProvider } from './contexts/SearchResultsContext';
import { PlaylistProvider } from './contexts/PlaylistContext';
import { ToastProvider } from './components/ToastManager';
import { LoginScreen } from './components/LoginScreen';
import { GoogleLoginButton } from './components/GoogleLoginButton';
import { PlaylistButton } from './components/PlaylistButton';
import { SettingsModal } from './components/SettingsModal';
import { ChatTab } from './components/ChatTab';
import { useLocalStorage } from './hooks/useLocalStorage';

// Create a wrapper component that can access auth context
function AppContent() {
  const { isAuthenticated } = useAuth();
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
            LLM Proxy
          </h1>
          <div className="flex items-center gap-3">
            <PlaylistButton />
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
          <ChatTab 
            enabledTools={enabledTools}
            setEnabledTools={setEnabledTools}
            showMCPDialog={showMCPDialog}
            setShowMCPDialog={setShowMCPDialog}
          />
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
    <AuthProvider>
      <PlaylistProvider>
        <SearchResultsProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </SearchResultsProvider>
      </PlaylistProvider>
    </AuthProvider>
  );
}

export default App;
