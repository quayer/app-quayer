"use client"

/**
 * PricingImageUploader — controle inline "Adicionar foto" por linha do card de
 * preço (Onda B / G5b, catálogo visual). Cada item da tabela pode ter UMA
 * imagem; este componente resolve essa imagem e devolve o `imageUrl` para a
 * linha via `onChange`.
 *
 * Fluxo principal (upload):
 *   - clique → escolhe arquivo → POST multipart para
 *     `/api/v1/builder/pricing-image/upload` (FormData: projectId + file).
 *   - a rota (Next route handler irmã de knowledge/upload) faz auth por cookie/
 *     Bearer + escopo currentOrgId, valida magic-bytes (jpg/png/webp/gif), cap
 *     5 MB, sobe pro Supabase Storage e devolve `{ imageUrl }` (signed URL).
 *   - mostra spinner enquanto envia, depois preview + botões Trocar/Remover.
 *
 * Fallback colapsável "Tenho a URL pronta":
 *   - espelha o <details> do Orayon. Se o Storage estiver indisponível (rota
 *     responde 503) ou o usuário já tiver a imagem hospedada (Instagram, Drive,
 *     site), ele cola a URL — validada por `^https?://` — e ela vira o
 *     `imageUrl`. O campo final `item.imageUrl?` é satisfeito por QUALQUER um
 *     dos dois caminhos; ambos chegam como string https validada.
 *
 * Tokens-driven (useAppTokens via props.tokens), ZERO cor hard-coded, PT-BR.
 * PRESENTATIONAL: não conhece o estado do card — só resolve a URL e emite.
 */

import * as React from "react"
import { ImagePlus, Loader2, Trash2, Upload, X } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

/** Tipos de imagem aceitos — espelha o ACCEPT validado na rota de upload. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

/** Endpoint multipart (Next route handler, fora do Igniter). */
const UPLOAD_ENDPOINT = "/api/v1/builder/pricing-image/upload"

/** `true` quando a string parece uma URL http(s) válida (fallback colado). */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

/**
 * Forma do JSON devolvido por `UPLOAD_ENDPOINT`. Na trilha feliz vem
 * `{ imageUrl }`; em qualquer erro (incl. 503 Storage indisponível) vem
 * `{ error }`. Mantemos os dois opcionais para parse defensivo.
 */
interface UploadResponse {
  imageUrl?: string
  error?: string
}

/** Mensagens PT-BR por status HTTP — sem expor detalhe interno ao usuário. */
function errorMessageForStatus(status: number, fallback?: string): string {
  if (status === 401 || status === 403) {
    return "Sessão expirada. Recarregue a página e tente de novo."
  }
  if (status === 413) {
    return "Imagem muito grande. O limite é 5 MB."
  }
  if (status === 415 || status === 422) {
    return "Formato não suportado. Use JPG, PNG, WEBP ou GIF."
  }
  if (status === 503) {
    return "Upload indisponível agora. Cole a URL da imagem abaixo."
  }
  return fallback && fallback.trim().length > 0
    ? fallback
    : "Não foi possível enviar a imagem. Tente novamente."
}

/** Contrato consumido pela linha do card de preço (pricing-card.tsx, Onda B). */
export interface PricingImageUploaderProps {
  /** Projeto Builder dono do item — vai no FormData para escopo/path no storage. */
  projectId: string
  /** URL já resolvida (upload anterior ou colada). `undefined` = sem imagem. */
  value?: string
  /** Desabilita todas as interações (ex.: card em submit). */
  disabled?: boolean
  /** Tokens do design system (useAppTokens). */
  tokens: AppTokens
  /** Emite a URL resolvida (ou `undefined` ao remover) para a linha. */
  onChange: (imageUrl: string | undefined) => void
}

/**
 * PricingImageUploader — vê `value` como fonte da verdade da imagem da linha.
 * O preview e o draft do fallback derivam de `value`; o estado local só guarda
 * o que é puramente de UI (enviando, erro, fallback aberto, draft do input).
 */
