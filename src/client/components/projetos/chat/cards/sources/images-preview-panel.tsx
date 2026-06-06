"use client"

/**
 * Builder Cards — sources / images-preview-panel (Onda D3, vision/G2)
 *
 * Orquestrador da GALERIA de curadoria visual, renderizado INLINE dentro do
 * card `source_progress` (zona "Catálogo de fotos"). Porta de
 * `web/src/components/sdr/ImagesPreviewPanel.tsx` do Orayon, adaptada ao DS da
 * Quayer (tokens via prop, ZERO cor hard-coded) e ao client tipado Igniter.
 *
 * Responsabilidades (o card é dono do `useQuery`; o panel é dono da CURADORIA):
 *   - agrupa `images` por `sourceId` (uma grid por fonte) — `groupedImages`.
 *   - mantém o estado local de curadoria: `drafts` (legenda em edição) +
 *     `deletingIds` (fade-out enquanto o soft-delete está em voo).
 *   - dispara `api.builder.patchSourceImage` (delete / caption com debounce) e
 *     `api.builder.bulkSourceImages` (approve_all / delete_low_quality), e pede
 *     ao pai um `onRefetch()` no sucesso para repuxar a lista canônica.
 *   - footer CONDICIONAL: "Aprovar todas (N)" (pendentes: confirmedAt == null) e
 *     "Remover genéricas (N)" (heurística FE: sem legenda OU dimensão pequena) —
 *     cada botão só renderiza quando seu N > 0. O server é a verdade; o N de
 *     "genéricas" é só indicativo (o GET não devolve esse count).
 *   - abre o lightbox passando o GRUPO da fonte daquela imagem, para a navegação
 *     ←/→ ficar dentro da MESMA fonte.
 *
 * A galeria é INDEPENDENTE do "Aceitar" dos campos de texto: não toca em
 * `confirmations.source` nem nas actions do footer do card. SEM SSE — o card
 * faz o poll (W4) e nos entrega `images`/`loading`/`onRefetch`.
 *
 * Contrato: docs/builder/ONDA_D_VISION_PLAN.md (§ curadoria/D3).
 */

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { api } from "@/igniter.client"

import { ImageLightbox } from "./image-lightbox"
import { ImagesPreviewCard } from "./images-preview-card"

// ──────────────────────────────────────────────────────────────────────────
// Tipo compartilhado da galeria (espelha CuratedImage de source-images.routes.ts)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Forma de UMA imagem curável, exatamente como `GET /sources/images` devolve.
 * Mantido LOCAL ao panel (e re-exportado para os filhos `images-preview-card` e
 * `image-lightbox`) para não acoplar o FE ao type do route file do server.
 *
 * `imageUrl` é a signed URL on-read (https, BUCKETS.MEDIA) e é NULLABLE — a
 * assinatura é fail-safe por item no backend. `storageKey` NUNCA chega ao FE;
 * só renderizamos `<img src>` quando `imageUrl != null`.
 */
export interface CuratedImage {
  id: string
  sourceId: string
  collectionId: string
  /** URL de origem da imagem (mostrada como legenda da fonte no lightbox). */
  originalUrl: string
  /** Signed URL on-read (https); null quando a assinatura falhou — render só se != null. */
  imageUrl: string | null
  caption: string | null
  width: number | null
  height: number | null
  sizeBytes: number | null
  mimeType: string | null
  /** ISO; null = pendente de curadoria (candidata a approve_all). */
  confirmedAt: string | null
  /** ISO — ordenação estável. */
  createdAt: string
}

// ──────────────────────────────────────────────────────────────────────────
// Constantes de UI / heurística FE
// ──────────────────────────────────────────────────────────────────────────

/** Debounce da edição de legenda antes de bater no PATCH (ms). */
const CAPTION_DEBOUNCE_MS = 600

/**
 * Dimensão mínima (px) abaixo da qual a imagem conta como "genérica" na
 * heurística do FRONTEND. É só um indicador do contador "Remover genéricas (N)";
 * o repository do server tem a sua própria heurística (a verdade). Mantida
 * deliberadamente conservadora para não superestimar o número.
 */
const LOW_QUALITY_MIN_DIMENSION = 200

/**
 * Heurística FE de "imagem genérica" (espelha o espírito de
 * `bulkDeleteLowQuality`): sem legenda OU com alguma dimensão conhecida pequena.
 * Imagens sem dimensão conhecida NÃO entram só por isso (evita falso-positivo).
 */
function isLowQuality(image: CuratedImage): boolean {
  const hasCaption =
    typeof image.caption === "string" && image.caption.trim().length > 0
  if (!hasCaption) return true
  const tooSmallWidth =
    typeof image.width === "number" && image.width < LOW_QUALITY_MIN_DIMENSION
  const tooSmallHeight =
    typeof image.height === "number" && image.height < LOW_QUALITY_MIN_DIMENSION
  return tooSmallWidth || tooSmallHeight
}

