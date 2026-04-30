import type {
  ChatMessage,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import type { useAppTokens } from "@/client/hooks/use-app-tokens"

export interface PromptTabProps {
  project: WorkspaceProject
  /**
   * Full chat history of the current project conversation. Optional for
   * backwards compatibility (older callers pass `{ project }` only) — when
   * provided, the insights section mines it for the latest
   * `generate_prompt_anatomy` tool result to render the "Análise do Builder"
   * block.
   */
  messages?: ChatMessage[]
  /** Optional callback to open the chat panel from the empty state. */
  onOpenChat?: () => void
}

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string }

export interface PromptInsights {
  charCount: number
  lineCount: number
  sectionCount: number
  estimatedTokens: number
  hasIdentity: boolean
  hasInstructions: boolean
  hasRestrictions: boolean
  hasTone: boolean
}

export type AppTokens = ReturnType<typeof useAppTokens>["tokens"]

/**
 * Shape returned by `GET /api/v1/builder/projects/:id/versions`.
 * Mirrors the backend contract (C1) — keep in sync when the endpoint evolves.
 */
export interface VersionListItem {
  id: string
  versionNumber: number
  content: string
  description: string | null
  createdBy: "chat" | "manual" | "rollback"
  publishedAt: string | null
  publishedBy: { id: string; name: string } | null
  createdAt: string
}

export interface VersionHistoryProps {
  tokens: AppTokens
  projectId: string
}
