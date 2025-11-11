/**
 * Script Loader Utility
 * 
 * Dynamically loads external scripts
 */

const loadedScripts = new Set<string>();

/**
 * Load an external script dynamically
 */
export function loadScript(src: string): Promise<void> {
  if (loadedScripts.has(src)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    
    script.onload = () => {
      loadedScripts.add(src);
      resolve();
    };
    
    script.onerror = () => {
      reject(new Error(`Failed to load script: ${src}`));
    };
    
    document.head.appendChild(script);
  });
}

/**
 * Check if a script is already loaded
 */
export function isScriptLoaded(src: string): boolean {
  return loadedScripts.has(src);
}
