/**
 * PII masking helpers for logs.
 *
 * Lives in its own module (instead of sanitize.ts) on purpose: sanitize.ts
 * pulls isomorphic-dompurify/jsdom, a multi-second cold import the webhook
 * hot path must not pay just to mask a phone number.
 */

/**
 * Mask a phone number for logs (PII protection).
 *
 * Keeps at most the first 4 digits (country/area code) and the last 4 digits,
 * masking everything in between — e.g. `+5511999998888` → `+5511*****8888`.
 * Short values are fully/mostly masked. Never throws.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) {
    return '';
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) {
    return '***';
  }
  const prefix = phone.trim().startsWith('+') ? '+' : '';
  if (digits.length <= 4) {
    return `${prefix}${'*'.repeat(digits.length)}`;
  }

  // Only reveal a head when there are enough digits to keep >=4 masked.
  const head = digits.slice(0, Math.min(4, Math.max(0, digits.length - 8)));
  const tail = digits.slice(-4);
  const masked = '*'.repeat(digits.length - head.length - tail.length);
  return `${prefix}${head}${masked}${tail}`;
}
