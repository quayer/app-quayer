"use client"

/**
 * Builder — preview/tabs/media / MediaGrid (Fase E, E4)
 *
 * DONO DAS MUTATIONS da aba "Mídias". É o equivalente, para o catálogo de
 * MediaAsset, do `chat/cards/sources/images-preview-panel.tsx` (Onda D3): o
 * componente PAI (`media-tab.tsx`) é dono do `useQuery` (lista canônica) e nos
 * entrega `items` + `onRefetch`; este componente é dono da CURADORIA — edita
 * legenda (debounce → PATCH) e soft-delete (PATCH { deleted:true }).
 *
 * Responsabilidades (espelha o panel da D3):
 *   - dispara `api.builder.patchMediaAsset` (delete / caption com debounce 600ms /
 *     confirmed para liberar mídia pendente ao agente) e, no sucesso, pede ao pai
 *     um `onRefetch()` para repuxar a lista canônica;
 *   - mantém o estado local de curadoria: `drafts` (legenda em edição por id) +
 *     `deletingIds` (Set — fade-out enquanto o soft-delete está em voo);
 *   - um timer de debounce por mediaId (`captionTimers`), limpo no unmount;
 *   - grid responsivo `grid-cols-2 sm:grid-cols-3 gap-2`, uma célula por item,
 *     delegando o RENDER (por tipo de mídia) ao `MediaCard` (presentational).
 *
 * A filtragem por `mediaType` vive no PAI (`media-tab.tsx`) para o contador da
 * barra de filtro ficar correto — aqui só renderizamos `items` já filtrados.
 *
 * Segurança de mídia: o `MediaCard` só renderiza `<img>`/`<video>` com
 * `item.url` (signed URL https on-read OU `externalUrl` https do backend);
 * `storageKey` NUNCA chega ao FE. `url == null` → placeholder, nunca render.
 *
 * Contrato: docs/AUTH_MAP.md (rotas listProjectMedia/patchMediaAsset, E4).
 */

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { api } from "@/igniter.client"

import { MediaCard } from "./media-card"

// ──────────────────────────────────────────────────────────────────────────
// Tipo compartilhado da aba (espelha o MediaAssetItem de media-curation.routes.ts)
// ──────────────────────────────────────────────────────────────────────────

/** Tipos de mídia suportados pelo catálogo (espelha MediaAsset.mediaType). */
export type MediaAssetType = "image" | "video" | "document"

/** Origem do item no catálogo (espelha MediaAsset.source). */
export type MediaAssetSource = "upload" | "gallery" | "pricing"

/**
 * Forma de UM item do catálogo, exatamente como
 * `GET /builder/projects/:id/media` devolve (MediaAssetItem no route file).
 *
 * Mantido LOCAL à aba (e re-exportado para o filho `media-card`) para não
 * acoplar o FE ao type do route file do servidor — espelha o padrão
 * `CuratedImage` da Onda D3.
 *
 * `url` é a signed URL on-read (https, BUCKETS.MEDIA) OU o `externalUrl` direto
 * (pricing) e é NULLABLE — a assinatura é fail-safe por item no backend.
 * `storageKey` NUNCA chega ao FE; só renderizamos mídia quando `url != null`.
 */
export interface MediaAssetItem {
  id: string
  /** Signed URL on-read (https) ou externalUrl direto; null se a assinatura falhar. */
  url: string | null
  mediaType: MediaAssetType
  caption: string | null
  category: string | null
  source: MediaAssetSource
  mimeType: string | null
  /** ISO; null = pendente de curadoria. Aditivo (paridade com a D2). */
  confirmedAt: string | null
}

// ──────────────────────────────────────────────────────────────────────────
// Constantes de UI
// ──────────────────────────────────────────────────────────────────────────

/** Debounce da edição de legenda antes de bater no PATCH (ms) — igual à D3. */
const CAPTION_DEBOUNCE_MS = 600

// ──────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────

export interface MediaGridProps {
  /** Itens do catálogo, já filtrados por mediaType pelo pai (`media-tab.tsx`). */
  items: MediaAssetItem[]
  /** Tokens do design system (descem do pai — este componente não chama useAppTokens). */
  tokens: AppTokens
  /** Desabilita toda a curadoria (ex.: upload em voo). */
  disabled?: boolean
  /** Repuxa a lista canônica após patch (refetch do `useQuery` do pai). */
  onRefetch: () => void
}

// ──────────────────────────────────────────────────────────────────────────
// MediaGrid
// ──────────────────────────────────────────────────────────────────────────

/**
 * MediaGrid — grade de curadoria do catálogo de mídia. Não busca a lista (o
 * `media-tab` o faz); só CURA: edita legenda (debounce → PATCH) e remove
 * (soft-delete). Repassa cada item ao `MediaCard` (presentational) e mantém o
 * estado de edição/fade-out por id, espelhando o `ImagesPreviewPanel` da D3.
 */
