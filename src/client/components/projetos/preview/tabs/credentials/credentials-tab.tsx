"use client"

/**
 * Credentials Tab — per-project AI key overrides.
 *
 * Shows which key the project is currently using (inherited from org or own),
 * and lets the user add/remove project-specific keys that take priority over
 * the org-level keys configured in /integracoes.
 */

import { useState, useEffect, useCallback } from "react"
import { Eye, EyeOff, Loader2, Plus, Trash2, RefreshCw, Building2, FolderKey } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/client/components/ui/dialog"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { api } from "@/igniter.client"
import type { WorkspaceProject } from "@/client/components/projetos/types"

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgProvider {
  id: string
  name: string
  provider: string
  category: string
  isPrimary: boolean
  priority: number
  builderProjectId: string | null
  credentials: Record<string, string>
  settings: Record<string, unknown> | null
  lastTestStatus: string | null
  lastTestError: string | null
}

interface ProviderMeta {
  id: string
  name: string
  models: Array<{ id: string; label: string }>
  defaultModel: string
  keyPlaceholder: string
}

const AI_PROVIDERS: ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      { id: "claude-opus-4-7",   label: "Claude Opus 4.7 ★" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 ★" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    ],
    defaultModel: "claude-sonnet-4-6",
    keyPlaceholder: "sk-ant-api03-…",
  },
  {
    id: "openai",
    name: "OpenAI",
    models: [
      { id: "gpt-5.5",      label: "GPT-5.5 ★" },
      { id: "gpt-5.4",      label: "GPT-5.4" },
      { id: "gpt-4.1",      label: "GPT-4.1" },
    ],
    defaultModel: "gpt-5.5",
    keyPlaceholder: "sk-proj-…",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    models: [
      { id: "openrouter/auto",              label: "Auto ★" },
      { id: "anthropic/claude-sonnet-4-6",  label: "Claude Sonnet 4.6" },
      { id: "openai/gpt-5.5",               label: "GPT-5.5" },
    ],
    defaultModel: "openrouter/auto",
    keyPlaceholder: "sk-or-v1-…",
  },
]

// ─── Add Key Modal ────────────────────────────────────────────────────────────

interface AddKeyModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  onSaved: () => void
}

