export interface SseEvent {
  type: string
  text: string
  message: string
  toolName: string
  args: Record<string, unknown>
}

export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  return { events: [], rest: buffer }
}
