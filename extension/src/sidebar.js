/**
 * Sidebar Script - Research Agent Extension
 */

let conversationHistory = [];

document.addEventListener('DOMContentLoaded', () => {
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const chatMessages = document.getElementById('chatMessages');

  // Send button click
  sendBtn.addEventListener('click', () => {
    handleSendMessage();
  });

  // Enter key (Ctrl+Enter or Cmd+Enter to send)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Sidebar received message:', message.type);

    if (message.type === 'RESEARCH_QUERY' || 
        message.type === 'SUMMARIZE_PAGE' || 
        message.type === 'EXTRACT_POINTS' ||
        message.type === 'EXPLAIN_SIMPLE' ||
        message.type === 'FIND_RELATED') {
      
      // Auto-populate input with query
      if (message.data.query) {
        handleIncomingQuery(message.data.query, message.data.context);
      }
    }
  });

  // Load conversation history from storage
  loadConversationHistory();

  /**
   * Handle sending a message
   */
  async function handleSendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessage('user', message);

    // Clear input
    messageInput.value = '';

    // Show thinking indicator
    const thinkingId = addMessage('assistant', '...', true);

    try {
      // Get configuration
      const config = await chrome.storage.sync.get(['lambdaUrl', 'apiKey']);

      if (!config.lambdaUrl || !config.apiKey) {
        updateMessage(thinkingId, 'Please configure your API settings first. Click the extension icon and go to Settings.');
        return;
      }

      // Call chat API
      const response = await callChatAPI(message, config);

      // Update thinking message with response
      updateMessage(thinkingId, response);

      // Save conversation
      await saveConversation();
    } catch (error) {
      console.error('Chat error:', error);
      updateMessage(thinkingId, `Error: ${error.message}`);
    }
  }

  /**
   * Handle incoming query from context menu
   */
  function handleIncomingQuery(query, context) {
    // Add context info if available
    let fullMessage = query;
    if (context && context.title) {
      fullMessage += `\n\nFrom: ${context.title}`;
    }
    if (context && context.url) {
      fullMessage += `\nURL: ${context.url}`;
    }

    // Set input value
    messageInput.value = query;

    // Auto-send after short delay
    setTimeout(() => {
      handleSendMessage();
    }, 500);
  }

  /**
   * Add message to chat
   */
  function addMessage(role, content, isThinking = false) {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = `message ${role}-message${isThinking ? ' thinking' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);

    // Remove welcome message if it exists
    const welcomeMessage = chatMessages.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    chatMessages.appendChild(messageDiv);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Add to conversation history
    conversationHistory.push({ role, content, id: messageId });

    return messageId;
  }

  /**
   * Update existing message
   */
  function updateMessage(messageId, newContent) {
    const messageDiv = document.getElementById(messageId);
    if (messageDiv) {
      const contentDiv = messageDiv.querySelector('.message-content');
      if (contentDiv) {
        contentDiv.textContent = newContent;
      }
      messageDiv.classList.remove('thinking');

      // Update in conversation history
      const msg = conversationHistory.find(m => m.id === messageId);
      if (msg) {
        msg.content = newContent;
      }
    }
  }

  /**
   * Call chat API
   */
  async function callChatAPI(message, config) {
    // Simplified API call - replace with actual implementation
    const response = await fetch(`${config.lambdaUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        messages: conversationHistory.map(m => ({
          role: m.role,
          content: m.content
        })).concat([
          { role: 'user', content: message }
        ])
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || data.message || 'No response received';
  }

  /**
   * Save conversation to storage
   */
  async function saveConversation() {
    try {
      await chrome.storage.local.set({
        conversationHistory: conversationHistory.slice(-50) // Keep last 50 messages
      });
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }

  /**
   * Load conversation history from storage
   */
  async function loadConversationHistory() {
    try {
      const result = await chrome.storage.local.get(['conversationHistory']);
      if (result.conversationHistory && result.conversationHistory.length > 0) {
        conversationHistory = result.conversationHistory;

        // Restore messages to UI
        const welcomeMessage = chatMessages.querySelector('.welcome-message');
        if (welcomeMessage) {
          welcomeMessage.remove();
        }

        conversationHistory.forEach(msg => {
          const messageDiv = document.createElement('div');
          messageDiv.id = msg.id;
          messageDiv.className = `message ${msg.role}-message`;

          const avatar = document.createElement('div');
          avatar.className = 'message-avatar';
          avatar.textContent = msg.role === 'user' ? '👤' : '🤖';

          const contentDiv = document.createElement('div');
          contentDiv.className = 'message-content';
          contentDiv.textContent = msg.content;

          messageDiv.appendChild(avatar);
          messageDiv.appendChild(contentDiv);
          chatMessages.appendChild(messageDiv);
        });

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }

  // Auto-focus input
  messageInput.focus();
});
