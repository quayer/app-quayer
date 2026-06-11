"use client"

/**
 * useIntegrations — React Query + Igniter client wrapper para o Integration
 * Builder (Wave 1, T34). Dono dos dois `useQuery` (lista do projeto + catálogo
 * de templates) e dos seis `useMutation` do ciclo de vida da integração.
 *
 * Espelha o idioma do repo (ex.: `use-project-readiness.ts` para o
 * `useQuery`/refetch e `media-grid.tsx` para o `useMutation` com `mutate({
 * params, body })` retornando Promise de `{ data, error }`):
 *
 *   - QUERY  → `api.builder.<action>.useQuery({ query | params })` →
 *              `{ data, isLoading, error, refetch }`.
 *   - MUTATION → `api.builder.<action>.useMutation()` → `{ mutate }`, onde
 *              `mutate({ params, body })` devolve Promise da resposta. Cada
 *              wrapper de mutação aguarda o `mutate` e SÓ ENTÃO `refetch()` da
 *              lista — assim a lista canônica reflete o novo status sem F5.
 *
 * Wrapper FINO e tipado: zero lógica de negócio, zero `any`. Os tipos de
 * `api.builder.*` fluem automaticamente do controller (que já espalha
 * `integrationsRoutes`) — sem codegen.
 */

import * as React from "react"

import { api } from "@/igniter.client"
import { fetchWithAuthRetry } from "@/lib/auth/client-refresh"

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

// ── Adapters: client gerado quando existe, REST nativo quando não existe ─────

interface QueryResult {
  data: unknown
  isLoading?: boolean
  error?: unknown
  refetch?: () => unknown
}

interface GeneratedQuery {
  useQuery: (opts?: unknown) => QueryResult
}

interface MutationResult {
  mutate: (args?: unknown) => Promise<unknown>
  isLoading?: boolean
}

interface GeneratedMutation {
  useMutation: () => MutationResult
}

type MutationArgs = {
  params?: { id?: string }
  body?: unknown
}

function getBuilderQuery(name: string, fallback: GeneratedQuery): GeneratedQuery {
  const candidate = (api.builder as Record<string, unknown>)[name]
  if (
    candidate &&
    typeof (candidate as { useQuery?: unknown }).useQuery === "function"
  ) {
    return candidate as GeneratedQuery
  }
  return fallback
}

function getBuilderMutation(
  name: string,
  fallback: GeneratedMutation,
): GeneratedMutation {
  const candidate = (api.builder as Record<string, unknown>)[name]
  if (
    candidate &&
    typeof (candidate as { useMutation?: unknown }).useMutation === "function"
  ) {
    return candidate as GeneratedMutation
  }
  return fallback
}

function useNativeJsonQuery(url: string | null): QueryResult {
  const mounted = React.useRef(false)
  const [state, setState] = React.useState<{
    data: unknown
    isLoading: boolean
    error: unknown
  }>({ data: undefined, isLoading: Boolean(url), error: null })

  const refetch = React.useCallback(async () => {
    if (!url) {
      setState({ data: undefined, isLoading: false, error: null })
      return
    }
    setState((cur) => ({ ...cur, isLoading: cur.data == null, error: null }))
    try {
      const res = await fetchWithAuthRetry(
        url,
        { method: "GET", headers: { Accept: "application/json" } },
        { notifyOnAuthFailure: true },
      )
      if (!res.ok) throw new Error(`query ${res.status}`)
      const data = await res.json()
      if (mounted.current) setState({ data, isLoading: false, error: null })
    } catch (error) {
      if (mounted.current) setState((cur) => ({ ...cur, isLoading: false, error }))
    }
  }, [url])

  React.useEffect(() => {
    mounted.current = true
    void refetch()
    return () => {
      mounted.current = false
    }
  }, [refetch])

  return {
    data: state.data,
    isLoading: state.isLoading,
    error: state.error,
    refetch,
  }
}

function createNativeMutation(
  buildRequest: (args: MutationArgs) => { method: string; url: string; body?: unknown },
): GeneratedMutation {
  return {
    useMutation: () => {
      const [isLoading, setIsLoading] = React.useState(false)
      const mutate = React.useCallback(
        async (rawArgs?: unknown) => {
          const args = (rawArgs ?? {}) as MutationArgs
          const request = buildRequest(args)
          setIsLoading(true)
          try {
            const hasBody = request.body !== undefined
            const res = await fetchWithAuthRetry(
              request.url,
              {
                method: request.method,
                headers: {
                  Accept: "application/json",
                  ...(hasBody ? { "Content-Type": "application/json" } : {}),
                },
                body: hasBody ? JSON.stringify(request.body) : undefined,
              },
              { notifyOnAuthFailure: true },
            )
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(`mutation ${res.status}`)
            return data
          } finally {
            setIsLoading(false)
          }
        },
        [],
      )
      return { mutate, isLoading }
    },
  }
}

function requiredId(args: MutationArgs): string {
  const id = args.params?.id
  if (!id) throw new Error("integration id obrigatório")
  return encodeURIComponent(id)
}

const LIST_PROJECT_INTEGRATIONS_QUERY = getBuilderQuery("listProjectIntegrations", {
  useQuery: (opts?: unknown) => {
    const query = (opts as { query?: { projectId?: unknown } } | undefined)
      ?.query
    const projectId =
      typeof query?.projectId === "string" ? query.projectId : ""
    const url = projectId
      ? `/api/v1/builder/integrations?projectId=${encodeURIComponent(projectId)}`
      : null
    return useNativeJsonQuery(url)
  },
})

