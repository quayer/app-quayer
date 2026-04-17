import { describe, it, expect } from 'vitest'
import { isWebhookUrlSafe } from '@/server/ai-module/builder/tools/create-custom-tool.tool'

/**
 * SSRF guard — create_custom_tool
 *
 * Validates that LLM-drafted webhook URLs are blocked before being persisted
 * as AgentTool rows. Covers HTTPS-only, port 443-only, and hostname
 * blocklist (localhost, RFC1918, 169.254 metadata, IPv6 loopback/link-local/ULA,
 * .internal/.local/.localhost TLDs).
 */
describe('isWebhookUrlSafe — SSRF guard', () => {
  // ── Allowed ─────────────────────────────────────────────────────────
  describe('allowed URLs', () => {
    const allowed: Array<[string, string]> = [
      ['public Shopify API', 'https://api.shopify.com/admin/api/2024-01/products.json'],
      ['plain public hostname', 'https://example.com/x'],
      ['explicit port 443', 'https://example.com:443/x'],
      ['just outside 172.16.0.0/12 — 172.15', 'https://172.15.0.1/x'],
      ['just outside 172.16.0.0/12 — 172.32', 'https://172.32.0.1/x'],
    ]
    it.each(allowed)('accepts %s', (_label, url) => {
      const result = isWebhookUrlSafe(url)
      expect(result.ok).toBe(true)
    })
  })

  // ── Protocol ────────────────────────────────────────────────────────
  describe('protocol blocklist', () => {
    it('rejects http:', () => {
      const result = isWebhookUrlSafe('http://api.example.com/')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/HTTPS/i)
    })
    it('rejects ftp:', () => {
      const result = isWebhookUrlSafe('ftp://example.com/x')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/HTTPS/i)
    })
    it('rejects file:', () => {
      const result = isWebhookUrlSafe('file:///etc/passwd')
      expect(result.ok).toBe(false)
    })
  })

  // ── Port ────────────────────────────────────────────────────────────
  describe('port blocklist', () => {
    it('rejects :8080', () => {
      const result = isWebhookUrlSafe('https://example.com:8080/x')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/port|443/i)
    })
    it('rejects :80', () => {
      const result = isWebhookUrlSafe('https://example.com:80/x')
      expect(result.ok).toBe(false)
    })
  })

  // ── Hostname strings ────────────────────────────────────────────────
  describe('hostname blocklist (strings)', () => {
    it('rejects localhost', () => {
      const result = isWebhookUrlSafe('https://localhost/x')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/localhost/i)
    })
    it('rejects LOCALHOST (case-insensitive)', () => {
      const result = isWebhookUrlSafe('https://LOCALHOST/x')
      expect(result.ok).toBe(false)
    })
    it('rejects .internal TLD', () => {
      const result = isWebhookUrlSafe('https://foo.internal/x')
      expect(result.ok).toBe(false)
    })
    it('rejects .local TLD', () => {
      const result = isWebhookUrlSafe('https://foo.local/x')
      expect(result.ok).toBe(false)
    })
  })

  // ── IPv4 ranges ─────────────────────────────────────────────────────
  describe('IPv4 blocklist', () => {
    const blocked: Array<[string, string]> = [
      ['127.0.0.1 loopback', 'https://127.0.0.1/x'],
      ['127.5.5.5 — entire /8 blocked', 'https://127.5.5.5/x'],
      ['10.0.0.1 RFC1918', 'https://10.0.0.1/x'],
      ['172.16.5.5 RFC1918', 'https://172.16.5.5/x'],
      ['172.31.255.255 top of /12', 'https://172.31.255.255/x'],
      ['192.168.1.1 RFC1918', 'https://192.168.1.1/x'],
      ['169.254.169.254 AWS metadata', 'https://169.254.169.254/latest/meta-data'],
      ['0.0.0.0', 'https://0.0.0.0/x'],
    ]
    it.each(blocked)('rejects %s', (_label, url) => {
      const result = isWebhookUrlSafe(url)
      expect(result.ok).toBe(false)
    })
  })

  // ── IPv6 ────────────────────────────────────────────────────────────
  describe('IPv6 blocklist', () => {
    it('rejects [::1] loopback', () => {
      const result = isWebhookUrlSafe('https://[::1]/x')
      expect(result.ok).toBe(false)
    })
    it('rejects [fe80::1] link-local', () => {
      const result = isWebhookUrlSafe('https://[fe80::1]/x')
      expect(result.ok).toBe(false)
    })
  })

  // ── Malformed ───────────────────────────────────────────────────────
  describe('malformed input', () => {
    it('rejects not-a-url with reason "Invalid URL"', () => {
      const result = isWebhookUrlSafe('not-a-url')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('Invalid URL')
    })
  })
})
