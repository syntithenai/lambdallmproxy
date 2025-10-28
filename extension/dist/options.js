/**
 * Options/Settings Page for Research Agent Extension
 */

// Default configuration
const DEFAULT_CONFIG = {
  lambdaUrl: '',
  apiKey: '',
  useLocalhost: false,
  autoOpenSidebar: 'always',
  inlineButtonDelay: 5000,
  enableInlineButton: true,
  enableContextMenu: true
};

// Load settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateStorageInfo();
  attachEventListeners();
});

/**
 * Load settings from storage and populate form
 */
async function loadSettings() {
  try {
    const config = await chrome.storage.sync.get(DEFAULT_CONFIG);
    
    // Populate form fields
    document.getElementById('lambdaUrl').value = config.lambdaUrl || '';
    document.getElementById('apiKey').value = config.apiKey || '';
    document.getElementById('useLocalhost').checked = config.useLocalhost || false;
    document.getElementById('autoOpenSidebar').value = config.autoOpenSidebar || 'always';
    document.getElementById('inlineButtonDelay').value = config.inlineButtonDelay || 5000;
    document.getElementById('enableInlineButton').checked = config.enableInlineButton !== false;
    document.getElementById('enableContextMenu').checked = config.enableContextMenu !== false;
    
    // Update localhost checkbox state
    updateLocalhostState();
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    const config = {
      lambdaUrl: document.getElementById('lambdaUrl').value.trim(),
      apiKey: document.getElementById('apiKey').value.trim(),
      useLocalhost: document.getElementById('useLocalhost').checked,
      autoOpenSidebar: document.getElementById('autoOpenSidebar').value,
      inlineButtonDelay: parseInt(document.getElementById('inlineButtonDelay').value),
      enableInlineButton: document.getElementById('enableInlineButton').checked,
      enableContextMenu: document.getElementById('enableContextMenu').checked
    };
    
    // Validate Lambda URL if not using localhost
    if (!config.useLocalhost && config.lambdaUrl) {
      try {
        new URL(config.lambdaUrl);
      } catch (error) {
        showStatus('Invalid Lambda URL format', 'error');
        return;
      }
    }
    
    // Save to Chrome storage
    await chrome.storage.sync.set(config);
    
    // Notify background script of config change
    chrome.runtime.sendMessage({ type: 'configUpdated', config });
    
    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings', 'error');
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  if (!confirm('Reset all settings to defaults? This cannot be undone.')) {
    return;
  }
  
  try {
    await chrome.storage.sync.clear();
    await loadSettings();
    showStatus('Settings reset to defaults', 'success');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showStatus('Failed to reset settings', 'error');
  }
}

/**
 * Clear conversation history
 */
async function clearHistory() {
  if (!confirm('Clear all conversation history? This cannot be undone.')) {
    return;
  }
  
  try {
    await chrome.storage.local.remove('conversationHistory');
    await updateStorageInfo();
    showStatus('Conversation history cleared', 'success');
  } catch (error) {
    console.error('Failed to clear history:', error);
    showStatus('Failed to clear history', 'error');
  }
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKey');
  const button = document.getElementById('toggleApiKey');
  
  if (input.type === 'password') {
    input.type = 'text';
    button.textContent = 'Hide';
  } else {
    input.type = 'password';
    button.textContent = 'Show';
  }
}

/**
 * Update localhost checkbox state
 */
function updateLocalhostState() {
  const useLocalhost = document.getElementById('useLocalhost').checked;
  const lambdaUrlInput = document.getElementById('lambdaUrl');
  
  if (useLocalhost) {
    lambdaUrlInput.value = 'http://localhost:3000';
    lambdaUrlInput.disabled = true;
  } else {
    if (lambdaUrlInput.value === 'http://localhost:3000') {
      lambdaUrlInput.value = '';
    }
    lambdaUrlInput.disabled = false;
  }
}

/**
 * Update storage usage information
 */
async function updateStorageInfo() {
  try {
    const storageData = await chrome.storage.local.get(null);
    const conversationHistory = storageData.conversationHistory || [];
    
    // Calculate approximate size
    const dataSize = JSON.stringify(storageData).length;
    const sizeKB = (dataSize / 1024).toFixed(2);
    
    const infoDiv = document.getElementById('storageInfo');
    infoDiv.innerHTML = `
      <div class="storage-stat">
        <strong>Conversations:</strong> ${conversationHistory.length} messages
      </div>
      <div class="storage-stat">
        <strong>Storage used:</strong> ~${sizeKB} KB
      </div>
      <div class="storage-stat">
        <strong>Last updated:</strong> ${new Date().toLocaleString()}
      </div>
    `;
  } catch (error) {
    console.error('Failed to get storage info:', error);
    document.getElementById('storageInfo').innerHTML = '<p class="error">Failed to load storage info</p>';
  }
}

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status-message ${type}`;
  statusDiv.style.display = 'block';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
  // Save button
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  // Reset button
  document.getElementById('resetSettings').addEventListener('click', resetSettings);
  
  // Clear history button
  document.getElementById('clearHistory').addEventListener('click', clearHistory);
  
  // Toggle API key visibility
  document.getElementById('toggleApiKey').addEventListener('click', toggleApiKeyVisibility);
  
  // Localhost checkbox
  document.getElementById('useLocalhost').addEventListener('change', updateLocalhostState);
  
  // Save on Enter key in text inputs
  document.querySelectorAll('input[type="text"], input[type="url"], input[type="password"]').forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveSettings();
      }
    });
  });
}
