/**
 * URL Validator Unit Tests
 *
 * Tests SSRF protection and URL validation
 */

import { describe, it, expect } from 'vitest'
import { validatePublicUrl, isValidPublicUrl } from '@/lib/validators/url.validator'

describe('URL Validator', () => {
  describe('validatePublicUrl', () => {
    it('should accept valid HTTPS URL', () => {
      const result = validatePublicUrl('https://api.example.com/webhook')

      expect(result.isValid).toBe(true)
      expect(result.url).toBeDefined()
      expect(result.url?.protocol).toBe('https:')
    })

    it('should accept valid HTTP URL in development', () => {
      const result = validatePublicUrl('http://api.example.com/webhook', {
        requireHttps: false,
      })

      expect(result.isValid).toBe(true)
      expect(result.url).toBeDefined()
    })

    it('should reject localhost', () => {
      const result = validatePublicUrl('http://localhost:3000/webhook')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('não é permitida')
    })

    it('should reject 127.0.0.1', () => {
      const result = validatePublicUrl('http://127.0.0.1:3000/webhook')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('permitida')
    })

    it('should reject 0.0.0.0', () => {
      const result = validatePublicUrl('http://0.0.0.0:3000/webhook')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('não é permitida')
    })

    it('should reject AWS metadata endpoint', () => {
      const result = validatePublicUrl('http://169.254.169.254/latest/meta-data')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('não é permitida')
    })

    it('should reject GCP metadata endpoint', () => {
      const result = validatePublicUrl('http://metadata.google.internal/computeMetadata/v1/')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('não é permitida')
    })

    it('should reject private IP 10.x.x.x', () => {
      const result = validatePublicUrl('http://10.0.0.1/webhook')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('IPs privados')
    })

    it('should reject private IP 192.168.x.x', () => {
      const result = validatePublicUrl('http://192.168.1.1/webhook')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('IPs privados')
    })

    it('should reject private IP 172.16-31.x.x', () => {
      const result = validatePublicUrl('http://172.16.0.1/webhook')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('IPs privados')
    })

    it('should reject invalid protocol', () => {
      const result = validatePublicUrl('ftp://example.com/webhook')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Protocolo não permitido')
    })

    it('should reject malformed URL', () => {
      const result = validatePublicUrl('not-a-url')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('URL inválida')
    })

    it('should require HTTPS in production mode', () => {
      const result = validatePublicUrl('http://api.example.com/webhook', {
        requireHttps: true,
      })

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('HTTPS')
    })

    it('should allow custom protocols', () => {
      const result = validatePublicUrl('ws://api.example.com/socket', {
        allowedProtocols: ['ws:', 'wss:'],
      })

      expect(result.isValid).toBe(true)
    })
  })

  describe('isValidPublicUrl', () => {
    it('should return true for valid URL', () => {
      expect(isValidPublicUrl('https://api.example.com/webhook')).toBe(true)
    })

    it('should return false for localhost', () => {
      expect(isValidPublicUrl('http://localhost:3000/webhook')).toBe(false)
    })

    it('should return false for private IP', () => {
      expect(isValidPublicUrl('http://192.168.1.1/webhook')).toBe(false)
    })

    it('should return false for malformed URL', () => {
      expect(isValidPublicUrl('not-a-url')).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle URL with query parameters', () => {
      const result = validatePublicUrl('https://api.example.com/webhook?token=abc123')

      expect(result.isValid).toBe(true)
    })

    it('should handle URL with fragments', () => {
      const result = validatePublicUrl('https://api.example.com/webhook#section')

      expect(result.isValid).toBe(true)
    })

    it('should handle URL with username and password', () => {
      const result = validatePublicUrl('https://user:pass@api.example.com/webhook')

      expect(result.isValid).toBe(true)
    })

    it('should handle URL with non-standard port', () => {
      const result = validatePublicUrl('https://api.example.com:8443/webhook')

      expect(result.isValid).toBe(true)
    })

    it('should reject IPv6 localhost', () => {
      const result = validatePublicUrl('http://[::1]:3000/webhook')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('não é permitida')
    })

    it('should handle empty string', () => {
      const result = validatePublicUrl('')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('URL inválida')
    })
  })
})
