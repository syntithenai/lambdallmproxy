import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSearchResults } from '../contexts/SearchResultsContext';
import { useToast } from './ToastManager';
import { useLocalStorage, removeFromLocalStorage, getAllKeys } from '../hooks/useLocalStorage';
import { sendChatMessageStreaming } from '../utils/api';
import type { ChatMessage } from '../utils/api';
import { extractAndSaveSearchResult } from '../utils/searchCache';

interface ChatTabProps {
  transferData?: { prompt: string; persona: string } | null;
}

export const ChatTab: React.FC<ChatTabProps> = ({ transferData }) => {
  const { accessToken, isAuthenticated } = useAuth();
  const { addSearchResult } = useSearchResults();
  const { showError, showWarning } = useToast();
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>('chat_messages', []);
  const [input, setInput] = useLocalStorage<string>('chat_input', '');
  const [systemPrompt, setSystemPrompt] = useLocalStorage<string>('chat_system_prompt', '');
  const [settings] = useLocalStorage('app_settings', {
    provider: 'groq',
    llmApiKey: '',
    apiEndpoint: 'https://api.groq.com/openai/v1',
    largeModel: 'llama-3.3-70b-versatile'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showMCPDialog, setShowMCPDialog] = useState(false);
  
  // Tool configuration
  const [enabledTools, setEnabledTools] = useLocalStorage<{
    web_search: boolean;
    execute_js: boolean;
    scrape_url: boolean;
  }>('chat_enabled_tools', {
    web_search: true,
    execute_js: false,
    scrape_url: false
  });
  
  const [mcpServers, setMcpServers] = useLocalStorage<Array<{
    id: string;
    name: string;
    url: string;
    enabled: boolean;
  }>>('chat_mcp_servers', []);
  
  const [newMCPServer, setNewMCPServer] = useState({ name: '', url: '' });
  
  // Tool execution status tracking
  const [toolStatus, setToolStatus] = useState<Array<{
    id: string;
    name: string;
    status: 'starting' | 'executing' | 'complete' | 'error';
    result?: string;
  }>>([]);
  
  const [streamingContent, setStreamingContent] = useState<string>('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle transfer data from planning tab
  useEffect(() => {
    if (transferData) {
      setInput(transferData.prompt);
      if (transferData.persona) {
        setSystemPrompt(transferData.persona);
      }
    }
  }, [transferData]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const buildToolsArray = () => {
    const tools = [];
    
    // Add enabled built-in tools
    if (enabledTools.web_search) {
      tools.push({
        type: 'function',
        function: {
          name: 'search_web',
          description: 'Search the web for results relevant to a query and optionally generate an LLM summary.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'integer', minimum: 1, maximum: 50, default: 3 },
              timeout: { type: 'integer', minimum: 1, maximum: 60, default: 15 },
              load_content: { type: 'boolean', default: false, description: 'Fetch full page content for each result'},
              generate_summary: { type: 'boolean', default: false, description: 'Generate an LLM summary of results'}
            },
            required: ['query']
          }
        }
      });
    }
    
    if (enabledTools.execute_js) {
      tools.push({
        type: 'function',
        function: {
          name: 'execute_javascript',
          description: 'Execute JavaScript code in a secure sandbox environment for calculations and data processing.',
          parameters: {
            type: 'object',
            properties: {
              code: { 
                type: 'string', 
                description: 'JavaScript code to execute. Include console.log() statements to display results.'
              },
              timeout: { 
                type: 'integer', 
                minimum: 1, 
                maximum: 10, 
                default: 5
              }
            },
            required: ['code']
          }
        }
      });
    }
    
    if (enabledTools.scrape_url) {
      tools.push({
        type: 'function',
        function: {
          name: 'scrape_web_content',
          description: 'Fetch and extract readable content from any URL. Excellent for getting detailed information from webpages.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Fully qualified URL to fetch' },
              timeout: { type: 'integer', minimum: 1, maximum: 60, default: 15 }
            },
            required: ['url']
          }
        }
      });
    }
    
    // Add enabled MCP servers (placeholder - would need MCP integration)
    mcpServers.filter(server => server.enabled).forEach(server => {
      // MCP servers would be added here when backend supports them
      console.log('MCP Server enabled:', server.name, server.url);
    });
    
    return tools;
  };

  const handleSend = async () => {
    if (!input.trim() || !accessToken || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setToolStatus([]);
    setStreamingContent('');

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    // Build tools array from enabled tools
    const tools = buildToolsArray();

    // Set a client-side timeout (4 minutes) to prevent Lambda timeout
    let timeoutId: number | null = null;
    if (tools.length > 0) {
      timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          console.warn('Request timeout - aborting after 4 minutes due to tool execution');
          abortControllerRef.current.abort();
        }
      }, 240000); // 4 minutes
    }

    try {
      // Prepend system prompt if provided
      const messagesWithSystem = systemPrompt.trim()
        ? [{ role: 'system' as const, content: systemPrompt }, ...newMessages]
        : newMessages;
      
      const requestPayload: any = {
        model: settings.largeModel || 'llama-3.3-70b-versatile',
        messages: messagesWithSystem,
        temperature: 0.7
      };
      
      // Add tools if any are enabled
      if (tools.length > 0) {
        requestPayload.tools = tools;
        console.log('Sending streaming request with tools:', tools.map(t => t.function.name));
      }
      
      // Use streaming API
      await sendChatMessageStreaming(
        requestPayload,
        accessToken,
        (eventType: string, data: any) => {
          console.log('SSE Event:', eventType, data);
          
          switch (eventType) {
            case 'status':
              // Processing status
              break;
              
            case 'delta':
              // Streaming text chunk
              setStreamingContent(prev => prev + data.content);
              break;
              
            case 'tool_call_start':
              // Tool execution starting
              setToolStatus(prev => [...prev, {
                id: data.id,
                name: data.name,
                status: 'starting'
              }]);
              break;
              
            case 'tool_call_progress':
              // Tool execution in progress
              setToolStatus(prev => prev.map(t =>
                t.id === data.id ? { ...t, status: 'executing' } : t
              ));
              break;
              
            case 'tool_call_result':
              // Tool execution complete
              setToolStatus(prev => prev.map(t =>
                t.id === data.id ? {
                  ...t,
                  status: data.error ? 'error' : 'complete',
                  result: data.content
                } : t
              ));
              
              // If this was a web search, extract and save the results
              if (data.name === 'search_web' && data.content) {
                const searchResult = extractAndSaveSearchResult(data.name, data.content);
                if (searchResult) {
                  addSearchResult(searchResult);
                }
              }
              break;
              
            case 'message_complete':
              // Assistant message complete
              const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: data.content,
                tool_calls: data.tool_calls
              };
              setMessages(prev => [...prev, assistantMessage]);
              setStreamingContent('');
              break;
              
            case 'complete':
              // All processing complete
              console.log('Stream complete:', data);
              break;
              
            case 'error':
              // Error occurred
              showError(data.error);
              const errorMessage: ChatMessage = {
                role: 'assistant',
                content: `❌ Error: ${data.error}`
              };
              setMessages(prev => [...prev, errorMessage]);
              break;
              
            case 'llm_request':
            case 'llm_response':
              // Sub-LLM requests (for summaries, etc.)
              console.log('LLM sub-request:', eventType, data);
              break;
          }
        },
        () => {
          // On complete
          if (timeoutId) clearTimeout(timeoutId);
          setIsLoading(false);
          setToolStatus([]);
          abortControllerRef.current = null;
        },
        (error) => {
          // On error
          if (timeoutId) clearTimeout(timeoutId);
          console.error('Streaming error:', error);
          showError(`Streaming error: ${error.message}`);
          setIsLoading(false);
          setToolStatus([]);
          abortControllerRef.current = null;
        },
        abortControllerRef.current.signal
      );
    } catch (error) {
      console.error('Chat error:', error);
      if (timeoutId) clearTimeout(timeoutId);
      
      // Handle aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutMessage: ChatMessage = {
          role: 'assistant',
          content: '⏱️ Request timed out after 4 minutes. This may happen when tools take too long to execute. Try simplifying your request or disabling some tools.'
        };
        setMessages([...newMessages, timeoutMessage]);
        showWarning('Request timed out after 4 minutes. Try disabling some tools or simplifying your request.');
      } else {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: `Error: ${errorMsg}`
        };
        setMessages([...newMessages, errorMessage]);
        showError(`Chat error: ${errorMsg}`);
      }
      
      setIsLoading(false);
      setToolStatus([]);
      abortControllerRef.current = null;
    }
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

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
  };

  const handleAddMCPServer = () => {
    if (!newMCPServer.name.trim() || !newMCPServer.url.trim()) return;
    
    setMcpServers([
      ...mcpServers,
      {
        id: `mcp_${Date.now()}`,
        name: newMCPServer.name,
        url: newMCPServer.url,
        enabled: true
      }
    ]);
    setNewMCPServer({ name: '', url: '' });
  };

  const handleToggleMCPServer = (id: string) => {
    setMcpServers(mcpServers.map(server =>
      server.id === id ? { ...server, enabled: !server.enabled } : server
    ));
  };

  const handleDeleteMCPServer = (id: string) => {
    setMcpServers(mcpServers.filter(server => server.id !== id));
  };

  const savedChats = getAllKeys('saved_chat_');

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header with Actions */}
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-2 flex-1">
          <button onClick={() => setShowLoadDialog(true)} className="btn-secondary text-sm">
            📂 Load Chat
          </button>
          <button onClick={handleNewChat} className="btn-secondary text-sm">
            ➕ New Chat
          </button>
          <div className="relative group">
            <button className="btn-secondary text-sm">
              📝 Examples ▾
            </button>
            <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 w-[400px] max-h-96 overflow-y-auto before:content-[''] before:absolute before:-top-2 before:left-0 before:right-0 before:h-2">
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  Web Search & Current Events
                </div>
                <button onClick={() => setInput('What are the latest developments in artificial intelligence this week?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Latest AI developments</button>
                <button onClick={() => setInput('Find current news about climate change policy updates')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Climate change policy updates</button>
                <button onClick={() => setInput('What is the current stock price of Tesla and recent news about the company?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Tesla stock price and news</button>
                
                <div className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 mt-2">
                  Mathematical & Computational
                </div>
                <button onClick={() => setInput('Calculate the compound interest on $10,000 invested at 7% annual rate for 15 years')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Compound interest calculation</button>
                <button onClick={() => setInput('Generate a multiplication table for numbers 1-12')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Multiplication table</button>
                
                <div className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 mt-2">
                  Data Analysis & Research
                </div>
                <button onClick={() => setInput('Compare the population growth rates of the top 5 most populous countries')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Population growth comparison</button>
                <button onClick={() => setInput('What are the key differences between Python and JavaScript programming languages?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Python vs JavaScript</button>
                <button onClick={() => setInput('Analyze the pros and cons of renewable energy sources')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Renewable energy analysis</button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Tool Configuration - Right Side */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enabledTools.web_search}
                onChange={(e) => setEnabledTools({ ...enabledTools, web_search: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-700 dark:text-gray-300">🔍 Search</span>
            </label>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enabledTools.execute_js}
                onChange={(e) => setEnabledTools({ ...enabledTools, execute_js: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-700 dark:text-gray-300">⚡ JS</span>
            </label>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enabledTools.scrape_url}
                onChange={(e) => setEnabledTools({ ...enabledTools, scrape_url: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-700 dark:text-gray-300">🌐 Scrape</span>
            </label>
          </div>
          <button
            onClick={() => setShowMCPDialog(true)}
            className="btn-secondary text-sm px-3 py-1"
            title="Configure MCP Servers"
          >
            ➕ MCP
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                  <div className="text-xs font-semibold mb-1">Tool Calls:</div>
                  {msg.tool_calls.map((tc, tcIdx) => (
                    <div key={tcIdx} className="text-xs bg-gray-300 dark:bg-gray-600 rounded px-2 py-1 mt-1">
                      🔧 {tc.function.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setMessages(messages.slice(0, idx + 1));
                setToolStatus([]);
                setStreamingContent('');
              }}
              className="btn-secondary text-xs px-2 py-1 self-start opacity-50 hover:opacity-100 transition-opacity"
              title="Reset chat to this point"
            >
              🔄
            </button>
          </div>
        ))}
        
        {/* Tool Status Display */}
        {toolStatus.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 max-w-[80%]">
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                🔧 Tool Execution
              </div>
              <div className="space-y-1">
                {toolStatus.map((tool) => (
                  <div key={tool.id} className="flex items-center gap-2 text-sm">
                    {tool.status === 'starting' && <span className="text-blue-500">⏳</span>}
                    {tool.status === 'executing' && <span className="text-yellow-500 animate-pulse">⚡</span>}
                    {tool.status === 'complete' && <span className="text-green-500">✓</span>}
                    {tool.status === 'error' && <span className="text-red-500">✗</span>}
                    <span className="text-gray-700 dark:text-gray-300">{tool.name}</span>
                    {tool.status === 'executing' && (
                      <span className="text-xs text-gray-500">running...</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Streaming Content */}
        {isLoading && streamingContent && (
          <div className="flex justify-start">
            <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-3 max-w-[80%]">
              <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                {streamingContent}
                <span className="inline-block w-2 h-4 bg-gray-500 animate-pulse ml-1"></span>
              </div>
            </div>
          </div>
        )}
        
        {isLoading && !streamingContent && toolStatus.length === 0 && (
          <div className="flex justify-start">
            <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-3">
              <div className="flex gap-2">
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
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        {!isAuthenticated ? (
          <div className="text-center text-red-500">
            Please sign in to start chatting
          </div>
        ) : (
          <>
            {/* System Prompt (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                System Prompt (Optional)
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter a system prompt to set the AI's behavior and persona..."
                className="input-field w-full resize-none"
                rows={2}
              />
            </div>
            
            {/* Message Input */}
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
              onClick={isLoading ? handleStop : handleSend}
              disabled={!isLoading && (!input.trim() || !accessToken)}
              className="btn-primary self-end"
              title={!accessToken ? 'Please sign in to send messages' : (!input.trim() ? 'Type a message first' : 'Send message')}
            >
              {isLoading ? '⏹ Stop' : '📤 Send'}
            </button>
          </div>
          </>
        )}
      </div>

      {/* Load Chat Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Load Chat History</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {savedChats.map((key) => (
                <div key={key} className="flex gap-2">
                  <button
                    onClick={() => handleLoadChat(key)}
                    className="btn-secondary flex-1 text-left"
                  >
                    {key.replace('saved_chat_', '').replace(/_/g, ' ')}
                  </button>
                  <button
                    onClick={() => handleDeleteChat(key)}
                    className="btn-secondary text-red-500"
                  >
                    🗑️
                  </button>
                </div>
              ))}
              {savedChats.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No saved chats found
                </p>
              )}
            </div>
            <button
              onClick={() => setShowLoadDialog(false)}
              className="btn-secondary w-full mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MCP Server Configuration Dialog */}
      {showMCPDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">MCP Server Configuration</h2>
              <button
                onClick={() => setShowMCPDialog(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {/* Add New MCP Server */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Add MCP Server</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newMCPServer.name}
                  onChange={(e) => setNewMCPServer({ ...newMCPServer, name: e.target.value })}
                  placeholder="Server Name (e.g., filesystem, github)"
                  className="input-field w-full"
                />
                <input
                  type="text"
                  value={newMCPServer.url}
                  onChange={(e) => setNewMCPServer({ ...newMCPServer, url: e.target.value })}
                  placeholder="Server URL (e.g., http://localhost:3000)"
                  className="input-field w-full"
                />
                <button
                  onClick={handleAddMCPServer}
                  disabled={!newMCPServer.name.trim() || !newMCPServer.url.trim()}
                  className="btn-primary w-full"
                >
                  ➕ Add Server
                </button>
              </div>
            </div>

            {/* Existing MCP Servers */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
                Configured Servers ({mcpServers.length})
              </h3>
              <div className="space-y-2">
                {mcpServers.map((server) => (
                  <div
                    key={server.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <input
                      type="checkbox"
                      checked={server.enabled}
                      onChange={() => handleToggleMCPServer(server.id)}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{server.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{server.url}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteMCPServer(server.id)}
                      className="text-red-500 hover:text-red-700 px-3 py-1"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                {mcpServers.length === 0 && (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    No MCP servers configured
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setShowMCPDialog(false)} className="btn-primary flex-1">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
