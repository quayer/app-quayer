import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRunFaithfulPreview = vi.hoisted(() => vi.fn())

vi.mock('../services/faithful-preview.service', () => ({
  runFaithfulPreview: mockRunFaithfulPreview,
}))

import { runRefinementConversation } from './conversation-runner'

beforeEach(() => {
  mockRunFaithfulPreview.mockReset()
})

describe('runRefinementConversation', () => {
  it('runs scenario turns through faithful preview and accumulates transcript/tools', async () => {
    mockRunFaithfulPreview
      .mockResolvedValueOnce({
        reply: 'Claro, qual serviço você precisa?',
        toolCalls: [],
        usage: { totalTokens: 10 },
      })
      .mockResolvedValueOnce({
        reply: 'Vou acionar a agenda.',
        toolCalls: ['calendar_booking'],
        usage: { totalTokens: 20 },
      })

    const result = await runRefinementConversation({
      projectId: 'proj-1',
      organizationId: 'org-1',
      scenario: {
        id: 'happy',
        label: 'Fluxo feliz',
        userMessages: ['Oi', 'Quero agendar amanhã'],
        tags: ['happy_path'],
      },
    })

    expect(result.error).toBeUndefined()
    expect(result.transcript).toEqual([
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Claro, qual serviço você precisa?' },
      { role: 'user', content: 'Quero agendar amanhã' },
      { role: 'assistant', content: 'Vou acionar a agenda.' },
    ])
    expect(result.toolCalls).toEqual([{ toolName: 'calendar_booking' }])
    expect(mockRunFaithfulPreview).toHaveBeenCalledTimes(2)
    expect(mockRunFaithfulPreview.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Claro, qual serviço você precisa?' },
      { role: 'user', content: 'Quero agendar amanhã' },
    ])
  })

  it('returns partial transcript with error when preview fails', async () => {
    mockRunFaithfulPreview.mockRejectedValueOnce(new Error('provider down'))

    const result = await runRefinementConversation({
      projectId: 'proj-1',
      organizationId: 'org-1',
      scenario: {
        id: 'sad',
        label: 'Falha',
        userMessages: ['Oi'],
        tags: ['error'],
      },
    })

    expect(result.error).toBe('provider down')
    expect(result.transcript).toEqual([])
  })
})
