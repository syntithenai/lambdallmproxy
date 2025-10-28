/**
 * Popup UI Script - Research Agent Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  const queryInput = document.getElementById('queryInput');
  const researchBtn = document.getElementById('researchBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const statusMessage = document.getElementById('statusMessage');
  const openWebAppLink = document.getElementById('openWebApp');
  const actionButtons = document.querySelectorAll('.action-btn');

  // Load configuration
  const config = await loadConfig();

  // Research button click
  researchBtn.addEventListener('click', async () => {
    const query = queryInput.value.trim();
    if (!query) {
      showStatus('Please enter a question or text to research', 'error');
      return;
    }

    await handleResearch(query);
  });

  // Enter key in textarea
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      researchBtn.click();
    }
  });

  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Quick action buttons
  actionButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      await handleQuickAction(action);
    });
  });

  // Open web app link
  openWebAppLink.addEventListener('click', (e) => {
    e.preventDefault();
    const webAppUrl = config.webAppUrl || 'https://syntithenai.github.io/lambdallmproxy';
    chrome.tabs.create({ url: webAppUrl });
  });

  /**
   * Handle research query
   */
  async function handleResearch(query) {
    showStatus('Opening sidebar...', 'info');

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Send message to background to open sidebar with query
      chrome.runtime.sendMessage({
        type: 'RESEARCH_QUERY',
        data: {
          query,
          context: {
            url: tab.url,
            title: tab.title,
            source: 'popup'
          }
        }
      });

      // Open sidebar
      await chrome.sidePanel.open({ tabId: tab.id });

      // Clear input
      queryInput.value = '';
      showStatus('Research started!', 'success');

      // Close popup after short delay
      setTimeout(() => window.close(), 500);
    } catch (error) {
      console.error('Research error:', error);
      showStatus('Error: ' + error.message, 'error');
    }
  }

  /**
   * Handle quick actions
   */
  async function handleQuickAction(action) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      switch (action) {
        case 'summarize':
          chrome.runtime.sendMessage({
            type: 'SUMMARIZE_PAGE',
            data: { tabId: tab.id }
          });
          showStatus('Summarizing page...', 'info');
          break;

        case 'extract':
          chrome.runtime.sendMessage({
            type: 'EXTRACT_POINTS',
            data: { tabId: tab.id }
          });
          showStatus('Extracting points...', 'info');
          break;

        case 'explain':
          // Get selected text first
          const selection = await getSelectedText(tab.id);
          if (selection) {
            chrome.runtime.sendMessage({
              type: 'EXPLAIN_SIMPLE',
              data: {
                text: selection,
                tabId: tab.id
              }
            });
            showStatus('Explaining...', 'info');
          } else {
            showStatus('Please select some text first', 'error');
            return;
          }
          break;

        case 'sidebar':
          await chrome.sidePanel.open({ tabId: tab.id });
          showStatus('Sidebar opened', 'success');
          break;
      }

      // Close popup after short delay
      setTimeout(() => window.close(), 500);
    } catch (error) {
      console.error('Quick action error:', error);
      showStatus('Error: ' + error.message, 'error');
    }
  }

  /**
   * Get selected text from current tab
   */
  async function getSelectedText(tabId) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.getSelection().toString().trim()
      });
      return result.result;
    } catch (error) {
      console.error('Failed to get selection:', error);
      return '';
    }
  }

  /**
   * Load configuration from storage
   */
  async function loadConfig() {
    const result = await chrome.storage.sync.get(['lambdaUrl', 'apiKey', 'webAppUrl']);
    return result || {};
  }

  /**
   * Show status message
   */
  function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000);
  }

  // Auto-focus query input
  queryInput.focus();
});