const LIST_TEMPLATES_QUERY = getBuilderQuery("listTemplates", {
  useQuery: () => useNativeJsonQuery("/api/v1/builder/integrations/templates"),
})

const CREATE_INTEGRATION_MUTATION = getBuilderMutation(
  "createIntegration",
  createNativeMutation((args) => ({
    method: "POST",
    url: "/api/v1/builder/integrations",
    body: args.body,
  })),
)

const UPDATE_CREDENTIALS_MUTATION = getBuilderMutation(
  "updateIntegrationCredentials",
  createNativeMutation((args) => ({
    method: "PATCH",
    url: `/api/v1/builder/integrations/${requiredId(args)}/credentials`,
    body: args.body,
  })),
)

const TEST_INTEGRATION_MUTATION = getBuilderMutation(
  "testIntegration",
  createNativeMutation((args) => ({
    method: "POST",
    url: `/api/v1/builder/integrations/${requiredId(args)}/test`,
  })),
)

const ACTIVATE_INTEGRATION_MUTATION = getBuilderMutation(
  "activateIntegration",
  createNativeMutation((args) => ({
    method: "POST",
    url: `/api/v1/builder/integrations/${requiredId(args)}/activate`,
  })),
)

const PAUSE_INTEGRATION_MUTATION = getBuilderMutation(
  "pauseIntegration",
  createNativeMutation((args) => ({
    method: "POST",
    url: `/api/v1/builder/integrations/${requiredId(args)}/pause`,
  })),
)

const RESUME_INTEGRATION_MUTATION = getBuilderMutation(
  "resumeIntegration",
  createNativeMutation((args) => ({
    method: "POST",
    url: `/api/v1/builder/integrations/${requiredId(args)}/resume`,
  })),
)

const REMOVE_INTEGRATION_MUTATION = getBuilderMutation(
  "removeIntegration",
  createNativeMutation((args) => ({
    method: "DELETE",
    url: `/api/v1/builder/integrations/${requiredId(args)}`,
  })),
)

export function useIntegrations(projectId: string): UseIntegrations {
  // ── Lista do projeto (QUERY com `query: { projectId }`) ───────────────────
  const listQuery = LIST_PROJECT_INTEGRATIONS_QUERY.useQuery({
    query: { projectId },
  })

  // ── Catálogo de templates (QUERY sem input) ───────────────────────────────
  const templatesQuery = LIST_TEMPLATES_QUERY.useQuery()

  // ── Mutations do ciclo de vida ────────────────────────────────────────────
  const createMutation = CREATE_INTEGRATION_MUTATION.useMutation()
  const updateCredsMutation = UPDATE_CREDENTIALS_MUTATION.useMutation()
  const testMutation = TEST_INTEGRATION_MUTATION.useMutation()
  const activateMutation = ACTIVATE_INTEGRATION_MUTATION.useMutation()
  const pauseMutation = PAUSE_INTEGRATION_MUTATION.useMutation()
  const resumeMutation = RESUME_INTEGRATION_MUTATION.useMutation()
  const removeMutation = REMOVE_INTEGRATION_MUTATION.useMutation()

  // Identidade estável do `refetch` para os wrappers (o hook gerado pode trocar
  // a identidade a cada render — mesmo guard de `use-project-readiness.ts`).
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
      const res = await createMutation.mutate({ body: input })
      refetch()
      return res
    },
    [createMutation, refetch],
  )

  const updateCredentials = React.useCallback(
    async (id: string, values: Record<string, string>) => {
      const res = await updateCredsMutation.mutate({
        params: { id },
        body: { values },
      })
      refetch()
      return res
    },
    [updateCredsMutation, refetch],
  )

  const testIntegration = React.useCallback(
    async (id: string) => {
      const res = await testMutation.mutate({ params: { id } })
      // O teste muda `lastTest*`/status (draft → validated) — repuxa a lista.
      refetch()
      return asTestResult(res)
    },
    [testMutation, refetch],
  )

  const activate = React.useCallback(
    async (id: string) => {
      const res = await activateMutation.mutate({ params: { id } })
      refetch()
      return res
    },
    [activateMutation, refetch],
  )

  const pause = React.useCallback(
    async (id: string) => {
      const res = await pauseMutation.mutate({ params: { id } })
      refetch()
      return res
    },
    [pauseMutation, refetch],
  )

  const resume = React.useCallback(
    async (id: string) => {
      const res = await resumeMutation.mutate({ params: { id } })
      refetch()
      return res
    },
    [resumeMutation, refetch],
  )

  const remove = React.useCallback(
    async (id: string) => {
      const res = await removeMutation.mutate({ params: { id } })
      refetch()
      return res
    },
    [removeMutation, refetch],
  )

  const isMutating =
    Boolean(createMutation.isLoading) ||
    Boolean(updateCredsMutation.isLoading) ||
    Boolean(testMutation.isLoading) ||
    Boolean(activateMutation.isLoading) ||
    Boolean(pauseMutation.isLoading) ||
    Boolean(resumeMutation.isLoading) ||
    Boolean(removeMutation.isLoading)

  return {
    integrations,
    isLoading: Boolean(listQuery.isLoading),
    error: listQuery.error,
    refetch,
    templates,
    templatesLoading: Boolean(templatesQuery.isLoading),
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
