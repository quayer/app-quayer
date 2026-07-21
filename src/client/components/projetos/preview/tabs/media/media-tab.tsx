"use client"

/**
 * MediaTab — Catálogo de Mídias (Fase E / E4) do projeto.
 *
 * Aba de CURADORIA do catálogo que o agente pode enviar no WhatsApp: o dono sobe
 * foto/vídeo/PDF, vê a grade, edita legenda e remove (soft-delete). É SÓ
 * leitura/curadoria — o ENVIO da mídia é responsabilidade do runtime (tool
 * `buscar_media`), nunca desta UI.
 *
 * Espelha `knowledge-tab.tsx` (orquestrador dono do data): loading com spinner
 * Loader2, empty-state PT-BR, estado de ERRO honesto (falha da lista ≠ catálogo
 * vazio — bloco com "Tentar de novo" em vez do empty-state), e um único
 * `refetch` propagado para os filhos (<MediaUpload onUploaded> e
 * <MediaGrid onRefetch>) repuxar a lista canônica.
 *
 * Responsabilidades (este componente é o DONO do `useQuery`):
 *   - `api.builder.listProjectMedia.useQuery({ params: { id } })` → lista canônica
 *     (cada item já vem com `url` assinada on-read OU `externalUrl` https; o
 *     `storageKey` NUNCA chega ao FE — render só quando `url != null`).
 *   - filtro por `mediaType` (Todos | Imagens | Vídeos | Documentos) em estado
 *     local, com contador por aba.
 *   - delega o UPLOAD multipart a <MediaUpload> (route handler fora do Igniter) e
 *     as mutations de legenda/soft-delete a <MediaGrid> (api.builder.patchMediaAsset).
 *
 * O upload cria a collection on-demand no backend (ensureCollectionIdOrThrow), por
 * isso a aba funciona pré-agente — igual à knowledge-tab, sem `requiresAgent`.
 */

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { useQuery } from "@tanstack/react-query"
import { orpc } from "@/orpc/client"
import type { WorkspaceProject } from "@/client/components/projetos/types"

import { MediaUpload } from "./media-upload"
import { MediaGrid, type MediaAssetItem } from "./media-grid"

// ──────────────────────────────────────────────────────────────────────────
// Filtro por tipo de mídia
// ──────────────────────────────────────────────────────────────────────────

/** Valor do filtro local — `all` = sem filtro; demais espelham `MediaAssetItem.mediaType`. */
type MediaFilter = "all" | MediaAssetItem["mediaType"]

interface FilterOption {
  value: MediaFilter
  label: string
}

/** Abas do filtro, em PT-BR. Ordem: Todos → Imagens → Vídeos → Documentos. */
const FILTER_OPTIONS: readonly FilterOption[] = [
  { value: "all", label: "Todos" },
  { value: "image", label: "Imagens" },
  { value: "video", label: "Vídeos" },
  { value: "document", label: "Documentos" },
] as const

// ──────────────────────────────────────────────────────────────────────────
// Filtro por categoria (derivado dos itens — só FE, sem nova query)
// ──────────────────────────────────────────────────────────────────────────

/** Valor do filtro de categoria — `"all"` = todas; demais = a chave normalizada (lowercase). */
type CategoryFilter = string

/**
 * Categoria distinta derivada dos itens. `key` é a forma normalizada
 * (lowercase + trim) usada para deduplicar e comparar; `label` é o primeiro
 * rótulo original encontrado (preservado para exibição PT-BR amigável).
 */
interface DerivedCategory {
  key: string
  label: string
}

/**
 * Deriva as categorias DISTINTAS presentes nos itens: `item.category` não-nulo,
 * trim, deduplicado case-insensitive (a primeira grafia vira o rótulo exibido),
 * ordenado alfabeticamente (locale pt-BR). Função pura — sem efeito colateral.
 */