// ──────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────

export interface ImagesPreviewPanelProps {
  /** Projeto Builder dono das imagens (vai no path do bulk). */
  projectId: string
  /** Lista canônica vinda do pai (o card é dono do `useQuery`). */
  images: CuratedImage[]
  /** `true` enquanto a lista ainda está carregando (1º fetch / poll). */
  loading: boolean
  /** Tokens do design system (useAppTokens via props.tokens). */
  tokens: AppTokens
  /** Desabilita toda a curadoria (ex.: card em streaming). */
  disabled?: boolean
  /** Repuxa a lista canônica após patch/bulk (refetch do `useQuery` do card). */
  onRefetch: () => void
}

// ──────────────────────────────────────────────────────────────────────────
// ImagesPreviewPanel
// ──────────────────────────────────────────────────────────────────────────

/**
 * ImagesPreviewPanel — galeria de curadoria agrupada por fonte. Não busca a
 * lista (o card o faz); só CURA: edita legenda, remove, aprova em massa, e abre
 * o lightbox por fonte. Repassa cada item ao `ImagesPreviewCard` e mantém um
 * único `ImageLightbox` escopado ao grupo da imagem aberta.
 */
export function ImagesPreviewPanel({
  projectId,
  images,
  loading,
  tokens,
  disabled = false,
  onRefetch,
}: ImagesPreviewPanelProps): React.JSX.Element {
  // ── Mutations (client tipado Igniter, agrupado por controller → api.builder.*)
  // `onSuccess` (refetch da lista canônica) vive no hook — nesta versão do
  // client o `.mutate({ params, body })` NÃO aceita callbacks por chamada; ele
  // devolve uma Promise da resposta, então o error-handling pontual (rollback do
  // fade-out no delete) é feito no `.catch`/inspeção da resposta no handler.
  const patchImage = api.builder.patchSourceImage.useMutation({
    onSuccess: () => onRefetch(),
  })
  const bulkImages = api.builder.bulkSourceImages.useMutation({
    onSuccess: () => onRefetch(),
  })

  // ── Estado local de curadoria ───────────────────────────────────────────
  // Legendas em edição (controladas pelo lightbox via drafts[id]).
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  // IDs em soft-delete em voo — mantidos até o refetch confirmar a remoção
  // (o `ImagesPreviewCard` usa isso para o fade-out de 300ms).
  const [deletingIds, setDeletingIds] = React.useState<Set<string>>(
    () => new Set<string>(),
  )
  // Qual imagem está aberta no lightbox (null = fechado).
  const [lightboxOpenId, setLightboxOpenId] = React.useState<string | null>(
    null,
  )

  // Um timer de debounce por imageId (legenda) — limpo no unmount.
  const captionTimers = React.useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({})
  React.useEffect(() => {
    const timers = captionTimers.current
    return () => {
      for (const id of Object.keys(timers)) clearTimeout(timers[id])
    }
  }, [])

  // ── Agrupamento por fonte (uma grid por sourceId) ─────────────────────────
  const groupedImages = React.useMemo(() => {
    const acc: Record<string, CuratedImage[]> = {}
    for (const img of images) {
      ;(acc[img.sourceId] ??= []).push(img)
    }
    return acc
  }, [images])

  // Ordem estável das fontes: pela 1ª imagem (createdAt asc) de cada grupo.
  const sourceOrder = React.useMemo(() => {
    const ids = Object.keys(groupedImages)
    ids.sort((a, b) => {
      const ca = groupedImages[a][0]?.createdAt ?? ""
      const cb = groupedImages[b][0]?.createdAt ?? ""
      return ca.localeCompare(cb)
    })
    return ids
  }, [groupedImages])

  // ── Contadores do footer condicional ──────────────────────────────────────
  // Pendentes de curadoria (confirmedAt == null) → "Aprovar todas (N)".
  const pendingApproveCount = React.useMemo(
    () => images.filter((i) => i.confirmedAt == null).length,
    [images],
  )
  // Heurística FE (indicativa) → "Remover genéricas (N)".
  const lowQualityCount = React.useMemo(
    () => images.filter((i) => isLowQuality(i)).length,
    [images],
  )

  const busy = patchImage.isLoading || bulkImages.isLoading

  // ── Handlers de curadoria ─────────────────────────────────────────────────

  /** Libera um id do conjunto de fade-out (quando o delete falha). */
  const clearDeleting = React.useCallback((imageId: string) => {
    setDeletingIds((cur) => {
      if (!cur.has(imageId)) return cur
      const next = new Set(cur)
      next.delete(imageId)
      return next
    })
  }, [])

  /**
   * Soft-delete de UMA imagem. Marca o id como "deletando" (fade-out no card) e,
   * no sucesso, o `onSuccess` do hook chama `onRefetch()` — a lista canônica volta
   * sem a imagem e o id sai do grid. Se o PATCH falhar (resposta com `error` ou
   * rejeição), libera o id do fade-out para o usuário poder tentar de novo.
   */
  const handleDelete = React.useCallback(
    (imageId: string) => {
      if (disabled) return
      // Cancela um PATCH de legenda pendente desta imagem — senão o timer dispara
      // depois do delete e bate num imageId já removido (404 silencioso).
      const timers = captionTimers.current
      if (timers[imageId]) {
        clearTimeout(timers[imageId])
        delete timers[imageId]
      }
      setDeletingIds((cur) => {
        const next = new Set(cur)
        next.add(imageId)
        return next
      })
      void patchImage
        .mutate({ params: { imageId }, body: { deleted: true } })
        .then((res) => {
          if (res?.error != null) clearDeleting(imageId)
        })
        .catch(() => clearDeleting(imageId))
    },
    [clearDeleting, disabled, patchImage],
  )

  /** Edição de legenda com debounce por id → PATCH { caption }. */
  const handleCaptionChange = React.useCallback(
    (imageId: string, next: string) => {
      setDrafts((cur) => ({ ...cur, [imageId]: next }))
      const timers = captionTimers.current
      if (timers[imageId]) clearTimeout(timers[imageId])
      timers[imageId] = setTimeout(() => {
        delete timers[imageId]
        if (disabled) return
        void patchImage.mutate({
          params: { imageId },
          body: { caption: next.trim() },
        })
      }, CAPTION_DEBOUNCE_MS)
    },
    [disabled, patchImage],
  )

  /** Ação em massa (approve_all | delete_low_quality) → POST /bulk. */
  const handleBulk = React.useCallback(
    (action: "approve_all" | "delete_low_quality") => {
      if (disabled) return
      void bulkImages.mutate({ params: { id: projectId }, body: { action } })
    },
    [bulkImages, disabled, projectId],
  )

  // ── Lightbox (escopado ao grupo da fonte da imagem aberta) ─────────────────
  const openImage = React.useMemo(
    () => images.find((i) => i.id === lightboxOpenId) ?? null,
    [images, lightboxOpenId],
  )
  const lightboxGroup = React.useMemo<CuratedImage[]>(
    () => (openImage ? (groupedImages[openImage.sourceId] ?? []) : []),
    [openImage, groupedImages],
  )

  const handleView = React.useCallback(
    (imageId: string) => setLightboxOpenId(imageId),
    [],
  )
  const closeLightbox = React.useCallback(() => setLightboxOpenId(null), [])
  const navigateLightbox = React.useCallback(
    (nextId: string) => setLightboxOpenId(nextId),
    [],
  )

  // ── Render ────────────────────────────────────────────────────────────────
  const showApproveAll = pendingApproveCount > 0
  const showCleanLowQuality = lowQualityCount > 0
  const showFooter = !loading && (showApproveAll || showCleanLowQuality)

  return (
    <section
      aria-label="Galeria de fotos das fontes"
      className="flex flex-col gap-3"
    >
      {sourceOrder.map((sourceId) => {
        const group = groupedImages[sourceId]
        return (
          <div key={sourceId} className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {group.map((image) => (
                <ImagesPreviewCard
                  key={image.id}
                  image={image}
                  deleting={deletingIds.has(image.id)}
                  disabled={disabled}
                  tokens={tokens}
                  onDelete={() => handleDelete(image.id)}
                  onView={() => handleView(image.id)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {showFooter && (
        <div className="flex flex-wrap items-center gap-2">
          {showApproveAll && (
            <button
              type="button"
              onClick={() => handleBulk("approve_all")}
              disabled={disabled || busy}
              aria-label={`Aprovar todas as ${pendingApproveCount} fotos pendentes`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: tokens.brandSubtle,
                borderColor: tokens.brandBorder,
                color: tokens.brandText,
              }}
            >
              Aprovar todas ({pendingApproveCount})
            </button>
          )}
          {showCleanLowQuality && (
            <button
              type="button"
              onClick={() => handleBulk("delete_low_quality")}
              disabled={disabled || busy}
              aria-label={`Remover ${lowQualityCount} fotos genéricas`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: tokens.bgBase,
                borderColor: tokens.divider,
                color: tokens.dangerText,
              }}
            >
              Remover genéricas ({lowQualityCount})
            </button>
          )}
        </div>
      )}

      <ImageLightbox
        open={lightboxOpenId !== null}
        images={lightboxGroup}
        currentId={lightboxOpenId}
        drafts={drafts}
        tokens={tokens}
        disabled={disabled}
        onClose={closeLightbox}
        onNavigate={navigateLightbox}
        onCaptionChange={handleCaptionChange}
      />
    </section>
  )
}

export default ImagesPreviewPanel
