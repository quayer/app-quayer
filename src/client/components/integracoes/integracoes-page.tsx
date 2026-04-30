"use client"

import { useState, useEffect, useCallback } from "react"
import { Eye, EyeOff, Loader2, RefreshCw, Plus, Star, StarOff, Trash2, Pencil, ChevronUp, ChevronDown } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/client/components/ui/dialog"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { api } from "@/igniter.client"

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrgProvider {
  id: string
  name: string
  organizationId: string
  category: string
  provider: string
  isActive: boolean
  isPrimary: boolean
  priority: number
  builderProjectId: string | null
  credentials: Record<string, string>
  settings: Record<string, unknown> | null
  lastTestedAt: string | null
  lastTestStatus: string | null
  lastTestError: string | null
  costThisMonth: number
  createdAt: string
  updatedAt: string
}

interface ModelOption {
  id: string
  label: string
}

interface AiProviderMeta {
  id: string
  name: string
  description: string
  models: ModelOption[]
  defaultModel: string
  keyPlaceholder: string
}

// ─── Static catalog ───────────────────────────────────────────────────────────

const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Modelos Claude — motor padrão dos agentes Quayer",
    models: [
      { id: "claude-opus-4-7",            label: "Claude Opus 4.7 ★" },
      { id: "claude-sonnet-4-6",          label: "Claude Sonnet 4.6 ★" },
      { id: "claude-haiku-4-5-20251001",  label: "Claude Haiku 4.5" },
      { id: "claude-opus-4-6",            label: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    ],
    defaultModel: "claude-sonnet-4-6",
    keyPlaceholder: "sk-ant-api03-…",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-5.5 e família de modelos OpenAI",
    models: [
      { id: "gpt-5.5",      label: "GPT-5.5 ★" },
      { id: "gpt-5.5-pro",  label: "GPT-5.5 Pro" },
      { id: "gpt-5.4",      label: "GPT-5.4" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      { id: "gpt-4.1",      label: "GPT-4.1 (1M ctx)" },
      { id: "o3",           label: "o3 — raciocínio" },
    ],
    defaultModel: "gpt-5.5",
    keyPlaceholder: "sk-proj-…",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Acesso unificado a todos os modelos",
    models: [
      { id: "openrouter/auto",                     label: "Auto ★" },
      { id: "anthropic/claude-opus-4-7",           label: "Claude Opus 4.7" },
      { id: "anthropic/claude-sonnet-4-6",         label: "Claude Sonnet 4.6" },
      { id: "openai/gpt-5.5",                      label: "GPT-5.5" },
      { id: "google/gemini-2.5-pro-preview",       label: "Gemini 2.5 Pro" },
      { id: "deepseek/deepseek-r1",                label: "DeepSeek R1" },
    ],
    defaultModel: "openrouter/auto",
    keyPlaceholder: "sk-or-v1-…",
  },
]

// ─── Status helpers ───────────────────────────────────────────────────────────

type StatusColor = "gray" | "green" | "yellow" | "red"

function getStatus(record: OrgProvider): { label: string; color: StatusColor } {
  if (record.lastTestStatus === "success") return { label: "Configurado", color: "green" }
  if (record.lastTestStatus === "failed")  return { label: "Erro na chave", color: "red" }
  return { label: "Não testado", color: "yellow" }
}

const STATUS_DOT: Record<StatusColor, string> = {
  gray: "#6B7280", green: "#22C55E", yellow: "#EAB308", red: "#EF4444",
}

// ─── Key Row ─────────────────────────────────────────────────────────────────

interface KeyRowProps {
  record: OrgProvider
  meta: AiProviderMeta
  isTesting: boolean
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onDelete: () => void
  onTest: () => void
  onTogglePrimary: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}