function AddKeyModal({ open, onClose, projectId, onSaved }: AddKeyModalProps) {
  const { tokens } = useAppTokens()

  const [keyName, setKeyName]   = useState("")
  const [provider, setProvider] = useState("anthropic")
  const [apiKey, setApiKey]     = useState("")
  const [model, setModel]       = useState("claude-sonnet-4-6")
  const [showKey, setShowKey]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)

  const selectedMeta = AI_PROVIDERS.find(p => p.id === provider) ?? AI_PROVIDERS[0]!

  useEffect(() => {
    if (open) {
      setKeyName("")
      setApiKey("")
      setProvider("anthropic")
      setModel("claude-sonnet-4-6")
      setShowKey(false)
      setError(null)
      setSaving(false)
    }
  }, [open])

  // Update model default when provider changes
  useEffect(() => {
    const meta = AI_PROVIDERS.find(p => p.id === provider)
    if (meta) setModel(meta.defaultModel)
  }, [provider])

  const handleSave = async () => {
    setError(null)
    if (!apiKey.trim()) { setError("Informe a API Key"); return }
    setSaving(true)
    try {
      const result = await (api["organization-providers"].create as any).mutate({
        body: {
          name: keyName.trim() || undefined,
          category: "AI",
          provider,
          credentials: { apiKey: apiKey.trim() },
          settings: { model },
          isPrimary: true,
          builderProjectId: projectId,
        },
      })
      const savedId = result?.data?.id
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
            Adicionar chave para este projeto
          </DialogTitle>
        </DialogHeader>

        <p style={{ color: tokens.textTertiary, fontSize: 12, margin: 0, marginBottom: 4 }}>
          Esta chave tem prioridade sobre a da organização — só afeta este projeto.
        </p>

        <div className="flex flex-col gap-4 py-2">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: 500 }}>Nome (opcional)</label>
            <input
              type="text"
              placeholder="Ex: Chave Cliente, Chave Prod…"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Provider */}
          <div className="flex flex-col gap-1.5">
            <label style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: 500 }}>Provedor</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {AI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <label style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: 500 }}>API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                placeholder={selectedMeta.keyPlaceholder}
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
              {selectedMeta.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          {error && <p style={{ color: "#EF4444", fontSize: 13, margin: 0 }}>{error}</p>}
        </div>

        <DialogFooter className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: tokens.bgElevated, border: `1px solid ${tokens.border}`,
              color: tokens.textSecondary, borderRadius: 8, padding: "7px 14px",
              fontSize: 13, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              background: tokens.brand, border: "none", color: tokens.textInverse,
              borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Credentials Tab ──────────────────────────────────────────────────────────

interface CredentialsTabProps {
  project: WorkspaceProject
}

export function CredentialsTab({ project }: CredentialsTabProps) {
  const { tokens } = useAppTokens()

  const [projectKeys, setProjectKeys] = useState<OrgProvider[]>([])
  const [orgKeys, setOrgKeys]         = useState<OrgProvider[]>([])
  const [loading, setLoading]         = useState(true)
  const [addOpen, setAddOpen]         = useState(false)
  const [testingId, setTestingId]     = useState<string | null>(null)

  const loadKeys = useCallback(async () => {
    setLoading(true)
    try {
      const [projectRes, orgRes] = await Promise.all([
        (api["organization-providers"].list as any).query({
          query: { category: "AI", builderProjectId: project.id },
        }),
        (api["organization-providers"].list as any).query({
          query: { category: "AI" },
        }),
      ])
      setProjectKeys(Array.isArray(projectRes?.data?.data) ? projectRes.data.data : [])
      setOrgKeys(Array.isArray(orgRes?.data?.data) ? orgRes.data.data : [])
    } catch {
      setProjectKeys([])
      setOrgKeys([])
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => { loadKeys() }, [loadKeys])

  const handleDelete = async (id: string) => {
    await (api["organization-providers"].delete as any).mutate({ params: { id } }).catch(() => {})
    loadKeys()
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    await (api["organization-providers"].test as any).mutate({ params: { id } }).catch(() => {})
    setTestingId(null)
    loadKeys()
  }

  const providerLabel = (r: OrgProvider) => {
    return AI_PROVIDERS.find(p => p.id === r.provider)?.name ?? r.provider
  }

  const modelLabel = (r: OrgProvider) => {
    const meta = AI_PROVIDERS.find(p => p.id === r.provider)
    const m = r.settings?.model as string | undefined
    return m ? (meta?.models.find(x => x.id === m)?.label ?? m) : "—"
  }

  const statusColor = (r: OrgProvider) =>
    r.lastTestStatus === "success" ? "#22C55E" : r.lastTestStatus === "failed" ? "#EF4444" : "#EAB308"

  const card = {
    background: tokens.bgSurface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 10,
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      {/* Header */}
      <div>
        <h3 style={{ color: tokens.textPrimary, fontSize: 15, fontWeight: 600, margin: 0 }}>
          Credenciais do projeto
        </h3>
        <p style={{ color: tokens.textTertiary, fontSize: 13, marginTop: 4 }}>
          Chaves específicas deste projeto têm prioridade sobre as da organização. Útil para projetos de clientes com suas próprias APIs.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2" style={{ color: tokens.textTertiary, fontSize: 13 }}>
          <Loader2 size={13} className="animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {/* Project-level keys */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FolderKey size={14} style={{ color: tokens.brand }} />
                <span style={{ color: tokens.textPrimary, fontSize: 13, fontWeight: 600 }}>
                  Chaves deste projeto
                </span>
                {projectKeys.length > 0 && (
                  <span style={{
                    background: tokens.brand + "22", color: tokens.brand,
                    fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "1px 7px",
                  }}>
                    {projectKeys.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: tokens.brand, border: "none",
                  color: tokens.textInverse, borderRadius: 8, padding: "5px 12px",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                <Plus size={12} /> Adicionar chave
              </button>
            </div>

            {projectKeys.length === 0 ? (
              <div
                style={{
                  ...card,
                  background: tokens.bgBase,
                  border: `1px dashed ${tokens.border}`,
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 6,
                  padding: "16px",
                }}
              >
                <span style={{ color: tokens.textTertiary, fontSize: 13 }}>
                  Nenhuma chave específica — usando a chave da organização abaixo.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {projectKeys.map(r => (
                  <div key={r.id} style={card}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(r), flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{ color: tokens.textPrimary, fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                        <span style={{ color: tokens.textTertiary, fontSize: 11, background: tokens.bgElevated, border: `1px solid ${tokens.border}`, borderRadius: 4, padding: "1px 6px" }}>
                          {providerLabel(r)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-0.5">
                        <span style={{ color: tokens.textTertiary, fontSize: 11, fontFamily: "monospace" }}>
                          {r.credentials.apiKey || "—"}
                        </span>
                        <span style={{ color: tokens.textTertiary, fontSize: 11 }}>{modelLabel(r)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleTest(r.id)}
                        disabled={testingId === r.id}
                        title="Testar"
                        style={{ background: "none", border: "none", cursor: "pointer", color: tokens.textTertiary, padding: 4 }}
                      >
                        {testingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        title="Remover"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 4 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Org-level fallback (read-only view) */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={14} style={{ color: tokens.textTertiary }} />
              <span style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: 600 }}>
                Chaves da organização (fallback)
              </span>
            </div>

            {orgKeys.length === 0 ? (
              <div style={{ ...card, background: tokens.bgBase, border: `1px dashed ${tokens.border}`, padding: "12px 16px" }}>
                <span style={{ color: tokens.textTertiary, fontSize: 13 }}>
                  Nenhuma chave de organização — usando a chave da plataforma Quayer.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {orgKeys.map(r => (
                  <div
                    key={r.id}
                    style={{
                      ...card,
                      opacity: projectKeys.length > 0 ? 0.55 : 1,
                      position: "relative",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(r), flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                        <span style={{ color: tokens.textTertiary, fontSize: 11, background: tokens.bgElevated, border: `1px solid ${tokens.border}`, borderRadius: 4, padding: "1px 6px" }}>
                          {providerLabel(r)}
                        </span>
                        {r.isPrimary && (
                          <span style={{ color: "#EAB308", fontSize: 10, fontWeight: 600 }}>★ Primária</span>
                        )}
                      </div>
                      <span style={{ color: tokens.textTertiary, fontSize: 11, fontFamily: "monospace" }}>
                        {r.credentials.apiKey || "—"}
                      </span>
                    </div>
                    {projectKeys.length > 0 && (
                      <span style={{ fontSize: 10, color: tokens.textTertiary, background: tokens.bgElevated, border: `1px solid ${tokens.border}`, borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>
                        sobrescrita
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p style={{ color: tokens.textTertiary, fontSize: 11, marginTop: 8 }}>
              Para gerenciar chaves da organização acesse{" "}
              <a href="/integracoes" style={{ color: tokens.brand, textDecoration: "none" }}>Integrações</a>.
            </p>
          </section>
        </>
      )}

      <AddKeyModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={project.id}
        onSaved={loadKeys}
      />
    </div>
  )
}
