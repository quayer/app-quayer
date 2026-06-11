"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert"
import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import { Skeleton } from "@/client/components/ui/skeleton"
import { ApiKeyModal } from "@/client/components/integracoes/api-key-modal"
import {
  PROVIDERS,
  type ProviderKey,
  type ProviderRecord,
} from "@/client/components/integracoes/providers-catalog"
import { useProviders } from "@/client/components/integracoes/use-providers"
import { getCsrfHeaders } from "@/client/hooks/use-csrf-token"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"
import { AgentConfigSection } from "./agent-config-section"

export interface CredentialsTabProps {
  project: WorkspaceProject
}

function normalizeProvider(provider: string | null | undefined): ProviderKey | null {
  const value = provider?.toLowerCase()
  if (value === "openai" || value === "anthropic" || value === "google") {
    return value
  }
  return null
}

function providerRecordLabel(record: ProviderRecord): string {
  if (!record.isConfigured) return "Sem chave"
  return record.lastFour ? `••••••${record.lastFour}` : "Configurado"
}

export function CredentialsTab({ project }: CredentialsTabProps) {
  const { tokens } = useAppTokens()
  const { groups, records, loading, backendMissing, error, createKey, refetch } =
    useProviders()
  const [editingProvider, setEditingProvider] = useState<ProviderKey | null>(null)

  /**
   * Salva a chave do modal: quando o provider JÁ tem chave, faz um UPDATE real
   * da chave exibida no card (a primária) — preservando o rótulo digitado e
   * sem criar uma credencial duplicada a cada "Atualizar chave". Sem chave
   * ainda, cria uma nova rotulada.
   */
  const handleSaveKey = useCallback(
    async (provider: ProviderKey, apiKey: string, name: string) => {
      const group = groups.find((item) => item.provider === provider)
      const primary =
        group?.keys.find((key) => key.isPrimary) ?? group?.keys[0] ?? null

      if (!primary) {
        await createKey(provider, apiKey, name)
        return
      }

      const res = await fetch(`/api/v1/builder/credential/keys/${primary.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ apiKey, name }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string
          error?: string
        }
        throw new Error(body.message || body.error || `Erro ${res.status}`)
      }
      await refetch()
    },
    [groups, createKey, refetch],
  )

  const activeProvider = normalizeProvider(project.aiAgent?.provider)
  const activeMeta = activeProvider
    ? PROVIDERS.find((provider) => provider.key === activeProvider) ?? null
    : null
  const activeRecord = activeProvider
    ? records.find((record) => record.provider === activeProvider) ?? null
    : null

  const editingMeta = editingProvider
    ? PROVIDERS.find((provider) => provider.key === editingProvider) ?? null
    : null
  const editingRecord = editingProvider
    ? records.find((record) => record.provider === editingProvider) ?? null
    : null

  // Conta apenas chaves LLM — voz/STT não são "credenciais do agente".
  const configuredCount = useMemo(
    () =>
      records.filter(
        (record) =>
          record.isConfigured &&
          PROVIDERS.find((meta) => meta.key === record.provider)?.category ===
            "llm",
      ).length,
    [records],
  )

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 flex flex-col gap-5 py-2 duration-500">
      {/* Config do agente: modelo (somente leitura) + chave BYOK em uso. */}
      <AgentConfigSection
        projectId={project.id}
        provider={activeProvider}
        currentModelId={project.aiAgent?.model ?? null}
        tokens={tokens}
      />

      <section
        className="rounded-xl border p-4"
        style={{
          borderColor: tokens.divider,
          backgroundColor: tokens.bgSurface,
        }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{
                backgroundColor: tokens.brandSubtle,
                color: tokens.brand,
              }}
              aria-hidden="true"
            >
              <KeyRound className="h-4 w-4" />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className="text-sm font-semibold"
                  style={{ color: tokens.textPrimary }}
                >
                  Credenciais do agente
                </h3>
                <Badge
                  className="border-transparent"
                  style={{
                    backgroundColor: tokens.brandSubtle,
                    color: tokens.brandText,
                  }}
                >
                  {configuredCount} configurada{configuredCount === 1 ? "" : "s"}
                </Badge>
              </div>

              <p
                className="max-w-2xl text-[13px] leading-relaxed"
                style={{ color: tokens.textSecondary }}
              >
                Este agente usa o provedor configurado no modelo dele. Quando há
                uma chave BYOK da organização para esse provedor, ela tem
                prioridade sobre a chave global da plataforma.
              </p>

              <div
                className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
                style={{ color: tokens.textTertiary }}
              >
                <span>Agente: {project.aiAgent?.name ?? project.name}</span>
                <span>Modelo: {project.aiAgent?.model ?? "não definido"}</span>
                <span>
                  Provedor: {activeMeta?.name ?? project.aiAgent?.provider ?? "não definido"}
                </span>
              </div>
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/integracoes">
              Gerenciar integrações
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      {error && !backendMissing && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar credenciais</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {backendMissing && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Backend de integrações indisponível</AlertTitle>
          <AlertDescription>
            A lista de credenciais não pôde ser carregada. O agente continuará
            usando as chaves globais configuradas no ambiente.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.textTertiary }}
          >
            Provedores disponíveis
          </h4>
          {loading && (
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: tokens.textTertiary }}
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Carregando
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {PROVIDERS.map((provider) => (
              <Skeleton key={provider.key} className="h-[96px] rounded-xl" />
            ))}
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Credenciais disponíveis">
            {PROVIDERS.map((meta) => {
              const record =
                records.find((item) => item.provider === meta.key) ?? null
              const isActive = activeProvider === meta.key
              const isConfigured = Boolean(record?.isConfigured)

              return (
                <li key={meta.key}>
                  <article
                    className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                    style={{
                      backgroundColor: tokens.bgSurface,
                      borderColor: isActive ? tokens.brand : tokens.border,
                    }}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                        style={{
                          backgroundColor: tokens.bgElevated,
                          color: tokens.textSecondary,
                        }}
                        aria-hidden="true"
                      >
                        {meta.letter}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5
                            className="text-sm font-medium"
                            style={{ color: tokens.textPrimary }}
                          >
                            {meta.name}
                          </h5>

                          {isActive && (
                            <Badge
                              className="border-transparent"
                              style={{
                                backgroundColor: tokens.brandSubtle,
                                color: tokens.brandText,
                              }}
                            >
                              Em uso
                            </Badge>
                          )}

                          {isConfigured ? (
                            <Badge variant="secondary">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Configurado
                            </Badge>
                          ) : (
                            <Badge variant="outline">Sem chave</Badge>
                          )}
                        </div>

                        <p className="text-xs" style={{ color: tokens.textTertiary }}>
                          {meta.description}
                        </p>

                        <p
                          className="font-mono text-xs"
                          style={{ color: tokens.textSecondary }}
                        >
                          {record ? providerRecordLabel(record) : "Sem chave"}
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={isConfigured ? "outline" : "default"}
                      onClick={() => setEditingProvider(meta.key)}
                      disabled={backendMissing}
                    >
                      {isConfigured ? "Atualizar chave" : "Conectar chave"}
                    </Button>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {activeProvider && !activeRecord?.isConfigured && !loading && !backendMissing && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Este agente usa a chave global</AlertTitle>
          <AlertDescription>
            O provedor do agente é {activeMeta?.name ?? activeProvider}, mas não
            há chave própria configurada para a organização. Conecte uma chave
            acima para este agente passar a usar BYOK.
          </AlertDescription>
        </Alert>
      )}

      <ApiKeyModal
        meta={editingMeta}
        currentRecord={editingRecord}
        open={editingProvider !== null}
        onClose={() => setEditingProvider(null)}
        onSave={handleSaveKey}
      />
    </div>
  )
}
