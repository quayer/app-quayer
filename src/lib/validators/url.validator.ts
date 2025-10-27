/**
 * URL Validators
 *
 * ✅ FIX: Protege contra SSRF (Server-Side Request Forgery)
 * Previne que URLs internas/privadas sejam usadas
 */

const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS metadata endpoint
  'metadata.google.internal', // GCP metadata
]

const PRIVATE_IP_RANGES = [
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^127\./, // 127.0.0.0/8 (loopback)
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^fc00:/, // fc00::/7 (IPv6 ULA)
  /^fe80:/, // fe80::/10 (IPv6 link-local)
]

export interface UrlValidationResult {
  isValid: boolean
  error?: string
  url?: URL
}

/**
 * Validate URL against SSRF attacks
 */
export function validatePublicUrl(
  urlString: string,
  options: {
    requireHttps?: boolean
    allowedProtocols?: string[]
  } = {}
): UrlValidationResult {
  const {
    requireHttps = process.env.NODE_ENV === 'production',
    allowedProtocols = ['http:', 'https:'],
  } = options

  try {
    const url = new URL(urlString)

    // Check protocol
    if (!allowedProtocols.includes(url.protocol)) {
      return {
        isValid: false,
        error: `Protocolo não permitido: ${url.protocol}. Use ${allowedProtocols.join(' ou ')}`
      }
    }

    // Require HTTPS in production
    if (requireHttps && url.protocol !== 'https:') {
      return {
        isValid: false,
        error: 'Em produção, apenas URLs HTTPS são permitidas'
      }
    }

    // Check blocked hosts (including IPv6 localhost)
    const hostname = url.hostname.toLowerCase()
    if (BLOCKED_HOSTS.includes(hostname) || hostname === '[::1]' || hostname === '::1') {
      return {
        isValid: false,
        error: 'Esta URL não é permitida. Use uma URL pública válida.'
      }
    }

    // Check private IP ranges
    for (const range of PRIVATE_IP_RANGES) {
      if (range.test(url.hostname)) {
        return {
          isValid: false,
          error: 'IPs privados não são permitidos. Use uma URL pública válida.'
        }
      }
    }

    // Check for DNS rebinding attacks (numeric IPs)
    const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
    if (ipv4Pattern.test(url.hostname)) {
      // Parse IP and check if it's private
      const parts = url.hostname.split('.').map(Number)

      // Check if it's a private IP
      if (parts[0] === 10) {
        return { isValid: false, error: 'IP privado não permitido (10.x.x.x)' }
      }
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
        return { isValid: false, error: 'IP privado não permitido (172.16-31.x.x)' }
      }
      if (parts[0] === 192 && parts[1] === 168) {
        return { isValid: false, error: 'IP privado não permitido (192.168.x.x)' }
      }
      if (parts[0] === 127) {
        return { isValid: false, error: 'Localhost não permitido (127.x.x.x)' }
      }
    }

    return {
      isValid: true,
      url
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'URL inválida. Verifique o formato.'
    }
  }
}

/**
 * Zod validator for public URLs (use in schemas)
 */
export function isValidPublicUrl(url: string): boolean {
  return validatePublicUrl(url).isValid
}
