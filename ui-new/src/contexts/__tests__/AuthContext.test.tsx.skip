/**
 * AuthContext Tests
 * 
 * Tests for authentication context including login, logout,
 * token validation, and auto-login behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'
import * as authUtils from '../../utils/auth'

// Mock the auth utilities
vi.mock('../../utils/auth', () => ({
  loadAuthState: vi.fn(),
  saveAuthState: vi.fn(),
  clearAuthState: vi.fn(),
  decodeJWT: vi.fn(),
  isTokenExpiringSoon: vi.fn(),
}))

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Context Setup', () => {
    it('should throw error when useAuth used outside provider', () => {
      expect(() => {
        renderHook(() => useAuth())
      }).toThrow('useAuth must be used within AuthProvider')
    })

    it('should provide auth context within provider', () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: null,
        accessToken: null,
        isAuthenticated: false
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      expect(result.current).toBeDefined()
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('Login', () => {
    it('should login user with valid credential', () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: null,
        accessToken: null,
        isAuthenticated: false
      })
      
      vi.mocked(authUtils.decodeJWT).mockReturnValue({
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/pic.jpg',
        sub: '12345'
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      act(() => {
        result.current.login('mock.jwt.token')
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user).toEqual({
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/pic.jpg',
        sub: '12345'
      })
      expect(result.current.accessToken).toBe('mock.jwt.token')
      expect(authUtils.saveAuthState).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
        'mock.jwt.token'
      )
    })

    it('should handle invalid JWT token gracefully', () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: null,
        accessToken: null,
        isAuthenticated: false
      })
      
      vi.mocked(authUtils.decodeJWT).mockImplementation(() => {
        throw new Error('Invalid token')
      })

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      act(() => {
        result.current.login('invalid.token')
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(consoleError).toHaveBeenCalledWith('Login failed:', expect.any(Error))
      
      consoleError.mockRestore()
    })

    it('should extract user info from JWT', () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: null,
        accessToken: null,
        isAuthenticated: false
      })
      
      vi.mocked(authUtils.decodeJWT).mockReturnValue({
        email: 'john@example.com',
        name: 'John Doe',
        picture: 'https://example.com/john.jpg',
        sub: '67890',
        iat: 1234567890,
        exp: 1234567890 + 3600
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      act(() => {
        result.current.login('token.with.claims')
      })

      expect(result.current.user?.email).toBe('john@example.com')
      expect(result.current.user?.name).toBe('John Doe')
      expect(result.current.user?.sub).toBe('67890')
    })
  })

  describe('Logout', () => {
    it('should logout user and clear state', () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: {
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/pic.jpg',
          sub: '12345'
        },
        accessToken: 'existing.token',
        isAuthenticated: true
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      expect(result.current.isAuthenticated).toBe(true)

      act(() => {
        result.current.logout()
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.user).toBeNull()
      expect(result.current.accessToken).toBeNull()
      expect(authUtils.clearAuthState).toHaveBeenCalled()
    })

    it('should handle logout when not authenticated', () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: null,
        accessToken: null,
        isAuthenticated: false
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      act(() => {
        result.current.logout()
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(authUtils.clearAuthState).toHaveBeenCalled()
    })
  })

  describe('Token Refresh', () => {
    it('should return false for refresh token (disabled)', async () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: null,
        accessToken: null,
        isAuthenticated: false
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      const refreshResult = await result.current.refreshToken()
      expect(refreshResult).toBe(false)
    })
  })

  describe('Get Token', () => {
    it('should return token when valid', async () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: {
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/pic.jpg',
          sub: '12345'
        },
        accessToken: 'valid.token',
        isAuthenticated: true
      })
      
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(false)

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      const token = await result.current.getToken()
      expect(token).toBe('valid.token')
    })

    it('should return null when not authenticated', async () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: null,
        accessToken: null,
        isAuthenticated: false
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      const token = await result.current.getToken()
      expect(token).toBeNull()
    })

    it('should logout and return null for expired token', async () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: {
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/pic.jpg',
          sub: '12345'
        },
        accessToken: 'expired.token',
        isAuthenticated: true
      })
      
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(true)

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      const token = await result.current.getToken()
      
      expect(token).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('Auto-Login', () => {
    it('should auto-login with valid saved token', async () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: {
          email: 'returning@example.com',
          name: 'Returning User',
          picture: 'https://example.com/returning.jpg',
          sub: '99999'
        },
        accessToken: 'saved.token',
        isAuthenticated: false
      })
      
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(false)

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })

      expect(result.current.user?.email).toBe('returning@example.com')
      expect(result.current.accessToken).toBe('saved.token')
    })

    it('should not auto-login with expired saved token', async () => {
      vi.mocked(authUtils.loadAuthState)
        .mockReturnValueOnce({
          user: null,
          accessToken: null,
          isAuthenticated: false
        })
        .mockReturnValueOnce({
          user: {
            email: 'expired@example.com',
            name: 'Expired User',
            picture: 'https://example.com/expired.jpg',
            sub: '88888'
          },
          accessToken: 'expired.token',
          isAuthenticated: false
        })
      
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(true)

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      await waitFor(() => {
        expect(authUtils.clearAuthState).toHaveBeenCalled()
      })

      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should not auto-login when already authenticated', async () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: {
          email: 'current@example.com',
          name: 'Current User',
          picture: 'https://example.com/current.jpg',
          sub: '77777'
        },
        accessToken: 'current.token',
        isAuthenticated: true
      })
      
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(false)

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      // Wait for initial state to settle
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })
      
      expect(result.current.user?.email).toBe('current@example.com')
    })
  })

  describe('Token Expiration Monitoring', () => {
    it('should logout when token expires during session', async () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: {
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/pic.jpg',
          sub: '12345'
        },
        accessToken: 'valid.token',
        isAuthenticated: true
      })
      
      // Token is valid initially
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(false)

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })

      // Simulate token expiring
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(true)

      // Fast-forward 30 seconds (token check interval)
      await act(async () => {
        vi.advanceTimersByTime(30 * 1000)
        await vi.runAllTimersAsync()
      })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false)
      }, { timeout: 1000 })
    }, 10000) // Increase test timeout

    it('should logout immediately if token already expired on mount', () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: {
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/pic.jpg',
          sub: '12345'
        },
        accessToken: 'expired.token',
        isAuthenticated: true
      })
      
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(true)

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(authUtils.clearAuthState).toHaveBeenCalled()
    })

    it('should check token every 30 seconds', () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: {
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/pic.jpg',
          sub: '12345'
        },
        accessToken: 'valid.token',
        isAuthenticated: true
      })
      
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(false)

      renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      // Initial call on mount
      expect(authUtils.isTokenExpiringSoon).toHaveBeenCalledTimes(1)

      // After 30 seconds
      act(() => {
        vi.advanceTimersByTime(30 * 1000)
      })
      expect(authUtils.isTokenExpiringSoon).toHaveBeenCalledTimes(2)

      // After another 30 seconds
      act(() => {
        vi.advanceTimersByTime(30 * 1000)
      })
      expect(authUtils.isTokenExpiringSoon).toHaveBeenCalledTimes(3)
    })

    it('should stop checking when logged out', () => {
      vi.mocked(authUtils.loadAuthState).mockReturnValue({
        user: {
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/pic.jpg',
          sub: '12345'
        },
        accessToken: 'valid.token',
        isAuthenticated: true
      })
      
      vi.mocked(authUtils.isTokenExpiringSoon).mockReturnValue(false)

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider
      })

      // Logout
      act(() => {
        result.current.logout()
      })

      // Clear the mock calls from logout
      vi.mocked(authUtils.isTokenExpiringSoon).mockClear()

      // Fast-forward time
      act(() => {
        vi.advanceTimersByTime(30 * 1000)
      })

      // Should not check token after logout
      expect(authUtils.isTokenExpiringSoon).not.toHaveBeenCalled()
    })
  })
})
