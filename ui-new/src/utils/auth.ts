// Google OAuth types and constants
// Use environment variable - configured in ui-new/.env
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GGL_CID;

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

export interface AuthState {
  user: GoogleUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

// Initialize Google OAuth
export const initializeGoogleOAuth = (callback: (response: any) => void) => {
  if (typeof google !== 'undefined' && google.accounts) {
    if (!GOOGLE_CLIENT_ID) {
      console.error('❌ VITE_GGL_CID not configured in ui-new/.env');
      return;
    }
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: callback
    });
  }
};

// Render Google Sign-In button
export const renderGoogleButton = (elementId: string) => {
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.renderButton(
      document.getElementById(elementId)!,
      {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular'
      }
    );
  }
};

// Welcome Wizard State Management
// These functions track whether a user has seen the welcome wizard

/**
 * Check if user has already completed the welcome wizard
 * @returns true if user has seen the wizard, false otherwise
 */
export const hasSeenWelcomeWizard = (): boolean => {
  try {
    const completed = localStorage.getItem('has_completed_welcome_wizard');
    return completed === 'true';
  } catch (e) {
    console.error('Failed to check welcome wizard status:', e);
    return false; // Show wizard if we can't determine status
  }
};

/**
 * Mark the welcome wizard as completed
 * Stores timestamp for analytics/debugging
 */
export const markWelcomeWizardComplete = (): void => {
  try {
    localStorage.setItem('has_completed_welcome_wizard', 'true');
    localStorage.setItem('welcome_wizard_completed_at', new Date().toISOString());
  } catch (e) {
    console.error('Failed to mark welcome wizard as complete:', e);
  }
};

/**
 * Reset welcome wizard state (for testing)
 */
export const resetWelcomeWizard = (): void => {
  try {
    localStorage.removeItem('has_completed_welcome_wizard');
    localStorage.removeItem('welcome_wizard_completed_at');
  } catch (e) {
    console.error('Failed to reset welcome wizard:', e);
  }
};

/**
 * Trigger the welcome wizard to show
 */
export const triggerWelcomeWizard = (): void => {
  try {
    console.log('🎓 Triggering welcome wizard...');
    
    // Reset the wizard state
    resetWelcomeWizard();
    console.log('🎓 Reset wizard state');
    
    // Dispatch a custom event to trigger the wizard
    const event = new CustomEvent('show-welcome-wizard');
    console.log('🎓 About to dispatch event:', event);
    console.log('🎓 Current event listeners on window:', window);
    
    const result = window.dispatchEvent(event);
    console.log('🎓 Event dispatch result:', result);
    console.log('🎓 Event dispatched successfully');
    
    // Also try a delayed dispatch in case of timing issues
    setTimeout(() => {
      console.log('🎓 Trying delayed dispatch...');
      const delayedEvent = new CustomEvent('show-welcome-wizard');
      window.dispatchEvent(delayedEvent);
    }, 100);
    
  } catch (e) {
    console.error('Failed to trigger welcome wizard:', e);
  }
};

/**
 * Check if welcome wizard should be shown
 * @param isAuthenticated - Whether user is logged in
 * @returns true if wizard should be displayed
 */
export const shouldShowWelcomeWizard = (isAuthenticated: boolean): boolean => {
  // Only show if:
  // 1. User is authenticated
  // 2. User hasn't seen the wizard before
  return isAuthenticated && !hasSeenWelcomeWizard();
};
