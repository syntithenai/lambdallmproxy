/**
 * Background Service Worker - Research Agent Extension
 * 
 * Handles:
 * - Context menu creation and click handling
 * - Message passing between components
 * - API communication with backend
 * - Sidebar panel management
 */

console.log('Research Agent: Background service worker initialized');

// API Configuration
const API_CONFIG = {
  lambdaUrl: '', // Will be set from storage
  webAppUrl: 'https://syntithenai.github.io/lambdallmproxy'
};

// Initialize on installation
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Research Agent: Extension installed/updated');
  
  // Create context menus
  createContextMenus();
  
  // Load API configuration from storage
  const config = await chrome.storage.sync.get(['lambdaUrl', 'apiKey']);
  if (config.lambdaUrl) {
    API_CONFIG.lambdaUrl = config.lambdaUrl;
  }
});

/**
 * Create context menu items
 */
function createContextMenus() {
  // Remove existing menus first
  chrome.contextMenus.removeAll(() => {
    // Research selected text
    chrome.contextMenus.create({
      id: 'research-selection',
      title: 'Research "%s" with AI',
      contexts: ['selection']
    });

    // Summarize page
    chrome.contextMenus.create({
      id: 'summarize-page',
      title: 'Summarize this page',
      contexts: ['page', 'selection']
    });

    // Extract main points
    chrome.contextMenus.create({
      id: 'extract-points',
      title: 'Extract main points',
      contexts: ['page']
    });

    // Explain like I'm 5
    chrome.contextMenus.create({
      id: 'explain-simple',
      title: 'Explain this simply',
      contexts: ['selection']
    });

    // Find related topics
    chrome.contextMenus.create({
      id: 'find-related',
      title: 'Find related topics',
      contexts: ['selection']
    });
    
    console.log('Research Agent: Context menus created');
  });
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('Research Agent: Context menu clicked:', info.menuItemId);

  try {
    switch (info.menuItemId) {
      case 'research-selection':
        await handleResearchSelection(info.selectionText, tab);
        break;
      
      case 'summarize-page':
        await handleSummarizePage(tab, info.selectionText);
        break;
      
      case 'extract-points':
        await handleExtractPoints(tab);
        break;
      
      case 'explain-simple':
        await handleExplainSimple(info.selectionText, tab);
        break;
      
      case 'find-related':
        await handleFindRelated(info.selectionText, tab);
        break;
    }
  } catch (error) {
    console.error('Research Agent: Error handling context menu:', error);
    showNotification('Error', error.message);
  }
});

/**
 * Research selected text
 */
async function handleResearchSelection(text, tab) {
  if (!text || text.length === 0) {
    showNotification('Error', 'No text selected');
    return;
  }

  // Open sidebar
  await openSidebarWithQuery({
    type: 'RESEARCH_QUERY',
    data: {
      query: `Research this: "${text}"`,
      context: {
        url: tab.url,
        title: tab.title,
        source: 'selection'
      }
    }
  }, tab.id);
}

/**
 * Summarize current page
 */
async function handleSummarizePage(tab, selectionText) {
  // Extract page content
  const content = await extractPageContent(tab.id);
  
  if (!content || !content.article) {
    showNotification('Error', 'Could not extract page content');
    return;
  }

  const textToSummarize = selectionText || content.article.content;

  // Open sidebar with summary request
  await openSidebarWithQuery({
    type: 'SUMMARIZE_PAGE',
    data: {
      query: `Summarize this content:\n\n${textToSummarize.slice(0, 5000)}`,
      context: {
        url: tab.url,
        title: content.title,
        author: content.article.byline,
        source: 'page_summary'
      }
    }
  }, tab.id);
}

/**
 * Extract main points from page
 */
async function handleExtractPoints(tab) {
  const content = await extractPageContent(tab.id);
  
  if (!content || !content.article) {
    showNotification('Error', 'Could not extract page content');
    return;
  }

  await openSidebarWithQuery({
    type: 'EXTRACT_POINTS',
    data: {
      query: `Extract the main points from this article:\n\n${content.article.content.slice(0, 5000)}`,
      context: {
        url: tab.url,
        title: content.title,
        source: 'extract_points'
      }
    }
  }, tab.id);
}

