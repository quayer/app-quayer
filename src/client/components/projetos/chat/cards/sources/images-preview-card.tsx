"use client"

/**
 * Builder Cards — ImagesPreviewCard (Onda D3, vision/G2)
 *
 * Porta do `ImagesPreviewCard.tsx` do Orayon, adaptada ao DS da Quayer
 * (tokens via props, ZERO cor hard-coded, PT-BR, a11y). É a célula visual de
 * UMA imagem curável dentro da galeria do card `source_progress`.
 *
 * Fluxo opt-out v3 (default = visível = aprovada):
 *   - thumbnail `aspect-square object-cover` clicável → onView (abre o lightbox,
 *     onde a edição de legenda de fato acontece);
 *   - `[x]` no canto (hover desktop / sempre em touch) → onDelete (o pai dispara
 *     patchSourceImage { deleted:true }); enquanto o patch está em voo, `deleting`
 *     pinta a borda de perigo + fade-out 300ms;
 *   - preview de legenda READ-ONLY com `stripHashtags` (remove `#xxx`/`@menção`
 *     SÓ no DISPLAY — nunca toca no dado real). Clicar na legenda também chama
 *     onView (a edição vive no lightbox).
 *   - SEM overlay Check e SEM badge "Aprovada": visível já é aprovada.
 *
 * Segurança de mídia: o `<img src>` recebe APENAS `image.imageUrl` (signed URL
 * https on-read, vinda do backend). Quando `imageUrl == null` (assinatura falhou,
 * fail-safe por item da rota D2) renderizamos um placeholder com ícone ImageOff —
 * NUNCA renderizamos `storageKey`/`originalUrl` cru no `<img>`.
 *
 * PRESENTATIONAL: não faz fetch, não tem estado próprio. O pai (panel) é dono do
 * useQuery/mutations e desce `tokens` + handlers.
 */

import * as React from "react"
import { ImageOff, X } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

/**
 * Forma EXATA de uma imagem curável devolvida por
 * `GET /builder/projects/:id/sources/images` (CuratedImage no route file).
 * Definida no FE para não acoplar os componentes de UI ao módulo de servidor;
 * os irmãos da Onda D3 (panel/lightbox) reusam este TYPE importando-o daqui.
 *
 * `storageKey` NÃO existe aqui de propósito — só a `imageUrl` assinada chega ao FE.
 */
export interface CuratedImage {
  id: string
  /** Chave de agrupamento por fonte na galeria. */
  sourceId: string
  collectionId: string
  /** URL de origem (mostrada no lightbox; NUNCA usada como `<img src>`). */
  originalUrl: string
  /** Signed URL on-read (BUCKETS.MEDIA), https; `null` se a assinatura falhar. */
  imageUrl: string | null
  caption: string | null
  width: number | null
  height: number | null
  sizeBytes: number | null
  mimeType: string | null
  /** ISO; `null` = pendente de curadoria (candidata a approve_all). */
  confirmedAt: string | null
  /** ISO (ordenação estável). */
  createdAt: string
}

/** Limite de caracteres do preview de legenda (resto vira reticências). */
const CAPTION_MAX = 140

/**
 * Remove hashtags (`#xxx`) e @menções (`@nome`) APENAS para o display do preview.
 * O dado real (image.caption) é preservado — a edição no lightbox vê a legenda crua.
 * Regex unicode (`\p{L}`) para cobrir acentos/letras não-ASCII.
 */
export function stripHashtags(text: string): string {
  return text
    .replace(/(^|\s)[#@][\p{L}0-9_.]+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

export interface ImagesPreviewCardProps {
  /** Imagem curável (uma célula da galeria). */
  image: CuratedImage
  /** `true` enquanto o patch { deleted:true } está em voo → fade-out + borda perigo. */
  deleting: boolean
  /** Desabilita as interações (ex.: card em streaming/submit). */
  disabled?: boolean
  /** Tokens do design system (descem do card — o componente não chama useAppTokens). */
  tokens: AppTokens
  /** Pai dispara patchSourceImage { deleted:true }. */
  onDelete: () => void
  /** Abre o lightbox nesta imagem (também é o caminho de edição da legenda). */
  onView: () => void
}

/**
 * ImagesPreviewCard — célula visual de uma imagem na galeria de curadoria.
 * Opt-out v3: sem Check/badge; só o thumbnail clicável + `[x]` de remoção + preview
 * de legenda read-only. 100% token-driven.
 */
export function ImagesPreviewCard({
  image,
  deleting,
  disabled = false,
  tokens,
  onDelete,
  onView,
}: ImagesPreviewCardProps): React.JSX.Element {
  const interactionsDisabled = disabled || deleting

  // Preview de legenda: strip de #/@ só no DISPLAY + truncamento ~140 chars.
  const cleaned = stripHashtags(image.caption ?? "")
  const previewText =
    cleaned.length > CAPTION_MAX
      ? `${cleaned.slice(0, CAPTION_MAX).trim()}…`
      : cleaned
  const hasCaption = previewText.length > 0

  // A signed URL é a única fonte aceita no `<img>`. null → placeholder ImageOff.
  const hasImage =
    typeof image.imageUrl === "string" && image.imageUrl.length > 0

  return (
    <div
      className="group/card relative flex flex-col gap-2 rounded-lg border p-2 transition-all duration-300"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: deleting ? tokens.dangerText : tokens.divider,
        opacity: deleting ? 0.4 : 1,
      }}
    >
      {/* Thumbnail clicável → abre o lightbox. */}
      <button
        type="button"
        onClick={onView}
        disabled={interactionsDisabled}
        aria-label="Ver imagem em tamanho maior"
        title="Ver maior"
        className="relative aspect-square w-full overflow-hidden rounded-md transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
        style={{ backgroundColor: tokens.hoverBg }}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.imageUrl ?? undefined}
            alt={cleaned || "Foto extraída da fonte"}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center"
            style={{ color: tokens.textTertiary }}
          >
            <ImageOff className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] leading-tight">
              Pré-visualização indisponível
            </span>
          </span>
        )}
      </button>

      {/* Único overlay: [x] remover. Hover (desktop) ou sempre visível (touch). */}
      <div
        className="pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          disabled={interactionsDisabled}
          aria-label="Remover foto"
          title="Remover"
          className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: tokens.bgElevated,
            color: tokens.dangerText,
          }}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Preview de legenda READ-ONLY — clique abre a edição no lightbox. */}
      <button
        type="button"
        onClick={onView}
        disabled={interactionsDisabled}
        title="Clique para editar a descrição"
        className="min-h-[2.5rem] w-full rounded-md border border-transparent px-2 py-1 text-left text-[12px] leading-snug transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          color: hasCaption ? tokens.textSecondary : tokens.textTertiary,
        }}
      >
        {hasCaption ? (
          previewText
        ) : (
          <em style={{ color: tokens.textTertiary }}>
            Sem descrição — clique para editar
          </em>
        )}
      </button>
    </div>
  )
}

export default ImagesPreviewCard
