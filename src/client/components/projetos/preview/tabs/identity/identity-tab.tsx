"use client"

/**
 * IdentityTab — edita o Card de Identidade & Comportamento do agente
 * (objetivo, nome, persona, tom, e o DISCLOSURE: assume IA / se passa por
 * humano / personalizado). Autosave com debounce via PATCH.
 *
 * O modo "se passa por humano" exibe um disclaimer legal (LGPD/CDC/WhatsApp ToS)
 * e EXIGE aceite antes de salvar esse modo.
 */

import * as React from "react"
import { Check, Loader2, AlertTriangle } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Textarea } from "@/client/components/ui/textarea"
import type { WorkspaceProject } from "@/client/components/projetos/types"
import {
  DEFAULT_AGENT_IDENTITY_CARD,
  type AgentIdentityCard,
  type DisclosureMode,
  type IdentityTone,
} from "@/lib/agent-identity-card"

const TONES: { value: IdentityTone; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "amigavel", label: "Amigável" },
  { value: "direto", label: "Direto" },
]

const DISCLOSURE: { value: DisclosureMode; label: string; hint: string }[] = [
  { value: "ai_explicit", label: "🤖 Assume que é IA", hint: '"Sou a assistente virtual…"' },
  { value: "human_passthrough", label: "👤 Se passa por humano", hint: '"Oi, sou a Marina da clínica" (sem revelar IA)' },
  { value: "custom", label: "✎ Personalizado", hint: "Você escreve como ele se apresenta" },
]

export interface IdentityTabProps {
  project: WorkspaceProject
}

