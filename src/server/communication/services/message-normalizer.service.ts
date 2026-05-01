export function normalizeForAI(message: unknown): string {
  if (typeof message === 'string') return message
  if (message && typeof message === 'object' && 'content' in message) {
    return String((message as { content: unknown }).content)
  }
  return JSON.stringify(message)
}
