const PHONE_RE = /^[+\d][\d\s\-().]{6,}$/

export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.startsWith('+')) return true
  if (/^\d{10,}$/.test(trimmed.replace(/[\s\-().]/g, ''))) return true
  return PHONE_RE.test(trimmed)
}
