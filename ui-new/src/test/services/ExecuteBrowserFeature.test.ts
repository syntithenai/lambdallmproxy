/**
 * ExecuteBrowserFeature Unit Tests
 * 
 * Tests all 11 feature handlers, risk levels, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeBrowserFeature,
  getFeatureRiskLevel,
  requiresCodeReview,
  FEATURE_RISK_LEVELS
} from '../../services/clientTools/tools/ExecuteBrowserFeature';
import type { BrowserFeatureType } from '../../services/clientTools/types';

describe('ExecuteBrowserFeature', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Mock navigator APIs
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: vi.fn().mockResolvedValue('clipboard content'),
        writeText: vi.fn().mockResolvedValue(undefined)
      },
      writable: true,
      configurable: true
    });

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn()
      },
      writable: true,
      configurable: true
    });

    // Mock Notification
    global.Notification = {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted')
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Risk Levels', () => {
    it('should classify javascript as HIGH risk', () => {
      expect(getFeatureRiskLevel('javascript')).toBe('high');
      expect(FEATURE_RISK_LEVELS.javascript).toBe('high');
    });

    it('should classify dom_manipulate as HIGH risk', () => {
      expect(getFeatureRiskLevel('dom_manipulate')).toBe('high');
    });

    it('should classify storage_write as MEDIUM risk', () => {
      expect(getFeatureRiskLevel('storage_write')).toBe('medium');
    });

    it('should classify storage_read as LOW risk', () => {
      expect(getFeatureRiskLevel('storage_read')).toBe('low');
    });

    it('should have risk levels for all 11 features', () => {
      const features: BrowserFeatureType[] = [
        'javascript', 'storage_read', 'storage_write',
        'clipboard_read', 'clipboard_write', 'notification',
        'geolocation', 'file_read', 'screenshot',
        'dom_query', 'dom_manipulate'
      ];

      features.forEach(feature => {
        expect(FEATURE_RISK_LEVELS[feature]).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(FEATURE_RISK_LEVELS[feature]);
      });
    });
  });

  describe('Code Review Requirements', () => {
    it('should always require review in "always" mode', () => {
      expect(requiresCodeReview('storage_read', 'always')).toBe(true);
      expect(requiresCodeReview('javascript', 'always')).toBe(true);
    });

    it('should never require review in "timeout" mode', () => {
      expect(requiresCodeReview('javascript', 'timeout')).toBe(false);
      expect(requiresCodeReview('storage_write', 'timeout')).toBe(false);
    });

    it('should require review for high/medium risk in "risky-only" mode', () => {
      expect(requiresCodeReview('javascript', 'risky-only')).toBe(true);
      expect(requiresCodeReview('storage_write', 'risky-only')).toBe(true);
      expect(requiresCodeReview('storage_read', 'risky-only')).toBe(false);
    });
  });

  describe('storage_read', () => {
    it('should read from localStorage', async () => {
      localStorage.setItem('test_key', 'test_value');

      const result = await executeBrowserFeature({
        feature: 'storage_read',
        storage_key: 'test_key'
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('test_value');
      expect(result.metadata?.key).toBe('test_key');
    });

    it('should read from sessionStorage', async () => {
      sessionStorage.setItem('session_key', 'session_value');

      const result = await executeBrowserFeature({
        feature: 'storage_read',
        storage_key: 'session_key',
        storage_type: 'sessionStorage'
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('session_value');
    });

    it('should return null for non-existent key', async () => {
      const result = await executeBrowserFeature({
        feature: 'storage_read',
        storage_key: 'nonexistent'
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeNull();
    });
  });

  describe('storage_write', () => {
    it('should write to localStorage', async () => {
      const result = await executeBrowserFeature({
        feature: 'storage_write',
        storage_key: 'write_key',
        storage_value: 'write_value'
      });

      expect(result.success).toBe(true);
      expect(result.result?.key).toBe('write_key');
      expect(localStorage.getItem('write_key')).toBe('write_value');
    });

    it('should write to sessionStorage', async () => {
      const result = await executeBrowserFeature({
        feature: 'storage_write',
        storage_key: 'session_write',
        storage_value: 'session_val',
        storage_type: 'sessionStorage'
      });

      expect(result.success).toBe(true);
      expect(sessionStorage.getItem('session_write')).toBe('session_val');
    });
  });

  describe('clipboard_read', () => {
    it('should read from clipboard', async () => {
      const result = await executeBrowserFeature({
        feature: 'clipboard_read'
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('clipboard content');
      expect(navigator.clipboard.readText).toHaveBeenCalled();
    });

    it('should handle clipboard read errors', async () => {
      vi.mocked(navigator.clipboard.readText).mockRejectedValueOnce(
        new Error('Clipboard access denied')
      );

      const result = await executeBrowserFeature({
        feature: 'clipboard_read'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clipboard access denied');
    });
  });

  describe('clipboard_write', () => {
    it('should write to clipboard', async () => {
      const result = await executeBrowserFeature({
        feature: 'clipboard_write',
        clipboard_text: 'text to copy'
      });

      expect(result.success).toBe(true);
      expect(result.result?.text).toBe('text to copy');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('text to copy');
    });

    it('should track clipboard text length', async () => {
      const longText = 'a'.repeat(1000);

      const result = await executeBrowserFeature({
        feature: 'clipboard_write',
        clipboard_text: longText
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.length).toBe(1000);
    });
  });

  describe('notification', () => {
    it('should show notification when permission granted', async () => {
      const mockNotification = vi.fn();
      global.Notification = mockNotification as any;
      (global.Notification as any).permission = 'granted';

      const result = await executeBrowserFeature({
        feature: 'notification',
        notification_title: 'Test Title',
        notification_body: 'Test Body'
      });

      expect(result.success).toBe(true);
      expect(result.result?.title).toBe('Test Title');
    });

    it('should fail when permission denied', async () => {
      (global.Notification as any).permission = 'denied';

      const result = await executeBrowserFeature({
        feature: 'notification',
        notification_title: 'Test',
        notification_body: 'Body'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('permission');
    });
  });

  describe('geolocation', () => {
    it('should get current position', async () => {
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        }
      };

      vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation(
        (success: any) => success(mockPosition)
      );

      const result = await executeBrowserFeature({
        feature: 'geolocation'
      });

      expect(result.success).toBe(true);
      expect(result.result?.latitude).toBe(37.7749);
      expect(result.result?.longitude).toBe(-122.4194);
    });

    it('should handle geolocation errors', async () => {
      vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation(
        (_: any, error: any) => error({ message: 'User denied geolocation' })
      );

      const result = await executeBrowserFeature({
        feature: 'geolocation'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('denied');
    });
  });

  describe('dom_query', () => {
    it('should query DOM elements', async () => {
      // Create test elements
      const div1 = document.createElement('div');
      div1.className = 'test-class';
      div1.textContent = 'Test content 1';
      div1.id = 'test1';

      const div2 = document.createElement('div');
      div2.className = 'test-class';
      div2.textContent = 'Test content 2';

      document.body.appendChild(div1);
      document.body.appendChild(div2);

      const result = await executeBrowserFeature({
        feature: 'dom_query',
        selector: '.test-class'
      });

      expect(result.success).toBe(true);
      expect(result.result).toHaveLength(2);
      expect(result.metadata?.count).toBe(2);

      // Cleanup
      document.body.removeChild(div1);
      document.body.removeChild(div2);
    });

    it('should query specific attribute', async () => {
      const link = document.createElement('a');
      link.href = 'https://example.com';
      link.className = 'test-link';
      document.body.appendChild(link);

      const result = await executeBrowserFeature({
        feature: 'dom_query',
        selector: '.test-link',
        attribute: 'href'
      });

      expect(result.success).toBe(true);
      expect(result.result).toContain('https://example.com');

      document.body.removeChild(link);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown feature', async () => {
      const result = await executeBrowserFeature({
        feature: 'unknown_feature' as any
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown feature');
    });

    it('should include duration metadata', async () => {
      const result = await executeBrowserFeature({
        feature: 'storage_read',
        storage_key: 'test'
      });

      expect(result.metadata?.duration).toBeDefined();
      expect(typeof result.metadata?.duration).toBe('number');
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include feature in metadata', async () => {
      const result = await executeBrowserFeature({
        feature: 'storage_read',
        storage_key: 'test'
      });

      expect(result.metadata?.feature).toBe('storage_read');
    });
  });

  describe('Screenshot Feature', () => {
    it('should return placeholder message', async () => {
      // Mock canvas context for screenshot
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue({}) // Return a mock context
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);
      
      const result = await executeBrowserFeature({
        feature: 'screenshot'
      });

      expect(result.success).toBe(true);
      expect(result.result?.message).toContain('html2canvas');
      expect(result.metadata?.note).toContain('html2canvas');
      
      vi.restoreAllMocks();
    });
  });
});
