/**
 * Client storage utility module
 * Manages language preferences and other client-side storage needs
 * 
 * Design principles:
 * 1. Multi-shop support: keys include shopId to avoid conflicts
 * 2. Exception safety: all localStorage operations wrapped in try-catch
 * 3. SSR compatibility: check window object existence
 * 4. Multi-tab sync: use storage events
 */

// localStorage key constants
const STORAGE_KEYS = {
  LANGUAGE_PREFERENCE: (shopId) => `translate-${shopId}-language-preference`
};

/**
 * Get user's language preference
 * @param {string} shopId - Shop ID
 * @returns {string|null} Saved language code, or null if not found or error
 */
export function getLanguagePreference(shopId) {
  try {
    // SSR compatibility check
    if (typeof window === 'undefined') {
      console.log('[Storage] Server environment, skip localStorage read');
      return null;
    }

    if (!shopId) {
      console.warn('[Storage] shopId not provided, cannot read language preference');
      return null;
    }

    const key = STORAGE_KEYS.LANGUAGE_PREFERENCE(shopId);
    const savedLanguage = localStorage.getItem(key);
    
    if (savedLanguage) {
      console.log(`[Storage] Retrieved saved language preference: ${savedLanguage}`);
    }
    
    return savedLanguage;
  } catch (error) {
    console.warn('[Storage] Cannot read language preference:', error.message);
    return null;
  }
}

/**
 * Set user's language preference
 * @param {string} shopId - Shop ID
 * @param {string} language - Language code
 * @returns {boolean} Whether save was successful
 */
export function setLanguagePreference(shopId, language) {
  try {
    // SSR compatibility check
    if (typeof window === 'undefined') {
      console.log('[Storage] Server environment, skip localStorage write');
      return false;
    }

    if (!shopId) {
      console.warn('[Storage] shopId not provided, cannot save language preference');
      return false;
    }

    if (!language) {
      console.warn('[Storage] language not provided, cannot save language preference');
      return false;
    }

    const key = STORAGE_KEYS.LANGUAGE_PREFERENCE(shopId);
    localStorage.setItem(key, language);
    
    console.log(`[Storage] Saved language preference: ${language} (shop: ${shopId})`);
    return true;
  } catch (error) {
    console.warn('[Storage] Cannot save language preference:', error.message);
    // localStorage might be unavailable in private mode or storage full
    return false;
  }
}

/**
 * Listen for language preference changes (multi-tab sync)
 * @param {string} shopId - Shop ID
 * @param {function} callback - Callback function when language changes
 * @returns {function} Cleanup function to remove listener
 */
export function onLanguagePreferenceChange(shopId, callback) {
  // SSR compatibility check
  if (typeof window === 'undefined') {
    console.log('[Storage] Server environment, skip storage event listener');
    return () => {}; // Return empty cleanup function
  }

  if (!shopId || !callback) {
    console.warn('[Storage] shopId or callback not provided, cannot setup listener');
    return () => {};
  }

  const targetKey = STORAGE_KEYS.LANGUAGE_PREFERENCE(shopId);
  
  const handler = (event) => {
    // Only handle keys we care about
    if (event.key === targetKey && event.newValue) {
      console.log(`[Storage] Detected language change from other tab: ${event.newValue}`);
      callback(event.newValue);
    }
  };
  
  // Add event listener
  window.addEventListener('storage', handler);
  console.log(`[Storage] Setup storage event listener (shop: ${shopId})`);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('storage', handler);
    console.log(`[Storage] Cleaned up storage event listener (shop: ${shopId})`);
  };
}

/**
 * Clear user's language preference (for reset functionality)
 * @param {string} shopId - Shop ID
 * @returns {boolean} Whether clear was successful
 */
export function clearLanguagePreference(shopId) {
  try {
    if (typeof window === 'undefined') {
      console.log('[Storage] Server environment, skip localStorage clear');
      return false;
    }

    if (!shopId) {
      console.warn('[Storage] shopId not provided, cannot clear language preference');
      return false;
    }

    const key = STORAGE_KEYS.LANGUAGE_PREFERENCE(shopId);
    localStorage.removeItem(key);
    
    console.log(`[Storage] Cleared language preference (shop: ${shopId})`);
    return true;
  } catch (error) {
    console.warn('[Storage] Cannot clear language preference:', error.message);
    return false;
  }
}

/**
 * Get all stored keys (for debugging)
 * @returns {string[]} All translate-related localStorage keys
 */
export function getStorageKeys() {
  try {
    if (typeof window === 'undefined') {
      return [];
    }

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('translate-')) {
        keys.push(key);
      }
    }
    
    console.log('[Storage] Found translate-related keys:', keys);
    return keys;
  } catch (error) {
    console.warn('[Storage] Cannot get storage keys:', error.message);
    return [];
  }
}

export default {
  getLanguagePreference,
  setLanguagePreference,
  onLanguagePreferenceChange,
  clearLanguagePreference,
  getStorageKeys
};