export function PricingImageUploader({
  projectId,
  value,
  disabled = false,
  tokens,
  onChange,
}: PricingImageUploaderProps): React.JSX.Element {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  // Aborta o upload anterior se o usuário trocar a imagem no meio do envio.
  const abortRef = React.useRef<AbortController | null>(null)

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [showFallback, setShowFallback] = React.useState(false)
  // Draft do input de URL colada — espelha `value` quando ele já é uma URL.
  const [urlDraft, setUrlDraft] = React.useState<string>(value ?? "")

  // Mantém o draft sincronizado quando `value` muda por fora (ex.: reset do card).
  React.useEffect(() => {
    setUrlDraft(value ?? "")
  }, [value])

  // Cancela qualquer upload pendente ao desmontar.
  React.useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const hasImage = typeof value === "string" && value.trim().length > 0

  const handleFiles = React.useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (!file || disabled) return

      // Substitui um envio anterior em voo por este.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setBusy(true)
      setError(null)

      try {
        const fd = new FormData()
        fd.append("projectId", projectId)
        fd.append("file", file)

        const res = await fetch(UPLOAD_ENDPOINT, {
          method: "POST",
          body: fd,
          credentials: "include",
          signal: controller.signal,
        })

        // Parse defensivo: rota sempre devolve JSON, mas blindamos.
        let payload: UploadResponse = {}
        try {
          payload = (await res.json()) as UploadResponse
        } catch {
          payload = {}
        }

        if (!res.ok || !payload.imageUrl) {
          const message = errorMessageForStatus(res.status, payload.error)
          setError(message)
          // 503 = storage off → revela o fallback de URL automaticamente.
          if (res.status === 503) setShowFallback(true)
          return
        }

        onChange(payload.imageUrl)
        setUrlDraft(payload.imageUrl)
      } catch (err) {
        // Ignora o abort intencional (troca de imagem no meio do envio).
        if (err instanceof DOMException && err.name === "AbortError") return
        setError("Falha de conexão ao enviar a imagem. Tente novamente.")
      } finally {
        // Só limpa o busy se este controller ainda é o atual.
        if (abortRef.current === controller) {
          abortRef.current = null
          setBusy(false)
        }
      }
    },
    [disabled, onChange, projectId],
  )

  const openFilePicker = React.useCallback(() => {
    if (disabled || busy) return
    inputRef.current?.click()
  }, [busy, disabled])

  const handleRemove = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setError(null)
    setUrlDraft("")
    onChange(undefined)
  }, [onChange])

  const handleUrlDraftChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value
      setUrlDraft(raw)
      const trimmed = raw.trim().slice(0, 2000)
      if (trimmed.length === 0) {
        // Esvaziar o fallback limpa a imagem (se ela veio de uma URL colada).
        if (!busy) {
          setError(null)
          onChange(undefined)
        }
        return
      }
      if (isHttpUrl(trimmed)) {
        setError(null)
        onChange(trimmed)
      }
    },
    [busy, onChange],
  )

  const fallbackInvalid = urlDraft.trim().length > 0 && !isHttpUrl(urlDraft)

  return (
    <div className="flex flex-col gap-2">
      {/* Input de arquivo nativo, escondido — disparado pelos botões. */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          void handleFiles(event.target.files)
          // Reseta para permitir re-selecionar o mesmo arquivo.
          if (inputRef.current) inputRef.current.value = ""
        }}
      />

      {hasImage ? (
        // Preview + ações Trocar / Remover.
        <div
          className="overflow-hidden rounded-md border"
          style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Pré-visualização da foto do serviço"
            className="block max-h-40 w-full object-contain"
            style={{ backgroundColor: tokens.bgSurface }}
          />
          <div className="flex items-center justify-end gap-1.5 p-2">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={disabled || busy}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.divider,
                color: tokens.textSecondary,
              }}
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="h-3 w-3" aria-hidden="true" />
              )}
              {busy ? "Enviando…" : "Trocar"}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || busy}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.divider,
                color: tokens.dangerText,
              }}
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" /> Remover
            </button>
          </div>
        </div>
      ) : (
        // Sem imagem ainda → botão "Adicionar foto".
        <button
          type="button"
          onClick={openFilePicker}
          disabled={disabled || busy}
          aria-label="Adicionar foto do serviço"
          className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: tokens.bgBase,
            borderColor: tokens.divider,
            color: tokens.textSecondary,
          }}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {busy ? "Enviando…" : "Adicionar foto"}
        </button>
      )}

      {error ? (
        <p
          role="alert"
          className="text-[11px] leading-snug"
          style={{ color: tokens.dangerText }}
        >
          {error}
        </p>
      ) : null}

      {/* Fallback colapsável — espelha o <details> do Orayon. */}
      <details
        open={showFallback}
        onToggle={(event) =>
          setShowFallback((event.currentTarget as HTMLDetailsElement).open)
        }
      >
        <summary
          className="cursor-pointer select-none text-[11px]"
          style={{ color: tokens.textTertiary }}
        >
          Tenho a URL pronta (Instagram, Drive, site)
        </summary>
        <Input
          value={urlDraft}
          onChange={handleUrlDraftChange}
          placeholder="https://..."
          inputMode="url"
          disabled={disabled}
          aria-label="URL da foto do serviço"
          aria-invalid={fallbackInvalid}
          className="mt-2 h-8 text-[12px]"
          style={
            fallbackInvalid ? { borderColor: tokens.dangerText } : undefined
          }
        />
        {fallbackInvalid ? (
          <p
            className="mt-1 flex items-center gap-1 text-[11px]"
            style={{ color: tokens.dangerText }}
          >
            <X className="h-3 w-3" aria-hidden="true" />
            A URL precisa começar com http:// ou https://
          </p>
        ) : null}
      </details>
    </div>
  )
}

export default PricingImageUploader
