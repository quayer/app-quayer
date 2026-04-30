/**
 * Heuristic check: does the input look like a phone number?
 * Strips non-digit characters and returns true when 8+ digits remain.
 */
export function looksLikePhone(v: string): boolean {
  const clean = v.replace(/[^\d]/g, '')
  return clean.length >= 8
}
