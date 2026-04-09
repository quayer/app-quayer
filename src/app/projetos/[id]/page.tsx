import { headers } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { database } from '@/server/services/database'
import { Workspace } from '@/client/components/projetos/workspace'
import type {
  ChatMessage,
  WorkspaceProject,
} from '@/client/components/projetos/types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Projeto | Quayer',
}

interface ProjetoPageProps {
  params: Promise<{ id: string }>
}

// ------------------------------------------------------------------
// Auth helper (matches src/app/integracoes/settings/billing/actions.ts).
// Middleware injects x-user-id and x-current-org-id after JWT verify.
// ------------------------------------------------------------------
async function requireAuth() {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')
  return { userId, orgId }
}

export default async function ProjetoPage({ params }: ProjetoPageProps) {
  const { id } = await params
  const { userId, orgId } = await requireAuth()

  if (!userId) {
    redirect('/login')
  }
  if (!orgId) {
    redirect('/')
  }

  // ------------------------------------------------------------------
  // Fetch project scoped to active org + soft-delete aware.
  // ------------------------------------------------------------------
  const project = await database.builderProject.findFirst({
    where: {
      id,
      organizationId: orgId,
      archivedAt: null,
    },
    include: {
      aiAgent: {
        select: {
          id: true,
          name: true,
          systemPrompt: true,
          provider: true,
          model: true,
        },
      },
    },
  })

  if (!project) {
    notFound()
  }

  // ------------------------------------------------------------------
  // Fetch last 50 messages for the 1:1 conversation attached to this project.
  // ------------------------------------------------------------------
  const rawMessages = await database.builderProjectMessage.findMany({
    where: {
      conversation: { projectId: id },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: {
      id: true,
      role: true,
      content: true,
      toolCalls: true,
      createdAt: true,
    },
  })

  // Cast Prisma output into the stable ChatMessage contract.
  const initialMessages: ChatMessage[] = rawMessages
    .filter(
      (m) =>
        m.role === 'user' ||
        m.role === 'assistant' ||
        m.role === 'system_banner',
    )
    .map((m) => ({
      id: m.id,
      role: m.role as ChatMessage['role'],
      content: m.content,
      toolCalls:
        Array.isArray(m.toolCalls) && m.toolCalls.length > 0
          ? (m.toolCalls as ChatMessage['toolCalls'])
          : undefined,
      createdAt: m.createdAt.toISOString(),
    }))

  const workspaceProject: WorkspaceProject = {
    id: project.id,
    name: project.name,
    type: project.type as WorkspaceProject['type'],
    status: project.status as WorkspaceProject['status'],
    aiAgentId: project.aiAgentId,
    aiAgent: project.aiAgent
      ? {
          id: project.aiAgent.id,
          name: project.aiAgent.name,
          systemPrompt: project.aiAgent.systemPrompt,
          provider: project.aiAgent.provider,
          model: project.aiAgent.model,
        }
      : null,
  }

  return (
    <Workspace project={workspaceProject} initialMessages={initialMessages} />
  )
}
