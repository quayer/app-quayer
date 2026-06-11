"use client"

/**
 * PromptTab — editor do system prompt do agente com insights e toolbar.
 *
 * Tema reativo via useAppTokens. Auto-save com debounce de 2s, estritamente
 * user-driven: mudanças programáticas (sync de snapshot RSC, rollback, adoção
 * de conflito) realinham o baseline e NUNCA agendam PATCH. Quando o prompt
 * muda no servidor enquanto há edição local não salva, um banner de conflito
 * deixa o usuário escolher entre a versão do Builder e a edição manual.
 *
 * Orquestrador: combina header, editor, insights, version history e actions.
 * Toda lógica de estado pesada vive nos hooks co-locados em ./hooks/.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import {
  usePromptAutosave,
  type PromptServerState,
} from "./hooks/use-prompt-autosave"
import { usePromptActions } from "./hooks/use-prompt-actions"
import { analyzePrompt } from "./prompt-utils"
import { PromptHeader } from "./prompt-header"
import { PromptEditor } from "./prompt-editor"
import { PromptInsightsSection } from "./prompt-insights-section"
import { VersionHistory } from "./version-history"
import type { PromptTabProps } from "./prompt-types"

export type { PromptTabProps } from "./prompt-types"

export function PromptTab({ project, messages }: PromptTabProps) {
  const { tokens } = useAppTokens()
  const serverPrompt = project.aiAgent?.systemPrompt ?? ""

  const [value, setValue] = useState(serverPrompt)
  const [expanded, setExpanded] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(true)
  const [conflict, setConflict] = useState<PromptServerState | null>(null)

  /** Último conteúdo CONFIRMADO pelo servidor que o editor adotou. */
  const baselineRef = useRef(serverPrompt)
  /** True apenas quando a última mudança em `value` veio do textarea. */
  const userEditedRef = useRef(false)

  // dirty user-driven: edição do usuário divergindo do baseline confirmado.
  const isDirty = userEditedRef.current && value !== baselineRef.current

  const { saveState, now, forceSave, acceptServerState } = usePromptAutosave({
    value,
    dirty: isDirty,
    // PATCH /projects/:id/prompt resolve o AIAgentConfig internamente; null
    // pula chamadas de rede até o agente existir.
    projectId: project.aiAgent ? project.id : null,
    onSaved: (saved) => {
      baselineRef.current = saved.systemPrompt
    },
    onConflict: (server) => {
      setConflict(server)
    },
  })

  /** Adota um conteúdo vindo do servidor sem disparar autosave. */
  const adoptServer = useCallback(
    (content: string, updatedAt: string | null) => {
      userEditedRef.current = false
      baselineRef.current = content
      setValue(content)
      setConflict(null)
      acceptServerState(updatedAt)
    },
    [acceptServerState],
  )

  // Sync: o prompt mudou no servidor (regeneração via chat, disclosure da
  // identidade, rollback externo, router.refresh). Editor intocado → adota.
  // Editor com edição local não salva → banner de conflito, nunca sobrescreve.
  useEffect(() => {
    const incoming = project.aiAgent?.systemPrompt ?? ""
    if (incoming === baselineRef.current) return
    if (!userEditedRef.current || value === baselineRef.current) {
      adoptServer(incoming, null)
    } else {
      // Banner de conflito derivado da prop externa — nunca sobrescreve.
      setConflict({ systemPrompt: incoming, updatedAt: null })
    }
    // Reage apenas à mudança do prompt do servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.aiAgent?.systemPrompt])

  const handleEditorChange = useCallback((v: string) => {
    userEditedRef.current = true
    setValue(v)
  }, [])

  const handleKeepMine = useCallback(() => {
    setConflict(null)
    forceSave()
  }, [forceSave])

  const handleRestored = useCallback(
    (content: string) => {
      adoptServer(content, null)
    },
    [adoptServer],
  )

  const { handleCopy, handleRegenerate } = usePromptActions(value)

  // --- insights (memoized) ---
  const insights = useMemo(() => analyzePrompt(value), [value])

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

      {/* Banner de conflito: o prompt mudou no servidor com edição local viva */}
      {conflict && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border p-3"
          style={{
            borderColor: tokens.warning,
            backgroundColor: tokens.warningSubtle,
          }}
        >
          <p
            className="flex items-start gap-2 text-[12px] leading-snug"
            style={{ color: tokens.warningText }}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              O prompt foi alterado pelo Builder enquanto você editava. Escolha
              qual versão manter — nada será sobrescrito sem a sua decisão.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => adoptServer(conflict.systemPrompt, conflict.updatedAt)}
              className="inline-flex min-h-9 items-center rounded-md border px-3 text-[11px] font-medium"
              style={{
                borderColor: tokens.warning,
                color: tokens.warningText,
                backgroundColor: "transparent",
              }}
            >
              Usar versão do Builder
            </button>
            <button
              type="button"
              onClick={handleKeepMine}
              className="inline-flex min-h-9 items-center rounded-md border px-3 text-[11px] font-medium"
              style={{
                borderColor: tokens.divider,
                color: tokens.textPrimary,
                backgroundColor: tokens.bgSurface,
              }}
            >
              Manter minha edição
            </button>
          </div>
        </div>
      )}

      {/* Section 2: Toolbar + Editor */}
      <PromptEditor
        tokens={tokens}
        value={value}
        onChange={handleEditorChange}
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
      <VersionHistory
        tokens={tokens}
        projectId={project.id}
        editorValue={value}
        onRestored={handleRestored}
      />
    </div>
  )
}
