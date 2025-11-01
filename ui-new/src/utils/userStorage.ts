/**
 * User-scoped localStorage utilities
 * 
 * SECURITY-CRITICAL: This module ensures all settings are scoped to the logged-in user
 * to prevent settings leakage between users.
 * 
 * All localStorage keys are prefixed with the user's email (or 'anonymous' if not logged in)
 */

let currentUserEmail: string | null = null;

/**
 * Set the current user email for scoping localStorage keys
 * Should be called on login/logout
 */
export function setCurrentUser(email: string | null): void {
  currentUserEmail = email;
  console.log('📧 User storage scoped to:', email || 'anonymous');
}

/**
 * Get the current user email
 */
export function getCurrentUser(): string | null {
  return currentUserEmail;
}

/**
 * Generate a user-scoped key for localStorage
 * @param key The base key (e.g., 'app_settings')
 * @returns User-scoped key (e.g., 'user:alice@example.com:app_settings' or 'anonymous:app_settings')
 */
function getScopedKey(key: string): string {
  const userPrefix = currentUserEmail ? `user:${currentUserEmail}` : 'anonymous';
  return `${userPrefix}:${key}`;
}

/**
 * Get an item from user-scoped localStorage
 */
export function getItem(key: string): string | null {
  const scopedKey = getScopedKey(key);
  return localStorage.getItem(scopedKey);
}

/**
 * Set an item in user-scoped localStorage
 */
export function setItem(key: string, value: string): void {
  const scopedKey = getScopedKey(key);
  localStorage.setItem(scopedKey, value);
}

/**
 * Remove an item from user-scoped localStorage
 */
export function removeItem(key: string): void {
  const scopedKey = getScopedKey(key);
  localStorage.removeItem(scopedKey);
}

/**
 * Clear ALL localStorage items for the current user
 * SECURITY: This prevents settings leakage when logging out
 */
export function clearUserStorage(): void {
  if (!currentUserEmail) {
    console.warn('⚠️ clearUserStorage called but no user is logged in');
    return;
  }

  const userPrefix = `user:${currentUserEmail}:`;
  const keysToRemove: string[] = [];

  // Find all keys for the current user
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(userPrefix)) {
      keysToRemove.push(key);
    }
  }

  // Remove them
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  console.log(`🧹 Cleared ${keysToRemove.length} user-scoped settings for ${currentUserEmail}`);
}

/**
 * Clear ALL localStorage items for anonymous users
 * Used when transitioning from anonymous to logged-in state
 */
export function clearAnonymousStorage(): void {
  const anonymousPrefix = 'anonymous:';
  const keysToRemove: string[] = [];

  // Find all anonymous keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(anonymousPrefix)) {
      keysToRemove.push(key);
    }
  }

  // Remove them
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  console.log(`🧹 Cleared ${keysToRemove.length} anonymous settings`);
}

/**
 * Migrate existing non-scoped localStorage keys to user-scoped keys
 * Should be called once after user logs in
 * 
 * @param email User email to migrate to
 * @param keysToMigrate List of keys to migrate (e.g., ['app_settings', 'proxy_settings'])
 */
export function migrateToUserScoped(email: string, keysToMigrate: string[]): void {
  console.log(`🔄 Migrating ${keysToMigrate.length} keys to user-scoped storage for ${email}`);
  
  keysToMigrate.forEach(key => {
    // Check if old non-scoped key exists
    const oldValue = localStorage.getItem(key);
    if (oldValue !== null) {
      // Check if new scoped key already exists (don't overwrite)
      const newKey = `user:${email}:${key}`;
      const existingValue = localStorage.getItem(newKey);
      
      if (existingValue === null) {
        // Migrate: copy to new scoped key
        localStorage.setItem(newKey, oldValue);
        console.log(`  ✅ Migrated: ${key} → ${newKey}`);
      } else {
        console.log(`  ⏭️ Skipped: ${newKey} already exists`);
      }
      
      // Remove old non-scoped key
      localStorage.removeItem(key);
    }
  });
  
  console.log('✅ Migration complete');
}

/**
 * List of all keys that should be user-scoped
 * Used for migration and clearing
 */
export const USER_SCOPED_KEYS = [
  'app_settings',
  'proxy_settings',
  'feed_maturity_level',
  'auto_sync_enabled',
  'google_drive_access_token',
  'user_email',
  'rag_config',
  'rag_spreadsheet_id',
  'rag_google_linked',
  'last_active_chat_id',
  'image_editor_images',
  'image_editor_selection',
  'image_editor_command',
  'imageEditorPromptHistory',
  'swag-google-docs-cache',
  'swag-recent-tags',
  'swag-snippets',
  'saved_plans',
  'playlists',
  'chat_history',
  'google_access_token',
  'google_oauth_token',
  'access_token'
] as const;
