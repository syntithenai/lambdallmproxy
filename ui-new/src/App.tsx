import { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { SearchResultsProvider } from './contexts/SearchResultsContext';
import { ToastProvider } from './components/ToastManager';
import { GoogleLoginButton } from './components/GoogleLoginButton';
import { SettingsModal } from './components/SettingsModal';
import { ChatTab } from './components/ChatTab';
import { PlanningTab } from './components/PlanningTab';
import { SearchTab } from './components/SearchTab';

type TabType = 'chat' | 'planning' | 'search';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [showSettings, setShowSettings] = useState(false);
  const [chatTransferData, setChatTransferData] = useState<{prompt: string, persona: string} | null>(null);

  const handleTransferToChat = (transferDataJson: string) => {
    try {
      const data = JSON.parse(transferDataJson);
      setChatTransferData(data);
      setActiveTab('chat');
    } catch (e) {
      // Fallback for old format
      setChatTransferData({ prompt: transferDataJson, persona: '' });
      setActiveTab('chat');
    }
  };

  return (
    <AuthProvider>
      <SearchResultsProvider>
        <ToastProvider>
          <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex justify-between items-center max-w-screen-2xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              LLM Proxy
            </h1>
            <div className="flex items-center gap-3">
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

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="max-w-screen-2xl mx-auto px-4">
            <nav className="flex space-x-1" role="tablist">
              {(['chat', 'planning', 'search'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 font-medium transition-colors capitalize ${
                    activeTab === tab
                      ? 'border-b-2 border-primary-600 text-primary-600 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  {tab === 'chat' && '💬 '}
                  {tab === 'planning' && '📋 '}
                  {tab === 'search' && '🔍 '}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <div className="h-full max-w-screen-2xl mx-auto">
            {activeTab === 'chat' && <ChatTab transferData={chatTransferData} />}
            {activeTab === 'planning' && (
              <PlanningTab
                onTransferToChat={handleTransferToChat}
              />
            )}
            {activeTab === 'search' && <SearchTab />}
          </div>
        </main>

        {/* Settings Modal */}
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
          </div>
        </ToastProvider>
      </SearchResultsProvider>
    </AuthProvider>
  );
}

export default App;
