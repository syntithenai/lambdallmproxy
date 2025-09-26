// settings.js - Settings dialog and API key management

// Function to update API key status
function updateApiKeyStatus(elementId, message, color = '#6c757d') {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = color;
    }
}

function hasLocalKeyForModel() {
    const modelSelect = document.getElementById('model');
    const openaiApiKeyInput = document.getElementById('openai_api_key');
    const groqApiKeyInput = document.getElementById('groq_api_key');
    
    if (!modelSelect || !openaiApiKeyInput || !groqApiKeyInput) return false;
    
    const sel = modelSelect.value || '';
    const openaiKey = (openaiApiKeyInput.value || '').trim();
    const groqKey = (groqApiKeyInput.value || '').trim();
    
    if (sel.startsWith('openai:')) return !!openaiKey;
    if (sel.startsWith('groq:')) return !!groqKey;
    return false;
}

function updateSubmitButton() {
    const submitBtn = document.getElementById('submit-btn');
    if (!submitBtn) return;
    
    const signedIn = isGoogleTokenValid(window.googleAccessToken);
    const localKeyOk = hasLocalKeyForModel();
    const canSubmit = signedIn || localKeyOk;
    
    // Debug logging
    console.log('updateSubmitButton:', {
        googleAccessToken: window.googleAccessToken ? (signedIn ? 'present-valid' : 'present-expired') : 'null',
        googleUser: window.googleUser ? window.googleUser.email : 'null',
        signedIn: signedIn,
        localKeyOk: localKeyOk,
        canSubmit: canSubmit,
        savedToken: localStorage.getItem('google_access_token') ? 'present' : 'null'
    });
    
    submitBtn.disabled = !canSubmit;
    submitBtn.textContent = canSubmit ? 'Send Request' : 'Sign in or add an API key';
}

// Function to update model availability based on API keys
function updateModelAvailability() {
    console.log('updateModelAvailability called');
    const modelSelect = document.getElementById('model');
    
    if (!modelSelect) return;
    
    // Get API key inputs - they might not exist if settings dialog hasn't been opened
    const openaiApiKeyInput = document.getElementById('openai_api_key');
    const groqApiKeyInput = document.getElementById('groq_api_key');
    
    const hasOpenaiKey = !!(openaiApiKeyInput && openaiApiKeyInput.value && openaiApiKeyInput.value.trim());
    const hasGroqKey = !!(groqApiKeyInput && groqApiKeyInput.value && groqApiKeyInput.value.trim());
    const signedIn = isGoogleTokenValid(window.googleAccessToken);
    
    console.log('hasOpenaiKey:', hasOpenaiKey, 'hasGroqKey:', hasGroqKey, 'signedIn:', signedIn);
    
    // Enable/disable individual options based on available API keys, but keep them visible
    const allOptions = modelSelect.querySelectorAll('option');
    let hasAvailableOptions = false;
    let firstAvailableOption = null;
    
    allOptions.forEach(option => {
        if (!option.value) {
            // Skip empty options
            return;
        }
        
        let shouldEnable = false;
        if (option.value.startsWith('openai:')) {
            shouldEnable = hasOpenaiKey || signedIn;
            // Add visual indicator for disabled options
            option.textContent = option.textContent.replace(' (requires API key)', '');
            if (!shouldEnable) {
                option.textContent += ' (requires API key)';
            }
        } else if (option.value.startsWith('groq:')) {
            shouldEnable = hasGroqKey || signedIn;
            // Add visual indicator for disabled options
            option.textContent = option.textContent.replace(' (requires API key)', '');
            if (!shouldEnable) {
                option.textContent += ' (requires API key)';
            }
        }
        
        option.disabled = !shouldEnable;
        // Keep all options visible, just disable unavailable ones
        option.style.display = '';
        
        if (shouldEnable) {
            hasAvailableOptions = true;
            if (!firstAvailableOption) {
                firstAvailableOption = option;
            }
        }
    });
    
    // If no keys and not signed in, disable the entire selector
    if (!hasAvailableOptions && !signedIn) {
        modelSelect.disabled = true;
        console.log('No API keys available, disabling model select');
    } else {
        modelSelect.disabled = false;
        console.log('API keys available, enabling model select');
        
        // Check if current selection is still valid
        const currentOption = modelSelect.querySelector(`option[value="${modelSelect.value}"]`);
        if (!currentOption || currentOption.disabled) {
            // Set default model based on available API keys
            let defaultModel = null;
            
            // Priority 1: Groq llama instant if Groq key is available (and no OpenAI key)
            if (hasGroqKey) {
                defaultModel = 'groq:llama-3.1-8b-instant';
            // Priority 2: OpenAI gpt-4o-mini if OpenAI key is available
            } else if (hasOpenaiKey) {
                defaultModel = 'openai:gpt-4o-mini';
            }
             
            // Apply default model if available, otherwise use first available option
            if (defaultModel && modelSelect.querySelector(`option[value="${defaultModel}"]`) && 
                !modelSelect.querySelector(`option[value="${defaultModel}"]`).disabled) {
                modelSelect.value = defaultModel;
                console.log('Selected default model:', defaultModel);
            } else if (firstAvailableOption) {
                modelSelect.value = firstAvailableOption.value;
                console.log('Selected first available model:', firstAvailableOption.value);
            }
        }
    }
}

