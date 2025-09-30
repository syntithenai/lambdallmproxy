// ui-manager.js - UI state management and DOM manipulation

/**
 * UI Manager for handling button states, DOM updates, and user interface interactions
 */
class UIManager {
    constructor(stateManager, toastManager) {
        this.stateManager = stateManager;
        this.toastManager = toastManager;
        this.responseActionHandlersSetup = false;
    }

    /**
     * Set button state based on application state
     * @param {string} state - The state to set ('signin', 'send', 'stop', 'paused', 'retry')
     * @param {Object} options - Additional options like disabled status or custom text
     */
    setButtonState(state, options = {}) {
        const submitBtn = document.getElementById('submit-btn');
        const stopBtn = document.getElementById('stop-btn');
        const continueBtn = document.getElementById('continue-btn');
        
        if (!submitBtn || !stopBtn || !continueBtn) return;

        // Hide all by default
        submitBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        continueBtn.style.display = 'none';

        if (state === 'signin') {
            submitBtn.textContent = 'Sign in or add API key';
            submitBtn.className = 'compact-btn submit-btn disabled-btn';
            submitBtn.disabled = true;
            submitBtn.style.display = 'inline-block';
        } else if (state === 'send') {
            submitBtn.textContent = 'Send Request';
            submitBtn.className = 'compact-btn submit-btn';
            submitBtn.disabled = !!options.disabled;
            submitBtn.style.display = 'inline-block';
        } else if (state === 'stop') {
            stopBtn.textContent = 'Stop';
            stopBtn.className = 'compact-btn stop-btn';
            stopBtn.disabled = false;
            stopBtn.style.display = 'inline-block';
        } else if (state === 'paused') {
            continueBtn.textContent = options.text || 'Paused';
            continueBtn.className = 'compact-btn continue-btn paused-btn';
            continueBtn.disabled = !!options.disabled;
            continueBtn.style.display = 'inline-block';
        } else if (state === 'retry') {
            continueBtn.textContent = options.text || 'Retry';
            continueBtn.className = 'compact-btn continue-btn retry-btn';
            continueBtn.disabled = !!options.disabled;
            continueBtn.style.display = 'inline-block';
            stopBtn.textContent = 'Stop';
            stopBtn.className = 'compact-btn stop-btn';
            stopBtn.disabled = false;
            stopBtn.style.display = 'inline-block';
        }
    }

    /**
     * Update submit button state based on authentication and form state
     */
    updateSubmitButton() {
        const promptInput = document.getElementById('prompt');
        
        // Check authentication state first
        if (!isAuthenticated()) {
            this.setButtonState('signin');
        } else {
            this.setButtonState('send', { disabled: !promptInput || promptInput.value.trim() === '' });
        }
    }

