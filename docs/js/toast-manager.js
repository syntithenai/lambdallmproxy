// toast-manager.js - Toast notification system

/**
 * Toast notification manager for displaying user feedback messages
 */
class ToastManager {
    constructor() {
        this.container = null;
        this.init();
    }

    /**
     * Initialize the toast container
     */
    init() {
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            console.warn('Toast container not found. Toast notifications will not work.');
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - The type of toast ('info', 'success', 'warning', 'error')
     * @param {number} duration - How long to show the toast in milliseconds
     */
    showToast(message, type = 'info', duration = 5000) {
        if (!this.container) {
            console.warn('Toast container not available:', message);
            return;
        }
     
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = message;

        this.container.appendChild(toast);

        // Auto remove after duration
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, duration);
    }

    /**
     * Show success toast
     * @param {string} message - Success message
     * @param {number} duration - Duration in milliseconds
     */
    showSuccess(message, duration = 3000) {
        this.showToast(message, 'success', duration);
    }

    /**
     * Show error toast
     * @param {string} message - Error message
     * @param {number} duration - Duration in milliseconds
     */
    showError(message, duration = 7000) {
        this.showToast(message, 'error', duration);
    }

    /**
     * Show warning toast
     * @param {string} message - Warning message
     * @param {number} duration - Duration in milliseconds
     */
    showWarning(message, duration = 5000) {
        this.showToast(message, 'warning', duration);
    }

    /**
     * Show info toast
     * @param {string} message - Info message
     * @param {number} duration - Duration in milliseconds
     */
    showInfo(message, duration = 4000) {
        this.showToast(message, 'info', duration);
    }

    /**
     * Clear all toasts
     */
    clearAll() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Create singleton instance
const toastManager = new ToastManager();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ToastManager, toastManager };
}

// Global access for existing code
window.toastManager = toastManager;

// Export legacy function for backward compatibility
window.showToast = (message, type, duration) => toastManager.showToast(message, type, duration);