// Settings dialog functionality
function openSettings() {
    const settingsDialog = document.getElementById('settings-dialog');
    if (settingsDialog) {
        settingsDialog.style.display = 'block';
    }
}

function closeSettings() {
    const settingsDialog = document.getElementById('settings-dialog');
    if (settingsDialog) {
        settingsDialog.style.display = 'none';
    }
}

// Set initial default model based on available API keys
function setInitialDefaultModel() {
    const modelSelect = document.getElementById('model');
    if (!modelSelect) return;
    
    const savedOpenaiApiKey = localStorage.getItem('openai_api_key');
    const savedGroqApiKey = localStorage.getItem('groq_api_key');
    
    const hasOpenaiKey = savedOpenaiApiKey && savedOpenaiApiKey.trim();
    const hasGroqKey = savedGroqApiKey && savedGroqApiKey.trim();
    
    // Only set default if no model is currently selected
    if (!modelSelect.value || modelSelect.value === '') {
        if (hasGroqKey) {
            modelSelect.value = 'groq:llama-3.1-8b-instant';
            console.log('Set initial default model to llama-3.1-8b-instant (Groq key available - prioritized for speed)');
        } else if (hasOpenaiKey) {
            modelSelect.value = 'openai:gpt-4o-mini';
            console.log('Set initial default model to gpt-4o-mini (OpenAI key available)');
        }
    }
}