export function IdentityTab({ project }: IdentityTabProps) {
  const { tokens } = useAppTokens()
  const [card, setCard] = React.useState<AgentIdentityCard | null>(null)
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle")
  const [humanAccepted, setHumanAccepted] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load
  React.useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch(`/api/v1/builder/identity/${project.id}`, { credentials: "same-origin" })
        const json = (await res.json()) as { data?: { card?: AgentIdentityCard } }
        if (active) setCard(json.data?.card ?? { ...DEFAULT_AGENT_IDENTITY_CARD })
      } catch {
        if (active) setCard({ ...DEFAULT_AGENT_IDENTITY_CARD })
      }
    })()
    return () => {
      active = false
    }
  }, [project.id])

  const persist = React.useCallback(
    (patch: Partial<AgentIdentityCard>) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setSaveState("saving")
      timerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/v1/builder/identity/${project.id}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          })
          setSaveState(res.ok ? "saved" : "error")
        } catch {
          setSaveState("error")
        }
      }, 800)
    },
    [project.id],
  )

  const update = React.useCallback(
    (patch: Partial<AgentIdentityCard>) => {
      setCard((prev) => (prev ? { ...prev, ...patch } : prev))
      persist(patch)
    },
    [persist],
  )

  if (!card) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: tokens.textTertiary }} />
      </div>
    )
  }

  const fieldStyle = { color: tokens.textPrimary }
  const labelStyle = { color: tokens.textSecondary }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={fieldStyle}>
          Identidade & Comportamento
        </h2>
        <SaveIndicator state={saveState} tokens={tokens} />
      </div>

      {/* Objetivo + nome */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Objetivo" hint="ex: agendamento, vendas, suporte" tokens={tokens}>
          <Input
            value={card.objetivo}
            onChange={(e) => update({ objetivo: e.target.value })}
            placeholder="agendamento"
            className="h-9 text-[13px]"
          />
        </Field>
        <Field label="Nome do agente" tokens={tokens}>
          <Input
            value={card.displayName}
            onChange={(e) => update({ displayName: e.target.value })}
            placeholder="Marina"
            className="h-9 text-[13px]"
          />
        </Field>
      </div>

      <Field label="Persona" hint="como ele se comporta" tokens={tokens}>
        <Textarea
          value={card.persona}
          onChange={(e) => update({ persona: e.target.value })}
          placeholder="Secretária da clínica, acolhedora e objetiva."
          className="min-h-[64px] text-[13px]"
        />
      </Field>

      {/* Tom + emojis */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium" style={labelStyle}>Tom</span>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Tom de comunicação">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={card.tom === t.value}
                onClick={() => update({ tom: t.value })}
                className="rounded-md border px-3 py-1.5 text-[12px] transition-colors"
                style={{
                  borderColor: card.tom === t.value ? tokens.brand : tokens.border,
                  backgroundColor: card.tom === t.value ? tokens.brandSubtle : tokens.bgBase,
                  color: card.tom === t.value ? tokens.brand : tokens.textSecondary,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12px]" style={labelStyle}>
          <input
            type="checkbox"
            checked={card.usaEmojis}
            onChange={(e) => update({ usaEmojis: e.target.checked })}
          />
          Usar emojis com moderação
        </label>
      </div>

      {/* Disclosure */}
      <div className="rounded-lg border p-3" style={{ borderColor: tokens.divider }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: tokens.textTertiary }}>
          Como o agente se apresenta
        </span>
        <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label="Modo de identidade">
          {DISCLOSURE.map((d) => (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={card.disclosureMode === d.value}
              onClick={() => {
                if (d.value === "human_passthrough" && !humanAccepted) {
                  // exige aceite — apenas seleciona visualmente o disclaimer
                  setCard((p) => (p ? { ...p, disclosureMode: d.value } : p))
                  return
                }
                update({ disclosureMode: d.value })
              }}
              className="flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors"
              style={{
                borderColor: card.disclosureMode === d.value ? tokens.brand : tokens.border,
                backgroundColor: card.disclosureMode === d.value ? tokens.brandSubtle : tokens.bgBase,
              }}
            >
              <span className="text-[13px] font-medium" style={fieldStyle}>{d.label}</span>
              <span className="text-[11px]" style={{ color: tokens.textTertiary }}>{d.hint}</span>
            </button>
          ))}
        </div>

        {card.disclosureMode === "human_passthrough" && (
          <div
            className="mt-2 rounded-md border p-2.5"
            style={{ borderColor: tokens.warning, backgroundColor: tokens.warningSubtle }}
          >
            <p className="flex items-start gap-2 text-[11px]" style={{ color: tokens.warningText }}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Fingir ser humano pode violar LGPD/CDC (dever de transparência) e a
                política do WhatsApp. Você assume a responsabilidade legal.
              </span>
            </p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px]" style={{ color: tokens.warningText }}>
              <input
                type="checkbox"
                checked={humanAccepted}
                onChange={(e) => {
                  setHumanAccepted(e.target.checked)
                  if (e.target.checked) update({ disclosureMode: "human_passthrough" })
                }}
              />
              Li e aceito o risco.
            </label>
          </div>
        )}

        {card.disclosureMode === "custom" && (
          <Textarea
            value={card.disclosureCustomText ?? ""}
            onChange={(e) => update({ disclosureCustomText: e.target.value })}
            placeholder="Ex: Apresente-se como concierge do hotel, sem mencionar tecnologia."
            className="mt-2 min-h-[60px] text-[13px]"
          />
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  tokens,
  children,
}: {
  label: string
  hint?: string
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] font-medium" style={{ color: tokens.textSecondary }}>
        {label}
        {hint && <span style={{ color: tokens.textTertiary }}> — {hint}</span>}
      </Label>
      {children}
    </div>
  )
}

function SaveIndicator({
  state,
  tokens,
}: {
  state: "idle" | "saving" | "saved" | "error"
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  if (state === "idle") return null
  if (state === "saving")
    return (
      <span className="flex items-center gap-1.5 text-[11px]" style={{ color: tokens.textTertiary }}>
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Salvando…
      </span>
    )
  if (state === "saved")
    return (
      <span className="flex items-center gap-1.5 text-[11px]" style={{ color: tokens.successText }}>
        <Check className="h-3 w-3" aria-hidden="true" /> Salvo
      </span>
    )
  return (
    <span className="text-[11px]" style={{ color: tokens.dangerText }}>
      Erro ao salvar
    </span>
  )
}
