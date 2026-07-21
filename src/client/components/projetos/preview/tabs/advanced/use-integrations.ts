"use client"

/**
 * useIntegrations — client oRPC + TanStack Query para o Integration Builder
 * (Wave 1, T34). Dono dos dois `useQuery` (lista do projeto + catálogo de
 * templates) e dos seis `useMutation` do ciclo de vida da integração.
 *
 *   - QUERY  → `useQuery(orpc.builder.<action>.queryOptions({ input }))` →
 *              `{ data, isLoading, error, refetch }` (data = envelope { data }).
 *   - MUTATION → `useMutation(orpc.builder.<action>.mutationOptions())`;
 *              `mutateAsync(input)` devolve Promise do envelope. Cada wrapper
 *              aguarda o `mutateAsync` e SÓ ENTÃO `refetch()` da lista —
 *              assim a lista canônica reflete o novo status sem F5.
 *
 * Pós-cutover: os adapters defensivos (client gerado do Igniter + fallback
 * REST via fetchWithAuthRetry) foram aposentados — as actions são garantidas
 * pelo client tipado. Erro de API agora é REJEIÇÃO da Promise (ORPCError).
 */

import * as React from "react"

import { useMutation, useQuery } from "@tanstack/react-query"

import { orpc } from "@/orpc/client"

// ── View-models desembrulhados (o payload do envelope Igniter) ──────────────

/** Metadata não-secreta de um campo de credencial (+ flag "preenchido?"). */
export interface IntegrationCredentialFieldView {
  key: string
  label: string
  whereToGet: string
  placeholder: string | null
  /** Presente nas linhas da LISTA (nunca no catálogo de templates). */
  filled?: boolean
}

/** Uma integração na lista do projeto (credenciais MASCARADAS). */
export interface IntegrationListItem {
  id: string
  displayName: string
  status: string
  triggerDescription: string | null
  templateSlug: string | null
  lastTestAt: string | null
  lastTestStatus: string | null
  hasCredentials: boolean
  credentialFields: IntegrationCredentialFieldView[]
}

/** Um template ofertável do catálogo (sem segredos). */
export interface IntegrationTemplateItem {
  slug: string
  displayName: string
  description: string
  triggerDescription: string | null
  credentialFields: IntegrationCredentialFieldView[]
}

/** Resultado de um teste de validação (nunca segredos/payloads). */
export interface IntegrationTestResult {
  outcome: string
  diagnosis: string
  httpStatus?: number
  durationMs?: number
}

/** Corpo do `createIntegration` (uma origem é obrigatória, validada no server). */
export interface CreateIntegrationInput {
  projectId: string
  templateSlug?: string
  proposalFromState?: boolean
  displayName?: string
}

export interface UseIntegrations {
  /** Integrações do projeto; `[]` enquanto carrega ou em erro. */
  integrations: IntegrationListItem[]
  isLoading: boolean
  error: unknown
  refetch: () => void
  /** Catálogo de templates ofertáveis. */
  templates: IntegrationTemplateItem[]
  templatesLoading: boolean
  /** Cria draft + AgentTool inativo; repuxa a lista no sucesso. */
  createIntegration: (input: CreateIntegrationInput) => Promise<unknown>
  /** Grava valores de credencial (write-only); repuxa a lista no sucesso. */
  updateCredentials: (
    id: string,
    values: Record<string, string>,
  ) => Promise<unknown>
  /** Dispara o teste de validação; devolve o diagnóstico desembrulhado. */
  testIntegration: (id: string) => Promise<IntegrationTestResult | null>
  /** Transições de ciclo de vida; cada uma repuxa a lista no sucesso. */
  activate: (id: string) => Promise<unknown>
  pause: (id: string) => Promise<unknown>
  resume: (id: string) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
  /** Agregado de mutações em voo (qualquer uma pendente). */
  isMutating: boolean
}

// ── Desembrulho tolerante do envelope (plano | { data } | array) ────────────

function unwrap(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null
  if (Array.isArray(raw)) return unwrap(raw[0])
  if (typeof raw === "object" && "data" in raw) {
    return unwrap((raw as { data: unknown }).data)
  }
  return raw
}

/** Extrai uma propriedade de array do payload desembrulhado (defensivo). */
function unwrapArray<T>(raw: unknown, key: string): T[] {
  const payload = unwrap(raw)
  if (payload && typeof payload === "object" && key in payload) {
    const inner = (payload as Record<string, unknown>)[key]
    if (Array.isArray(inner)) return inner as T[]
  }
  return []
}