function initializeSettings() {
    const openaiApiKeyInput = document.getElementById('openai_api_key');
    const groqApiKeyInput = document.getElementById('groq_api_key');
    const clearOpenaiButton = document.getElementById('clear_openai_api_key');
    const clearGroqButton = document.getElementById('clear_groq_api_key');
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings');
    const settingsDialog = document.getElementById('settings-dialog');
    const modelSelect = document.getElementById('model');
    const promptInput = document.getElementById('prompt');
    
    if (!openaiApiKeyInput || !groqApiKeyInput || !clearOpenaiButton || !clearGroqButton || 
        !settingsBtn || !closeSettingsBtn || !settingsDialog) {
        console.error('Settings elements not found');
        return;
    }
    
    // Load saved API keys on page load
    const savedOpenaiApiKey = localStorage.getItem('openai_api_key');
    if (savedOpenaiApiKey) {
        openaiApiKeyInput.value = savedOpenaiApiKey;
        updateApiKeyStatus('openai_api_key_status', 'Loaded from local storage', '#28a745');
        clearOpenaiButton.style.display = 'block';
    }
    
    const savedGroqApiKey = localStorage.getItem('groq_api_key');
    if (savedGroqApiKey) {
        groqApiKeyInput.value = savedGroqApiKey;
        updateApiKeyStatus('groq_api_key_status', 'Loaded from local storage', '#28a745');
        clearGroqButton.style.display = 'block';
    }

    // Load saved query on page load
    if (promptInput) {
        const savedQuery = localStorage.getItem('saved_query');
        if (savedQuery) {
            promptInput.value = savedQuery;
            console.log('Loaded saved query from local storage');
        }
    }
    
    // Update model availability on initial load
    updateModelAvailability();
    updateSubmitButton();
    
    // Set initial default model
    setInitialDefaultModel();
    
    // Also call it after a small delay to ensure localStorage values are set
    setTimeout(() => { updateModelAvailability(); updateSubmitButton(); }, 100);
    
    // Save OpenAI API key when it changes
    openaiApiKeyInput.addEventListener('input', function() {
        const apiKey = this.value.trim();
        if (apiKey && apiKey.trim()) {
            localStorage.setItem('openai_api_key', apiKey);
            updateApiKeyStatus('openai_api_key_status', 'Saved to local storage', '#28a745');
            clearOpenaiButton.style.display = 'block';
        } else if (!apiKey) {
            updateApiKeyStatus('openai_api_key_status', '');
            clearOpenaiButton.style.display = 'none';
        }
        updateModelAvailability();
    });
    
    // Save Groq API key when it changes
    groqApiKeyInput.addEventListener('input', function() {
        const apiKey = this.value.trim();
        if (apiKey && apiKey.trim()) {
            localStorage.setItem('groq_api_key', apiKey);
            updateApiKeyStatus('groq_api_key_status', 'Saved to local storage', '#28a745');
            clearGroqButton.style.display = 'block';
        } else if (!apiKey) {
            updateApiKeyStatus('groq_api_key_status', '');
            clearGroqButton.style.display = 'none';
        }
        updateModelAvailability();
    });
    
    // Save query when it changes
    if (promptInput) {
        promptInput.addEventListener('input', function() {
            const query = this.value;
            if (query && query.trim()) {
                localStorage.setItem('saved_query', query);
                console.log('Query saved to local storage');
            } else {
                localStorage.removeItem('saved_query');
                console.log('Empty query - removed from local storage');
            }
        });
    }
    
    // Handle clear OpenAI button
    clearOpenaiButton.addEventListener('click', function() {
        localStorage.removeItem('openai_api_key');
        openaiApiKeyInput.value = '';
        updateApiKeyStatus('openai_api_key_status', 'Cleared from local storage', '#dc3545');
        clearOpenaiButton.style.display = 'none';
        updateModelAvailability();
        setTimeout(() => {
            updateApiKeyStatus('openai_api_key_status', '');
        }, 3000);
    });
    
    // Handle clear Groq button
    clearGroqButton.addEventListener('click', function() {
        localStorage.removeItem('groq_api_key');
        groqApiKeyInput.value = '';
        updateApiKeyStatus('groq_api_key_status', 'Cleared from local storage', '#dc3545');
        clearGroqButton.style.display = 'none';
        updateModelAvailability();
        setTimeout(() => {
            updateApiKeyStatus('groq_api_key_status', '');
        }, 3000);
    });
    
    // Handle OpenAI help button
    const openaiHelpBtn = document.getElementById('openai_help_button');
    if (openaiHelpBtn) {
        openaiHelpBtn.addEventListener('click', function() {
            window.open('https://platform.openai.com/api-keys', '_blank');
        });
    }
    
    // Handle Groq help button
    const groqHelpBtn = document.getElementById('groq_help_button');
    if (groqHelpBtn) {
        groqHelpBtn.addEventListener('click', function() {
            window.open('https://console.groq.com/keys', '_blank');
        });
    }
    
    // Settings button event listeners
    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    
    // Close dialog when clicking outside
    settingsDialog.addEventListener('click', function(e) {
        if (e.target === settingsDialog) {
            closeSettings();
        }
    });
    
    // Close dialog with escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && settingsDialog.style.display === 'block') {
            closeSettings();
        }
    });
    
    // Keep submit button state in sync with inputs
    if (modelSelect) {
        modelSelect.addEventListener('change', () => { updateModelAvailability(); updateSubmitButton(); });
    }
    openaiApiKeyInput.addEventListener('input', () => { updateModelAvailability(); updateSubmitButton(); });
    groqApiKeyInput.addEventListener('input', () => { updateModelAvailability(); updateSubmitButton(); });

    // When Tab is pressed inside the textarea, move focus to the Submit button
    if (promptInput) {
        promptInput.addEventListener('keydown', function(e) {
            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                // Focus the Send Request button
                const submitBtn = document.getElementById('submit-btn');
                if (submitBtn) {
                    submitBtn.focus();
                }
            }
        });
    }
}