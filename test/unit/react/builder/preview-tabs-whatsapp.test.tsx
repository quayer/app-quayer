import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage, WorkspaceProject } from '@/client/components/projetos/types'
import { ActivityTab } from '@/client/components/projetos/preview/tabs/_core/activity/activity-tab'
import { deriveChecklist } from '@/client/components/projetos/preview/tabs/deploy/connection-step'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

function makeProject(overrides: Partial<WorkspaceProject> = {}): WorkspaceProject {
  return {
    id: 'proj-1',
    name: 'Assistente WhatsApp',
    type: 'ai_agent',
    status: 'draft',
    aiAgentId: 'agent-1',
    aiAgent: {
      id: 'agent-1',
      name: 'Suporte',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt:
        'Voce e um assistente de atendimento via WhatsApp para responder clientes com clareza.',
    },
    hasWhatsAppConnection: false,
    ...overrides,
  }
}

describe('Builder preview WhatsApp UX', () => {
  it('marks the deploy WhatsApp requirement from project.hasWhatsAppConnection', () => {
    const disconnected = deriveChecklist(makeProject())
    expect(disconnected.find((item) => item.key === 'whatsapp')).toMatchObject({
      label: 'Canal WhatsApp conectado',
      met: false,
    })

    const connected = deriveChecklist(
      makeProject({ hasWhatsAppConnection: true }),
    )
    expect(connected.find((item) => item.key === 'whatsapp')).toMatchObject({
      label: 'Canal WhatsApp conectado',
      met: true,
    })
  })

  it('renders WhatsApp tool calls in the activity timeline', () => {
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        createdAt: '2026-05-04T12:00:00.000Z',
        toolCalls: [
          {
            toolName: 'list_whatsapp_instances',
            args: { organizationId: 'org-1' },
            result: [{ id: 'conn-1', name: 'Suporte', status: 'connected' }],
          },
          {
            toolName: 'create_whatsapp_instance',
            args: { name: 'Suporte' },
          },
        ],
      },
    ]

    render(<ActivityTab project={makeProject()} messages={messages} />)

    expect(screen.getByText('Atividade do agente')).toBeTruthy()
    expect(screen.getByText('2 ações')).toBeTruthy()
    expect(screen.getByText('Listou instâncias WhatsApp')).toBeTruthy()
    expect(screen.getByText('Criou instância WhatsApp')).toBeTruthy()
    expect(screen.getByText('list_whatsapp_instances')).toBeTruthy()
    expect(screen.getByText('create_whatsapp_instance')).toBeTruthy()
    expect(screen.getByText('ok')).toBeTruthy()
    expect(screen.getByText('pending')).toBeTruthy()
  })
})
