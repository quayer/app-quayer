"use client"

/**
 * PromptTab — editor do system prompt do agente com insights e toolbar.
 *
 * Tema reativo via useAppTokens. Auto-save com debounce de 2s.
 * Sem mocks — version history preparado para dados reais.
 *
 * Orquestrador: combina header, editor, insights, version history e actions.
 * Toda logica de estado pesada vive nos hooks co-locados em ./hooks/.
 */

import { useEffect, useMemo, useState } from "react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { usePromptAutosave } from "./hooks/use-prompt-autosave"
import { usePromptActions } from "./hooks/use-prompt-actions"
import { analyzePrompt } from "./prompt-utils"
import { PromptEmptyState } from "./prompt-empty-state"
import { PromptHeader } from "./prompt-header"
import { PromptEditor } from "./prompt-editor"
import { PromptInsightsSection } from "./prompt-insights-section"
import { VersionHistory } from "./version-history"
import type { PromptTabProps } from "./prompt-types"

export type { PromptTabProps } from "./prompt-types"

export function PromptTab({ project, messages, onOpenChat }: PromptTabProps) {
  const { tokens } = useAppTokens()
  const initial = project.aiAgent?.systemPrompt ?? ""
  const [value, setValue] = useState(initial)
  const [expanded, setExpanded] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(true)

  useEffect(() => {
    const serverPrompt = project.aiAgent?.systemPrompt ?? ""
    if (value === initial || value === serverPrompt) {
      setValue(serverPrompt)
    }
    // Only run when the server-side prompt changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.aiAgent?.systemPrompt])

  // Pass project.id (BuilderProject UUID) — the PATCH /projects/:id/prompt endpoint
  // resolves the linked AIAgentConfig internally. Pass null when aiAgent is absent
  // so the hook skips network calls until the agent exists.
  const { saveState, now } = usePromptAutosave(
    value,
    initial,
    project.aiAgent ? project.id : null,
  )
  const { handleCopy, handleRegenerate } = usePromptActions(value)

  // --- insights (memoized) ---
  const insights = useMemo(() => analyzePrompt(value), [value])

  // --- empty state ---
  if (!project.aiAgent) {
    return (
      <PromptEmptyState tokens={tokens} onOpenChat={onOpenChat}>
        Aguardando o Builder criar o agente. Continue a conversa no chat.
      </PromptEmptyState>
    )
  }

  const isDirty = value !== initial

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {/* Section 1: Header */}
      <PromptHeader
        tokens={tokens}
        charCount={insights.charCount}
        value={value}
        isDirty={isDirty}
        saveState={saveState}
        now={now}
      />

      {/* Section 2: Toolbar + Editor */}
      <PromptEditor
        tokens={tokens}
        value={value}
        onChange={setValue}
        lineCount={insights.lineCount}
        expanded={expanded}
        onToggleExpand={() => setExpanded((e) => !e)}
        onRegenerate={handleRegenerate}
        onCopy={handleCopy}
      />

      {/* Section 3: Prompt Insights */}
      {value.length > 0 && (
        <PromptInsightsSection
          tokens={tokens}
          insights={insights}
          messages={messages}
          open={insightsOpen}
          onToggle={() => setInsightsOpen((o) => !o)}
        />
      )}

      {/* Section 4: Version History (real but gracefully empty) */}
      <VersionHistory tokens={tokens} projectId={project.id} />
    </div>
  )
}
