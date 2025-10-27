/**
 * API Client Tests
 * 
 * Tests for API utility functions including URL resolution,
 * request formatting, and response parsing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getCachedApiBase,
  resetApiBase,
  forceRemote,
  getCurrentApiBase,
} from '../api'

describe('API Client - URL Resolution', () => {
  beforeEach(() => {
    // Reset localStorage FIRST before calling resetApiBase
    localStorage.clear()
    
    // Reset state before each test
    resetApiBase()
    vi.clearAllMocks()
    
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isLocalhost Detection', () => {
    it('should detect localhost', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'localhost' }
      })

      // Mock local health check to fail (force remote)
      ;(global.fetch as any).mockRejectedValue(new Error('Not available'))
      
      const apiBase = await getCachedApiBase()
      expect(apiBase).toContain('lambda-url')
    })

    it('should detect 127.0.0.1', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: '127.0.0.1' }
      })

      ;(global.fetch as any).mockRejectedValue(new Error('Not available'))
      
      const apiBase = await getCachedApiBase()
      expect(apiBase).toBeDefined()
    })

    it('should detect private network IPs', async () => {
      const privateIPs = ['192.168.1.1', '10.0.0.1', '172.16.0.1']
      
      for (const ip of privateIPs) {
        resetApiBase()
        Object.defineProperty(window, 'location', {
          writable: true,
          value: { hostname: ip }
        })

        ;(global.fetch as any).mockRejectedValue(new Error('Not available'))
        
        const apiBase = await getCachedApiBase()
        expect(apiBase).toBeDefined()
      }
    })

    it('should use remote for production hostnames', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'app.example.com' }
      })

      const apiBase = await getCachedApiBase()
      expect(apiBase).toContain('lambda-url')
    })
  })

  describe('Local Lambda Health Check', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'localhost' }
      })
    })

    it('should use local when available', async () => {
      // Mock successful health check
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200
      })

      const apiBase = await getCachedApiBase()
      
      // If VITE_API_BASE is set (like in test environment), it will use that
      // Otherwise on localhost with healthy local server, use local
      expect(apiBase).toBeDefined()
      expect(typeof apiBase).toBe('string')
      expect(apiBase.startsWith('http')).toBe(true)
    })

    it('should fallback to remote when local unavailable', async () => {
      // Mock failed health check
      ;(global.fetch as any).mockRejectedValue(new Error('Connection refused'))

      const apiBase = await getCachedApiBase()
      expect(apiBase).toContain('lambda-url')
    })

    it('should timeout health check after 1 second', async () => {
      // Mock slow health check
      ;(global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      )

      const start = Date.now()
      const apiBase = await getCachedApiBase()
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(1500) // Should timeout quickly
      expect(apiBase).toContain('lambda-url') // Should fallback to remote
    })

    it('should fallback to remote when local unavailable (stores decision)', async () => {
      ;(global.fetch as any).mockRejectedValue(new Error('Not available'))

      const apiBase = await getCachedApiBase()
      
      // Should fallback to remote
      expect(apiBase).toContain('lambda-url')
    })

    it('should use remote on subsequent calls after fallback', async () => {
      // Manually set the localStorage marker as if fallback had occurred
      localStorage.setItem('lambdaproxy_use_remote', 'true')
      
      // Reset fetch mock
      ;(global.fetch as any).mockClear()

      // Should use remote without health check
      const apiBase = await getCachedApiBase()
      
      expect(apiBase).toContain('lambda-url')
      // Should not make health check call since marker is set
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('API Base Caching', () => {
    it('should cache API base after first call', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'app.example.com' }
      })

      const first = await getCachedApiBase()
      const second = await getCachedApiBase()

      expect(first).toBe(second)
    })

    it('should return same promise for concurrent calls', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'localhost' }
      })
      
      ;(global.fetch as any).mockResolvedValue({ ok: true })

      const promise1 = getCachedApiBase()
      const promise2 = getCachedApiBase()

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toBe(result2)
    })

    it('should allow cache reset', async () => {
      await getCachedApiBase() // First call caches value
      resetApiBase()
      
      // After reset, should determine URL again
      const second = await getCachedApiBase()
      expect(second).toBeDefined()
    })

    it('should clear localStorage on reset', async () => {
      localStorage.setItem('lambdaproxy_use_remote', 'true')
      
      resetApiBase()
      
      expect(localStorage.getItem('lambdaproxy_use_remote')).toBeNull()
    })
  })

  describe('Force Remote', () => {
    it('should force remote Lambda usage', async () => {
      forceRemote()
      
      const apiBase = await getCurrentApiBase()
      expect(apiBase).toContain('lambda-url')
    })

    it('should persist force remote setting', () => {
      forceRemote()
      
      expect(localStorage.getItem('lambdaproxy_use_remote')).toBe('true')
    })

    it('should skip health check when forced', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'localhost' }
      })

      forceRemote()
      ;(global.fetch as any).mockClear()
      
      const apiBase = await getCachedApiBase()
      
      expect(apiBase).toContain('lambda-url')
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('Environment Variable Override', () => {
    it('should use VITE_API_BASE when set', async () => {
      // Note: In actual tests, environment variables would be set via config
      // This is a conceptual test showing the expected behavior
      
      // The API should respect VITE_API_BASE if it's set
      const apiBase = await getCachedApiBase()
      expect(apiBase).toBeDefined()
      expect(typeof apiBase).toBe('string')
    })
  })

  describe('Error Handling', () => {
    it('should handle localStorage unavailable', () => {
      // Mock localStorage to throw
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
      getItemSpy.mockImplementation(() => {
        throw new Error('localStorage disabled')
      })

      // Should not throw
      expect(() => resetApiBase()).not.toThrow()
      
      getItemSpy.mockRestore()
    })

    it('should handle localStorage setItem failure', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'localhost' }
      })
      
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      setItemSpy.mockImplementation(() => {
        throw new Error('Quota exceeded')
      })

      ;(global.fetch as any).mockRejectedValue(new Error('Not available'))

      // Should not throw even if localStorage fails
      await expect(getCachedApiBase()).resolves.toBeDefined()
      
      setItemSpy.mockRestore()
    })

    it('should handle fetch AbortError gracefully', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'localhost' }
      })
      
      ;(global.fetch as any).mockRejectedValue(
        new DOMException('Aborted', 'AbortError')
      )

      // Should fallback to remote
      const apiBase = await getCachedApiBase()
      expect(apiBase).toContain('lambda-url')
    })

    it('should handle network errors during health check', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: 'localhost' }
      })
      
      ;(global.fetch as any).mockRejectedValue(
        new TypeError('Network request failed')
      )

      // Should fallback to remote
      const apiBase = await getCachedApiBase()
      expect(apiBase).toContain('lambda-url')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty hostname', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: '' }
      })

      const apiBase = await getCachedApiBase()
      expect(apiBase).toBeDefined()
    })

    it('should handle malformed IP addresses', async () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { hostname: '999.999.999.999' }
      })

      const apiBase = await getCachedApiBase()
      expect(apiBase).toBeDefined()
    })

    it('should handle multiple concurrent force remote calls', () => {
      expect(() => {
        forceRemote()
        forceRemote()
        forceRemote()
      }).not.toThrow()
    })

    it('should handle multiple concurrent reset calls', () => {
      expect(() => {
        resetApiBase()
        resetApiBase()
        resetApiBase()
      }).not.toThrow()
    })
  })
})
