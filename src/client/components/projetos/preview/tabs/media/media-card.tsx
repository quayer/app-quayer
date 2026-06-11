"use client"

/**
 * Builder Media Tab — MediaCard (Onda E4, catálogo de mídia / Fase E)
 *
 * Célula PRESENTATIONAL de UM `MediaAsset` na grade de curadoria da aba "Mídias".
 * Espelha `chat/cards/sources/images-preview-card.tsx` (D3): tokens via props,
 * ZERO cor hard-coded, PT-BR, a11y; não faz fetch e não tem estado próprio — o
 * pai (`media-grid.tsx`) é dono do `useQuery`/`useMutation` e desce `tokens` +
 * handlers (`onCaptionChange`, `onDelete`).
 *
 * RENDER POR TIPO (discriminado por `mediaType`):
 *   - 'image'    → thumbnail `aspect-square object-cover` (<img>), só se `url != null`;
 *   - 'video'    → <video> com `poster`/placeholder + ícone Play overlay, só se `url != null`;
 *   - 'document' → card com ícone FileText + legenda/nome (SEM <img>/<video>).
 *
 * Diferença vs D3: a edição de legenda é INLINE no próprio card (input controlado
 * por `draft`), não em lightbox — mais simples e direto para o catálogo.
 *
 * Badge de origem no canto: `source` ('upload'|'gallery'|'pricing') → rótulo PT-BR
 * (Upload|Galeria|Preços), pintado com tokens de marca.
 *
 * Pendência visível: `confirmedAt == null` → badge "Pendente" (tokens warning) +
 * botão "Liberar para o agente" (PATCH { confirmed: true } via pai). O runtime SÓ
 * envia mídia confirmada — sem o badge, a aba mostrava o item idêntico aos demais
 * enquanto o agente o ignorava (catálogo da aba ≠ catálogo do agente).
 *
 * Segurança de mídia: `<img src>` / `<video src>` recebem APENAS `item.url`
 * (signed URL https on-read OU externalUrl https, vindas do backend). Quando
 * `url == null` (assinatura falhou — fail-safe por item da rota E4) renderizamos
 * um placeholder com ícone — NUNCA renderizamos `storageKey` cru. `storageKey`
 * não chega ao FE de propósito.
 */

import * as React from "react"
import { Check, FileText, ImageOff, Play, VideoOff, X } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

// ──────────────────────────────────────────────────────────────────────────
// Tipo compartilhado da grade (espelha MediaAssetItem de media-curation.routes.ts)
// ──────────────────────────────────────────────────────────────────────────

/** Tipos de mídia do catálogo (espelha `MediaAsset.mediaType` no server). */
export type MediaAssetType = "image" | "video" | "document"

/** Origem do asset no catálogo (espelha `MediaAsset.source` no server). */
export type MediaAssetSource = "upload" | "gallery" | "pricing"

/**
 * Forma EXATA de um `MediaAsset` curável devolvido por
 * `GET /builder/projects/:id/media` (MediaAssetItem no route file E4).
 * Definida no FE para não acoplar os componentes de UI ao módulo de servidor;
 * o irmão `media-grid.tsx` reusa este TYPE importando-o daqui (espelha o padrão
 * `CuratedImage` da Onda D3).
 *
 * `storageKey` NÃO existe aqui de propósito — só a `url` assinada (ou o
 * `externalUrl` https direto) chega ao FE.
 */
export interface MediaAssetItem {
  id: string
  /** Signed URL on-read (BUCKETS.MEDIA, https) OU externalUrl https; `null` se a assinatura falhar. */
  url: string | null
  mediaType: MediaAssetType
  caption: string | null
  /** Categoria livre (ex.: nome do serviço para itens de preço); pode ser `null`. */
  category: string | null
  source: MediaAssetSource
  mimeType: string | null
  /** ISO; `null` = pendente de confirmação (aditivo, igual a D2). */
  confirmedAt: string | null
}

// ──────────────────────────────────────────────────────────────────────────
// Constantes / helpers de display (puros, sem efeito colateral)
// ──────────────────────────────────────────────────────────────────────────

/** Rótulo PT-BR da origem para o badge do card. */
const SOURCE_LABEL: Record<MediaAssetSource, string> = {
  upload: "Upload",
  gallery: "Galeria",
  pricing: "Preços",
}

/**
 * Nome amigável exibido em documentos (e como `aria`/`alt`): usa a legenda se
 * houver; senão deriva uma rótulo curto a partir do mimeType (ex.: "PDF"); senão
 * cai para um genérico. Nunca expõe storageKey (que nem chega ao FE).
 */
function documentLabel(item: MediaAssetItem): string {
  const caption = item.caption?.trim()
  if (caption) return caption
  const ext = extensionFromMime(item.mimeType)
  return ext ? `Documento ${ext}` : "Documento"
}

