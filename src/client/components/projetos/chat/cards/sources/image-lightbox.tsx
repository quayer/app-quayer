"use client"

/**
 * Builder Cards — Sources / ImageLightbox (Onda D3, vision/G2 — FE do catálogo visual)
 *
 * Modal full-screen para inspeção de UMA imagem curável do catálogo de fotos
 * (zona "Catálogo de fotos" do card `source_progress`). Abre ao clicar no
 * thumbnail de um `images-preview-card`. Navega entre as imagens da MESMA fonte
 * via ← / → (wrap-around) e fecha com ESC ou no botão close NATIVO do Dialog.
 *
 * Diferenças do ImageLightbox do Orayon (porta adaptada ao DS da Quayer):
 *   - O `DialogContent` da Quayer SEMPRE renderiza o botão close embutido (não
 *     existe `showCloseButton`). Por isso NÃO duplicamos um segundo X — o ESC e o
 *     close já vêm de graça pelo Radix.
 *   - ZERO cor hard-coded: nada de `bg-black/95`. Todas as cores saem dos design
 *     tokens (`tokens.*`) via inline style — a paleta desce do pai (o card é dono
 *     do `useAppTokens()`; este componente é puramente apresentacional).
 *   - `<img src>` SÓ renderiza quando `imageUrl` (signed URL https on-read) é
 *     não-null. NUNCA renderizamos `storageKey` (que nem chega ao FE) nem a
 *     `originalUrl` crua num `<img>` — `originalUrl` aparece só como legenda/link
 *     de origem no rodapé.
 *
 * Edição de legenda: o `<textarea>` é controlado pelo pai (`drafts[current.id]`).
 * O pai DEBOUNCA o `onCaptionChange` e dispara `patchSourceImage { caption }`.
 * Aqui NÃO aplicamos `stripHashtags` — a edição é o dado real (o strip de #/@ vive
 * só no DISPLAY read-only do `images-preview-card`).
 *
 * Contrato/decisões: docs/builder/ONDA_D_VISION_PLAN.md (§ curadoria/D3).
 */

import * as React from "react"
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/client/components/ui/dialog"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

/**
 * Shape de UMA imagem curável, espelhando `CuratedImage` exposto pela rota
 * `GET /builder/projects/:id/sources/images` (source-images.routes.ts). Definido
 * localmente no FE para NÃO acoplar os componentes do catálogo ao arquivo de
 * rota do servidor — os siblings (`images-preview-card`, `images-preview-panel`)
 * reusam ESTE type. O `storageKey` deliberadamente NÃO aparece: só a `imageUrl`
 * assinada (e nullable por fail-safe) chega ao FE.
 */
export interface CuratedImage {
  id: string
  /** Chave de agrupamento por fonte (a navegação ←/→ fica dentro da fonte). */
  sourceId: string
  collectionId: string
  /** URL de origem (mostrada como legenda/link no rodapé — nunca num `<img>`). */
  originalUrl: string
  /** Signed URL on-read (https); null se a assinatura falhou — renderizar só se não-null. */
  imageUrl: string | null
  caption: string | null
  width: number | null
  height: number | null
  sizeBytes: number | null
  mimeType: string | null
  /** ISO; null = pendente de curadoria. */
  confirmedAt: string | null
  /** ISO. */
  createdAt: string
}

export interface ImageLightboxProps {
  /** Controla a visibilidade do Dialog. */
  open: boolean
  /** APENAS as imagens da MESMA fonte (o pai já filtrou o grupo). */
  images: CuratedImage[]
  /** Id da imagem atualmente em foco; `null` quando não há seleção. */
  currentId: string | null
  /** Legendas em edição (controladas pelo pai, que debounca → patch). */
  drafts: Record<string, string>
  /** Paleta de design tokens (referências a CSS variables). */
  tokens: AppTokens
  /** Bloqueia a edição da legenda (ex.: card streaming). */
  disabled?: boolean
  /** Fecha o modal (ESC/close nativos do Dialog também chamam isto). */
  onClose: () => void
  /** Navega para outra imagem da MESMA fonte (←/→ e botões). */
  onNavigate: (nextId: string) => void
  /** Edição de legenda — o pai DEBOUNCA e dispara patchSourceImage { caption }. */
  onCaptionChange: (imageId: string, next: string) => void
}

/**
 * ImageLightbox — inspeção full-screen + edição de legenda de UMA imagem,
 * com navegação wrap-around (←/→) dentro da fonte.
 *
 * @see ImageLightboxProps para o contrato exato consumido pelo pai (panel).
 */