function asTestResult(raw: unknown): IntegrationTestResult | null {
  const payload = unwrap(raw)
  if (!payload || typeof payload !== "object") return null
  const r = payload as Record<string, unknown>
  if (typeof r.outcome !== "string" || typeof r.diagnosis !== "string") {
    return null
  }
  return {
    outcome: r.outcome,
    diagnosis: r.diagnosis,
    httpStatus: typeof r.httpStatus === "number" ? r.httpStatus : undefined,
    durationMs: typeof r.durationMs === "number" ? r.durationMs : undefined,
  }
}

export function useIntegrations(projectId: string): UseIntegrations {
  // ── Lista do projeto ──────────────────────────────────────────────────────
  const listQuery = useQuery(
    orpc.builder.listProjectIntegrations.queryOptions({ input: { projectId } }),
  )

  // ── Catálogo de templates (QUERY sem input) ───────────────────────────────
  const templatesQuery = useQuery(orpc.builder.listTemplates.queryOptions())

  // ── Mutations do ciclo de vida ────────────────────────────────────────────
  const createMutation = useMutation(orpc.builder.createIntegration.mutationOptions())
  const updateCredsMutation = useMutation(
    orpc.builder.updateIntegrationCredentials.mutationOptions(),
  )
  const testMutation = useMutation(orpc.builder.testIntegration.mutationOptions())
  const activateMutation = useMutation(orpc.builder.activateIntegration.mutationOptions())
  const pauseMutation = useMutation(orpc.builder.pauseIntegration.mutationOptions())
  const resumeMutation = useMutation(orpc.builder.resumeIntegration.mutationOptions())
  const removeMutation = useMutation(orpc.builder.removeIntegration.mutationOptions())

  // Identidade estável do `refetch` para os wrappers.
  const refetchRef = React.useRef(listQuery.refetch)
  React.useEffect(() => {
    refetchRef.current = listQuery.refetch
  }, [listQuery.refetch])

  const refetch = React.useCallback(() => {
    void refetchRef.current?.()
  }, [])

  const integrations = React.useMemo(
    () => unwrapArray<IntegrationListItem>(listQuery.data, "integrations"),
    [listQuery.data],
  )
  const templates = React.useMemo(
    () => unwrapArray<IntegrationTemplateItem>(templatesQuery.data, "templates"),
    [templatesQuery.data],
  )

  const createIntegration = React.useCallback(
    async (input: CreateIntegrationInput) => {
      const res = await createMutation.mutateAsync(input)
      refetch()
      return res
    },
    [createMutation, refetch],
  )

  const updateCredentials = React.useCallback(
    async (id: string, values: Record<string, string>) => {
      const res = await updateCredsMutation.mutateAsync({ id, values })
      refetch()
      return res
    },
    [updateCredsMutation, refetch],
  )

  const testIntegration = React.useCallback(
    async (id: string) => {
      const res = await testMutation.mutateAsync({ id })
      // O teste muda `lastTest*`/status (draft → validated) — repuxa a lista.
      refetch()
      return asTestResult(res)
    },
    [testMutation, refetch],
  )

  const activate = React.useCallback(
    async (id: string) => {
      const res = await activateMutation.mutateAsync({ id })
      refetch()
      return res
    },
    [activateMutation, refetch],
  )

  const pause = React.useCallback(
    async (id: string) => {
      const res = await pauseMutation.mutateAsync({ id })
      refetch()
      return res
    },
    [pauseMutation, refetch],
  )

  const resume = React.useCallback(
    async (id: string) => {
      const res = await resumeMutation.mutateAsync({ id })
      refetch()
      return res
    },
    [resumeMutation, refetch],
  )

  const remove = React.useCallback(
    async (id: string) => {
      const res = await removeMutation.mutateAsync({ id })
      refetch()
      return res
    },
    [removeMutation, refetch],
  )

  const isMutating =
    createMutation.isPending ||
    updateCredsMutation.isPending ||
    testMutation.isPending ||
    activateMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    removeMutation.isPending

  return {
    integrations,
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    refetch,
    templates,
    templatesLoading: templatesQuery.isLoading,
    createIntegration,
    updateCredentials,
    testIntegration,
    activate,
    pause,
    resume,
    remove,
    isMutating,
  }
}