export function MediaGrid({
  items,
  tokens,
  disabled = false,
  onRefetch,
}: MediaGridProps): React.JSX.Element {
  // ── Mutation (client tipado Igniter, agrupado por controller → api.builder.*)
  // `onSuccess` (refetch da lista canônica) vive no hook — nesta versão do
  // client o `.mutate({ params, body })` NÃO aceita callbacks por chamada; ele
  // devolve uma Promise da resposta, então o error-handling pontual (rollback do
  // fade-out no delete) é feito no `.catch`/inspeção da resposta no handler.
  const patchMedia = api.builder.patchMediaAsset.useMutation({
    onSuccess: () => onRefetch(),
  })

  // ── Estado local de curadoria ───────────────────────────────────────────
  // Legendas em edição (controladas pelo card via drafts[id]).
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  // IDs em soft-delete em voo — mantidos até o refetch confirmar a remoção
  // (o `MediaCard` usa isso para o fade-out de 300ms).
  const [deletingIds, setDeletingIds] = React.useState<Set<string>>(
    () => new Set<string>(),
  )

  // Um timer de debounce por mediaId (legenda) — limpo no unmount.
  const captionTimers = React.useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({})
  React.useEffect(() => {
    const timers = captionTimers.current
    return () => {
      for (const id of Object.keys(timers)) clearTimeout(timers[id])
    }
  }, [])

  // ── Handlers de curadoria ─────────────────────────────────────────────────

  /** Libera um id do conjunto de fade-out (quando o delete falha). */
  const clearDeleting = React.useCallback((mediaId: string) => {
    setDeletingIds((cur) => {
      if (!cur.has(mediaId)) return cur
      const next = new Set(cur)
      next.delete(mediaId)
      return next
    })
  }, [])

  /**
   * Soft-delete de UMA mídia. Marca o id como "deletando" (fade-out no card) e,
   * no sucesso, o `onSuccess` do hook chama `onRefetch()` — a lista canônica
   * volta sem a mídia e o id sai do grid. Se o PATCH falhar (resposta com
   * `error` ou rejeição), libera o id do fade-out para o usuário tentar de novo.
   */
  const handleDelete = React.useCallback(
    (mediaId: string) => {
      if (disabled) return
      // Cancela um PATCH de legenda pendente desta mídia — senão o timer dispara
      // depois do delete e bate num mediaId já removido (404 silencioso).
      const timers = captionTimers.current
      if (timers[mediaId]) {
        clearTimeout(timers[mediaId])
        delete timers[mediaId]
      }
      setDeletingIds((cur) => {
        const next = new Set(cur)
        next.add(mediaId)
        return next
      })
      void patchMedia
        .mutate({ params: { mediaId }, body: { deleted: true } })
        .then((res) => {
          if (res?.error != null) clearDeleting(mediaId)
        })
        .catch(() => clearDeleting(mediaId))
    },
    [clearDeleting, disabled, patchMedia],
  )

  /**
   * Confirma UMA mídia pendente (PATCH { confirmed: true }) — o runtime só envia
   * mídia com confirmedAt preenchido, então confirmar = liberar para o agente.
   * No sucesso o `onSuccess` do hook repuxa a lista (badge "Pendente" some).
   */
  const handleConfirm = React.useCallback(
    (mediaId: string) => {
      if (disabled) return
      void patchMedia.mutate({ params: { mediaId }, body: { confirmed: true } })
    },
    [disabled, patchMedia],
  )

  /** Edição de legenda com debounce por id → PATCH { caption }. */
  const handleCaptionChange = React.useCallback(
    (mediaId: string, next: string) => {
      setDrafts((cur) => ({ ...cur, [mediaId]: next }))
      const timers = captionTimers.current
      if (timers[mediaId]) clearTimeout(timers[mediaId])
      timers[mediaId] = setTimeout(() => {
        delete timers[mediaId]
        if (disabled) return
        void patchMedia.mutate({
          params: { mediaId },
          body: { caption: next.trim() },
        })
      }, CAPTION_DEBOUNCE_MS)
    },
    [disabled, patchMedia],
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      role="list"
      aria-label="Catálogo de mídias"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {items.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          // draft tem precedência (edição em voo); senão a legenda canônica.
          caption={drafts[item.id] ?? item.caption ?? ""}
          deleting={deletingIds.has(item.id)}
          disabled={disabled}
          tokens={tokens}
          onCaptionChange={(next) => handleCaptionChange(item.id, next)}
          onDelete={() => handleDelete(item.id)}
          onConfirm={() => handleConfirm(item.id)}
        />
      ))}
    </div>
  )
}

export default MediaGrid