function deriveCategories(items: readonly MediaAssetItem[]): DerivedCategory[] {
  const byKey = new Map<string, string>()
  for (const item of items) {
    const raw = item.category?.trim()
    if (!raw) continue
    const key = raw.toLowerCase()
    // Mantém a PRIMEIRA grafia encontrada como rótulo de exibição.
    if (!byKey.has(key)) byKey.set(key, raw)
  }
  return Array.from(byKey, ([key, label]) => ({ key, label })).sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR"),
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────

export interface MediaTabProps {
  project: WorkspaceProject
}

// ──────────────────────────────────────────────────────────────────────────
// MediaTab
// ──────────────────────────────────────────────────────────────────────────

export function MediaTab({ project }: MediaTabProps): React.JSX.Element {
  const { tokens } = useAppTokens()

  // ── Lista canônica (este componente é o dono do data) ──────────────────────
  // `isError` é consumido de propósito (audit médio): sem ele, uma falha de API
  // virava lista vazia e a aba mentia "Nenhuma mídia no catálogo ainda".
  const { data, isLoading, isError, refetch } = useQuery(
    orpc.builder.listProjectMedia.queryOptions({ input: { id: project.id } }),
  )

  // oRPC: data = envelope { data: { media }, error: null } (wire idêntico ao
  // Igniter). Desembrulha tolerante e defaulta para [] (a UI nunca vê undefined).
  const media: MediaAssetItem[] = React.useMemo(() => {
    const env = data?.data as { media?: MediaAssetItem[] } | undefined
    return Array.isArray(env?.media) ? env.media : []
  }, [data])

  // ── Filtros locais (tipo + categoria) ──────────────────────────────────────
  const [filter, setFilter] = React.useState<MediaFilter>("all")
  const [categoryFilter, setCategoryFilter] = React.useState<CategoryFilter>("all")

  // Categorias distintas presentes nos itens (derivadas — sem nova query).
  const categories = React.useMemo<DerivedCategory[]>(
    () => deriveCategories(media),
    [media],
  )

  // Se a categoria selecionada some dos itens (ex.: último item dela removido),
  // volta para "Todas" para não travar a grade num filtro inexistente.
  React.useEffect(() => {
    if (categoryFilter === "all") return
    if (!categories.some((c) => c.key === categoryFilter)) {
      setCategoryFilter("all")
    }
  }, [categories, categoryFilter])

  // Filtro combinado (tipo AND categoria) — case-insensitive na categoria.
  const filtered = React.useMemo<MediaAssetItem[]>(
    () =>
      media.filter((m) => {
        const matchesType = filter === "all" || m.mediaType === filter
        const matchesCategory =
          categoryFilter === "all" ||
          m.category?.trim().toLowerCase() === categoryFilter
        return matchesType && matchesCategory
      }),
    [media, filter, categoryFilter],
  )

  // Contador por aba de TIPO — respeita o filtro de categoria ativo (AND), para
  // o número refletir o que de fato apareceria ao clicar naquela aba.
  const countFor = React.useCallback(
    (value: MediaFilter): number =>
      media.filter((m) => {
        const matchesType = value === "all" || m.mediaType === value
        const matchesCategory =
          categoryFilter === "all" ||
          m.category?.trim().toLowerCase() === categoryFilter
        return matchesType && matchesCategory
      }).length,
    [media, categoryFilter],
  )

  // `refetch` estável para repassar aos filhos sem recriar callbacks por render.
  const handleRefetch = React.useCallback(() => {
    void refetch()
  }, [refetch])

  // ── Loading (1º fetch) — espelha knowledge-tab ─────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2
          className="h-4 w-4 animate-spin"
          style={{ color: tokens.textTertiary }}
        />
      </div>
    )
  }

  // Erro da LISTA ≠ catálogo vazio: com isError nada de empty-state mentiroso.
  const isEmpty = !isError && media.length === 0
  const isFilteredEmpty = !isError && !isEmpty && filtered.length === 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {/* Header PT-BR */}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold" style={{ color: tokens.textPrimary }}>
          Mídias
        </h2>
        <p className="text-[12px]" style={{ color: tokens.textTertiary }}>
          Catálogo que o agente pode enviar no WhatsApp.
        </p>
      </div>

      {/* Upload (route handler multipart, fora do Igniter) → refetch ao concluir */}
      <MediaUpload projectId={project.id} onUploaded={handleRefetch} />

      {/* Barra de filtro por tipo — só quando há mídia para filtrar */}
      {!isError && !isEmpty && (
        <div
          role="tablist"
          aria-label="Filtrar mídias por tipo"
          className="flex flex-wrap items-center gap-1.5"
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value
            const count = countFor(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(opt.value)}
                className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                style={{
                  backgroundColor: active ? tokens.brandSubtle : tokens.bgSurface,
                  borderColor: active ? tokens.brandBorder : tokens.divider,
                  color: active ? tokens.brandText : tokens.textSecondary,
                }}
              >
                {opt.label}
                <span
                  className="text-[11px]"
                  style={{ color: active ? tokens.brandText : tokens.textTertiary }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Barra de filtro por categoria — só quando há ao menos uma categoria.
          Combina com o filtro de tipo (AND). Deriva da lista em memória, sem query. */}
      {!isError && !isEmpty && categories.length > 0 && (
        <div
          role="group"
          aria-label="Filtrar mídias por categoria"
          className="flex flex-wrap items-center gap-1.5"
        >
          {/* Chip "Todas" + um chip por categoria distinta. */}
          {[{ key: "all", label: "Todas" }, ...categories].map(
            (cat) => {
              const active = categoryFilter === cat.key
              return (
                <button
                  key={cat.key}
                  type="button"
                  aria-pressed={active}
                  aria-label={
                    cat.key === "all"
                      ? "Mostrar todas as categorias"
                      : `Filtrar pela categoria ${cat.label}`
                  }
                  onClick={() => setCategoryFilter(cat.key)}
                  className="inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                  style={{
                    backgroundColor: active ? tokens.brandSubtle : tokens.bgSurface,
                    borderColor: active ? tokens.brandBorder : tokens.divider,
                    color: active ? tokens.brandText : tokens.textSecondary,
                  }}
                >
                  {cat.label}
                </button>
              )
            },
          )}
        </div>
      )}

      {/* Erro de carregamento da lista — honesto, com retry (audit médio) */}
      {isError && (
        <div
          role="alert"
          className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center"
          style={{ borderColor: tokens.divider }}
        >
          <AlertTriangle className="h-5 w-5" style={{ color: tokens.dangerText }} />
          <p className="text-[13px] font-medium" style={{ color: tokens.textSecondary }}>
            Não foi possível carregar o catálogo de mídias
          </p>
          <p className="text-[12px]" style={{ color: tokens.textTertiary }}>
            Verifique sua conexão ou tente novamente em instantes.
          </p>
          <button
            type="button"
            onClick={handleRefetch}
            className="mt-1 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors hover:opacity-80"
            style={{
              borderColor: tokens.brand,
              backgroundColor: tokens.brand,
              color: "#fff",
            }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* Empty-state geral (nenhuma mídia no catálogo) */}
      {isEmpty && (
        <div
          className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center"
          style={{ borderColor: tokens.divider }}
        >
          <p className="text-[13px] font-medium" style={{ color: tokens.textSecondary }}>
            Nenhuma mídia no catálogo ainda
          </p>
          <p className="text-[12px]" style={{ color: tokens.textTertiary }}>
            Envie uma imagem, vídeo ou PDF acima para o agente poder usar.
          </p>
        </div>
      )}

      {/* Empty-state do filtro (há mídia, mas nenhuma combina com os filtros ativos) */}
      {isFilteredEmpty && (
        <p
          className="rounded-lg border border-dashed px-4 py-6 text-center text-[12px]"
          style={{ borderColor: tokens.divider, color: tokens.textTertiary }}
        >
          Nenhuma mídia com esses filtros.
        </p>
      )}

      {/* Grade (dona das mutations de legenda/confirmação/soft-delete) */}
      {!isError && !isEmpty && !isFilteredEmpty && (
        <MediaGrid items={filtered} tokens={tokens} onRefetch={handleRefetch} />
      )}
    </div>
  )
}

export default MediaTab
