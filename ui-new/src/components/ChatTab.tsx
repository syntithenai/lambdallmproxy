import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalStorage, removeFromLocalStorage, getAllKeys } from '../hooks/useLocalStorage';
import { sendChatMessage } from '../utils/api';
import type { ChatMessage } from '../utils/api';

export const ChatTab: React.FC = () => {
  const { accessToken, isAuthenticated } = useAuth();
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>('chat_messages', []);
  const [input, setInput] = useLocalStorage<string>('chat_input', '');
  const [isLoading, setIsLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !accessToken || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(
        {
          model: 'gpt-4',
          messages: newMessages,
          temperature: 0.7
        },
        accessToken
      );

      const data = await response.json();
      console.log('Chat response:', data);

      if (data.choices && data.choices[0]?.message) {
        setMessages([...newMessages, data.choices[0].message]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveChat = () => {
    if (!saveName.trim()) return;
    const key = `saved_chat_${Date.now()}_${saveName}`;
    localStorage.setItem(key, JSON.stringify(messages));
    setSaveName('');
    setShowSaveDialog(false);
  };

  const handleLoadChat = (key: string) => {
    const saved = localStorage.getItem(key);
    if (saved) {
      setMessages(JSON.parse(saved));
      setShowLoadDialog(false);
    }
  };

  const handleDeleteChat = (key: string) => {
    removeFromLocalStorage(key);
    setShowLoadDialog(false);
  };

  const savedChats = getAllKeys('saved_chat_');

  const insertTemplate = (template: string) => {
    setInput(template);
  };

  const templates = [
    'Explain this concept in simple terms: ',
    'Write code to: ',
    'Summarize the following: ',
    'Translate to [language]: ',
    'Debug this code: '
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header with Actions */}
      <div className="flex flex-wrap gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
        <button onClick={() => setShowSaveDialog(true)} className="btn-secondary text-sm">
          💾 Save Chat
        </button>
        <button onClick={() => setShowLoadDialog(true)} className="btn-secondary text-sm">
          📂 Load Chat
        </button>
        <button onClick={() => setMessages([])} className="btn-secondary text-sm">
          🗑️ Clear Chat
        </button>
        <div className="relative group">
          <button className="btn-secondary text-sm">
            📝 Templates
          </button>
          <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[250px] before:content-[''] before:absolute before:bottom-full before:left-0 before:right-0 before:h-2">
            {templates.map((template, idx) => (
              <button
                key={idx}
                onClick={() => insertTemplate(template)}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm first:rounded-t-lg last:rounded-b-lg"
              >
                {template}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <p className="text-lg">Start a conversation</p>
            <p className="text-sm mt-2">Type a message below or use a template</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] md:max-w-[70%] p-4 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 dark:bg-gray-700 p-4 rounded-lg">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        {!isAuthenticated ? (
          <div className="text-center text-red-500">
            Please sign in to start chatting
          </div>
        ) : (
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your message... (Shift+Enter for new line)"
              className="input-field flex-1 resize-none"
              rows={3}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="btn-primary self-end"
            >
              Send
            </button>
          </div>
        )}
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="card p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Save Chat</h3>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Enter chat name"
              className="input-field mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveDialog(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleSaveChat} className="btn-primary flex-1">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="card p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Load Chat</h3>
            {savedChats.length === 0 ? (
              <p className="text-gray-500">No saved chats found</p>
            ) : (
              <div className="space-y-2">
                {savedChats.map((key) => {
                  const name = key.replace('saved_chat_', '').split('_').slice(1).join('_');
                  return (
                    <div key={key} className="flex gap-2">
                      <button
                        onClick={() => handleLoadChat(key)}
                        className="btn-secondary flex-1 text-left"
                      >
                        {name || 'Unnamed Chat'}
                      </button>
                      <button
                        onClick={() => handleDeleteChat(key)}
                        className="btn-secondary text-red-500"
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => setShowLoadDialog(false)}
              className="btn-primary w-full mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