/**
 * Garante que o browser pinte o PRIMEIRO FRAME do vídeo como thumbnail estático.
 * Com `preload="metadata"` alguns browsers só rasterizam o frame quando há um
 * fragmento de tempo na URL; anexamos `#t=0.001` (início do vídeo) para forçar o
 * primeiro frame sem autoplay. Só toca em URLs https assinadas (já validadas pelo
 * chamador); se houver hash/fragmento, mantemos a URL intacta para não corromper
 * uma signed URL com assinatura no fragmento.
 */
function videoThumbSrc(url: string): string {
  return url.includes("#") ? url : `${url}#t=0.001`
}

/** Extrai uma extensão/rótulo curto em maiúsculas a partir do mimeType (ou null). */
function extensionFromMime(mimeType: string | null): string | null {
  if (!mimeType) return null
  // application/pdf → PDF ; image/png → PNG ; video/mp4 → MP4
  const subtype = mimeType.split("/")[1]
  if (!subtype) return null
  // Remove sufixos como "+xml" e prefixos como "x-".
  const cleaned = subtype.split("+")[0].replace(/^x-/, "")
  return cleaned.toUpperCase()
}

// ──────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────

export interface MediaCardProps {
  /** Asset de mídia curável (uma célula da grade). */
  item: MediaAssetItem
  /** Valor controlado da legenda em edição (draft do pai); cai para `item.caption`. */
  caption: string
  /** `true` enquanto o patch `{ deleted:true }` está em voo → fade-out + borda perigo. */
  deleting: boolean
  /** Desabilita as interações (ex.: grade em submit). */
  disabled?: boolean
  /** Tokens do design system (descem do grid — o componente não chama useAppTokens). */
  tokens: AppTokens
  /** Pai aplica o debounce → patchMediaAsset `{ caption }`. */
  onCaptionChange: (next: string) => void
  /** Pai dispara patchMediaAsset `{ deleted:true }`. */
  onDelete: () => void
  /** Pai dispara patchMediaAsset `{ confirmed:true }` (libera mídia pendente). */
  onConfirm: () => void
}

// ──────────────────────────────────────────────────────────────────────────
// MediaCard
// ──────────────────────────────────────────────────────────────────────────

/**
 * MediaCard — célula visual de um `MediaAsset` na grade de curadoria.
 * Render discriminado por `mediaType`, badge de origem, legenda editável inline
 * e `[x]` de remoção no hover. 100% token-driven.
 */
export function MediaCard({
  item,
  caption,
  deleting,
  disabled = false,
  tokens,
  onCaptionChange,
  onDelete,
  onConfirm,
}: MediaCardProps): React.JSX.Element {
  const interactionsDisabled = disabled || deleting

  // A signed URL (ou externalUrl https) é a única fonte aceita no <img>/<video>.
  // null → placeholder, NUNCA renderiza storageKey (que nem chega ao FE).
  const hasMedia = typeof item.url === "string" && item.url.length > 0
  const altText = documentLabel(item)
  const sourceLabel = SOURCE_LABEL[item.source]
  // Pendente de curadoria: o runtime NÃO envia esta mídia até ser confirmada.
  const isPending = item.confirmedAt === null

  return (
    <div
      className="group/card relative flex flex-col gap-2 rounded-lg border p-2 transition-all duration-300"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: deleting ? tokens.dangerText : tokens.divider,
        opacity: deleting ? 0.4 : 1,
      }}
    >
      {/* ── Área visual por tipo ─────────────────────────────────────────── */}
      <div
        className="relative aspect-square w-full overflow-hidden rounded-md"
        style={{ backgroundColor: tokens.hoverBg }}
      >
        <MediaThumb
          item={item}
          hasMedia={hasMedia}
          altText={altText}
          tokens={tokens}
        />

        {/* Badge de origem (canto inferior esquerdo). */}
        <span
          className="absolute bottom-1.5 left-1.5 z-10 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brandText,
          }}
        >
          {sourceLabel}
        </span>

        {/* Badge "Pendente" (canto superior esquerdo) — runtime não envia até confirmar. */}
        {isPending && (
          <span
            className="absolute left-1.5 top-1.5 z-10 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none"
            style={{
              backgroundColor: tokens.warningSubtle,
              color: tokens.warningText,
            }}
          >
            Pendente
          </span>
        )}
      </div>

      {/* ── [x] remover (hover desktop / sempre em touch) ────────────────── */}
      <div className="pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          disabled={interactionsDisabled}
          aria-label={`Remover ${altText}`}
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

      {/* ── Legenda editável INLINE → onCaptionChange (pai aplica debounce) ─ */}
      <textarea
        value={caption}
        onChange={(event) => onCaptionChange(event.target.value)}
        disabled={interactionsDisabled}
        rows={2}
        maxLength={2000}
        aria-label={`Descrição de ${altText}`}
        placeholder="Adicione uma descrição…"
        className="min-h-[2.5rem] w-full resize-none rounded-md border px-2 py-1 text-[12px] leading-snug transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: tokens.bgElevated,
          borderColor: tokens.divider,
          color: tokens.textSecondary,
        }}
      />

      {/* ── Confirmação de mídia pendente (libera para o agente enviar) ───── */}
      {isPending && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={interactionsDisabled}
          aria-label={`Liberar ${altText} para o agente`}
          className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: tokens.bgElevated,
            borderColor: tokens.divider,
            color: tokens.successText,
          }}
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          Liberar para o agente
        </button>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// MediaThumb — render discriminado por mediaType (interno, presentational)
