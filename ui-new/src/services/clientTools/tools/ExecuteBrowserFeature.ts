/**
 * Execute Browser Feature Tool
 * 
 * Unified tool for executing browser features client-side
 */

import type { BrowserFeatureType, BrowserFeatureResult, RiskLevel } from '../types';
import { JavaScriptSandbox } from '../JavaScriptSandbox';

// Feature risk levels
export const FEATURE_RISK_LEVELS: Record<BrowserFeatureType, RiskLevel> = {
  javascript: 'high',
  dom_manipulate: 'high',
  storage_write: 'medium',
  file_read: 'medium',
  geolocation: 'medium',
  storage_read: 'low',
  clipboard_read: 'low',
  clipboard_write: 'low',
  notification: 'low',
  screenshot: 'low',
  dom_query: 'low'
};

// Feature handlers

async function executeJavaScript(args: any): Promise<BrowserFeatureResult> {
  const sandbox = new JavaScriptSandbox();
  try {
    const result = await sandbox.execute(args.code);
    return { 
      success: true, 
      result, 
      description: args.description 
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  } finally {
    sandbox.destroy();
  }
}

async function readStorage(args: any): Promise<BrowserFeatureResult> {
  try {
    const { storage_key, storage_type = 'localStorage' } = args;
    const storage = storage_type === 'sessionStorage' ? sessionStorage : localStorage;
    const value = storage.getItem(storage_key);
    
    return { 
      success: true, 
      result: value, 
      metadata: { key: storage_key, type: storage_type }
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function writeStorage(args: any): Promise<BrowserFeatureResult> {
  try {
    const { storage_key, storage_value, storage_type = 'localStorage' } = args;
    const storage = storage_type === 'sessionStorage' ? sessionStorage : localStorage;
    storage.setItem(storage_key, storage_value);
    
    return { 
      success: true, 
      result: { key: storage_key, value: storage_value },
      metadata: { type: storage_type }
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function readClipboard(): Promise<BrowserFeatureResult> {
  try {
    const text = await navigator.clipboard.readText();
    return { 
      success: true, 
      result: text,
      metadata: { length: text.length }
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function writeClipboard(args: any): Promise<BrowserFeatureResult> {
  try {
    const { clipboard_text } = args;
    await navigator.clipboard.writeText(clipboard_text);
    
    return { 
      success: true, 
      result: { text: clipboard_text },
      metadata: { length: clipboard_text.length }
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function showNotification(args: any): Promise<BrowserFeatureResult> {
  try {
    const { notification_title, notification_body, notification_icon } = args;
    
    // Request permission if needed
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { 
          success: false, 
          error: 'Notification permission denied' 
        };
      }
    }
    
    if (Notification.permission !== 'granted') {
      return { 
        success: false, 
        error: 'Notification permission not granted' 
      };
    }
    
    new Notification(notification_title, {
      body: notification_body,
      icon: notification_icon
    });
    
    return { 
      success: true, 
      result: { title: notification_title, body: notification_body }
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function getGeolocation(): Promise<BrowserFeatureResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ 
        success: false, 
        error: 'Geolocation not supported' 
      });
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        success: true,
        result: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed
        }
      }),
      (error) => resolve({ 
        success: false, 
        error: error.message 
      }),
      { 
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 0 
      }
    );
  });
}

async function readFile(args: any): Promise<BrowserFeatureResult> {
  try {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = args.file_accept || '*/*';
    
    return new Promise((resolve) => {
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve({ 
            success: false, 
            error: 'No file selected' 
          });
          return;
        }
        
        try {
          const text = await file.text();
          resolve({ 
            success: true, 
            result: text,
            metadata: { 
              filename: file.name, 
              size: file.size, 
              type: file.type 
            }
          });
        } catch (error: any) {
          resolve({ 
            success: false, 
            error: error.message 
          });
        }
      };
      
      input.oncancel = () => {
        resolve({ 
          success: false, 
          error: 'File selection cancelled' 
        });
      };
      
      input.click();
    });
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function takeScreenshot(args: any): Promise<BrowserFeatureResult> {
  try {
    // Basic screenshot using canvas (full page)
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      return { 
        success: false, 
        error: 'Canvas context not available' 
      };
    }
    
    // Set canvas size to viewport
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // For a real screenshot, you'd need html2canvas library
    // This is a placeholder that captures viewport dimensions
    return { 
      success: true, 
      result: {
        width: canvas.width,
        height: canvas.height,
        message: 'Screenshot feature requires html2canvas library'
      },
      metadata: { 
        selector: args.selector,
        note: 'Install html2canvas for full functionality' 
      }
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function queryDOM(args: any): Promise<BrowserFeatureResult> {
  try {
    const { selector, attribute } = args;
    const elements = document.querySelectorAll(selector);
    
    const results = Array.from(elements).map(el => {
      if (attribute) {
        return el.getAttribute(attribute);
      }
      return {
        tagName: el.tagName,
        textContent: el.textContent?.substring(0, 200), // Limit text length
        className: el.className,
        id: el.id
      };
    });
    
    return { 
      success: true, 
      result: results,
      metadata: { 
        count: results.length, 
        selector 
      }
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function manipulateDOM(args: any): Promise<BrowserFeatureResult> {
  const sandbox = new JavaScriptSandbox();
  try {
    // DOM manipulation is done via JavaScript execution
    // This provides a safe wrapper
    const code = args.code || args.manipulation_code;
    const result = await sandbox.execute(code);
    
    return { 
      success: true, 
      result,
      description: args.description
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  } finally {
    sandbox.destroy();
  }
}

// Feature handler mapping
const featureHandlers: Record<BrowserFeatureType, (args: any) => Promise<BrowserFeatureResult>> = {
  javascript: executeJavaScript,
  storage_read: readStorage,
  storage_write: writeStorage,
  clipboard_read: readClipboard,
  clipboard_write: writeClipboard,
  notification: showNotification,
  geolocation: getGeolocation,
  file_read: readFile,
  screenshot: takeScreenshot,
  dom_query: queryDOM,
  dom_manipulate: manipulateDOM
};

/**
 * Execute a browser feature
 */
export async function executeBrowserFeature(args: {
  feature: BrowserFeatureType;
  description?: string;
  [key: string]: any;
}): Promise<BrowserFeatureResult> {
  const { feature, ...featureArgs } = args;
  
  const handler = featureHandlers[feature];
  if (!handler) {
    return { 
      success: false, 
      error: `Unknown feature: ${feature}` 
    };
  }
  
  try {
    const startTime = Date.now();
    const result = await handler(featureArgs);
    const duration = Date.now() - startTime;
    
    return {
      ...result,
      metadata: {
        ...result.metadata,
        duration,
        feature
      }
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Get risk level for a feature
 */
export function getFeatureRiskLevel(feature: BrowserFeatureType): RiskLevel {
  return FEATURE_RISK_LEVELS[feature] || 'high';
}

/**
 * Check if a feature requires code review based on mode and risk
 */
export function requiresCodeReview(
  feature: BrowserFeatureType, 
  mode: 'always' | 'risky-only' | 'timeout'
): boolean {
  if (mode === 'always') return true;
  if (mode === 'timeout') return false;
  
  // risky-only mode
  const risk = getFeatureRiskLevel(feature);
  return risk === 'high' || risk === 'medium';
}
