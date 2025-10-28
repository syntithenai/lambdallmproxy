/**
 * Content Script - Research Agent Extension
 * 
 * Runs on all web pages to:
 * - Detect text selection
 * - Show inline research button
 * - Extract page content
 */

console.log('Research Agent: Content script loaded on', window.location.href);

let inlineButton = null;
let hideTimeout = null;

/**
 * Listen for text selection
 */
document.addEventListener('mouseup', (event) => {
  // Clear any pending hide timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  const selection = window.getSelection().toString().trim();
  
  // Show inline button for selected text (between 10 and 500 chars)
  if (selection.length >= 10 && selection.length <= 500) {
    showInlineButton(event.clientX, event.clientY, selection);
  } else {
    hideInlineButton();
  }
});

/**
 * Hide button when clicking elsewhere
 */
document.addEventListener('mousedown', (event) => {
  if (inlineButton && !inlineButton.contains(event.target)) {
    hideInlineButton();
  }
});

/**
 * Show inline research button near cursor
 */
function showInlineButton(x, y, text) {
  if (!inlineButton) {
    createInlineButton();
  }

  // Position button near selection
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  
  inlineButton.style.left = `${x + scrollX}px`;
  inlineButton.style.top = `${y + scrollY + 20}px`;
  inlineButton.style.display = 'flex';
  
  // Store selected text
  inlineButton.dataset.selectedText = text;

  // Auto-hide after 5 seconds
  hideTimeout = setTimeout(() => {
    hideInlineButton();
  }, 5000);
}

/**
 * Create inline button element
 */
function createInlineButton() {
  inlineButton = document.createElement('div');
  inlineButton.id = 'research-agent-inline-button';
  inlineButton.className = 'research-agent-inline';
  
  inlineButton.innerHTML = `
    <button class="research-agent-btn" title="Research this with AI">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="M21 21l-4.35-4.35"></path>
      </svg>
      <span>Research</span>
    </button>
  `;
  
  // Add click handler
  const button = inlineButton.querySelector('button');
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const text = inlineButton.dataset.selectedText;
    if (text) {
      // Send message to background script
      chrome.runtime.sendMessage({
        type: 'RESEARCH_QUERY',
        data: {
          query: `Research this: "${text}"`,
          context: {
            url: window.location.href,
            title: document.title,
            source: 'inline_button'
          }
        }
      });
      
      hideInlineButton();
    }
  });
  
  document.body.appendChild(inlineButton);
}

/**
 * Hide inline button
 */
function hideInlineButton() {
  if (inlineButton) {
    inlineButton.style.display = 'none';
  }
  
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const content = extractPageContent();
    sendResponse({ success: true, content });
    return true;
  }
});

/**
 * Extract page content
 */
function extractPageContent() {
  try {
    const title = document.title;
    const url = window.location.href;
    
    // Try to find main content area
    let content = '';
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    
    if (article) {
      content = article.innerText;
    } else if (main) {
      content = main.innerText;
    } else {
      // Fallback: get body text but try to exclude nav, header, footer
      const body = document.body.cloneNode(true);
      const selectors = ['nav', 'header', 'footer', '.sidebar', '.ads', '#comments'];
      selectors.forEach(selector => {
        body.querySelectorAll(selector).forEach(el => el.remove());
      });
      content = body.innerText;
    }
    
    // Get metadata
    const getMetaContent = (name) => {
      const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return meta?.content || '';
    };
    
    return {
      title,
      url,
      article: {
        title,
        content: content.slice(0, 10000), // Limit to 10k chars
        excerpt: getMetaContent('description') || getMetaContent('og:description'),
        byline: getMetaContent('author')
      },
      metadata: {
        description: getMetaContent('description'),
        author: getMetaContent('author'),
        keywords: getMetaContent('keywords'),
        image: getMetaContent('og:image')
      }
    };
  } catch (error) {
    console.error('Research Agent: Content extraction error:', error);
    return null;
  }
}

/**
 * Clean up on unload
 */
window.addEventListener('beforeunload', () => {
  if (inlineButton && inlineButton.parentNode) {
    inlineButton.parentNode.removeChild(inlineButton);
  }
});
