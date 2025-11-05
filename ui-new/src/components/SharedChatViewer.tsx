/**
 * SharedChatViewer - View shared chats without authentication
 * Shows the shared conversation with a login button to continue chatting
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasShareData, getShareDataFromUrl, type ShareData } from '../utils/shareUtils';

export function SharedChatViewer() {
  const navigate = useNavigate();
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasShareData()) {
      try {
        const data = getShareDataFromUrl();
        if (data) {
          setShareData(data);
        } else {
          setError('Invalid share link');
        }
      } catch (err) {
        console.error('Failed to load shared chat:', err);
        setError('Failed to load shared conversation');
      }
    } else {
      setError('No share data found in URL');
    }
  }, []);

  const handleLogin = () => {
    // Navigate to home page where login will be required
    // The share data will still be in the URL and will be loaded after login
    navigate('/chat' + location.search);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Unable to Load Conversation
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error}
          </p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (!shareData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading shared conversation...</div>
      </div>
    );
  }

  const messages = shareData.messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp
  }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src={`${import.meta.env.BASE_URL}agent.png`}
              alt="Research Agent" 
              className="h-10 w-auto object-contain"
            />
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                {shareData.metadata.title || 'Shared Conversation'}
              </h1>
              {shareData.metadata.truncated && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Showing {shareData.metadata.includedMessageCount} of {shareData.metadata.originalMessageCount} messages
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleLogin}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            Login
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-[73px] pb-4">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  Viewing Shared Conversation
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  This is a preview of a shared conversation. To continue chatting or save this to your account, please login.
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'} rounded-lg shadow-sm p-4`}>
                <div className="text-xs font-medium mb-2 opacity-70">
                  {message.role === 'user' ? 'User' : 'Assistant'}
                </div>
                <div className="prose dark:prose-invert max-w-none">
                  {message.content}
                </div>
                {message.timestamp && (
                  <div className="text-xs opacity-50 mt-2">
                    {new Date(message.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Call to Action */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-center text-white mt-8">
            <h3 className="text-xl font-bold mb-2">Want to continue this conversation?</h3>
            <p className="mb-4 opacity-90">Login to continue chatting, save conversations, and access all features</p>
            {/* Login is available via the top-right button */}
          </div>
        </div>
      </main>
    </div>
  );
}