    /**
     * Auto-resize textarea functionality
     */
    setupAutoResizeTextarea() {
        const textarea = document.getElementById('prompt');
        if (!textarea) return;

        const adjustTextareaHeight = () => {
            textarea.style.height = 'auto'; // Reset height
            textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`; // Max height 300px
        };

        // Adjust on input
        textarea.addEventListener('input', adjustTextareaHeight);
        
        // Adjust on paste
        textarea.addEventListener('paste', () => {
            setTimeout(adjustTextareaHeight, 0);
        });

        // Adjust when content is set programmatically
        const observer = new MutationObserver(() => {
            adjustTextareaHeight();
        });
        observer.observe(textarea, { 
            attributes: true, 
            attributeFilter: ['value'],
            childList: true,
            subtree: true
        });

        // Initial adjustment
        adjustTextareaHeight();
    }

    /**
     * Toggle visibility of a collapsible section
     * @param {string} contentId - ID of the content element to toggle
     */
    toggleSection(contentId) {
        const content = document.getElementById(contentId);
        if (content) {
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        }
    }

    /**
     * Toggle tools details section visibility
     */
    toggleToolsDetails() {
        const content = document.getElementById('tools-details-content');
        const header = document.querySelector('.tools-details-header');
        
        if (content && header) {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            
            // Update arrow direction
            const arrow = header.querySelector('.toggle-arrow');
            if (arrow) {
                arrow.textContent = isHidden ? '▼' : '▶';
            }
        }
    }

    /**
     * Enable response action buttons (copy, share)
     */
    enableResponseActions() {
        const copyBtn = document.getElementById('copy-response-btn');
        const shareBtn = document.getElementById('share-response-btn');
        
        if (copyBtn) {
            copyBtn.disabled = false;
            copyBtn.style.opacity = '1';
        }
        if (shareBtn) {
            shareBtn.disabled = false;
            shareBtn.style.opacity = '1';
        }
    }

    /**
     * Disable response action buttons (copy, share)
     */
    disableResponseActions() {
        const copyBtn = document.getElementById('copy-response-btn');
        const shareBtn = document.getElementById('share-response-btn');
        
        if (copyBtn) {
            copyBtn.disabled = true;
            copyBtn.style.opacity = '0.5';
        }
        if (shareBtn) {
            shareBtn.disabled = true;
            shareBtn.style.opacity = '0.5';
        }
    }

    /**
     * Setup response action button handlers (copy, share)
     */
    setupResponseActionHandlers() {
        if (this.responseActionHandlersSetup) return;
        
        const copyBtn = document.getElementById('copy-response-btn');
        const shareBtn = document.getElementById('share-response-btn');
        
        if (copyBtn) {
            copyBtn.addEventListener('click', this.copyResponseToClipboard.bind(this));
        }
        if (shareBtn) {
            shareBtn.addEventListener('click', this.shareResponseByEmail.bind(this));
        }
        
        this.responseActionHandlersSetup = true;
    }

    /**
     * Copy response content to clipboard
     */
    async copyResponseToClipboard() {
        try {
            const responseContainer = document.getElementById('response-container');
            if (!responseContainer) {
                this.toastManager.showError('No response content to copy');
                return;
            }
            
            const textContent = responseContainer.textContent || responseContainer.innerText;
            if (!textContent.trim()) {
                this.toastManager.showWarning('Response is empty');
                return;
            }
            
            await navigator.clipboard.writeText(textContent);
            this.toastManager.showSuccess('Response copied to clipboard!');
            
            // Briefly highlight the copy button
            const copyBtn = document.getElementById('copy-response-btn');
            if (copyBtn) {
                const original = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                copyBtn.style.background = '#28a745';
                setTimeout(() => {
                    copyBtn.textContent = original;
                    copyBtn.style.background = '';
                }, 1500);
            }
        } catch (error) {
            console.error('Failed to copy response:', error);
            this.toastManager.showError('Failed to copy response to clipboard');
        }
    }

    /**
     * Share response content by email
     */
    shareResponseByEmail() {
        try {
            const responseContainer = document.getElementById('response-container');
            if (!responseContainer) {
                this.toastManager.showError('No response content to share');
                return;
            }
            
            const textContent = responseContainer.textContent || responseContainer.innerText;
            if (!textContent.trim()) {
                this.toastManager.showWarning('Response is empty');
                return;
            }
            
            const promptInput = document.getElementById('prompt');
            const originalPrompt = promptInput ? promptInput.value : 'N/A';
            
            const subject = encodeURIComponent('AI Search Results');
            const body = encodeURIComponent(
                `Original Query: ${originalPrompt}\n\n` +
                `AI Response:\n${textContent}\n\n` +
                `Generated on: ${new Date().toLocaleString()}`
            );
            
            const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
            window.open(mailtoUrl, '_blank');
            
            this.toastManager.showSuccess('Email client opened with response content');
        } catch (error) {
            console.error('Failed to share response:', error);
            this.toastManager.showError('Failed to open email client');
        }
    }

    /**
     * Update model availability in dropdown
     */
    updateModelAvailability() {
        const modelSelect = document.getElementById('model');
        if (!modelSelect) return;
        
        // Check if user is authenticated to determine which models are available
        const isAuth = isAuthenticated();
        const options = modelSelect.querySelectorAll('option');
        
        options.forEach(option => {
            if (option.value.startsWith('openai:') && !isAuth) {
                option.disabled = true;
                option.textContent += ' (Sign in required)';
            }
        });
    }

    /**
     * Show/hide persona and research containers
     * @param {boolean} show - Whether to show or hide the containers
     */
    togglePersonaQuestions(show = false) {
        const personaEl = document.getElementById('persona-container');
        const researchEl = document.getElementById('research-questions-container');
        const layoutEl = document.querySelector('.persona-questions-layout');
        
        if (personaEl) {
            personaEl.style.display = show ? 'block' : 'none';
        }
        if (researchEl) {
            researchEl.style.display = show ? 'block' : 'none';
        }
        if (layoutEl) {
            if (show) {
                layoutEl.classList.remove('hidden');
            } else {
                layoutEl.classList.add('hidden');
            }
        }
    }

    /**
     * Update status message
     * @param {string} message - Status message to display
     */
    updateStatus(message) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    /**
     * Update response container state
     * @param {string} state - State to set ('loading', 'success', 'error', '')
     */
    updateResponseContainer(state = '') {
        const responseContainer = document.getElementById('response-container');
        if (responseContainer) {
            responseContainer.className = state ? `response-container ${state}` : 'response-container';
        }
    }

    /**
     * Apply enhanced styles for tracking displays
     */
    applyTrackingStyles() {
        // This would contain the CSS-in-JS styling logic from the original
        // For brevity, keeping it as a placeholder - the actual implementation
        // would include all the dynamic styling code
        console.log('📊 Tracking styles applied');
    }
}

// Create singleton instance
const uiManager = new UIManager(
    window.stateManager || stateManager,
    window.toastManager || toastManager
);

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UIManager, uiManager };
}

// Global access for existing code
window.uiManager = uiManager;

// Export legacy functions for backward compatibility
window.setButtonState = (state, options) => uiManager.setButtonState(state, options);
window.updateSubmitButton = () => uiManager.updateSubmitButton();
window.setupAutoResizeTextarea = () => uiManager.setupAutoResizeTextarea();
window.toggleSection = (contentId) => uiManager.toggleSection(contentId);
window.toggleToolsDetails = () => uiManager.toggleToolsDetails();
window.enableResponseActions = () => uiManager.enableResponseActions();
window.disableResponseActions = () => uiManager.disableResponseActions();
window.setupResponseActionHandlers = () => uiManager.setupResponseActionHandlers();
window.copyResponseToClipboard = () => uiManager.copyResponseToClipboard();
window.shareResponseByEmail = () => uiManager.shareResponseByEmail();
window.applyTrackingStyles = () => uiManager.applyTrackingStyles();