/**
 * Explain selected text simply
 */
async function handleExplainSimple(text, tab) {
  if (!text || text.length === 0) {
    showNotification('Error', 'No text selected');
    return;
  }

  await openSidebarWithQuery({
    type: 'EXPLAIN_SIMPLE',
    data: {
      query: `Explain this in simple terms:\n\n"${text}"`,
      context: {
        url: tab.url,
        title: tab.title,
        source: 'explain_simple'
      }
    }
  }, tab.id);
}

/**
 * Find related topics
 */
async function handleFindRelated(text, tab) {
  if (!text || text.length === 0) {
    showNotification('Error', 'No text selected');
    return;
  }

  await openSidebarWithQuery({
    type: 'FIND_RELATED',
    data: {
      query: `Find topics related to: "${text}"`,
      context: {
        url: tab.url,
        title: tab.title,
        source: 'find_related'
      }
    }
  }, tab.id);
}

/**
 * Extract page content using content script
 */
async function extractPageContent(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // This function runs in the page context
        try {
          // Simple article extraction (fallback if Readability not available)
          const title = document.title;
          const url = window.location.href;
          
          // Try to find main content
          let content = '';
          const article = document.querySelector('article');
          const main = document.querySelector('main');
          
          if (article) {
            content = article.innerText;
          } else if (main) {
            content = main.innerText;
          } else {
            content = document.body.innerText;
          }
          
          // Get metadata
          const description = document.querySelector('meta[name="description"]')?.content || '';
          const author = document.querySelector('meta[name="author"]')?.content || '';
          
          return {
            title,
            url,
            article: {
              title,
              content: content.slice(0, 10000), // Limit to 10k chars
              excerpt: description,
              byline: author
            },
            metadata: {
              description,
              author
            }
          };
        } catch (error) {
          console.error('Content extraction error:', error);
          return null;
        }
      }
    });

    return result.result;
  } catch (error) {
    console.error('Research Agent: Failed to extract content:', error);
    return null;
  }
}

/**
 * Open sidebar with query
 */
async function openSidebarWithQuery(message, tabId) {
  try {
    // Open sidebar panel
    await chrome.sidePanel.open({ tabId });
    
    // Wait a bit for sidebar to load
    setTimeout(() => {
      // Send message to sidebar
      chrome.runtime.sendMessage(message);
    }, 500);
  } catch (error) {
    console.error('Research Agent: Failed to open sidebar:', error);
    // Fallback: show notification
    showNotification('Error', 'Could not open sidebar. Please click the extension icon.');
  }
}

/**
 * Show notification
 */
function showNotification(title, message) {
  // Note: chrome.notifications requires additional permission
  console.log(`Notification: ${title} - ${message}`);
  
  // Alternative: Use badge text
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  
  // Clear badge after 3 seconds
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 3000);
}

/**
 * Message handler for popup and sidebar communication
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Research Agent: Message received:', message.type);

  // Handle async messages
  (async () => {
    try {
      switch (message.type) {
        case 'GET_CONFIG':
          const config = await chrome.storage.sync.get(['lambdaUrl', 'apiKey', 'webAppUrl']);
          sendResponse({ success: true, config });
          break;

        case 'SET_CONFIG':
          await chrome.storage.sync.set(message.config);
          API_CONFIG.lambdaUrl = message.config.lambdaUrl || API_CONFIG.lambdaUrl;
          sendResponse({ success: true });
          break;

        case 'EXTRACT_CONTENT':
          const content = await extractPageContent(sender.tab?.id || message.tabId);
          sendResponse({ success: true, content });
          break;

        case 'OPEN_SIDEBAR':
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            await chrome.sidePanel.open({ tabId: tab.id });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No active tab' });
          }
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Research Agent: Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  // Return true to indicate async response
  return true;
});

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Research Agent: Extension icon clicked');
  
  try {
    // Toggle sidebar
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('Research Agent: Failed to open sidebar:', error);
  }
});
