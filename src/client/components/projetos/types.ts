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

export type ProjectStatus = 'draft' | 'production' | 'paused' | 'archived'
export type ProjectType = 'ai_agent'
export type PreviewTab = 'overview' | 'prompt' | 'playground' | 'deploy'

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
}

export interface PreviewPanelProps {
  project: WorkspaceProject
  activeTab: PreviewTab
  onTabChange: (tab: PreviewTab) => void
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
