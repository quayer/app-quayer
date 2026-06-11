"use client"

/**
 * Builder Cards — sources / images-preview-panel (Onda D3, vision/G2)
 *
 * Orquestrador da GALERIA de curadoria visual, renderizado INLINE dentro do
 * card `source_progress` (zona "Catálogo de fotos"). Porta de
 * `web/src/components/sdr/ImagesPreviewPanel.tsx` do Orayon, adaptada ao DS da
 * Quayer (tokens via prop, ZERO cor hard-coded).
 *
 * Responsabilidades (o card é dono do fetch da lista; o panel é dono da CURADORIA):
 *   - agrupa `images` por `sourceId` (uma grid por fonte) — `groupedImages`.
 *   - mantém o estado local de curadoria: `drafts` (legenda em edição) +
 *     `deletingIds` (fade-out enquanto o soft-delete está em voo).
 *   - dispara fetch autenticado para patchSourceImage (delete / caption com
 *     debounce) e bulkSourceImages (approve_all), e pede ao pai um `onRefetch()`
 *     no sucesso para repuxar a lista canônica.
 *   - footer CONDICIONAL: uma ação primária "Usar estas fotos no agente (N)" para
 *     confirmar pendentes. Remoção é por foto, por exceção.
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
import { fetchWithAuthRetry } from "@/lib/auth/client-refresh"

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
// Constantes de UI
// ──────────────────────────────────────────────────────────────────────────

/** Debounce da edição de legenda antes de bater no PATCH (ms). */
const CAPTION_DEBOUNCE_MS = 600

type PatchImageBody =
  | { deleted: true }
  | { caption: string }
  | { confirmed: boolean }

// ──────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────

export interface ImagesPreviewPanelProps {
  /** Projeto Builder dono das imagens (vai no path do bulk). */
  projectId: string
  /** Lista canônica vinda do pai (o card é dono do fetch da lista). */
  images: CuratedImage[]
  /** `true` enquanto a lista ainda está carregando (1º fetch / poll). */
  loading: boolean
  /** Tokens do design system (useAppTokens via props.tokens). */
  tokens: AppTokens
  /** Desabilita toda a curadoria (ex.: card em streaming). */
  disabled?: boolean
  /** Repuxa a lista canônica após patch/bulk (refetch do card). */
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
  const [pendingRequests, setPendingRequests] = React.useState(0)

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

  // ── Contador do footer condicional ────────────────────────────────────────
  // Pendentes de curadoria (confirmedAt == null) → "Usar estas fotos... (N)".
  const pendingApproveCount = React.useMemo(
    () => images.filter((i) => i.confirmedAt == null).length,
    [images],
  )

  const busy = pendingRequests > 0

  // ── Handlers de curadoria ─────────────────────────────────────────────────

  const runRequest = React.useCallback(async (task: () => Promise<boolean>) => {
    setPendingRequests((count) => count + 1)
    try {
      return await task()
    } finally {
      setPendingRequests((count) => Math.max(0, count - 1))
    }
  }, [])

  const patchSourceImage = React.useCallback(
    (imageId: string, body: PatchImageBody) =>
      runRequest(async () => {
        const res = await fetchWithAuthRetry(
          `/api/v1/builder/sources/images/${imageId}`,
          {
            method: "PATCH",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
          { notifyOnAuthFailure: true },
        )
        return res.ok
      }),
    [runRequest],
  )

  const approvePendingImages = React.useCallback(
    () =>
      runRequest(async () => {
        const res = await fetchWithAuthRetry(
          `/api/v1/builder/projects/${projectId}/sources/images/bulk`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "approve_all" }),
          },
          { notifyOnAuthFailure: true },
        )
        return res.ok
      }),
    [projectId, runRequest],
  )

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
   * no sucesso, repuxa a lista canônica. Se o PATCH falhar, libera o id do
   * fade-out para o usuário poder tentar de novo.
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
      void patchSourceImage(imageId, { deleted: true })
        .then((ok) => {
          if (ok) {
            onRefetch()
          } else {
            clearDeleting(imageId)
          }
        })
        .catch(() => clearDeleting(imageId))
    },
    [clearDeleting, disabled, onRefetch, patchSourceImage],
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
        void patchSourceImage(imageId, { caption: next.trim() }).then((ok) => {
          if (ok) onRefetch()
        })
      }, CAPTION_DEBOUNCE_MS)
    },
    [disabled, onRefetch, patchSourceImage],
  )

  /** Confirma as fotos ainda pendentes para uso pelo agente. */
  const handleApprovePending = React.useCallback(() => {
    if (disabled) return
    const approvedCount = pendingApproveCount
    void approvePendingImages().then((ok) => {
      if (!ok) return
      onRefetch()
      if (typeof window !== "undefined" && approvedCount > 0) {
        window.dispatchEvent(
          new CustomEvent("builder:local-receipt", {
            detail: {
              message: `✓ ${approvedCount} ${approvedCount === 1 ? "foto aprovada" : "fotos aprovadas"} para o agente`,
            },
          }),
        )
      }
    })
  }, [approvePendingImages, disabled, onRefetch, pendingApproveCount])

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
  const showFooter = !loading && showApproveAll

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
          <button
            type="button"
            onClick={handleApprovePending}
            disabled={disabled || busy}
            aria-label={`Usar ${pendingApproveCount} fotos no agente`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: tokens.brandSubtle,
              borderColor: tokens.brandBorder,
              color: tokens.brandText,
            }}
          >
            Usar estas fotos no agente ({pendingApproveCount})
          </button>
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
