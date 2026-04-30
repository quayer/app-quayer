/**
 * OTP Rate Limiter
 *
 * Rate-limit para envio de OTP via WhatsApp.
 * - Por telefone: 3 envios / 15 minutos
 * - Por IP: 5 envios / hora
 *
 * Usa Redis com INCR + EXPIRE (atômico) para contadores.
 */

import { RateLimiter, RateLimitResult } from './rate-limiter';

/**
 * Rate limiter por número de telefone
 * 3 tentativas a cada 15 minutos
 */
export const otpPhoneRateLimiter = new RateLimiter({
  limit: 3,
  window: 900, // 15 minutos
  prefix: 'ratelimit:otp:phone',
});

/**
 * Rate limiter por IP do client
 * 5 tentativas a cada hora
 */
export const otpIpRateLimiter = new RateLimiter({
  limit: 5,
  window: 3600, // 1 hora
  prefix: 'ratelimit:otp:ip',
});

/**
 * Verifica ambos os rate-limits (phone + IP) antes de enviar OTP.
 *
 * @param phone - Número de telefone normalizado
 * @param clientIp - IP do client
 * @returns RateLimitResult com success=false se bloqueado
 */
export async function checkOtpRateLimit(
  phone: string,
  clientIp: string
): Promise<RateLimitResult> {
  // Verificar rate-limit por telefone primeiro
  const phoneResult = await otpPhoneRateLimiter.check(phone);
  if (!phoneResult.success) {
    return phoneResult;
  }

  // Verificar rate-limit por IP
  const ipResult = await otpIpRateLimiter.check(clientIp);
  if (!ipResult.success) {
    return ipResult;
  }

  // Ambos OK — retornar resultado com menor remaining
  return phoneResult.remaining < ipResult.remaining ? phoneResult : ipResult;
}