// ──────────────────────────────────────────────────────────────────────────

interface MediaThumbProps {
  item: MediaAssetItem
  hasMedia: boolean
  altText: string
  tokens: AppTokens
}

/**
 * Render da área visual por tipo de mídia. Mantido interno ao card (não exportado)
 * para concentrar a lógica de placeholder/segurança num só lugar. `<img>`/`<video>`
 * só renderizam com `item.url` (signed/externalUrl https); senão, placeholder.
 */
function MediaThumb({
  item,
  hasMedia,
  altText,
  tokens,
}: MediaThumbProps): React.JSX.Element {
  // ── Documento: nunca usa <img>/<video> — ícone + nome/extensão. ──────────
  if (item.mediaType === "document") {
    const ext = extensionFromMime(item.mimeType)
    return (
      <span
        className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center"
        style={{ color: tokens.textSecondary }}
      >
        <FileText className="h-8 w-8" aria-hidden="true" />
        <span className="line-clamp-2 text-[11px] font-medium leading-tight">
          {altText}
        </span>
        {ext && (
          <span className="text-[10px]" style={{ color: tokens.textTertiary }}>
            {ext}
          </span>
        )}
      </span>
    )
  }

  // ── Vídeo: thumbnail REAL (primeiro frame) + ícone Play overlay (só com url). ─
  if (item.mediaType === "video") {
    // Guarda em `item.url` direto (não em `hasMedia`) p/ o TS narrow string|null → string.
    if (!hasMedia || item.url == null) {
      return (
        <Placeholder
          icon={<VideoOff className="h-5 w-5" aria-hidden="true" />}
          label="Vídeo indisponível"
          tokens={tokens}
        />
      )
    }
    return (
      <VideoThumb url={videoThumbSrc(item.url)} altText={altText} tokens={tokens} />
    )
  }

  // ── Imagem: thumbnail object-cover (só com url). ─────────────────────────
  if (!hasMedia) {
    return (
      <Placeholder
        icon={<ImageOff className="h-5 w-5" aria-hidden="true" />}
        label="Pré-visualização indisponível"
        tokens={tokens}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url ?? undefined}
      alt={altText}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
    />
  )
}

// ──────────────────────────────────────────────────────────────────────────
// VideoThumb — primeiro frame do vídeo + overlay de play (interno, presentational)
// ──────────────────────────────────────────────────────────────────────────

interface VideoThumbProps {
  /** Signed URL https já preparada com o fragmento `#t=` (via `videoThumbSrc`). */
  url: string
  altText: string
  tokens: AppTokens
}

/**
 * Thumbnail REAL de vídeo: renderiza o PRIMEIRO FRAME via `<video preload="metadata">`
 * (estático — sem `autoplay`, sem `controls` na grade) com o ícone Play sobreposto.
 * O player com controles vive no runtime/preview; aqui é só o frame estático (a
 * grade é de curadoria — não abre player ao clicar).
 *
 * a11y: o `<video>` recebe `aria-label` (descreve que é a prévia do vídeo) e o
 * overlay de play é decorativo (`aria-hidden`). `muted`/`playsInline` evitam som e
 * fullscreen automático em iOS quando o card é tocado.
 */
function VideoThumb({ url, altText, tokens }: VideoThumbProps): React.JSX.Element {
  return (
    <>
      <video
        src={url}
        preload="metadata"
        muted
        playsInline
        // Sem autoplay/loop/controls: queremos só o frame inicial estático.
        aria-label={`Prévia do vídeo ${altText}`}
        className="h-full w-full object-cover"
      />
      {/* Overlay com ícone Play (decorativo — o player real vive no runtime). */}
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full shadow-sm"
          style={{
            backgroundColor: tokens.bgElevated,
            color: tokens.textPrimary,
          }}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Placeholder — estado vazio/indisponível (interno, presentational)
// ──────────────────────────────────────────────────────────────────────────

interface PlaceholderProps {
  icon: React.ReactNode
  label: string
  tokens: AppTokens
}

/** Placeholder centralizado para mídia sem URL assinada (fail-safe por item). */
function Placeholder({
  icon,
  label,
  tokens,
}: PlaceholderProps): React.JSX.Element {
  return (
    <span
      className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center"
      style={{ color: tokens.textTertiary }}
    >
      {icon}
      <span className="text-[10px] leading-tight">{label}</span>
    </span>
  )
}

export default MediaCard