function KeyRow({
  record, meta, isTesting, isFirst, isLast,
  onEdit, onDelete, onTest, onTogglePrimary, onMoveUp, onMoveDown,
  tokens,
}: KeyRowProps) {
  const status = getStatus(record)
  const modelLabel = (record.settings?.model as string | undefined)
    ? (meta.models.find(m => m.id === record.settings?.model)?.label ?? record.settings?.model as string)
    : "—"

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr 1fr 90px 80px 120px",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderBottom: `1px solid ${tokens.border}`,
        background: tokens.bgSurface,
      }}
    >
      {/* Priority reorder */}
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Aumentar prioridade"
          style={{
            background: "none", border: "none", cursor: isFirst ? "default" : "pointer",
            color: isFirst ? tokens.textTertiary : tokens.textSecondary, padding: 1, lineHeight: 1,
          }}
        >
          <ChevronUp size={12} />
        </button>
        <span style={{ color: tokens.textTertiary, fontSize: 10 }}>{record.priority}</span>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          title="Diminuir prioridade"
          style={{
            background: "none", border: "none", cursor: isLast ? "default" : "pointer",
            color: isLast ? tokens.textTertiary : tokens.textSecondary, padding: 1, lineHeight: 1,
          }}
        >
          <ChevronDown size={12} />
        </button>
      </div>

      {/* Name + key */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span style={{ color: tokens.textPrimary, fontSize: 13, fontWeight: 600 }}>{record.name}</span>
        <span style={{ color: tokens.textTertiary, fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {record.credentials.apiKey || "—"}
        </span>
      </div>

      {/* Model */}
      <span style={{ color: tokens.textSecondary, fontSize: 12, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {modelLabel}
      </span>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT[status.color], display: "inline-block", flexShrink: 0 }} />
        <span style={{ color: tokens.textSecondary, fontSize: 11 }}>{status.label}</span>
      </div>

      {/* Primary star */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onTogglePrimary}
          title={record.isPrimary ? "Primária — clique para remover" : "Tornar primária"}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: record.isPrimary ? "#EAB308" : tokens.textTertiary }}
        >
          {record.isPrimary ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 justify-end">
        <button
          type="button"
          onClick={onTest}
          disabled={isTesting}
          title="Testar conexão"
          style={{
            background: "none", border: "none", cursor: isTesting ? "not-allowed" : "pointer",
            color: tokens.textTertiary, padding: 4, opacity: isTesting ? 0.5 : 1,
          }}
        >
          {isTesting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
        <button
          type="button"
          onClick={onEdit}
          title="Editar"
          style={{ background: "none", border: "none", cursor: "pointer", color: tokens.textTertiary, padding: 4 }}
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Remover"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 4 }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface KeyModalProps {
  open: boolean
  onClose: () => void
  meta: AiProviderMeta
  existing?: OrgProvider
  onSaved: () => void
}

function KeyModal({ open, onClose, meta, existing, onSaved }: KeyModalProps) {
  const { tokens } = useAppTokens()

  const [keyName, setKeyName]   = useState("")
  const [apiKey, setApiKey]     = useState("")
  const [model, setModel]       = useState(meta.defaultModel)
  const [showKey, setShowKey]   = useState(false)
  const [isPrimary, setIsPrimary] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open) {
      setKeyName(existing?.name ?? "")
      setApiKey("")
      setModel((existing?.settings?.model as string | undefined) ?? meta.defaultModel)
      setShowKey(false)
      setConfirmDelete(false)
      setError(null)
      setSaving(false)
      setDeleting(false)
      setIsPrimary(existing?.isPrimary ?? false)
    }
  }, [open, existing, meta.defaultModel])

  const handleSave = async () => {
    setError(null)
    if (!existing && !apiKey.trim()) {
      setError("Informe a API Key")
      return
    }
    setSaving(true)
    try {
      let savedId: string | undefined

      if (!existing) {
        const result = await (api["organization-providers"].create as any).mutate({
          body: {
            name: keyName.trim() || undefined,
            category: "AI",
            provider: meta.id,
            credentials: { apiKey: apiKey.trim() },
            settings: { model },
            isPrimary,
          },
        })
        savedId = result?.data?.id
      } else {
        await (api["organization-providers"].update as any).mutate({
          params: { id: existing.id },
          body: {
            name: keyName.trim() || undefined,
            ...(apiKey.trim() ? { credentials: { apiKey: apiKey.trim() } } : {}),
            settings: { model },
            isPrimary,
          },
        })
        savedId = existing.id
      }

      if (savedId) {
        await (api["organization-providers"].test as any).mutate({ params: { id: savedId } })
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    if (!existing) return
    setDeleting(true)
    try {
      await (api["organization-providers"].delete as any).mutate({ params: { id: existing.id } })
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao remover")
    } finally {
      setDeleting(false)
    }
  }

  const isPending = saving || deleting

  const inputStyle = {
    background: tokens.bgElevated,
    border: `1px solid ${tokens.border}`,
    color: tokens.textPrimary,
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 14,
    width: "100%",
    outline: "none",
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent style={{ background: tokens.bgSurface, border: `1px solid ${tokens.border}`, color: tokens.textPrimary, maxWidth: 480 }}>
        <DialogHeader>
          <DialogTitle style={{ color: tokens.textPrimary, fontSize: 16, fontWeight: 600 }}>
            {existing ? `Editar chave — ${meta.name}` : `Adicionar chave — ${meta.name}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: 500 }}>Nome da chave</label>
            <input
              type="text"
              placeholder="Ex: Chave Prod, Chave Dev…"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <label style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: 500 }}>API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                placeholder={existing ? "Deixe vazio para manter a chave atual" : meta.keyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{ ...inputStyle, paddingRight: 40 }}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: tokens.textTertiary, padding: 0, lineHeight: 1,
                }}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Model */}
          <div className="flex flex-col gap-1.5">
            <label style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: 500 }}>Modelo padrão</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {meta.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          {/* Primary toggle */}
          <label className="flex items-center gap-2.5" style={{ cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: tokens.brand }}
            />
            <span style={{ color: tokens.textSecondary, fontSize: 13 }}>
              Usar como chave primária (prioridade máxima)
            </span>
          </label>

          {error && <p style={{ color: "#EF4444", fontSize: 13, margin: 0 }}>{error}</p>}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          {existing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              style={{
                background: "none", border: "none", cursor: isPending ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 500, color: confirmDelete ? "#EF4444" : tokens.textTertiary,
                padding: "6px 0", textAlign: "left", opacity: isPending ? 0.5 : 1,
              }}
            >
              {deleting ? "Removendo…" : confirmDelete ? "Confirmar remoção" : "Remover chave"}
            </button>
          )}

          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              style={{
                background: tokens.bgElevated, border: `1px solid ${tokens.border}`,
                color: tokens.textSecondary, borderRadius: 8, padding: "7px 14px",
                fontSize: 13, fontWeight: 500, cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.5 : 1,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              style={{
                background: tokens.brand, border: "none", color: tokens.textInverse,
                borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 600,
                cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.7 : 1,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Provider Section ────────────────────────────────────────────────────────

interface ProviderSectionProps {
  meta: AiProviderMeta
  records: OrgProvider[]
  testingId: string | null
  onAdd: () => void
  onEdit: (r: OrgProvider) => void
  onTest: (r: OrgProvider) => void
  onDelete: (r: OrgProvider) => void
  onTogglePrimary: (r: OrgProvider) => void
  onMoveUp: (r: OrgProvider) => void
  onMoveDown: (r: OrgProvider) => void
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}

function ProviderSection({
  meta, records, testingId, onAdd, onEdit, onTest, onDelete, onTogglePrimary, onMoveUp, onMoveDown, tokens,
}: ProviderSectionProps) {
  const hasKeys = records.length > 0

  return (
    <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, overflow: "hidden", boxShadow: tokens.shadow }}>
      {/* Section header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: tokens.bgSurface, borderBottom: hasKeys ? `1px solid ${tokens.border}` : undefined }}
      >
        <div className="flex flex-col gap-0.5">
          <span style={{ color: tokens.textPrimary, fontWeight: 600, fontSize: 15 }}>{meta.name}</span>
          <span style={{ color: tokens.textTertiary, fontSize: 12 }}>{meta.description}</span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: tokens.bgElevated, border: `1px solid ${tokens.border}`,
            color: tokens.textSecondary, borderRadius: 8, padding: "5px 12px",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}
        >
          <Plus size={12} />
          Adicionar chave
        </button>
      </div>

      {/* Column headers (only when there are keys) */}
      {hasKeys && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "28px 1fr 1fr 90px 80px 120px",
            gap: 8,
            padding: "6px 14px",
            background: tokens.bgElevated,
            borderBottom: `1px solid ${tokens.border}`,
          }}
        >
          {["Pri.", "Nome / Chave", "Modelo", "Status", "Primária", ""].map((h, i) => (
            <span key={i} style={{ color: tokens.textTertiary, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Key rows */}
      {records.map((r, idx) => (
        <KeyRow
          key={r.id}
          record={r}
          meta={meta}
          isTesting={testingId === r.id}
          isFirst={idx === 0}
          isLast={idx === records.length - 1}
          onEdit={() => onEdit(r)}
          onDelete={() => onDelete(r)}
          onTest={() => onTest(r)}
          onTogglePrimary={() => onTogglePrimary(r)}
          onMoveUp={() => onMoveUp(r)}
          onMoveDown={() => onMoveDown(r)}
          tokens={tokens}
        />
      ))}

      {/* Empty state */}
      {!hasKeys && (
        <div
          className="flex items-center justify-center py-8"
          style={{ background: tokens.bgBase, color: tokens.textTertiary, fontSize: 13 }}
        >
          Nenhuma chave configurada — usando chave da plataforma Quayer
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function IntegracoesPagina() {
  const { tokens } = useAppTokens()

  const [providers, setProviders] = useState<OrgProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ meta: AiProviderMeta; existing?: OrgProvider } | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    try {
      const result = await (api["organization-providers"].list as any).query({
        query: { category: "AI" },
      })
      const data = result?.data?.data ?? result?.data ?? []
      setProviders(Array.isArray(data) ? data : [])
    } catch {
      setProviders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProviders() }, [loadProviders])

  const recordsByProvider: Record<string, OrgProvider[]> = {}
  for (const p of providers) {
    if (!recordsByProvider[p.provider]) recordsByProvider[p.provider] = []
    recordsByProvider[p.provider].push(p)
  }
  // Keep sorted by priority
  for (const arr of Object.values(recordsByProvider)) {
    arr.sort((a, b) => a.priority - b.priority)
  }

  const handleTest = async (record: OrgProvider) => {
    setTestingId(record.id)
    try {
      await (api["organization-providers"].test as any).mutate({ params: { id: record.id } })
    } catch { /* status shown after reload */ } finally {
      setTestingId(null)
      loadProviders()
    }
  }

  const handleDelete = async (record: OrgProvider) => {
    try {
      await (api["organization-providers"].delete as any).mutate({ params: { id: record.id } })
      loadProviders()
    } catch { /* ignore */ }
  }

  const handleTogglePrimary = async (record: OrgProvider) => {
    try {
      await (api["organization-providers"].update as any).mutate({
        params: { id: record.id },
        body: { isPrimary: !record.isPrimary },
      })
      loadProviders()
    } catch { /* ignore */ }
  }

  const handleMove = async (record: OrgProvider, direction: "up" | "down") => {
    const arr = (recordsByProvider[record.provider] ?? [])
    const idx = arr.findIndex(r => r.id === record.id)
    const swap = direction === "up" ? arr[idx - 1] : arr[idx + 1]
    if (!swap) return

    await Promise.all([
      (api["organization-providers"].update as any).mutate({
        params: { id: record.id },
        body: { priority: swap.priority },
      }),
      (api["organization-providers"].update as any).mutate({
        params: { id: swap.id },
        body: { priority: record.priority },
      }),
    ]).catch(() => {})
    loadProviders()
  }

  return (
    <div
      className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-10"
      style={{ background: tokens.bgBase, minHeight: "100%" }}
    >
      <div className="mb-10">
        <h1 style={{ color: tokens.textPrimary, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, margin: 0 }}>
          Integrações
        </h1>
        <p style={{ color: tokens.textTertiary, fontSize: 14, marginTop: 6 }}>
          Configure credenciais de IA da organização. Você pode adicionar múltiplas chaves por provedor — a de menor prioridade é usada primeiro. Projetos específicos podem ter chaves próprias na aba <strong style={{ color: tokens.textSecondary }}>Credenciais</strong> de cada projeto.
        </p>
      </div>

      <section>
        <div className="mb-5">
          <h2 style={{ color: tokens.textPrimary, fontSize: 16, fontWeight: 600, margin: 0 }}>Provedores de IA</h2>
          <p style={{ color: tokens.textTertiary, fontSize: 13, marginTop: 4 }}>
            Menor prioridade = primeira a ser usada. Chave marcada com ★ é a primária.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2" style={{ color: tokens.textTertiary, fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" />
            Carregando…
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {AI_PROVIDERS.map(meta => (
              <ProviderSection
                key={meta.id}
                meta={meta}
                records={recordsByProvider[meta.id] ?? []}
                testingId={testingId}
                onAdd={() => setModal({ meta })}
                onEdit={(r) => setModal({ meta, existing: r })}
                onTest={handleTest}
                onDelete={handleDelete}
                onTogglePrimary={handleTogglePrimary}
                onMoveUp={(r) => handleMove(r, "up")}
                onMoveDown={(r) => handleMove(r, "down")}
                tokens={tokens}
              />
            ))}
          </div>
        )}
      </section>

      {modal && (
        <KeyModal
          open
          meta={modal.meta}
          existing={modal.existing}
          onClose={() => setModal(null)}
          onSaved={() => { loadProviders(); setModal(null) }}
        />
      )}
    </div>
  )
}