export function ImageLightbox({
  open,
  images,
  currentId,
  drafts,
  tokens,
  disabled = false,
  onClose,
  onNavigate,
  onCaptionChange,
}: ImageLightboxProps): React.JSX.Element | null {
  const currentIndex = images.findIndex((img) => img.id === currentId)
  const current = currentIndex >= 0 ? images[currentIndex] : null

  // Navegação wrap-around: do primeiro vai pro último e vice-versa.
  const goPrev = React.useCallback(() => {
    if (images.length === 0 || currentIndex < 0) return
    const prev = (currentIndex - 1 + images.length) % images.length
    onNavigate(images[prev].id)
  }, [images, currentIndex, onNavigate])

  const goNext = React.useCallback(() => {
    if (images.length === 0 || currentIndex < 0) return
    const next = (currentIndex + 1) % images.length
    onNavigate(images[next].id)
  }, [images, currentIndex, onNavigate])

  // Setas do teclado só quando aberto. ESC já é tratado pelo Radix (fecha o
  // Dialog → onOpenChange(false) → onClose). Listener no window para captar a
  // seta mesmo quando o foco está fora do textarea.
  React.useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent): void {
      // Não sequestrar ←/→ quando o foco está num campo editável: o textarea de
      // edição de legenda vive dentro deste Dialog — senão o usuário não move o
      // cursor e é jogado para outra imagem ao digitar.
      const el = event.target as HTMLElement | null
      if (
        el &&
        (el.tagName === "TEXTAREA" ||
          el.tagName === "INPUT" ||
          el.isContentEditable)
      ) {
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        goPrev()
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        goNext()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, goPrev, goNext])

  // Sem imagem em foco → não renderiza o Dialog (evita modal vazio).
  if (!current) return null

  const hasMany = images.length > 1
  // Texto editável: rascunho do pai tem precedência sobre a legenda persistida.
  const captionValue = drafts[current.id] ?? current.caption ?? ""
  const dimensions =
    current.width && current.height
      ? `${current.width} x ${current.height}px`
      : null
  const positionLabel = hasMany
    ? `${currentIndex + 1}ª imagem de ${images.length}`
    : "1 imagem"

  // Estilo compartilhado dos botões circulares (close-nativo à parte) — cor 100%
  // por token, sem `bg-black`.
  const navButtonStyle: React.CSSProperties = {
    backgroundColor: tokens.bgElevated,
    color: tokens.textPrimary,
    borderColor: tokens.divider,
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="!max-w-5xl gap-0 overflow-hidden p-0 sm:rounded-xl"
        style={{
          backgroundColor: tokens.bgElevated,
          borderColor: tokens.divider,
          color: tokens.textPrimary,
        }}
      >
        {/* Radix exige um Title; ambos sr-only para a11y sem poluir o visual. */}
        <DialogTitle className="sr-only">Visualizar imagem</DialogTitle>
        <DialogDescription className="sr-only">
          Imagem {currentIndex + 1} de {images.length}. Use as setas do teclado
          para navegar e ESC para fechar.
        </DialogDescription>

        <div className="relative">
          {hasMany ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Anterior (←)"
                title="Anterior (←)"
                className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-opacity hover:opacity-80"
                style={navButtonStyle}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Próxima (→)"
                title="Próxima (→)"
                className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-opacity hover:opacity-80"
                style={navButtonStyle}
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          ) : null}

          <div
            className="flex max-h-[78vh] min-h-[16rem] items-center justify-center"
            style={{ backgroundColor: tokens.bgBase }}
          >
            {current.imageUrl ? (
              // imageUrl é signed https on-read (fail-safe nullable). NUNCA
              // renderizamos storageKey/originalUrl crus aqui.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.imageUrl}
                alt={current.caption ?? "Imagem da fonte"}
                className="max-h-[78vh] w-auto max-w-full object-contain"
              />
            ) : (
              <div
                className="flex flex-col items-center gap-2 px-6 py-16 text-center"
                style={{ color: tokens.textTertiary }}
              >
                <ImageOff className="h-8 w-8" aria-hidden="true" />
                <span className="text-[12px]">
                  Não foi possível carregar esta imagem.
                </span>
              </div>
            )}
          </div>
        </div>

        <div
          className="flex flex-col gap-2 border-t p-4"
          style={{ borderColor: tokens.divider, backgroundColor: tokens.bgElevated }}
        >
          <textarea
            value={captionValue}
            rows={2}
            onChange={(event) => onCaptionChange(current.id, event.target.value)}
            placeholder="Sem descrição — clique para editar"
            maxLength={500}
            disabled={disabled}
            aria-label="Editar a descrição da imagem"
            className="w-full resize-none rounded-md border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[color:var(--q-brand-border)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textPrimary,
            }}
          />
          <div
            className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
            style={{ color: tokens.textTertiary }}
          >
            <span>{positionLabel}</span>
            <span className="flex flex-wrap items-center gap-2">
              {dimensions ? <span>{dimensions}</span> : null}
              <a
                href={current.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="max-w-[18rem] truncate underline-offset-2 hover:underline"
                style={{ color: tokens.brandText }}
                title={current.originalUrl}
              >
                Ver origem
              </a>
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ImageLightbox
