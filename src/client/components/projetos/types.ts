/**
 * Shared types for the Projetos workspace (US-023 + US-024).
 *
 * This contract is consumed by:
 *  - workspace.tsx  (owns layout + URL tab state)
 *  - chat-panel.tsx (owns conversation + streaming)
 *  - preview-panel.tsx (owns tabs: overview/prompt/playground/deploy)
 *
 * Keep this file STABLE — it is the interface between parallel agents.
 */

import type { ProjectType } from '@/lib/project-type'

export type { ProjectType }
export type ProjectStatus = 'draft' | 'production' | 'paused' | 'archived'
export type PreviewTab = 'overview' | 'prompt' | 'playground' | 'deploy' | 'activity'

export interface WorkspaceProject {
  id: string
  name: string
  type: ProjectType
  status: ProjectStatus
  aiAgentId: string | null
  aiAgent: {
    id: string
    name: string
    systemPrompt: string | null
    provider: string
    model: string
  } | null
  /**
   * Option A (minimum) — derived from BuilderDeployment.status === 'live'
   * && connectionId != null. Avoids adding the full connections array to the
   * wire contract. When a live WhatsApp connection exists the deploy checklist
   * unblocks; `false` keeps agents in draft until the publish saga completes.
   */
  hasWhatsAppConnection: boolean
}

export interface PreviewPanelProps {
  project: WorkspaceProject
  activeTab: PreviewTab
  onTabChange: (tab: PreviewTab) => void
  /** All chat messages — used to derive dynamic progress from tool calls */
  messages: ChatMessage[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system_banner'
  content: string
  toolCalls?: Array<{
    toolName: string
    args: unknown
    result?: unknown
  }>
  createdAt: string
}
