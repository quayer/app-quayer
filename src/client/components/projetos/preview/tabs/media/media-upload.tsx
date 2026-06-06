"use client"

/**
 * MediaUpload — entrada de CURADORIA do catálogo de mídia (Fase E / E4).
 *
 * Dropzone + file-picker que sobe foto/vídeo/PDF para o catálogo do projeto via
 * POST multipart /api/v1/builder/media/upload (route handler, FORA do catch-all
 * Igniter — exatamente como o `addPdf` de knowledge-add-source.tsx). Não é Igniter
 * porque a rota de upload é multipart.
 *
 * Envia FormData { projectId, file, caption? }. Usa XMLHttpRequest para refletir
 * progresso real (xhr.upload.onprogress) — importante para vídeo de até 16MB e
 * PDF de até 100MB. Faz pré-checagem amistosa de tamanho por família (espelha
 * CAPS_BY_TYPE do E1) antes de subir, e traduz os status do backend
 * (415 / 413 / 503) em mensagens PT-BR.
 *
 * Só ingestão/curadoria — NÃO envia mídia no WhatsApp (envio é do runtime).
 * Ao concluir, chama onUploaded() para a aba recarregar a grade.
 */

import * as React from "react"
import { UploadCloud, Loader2, X } from "lucide-react"

import { useAppTokens } from "@/client/hooks/use-app-tokens"

/** Tipos declarados aceitos (espelha ACCEPTED_DECLARED do route handler E1). */
const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf"

/** Famílias de mídia para a pré-checagem de cap (espelha CAPS_BY_TYPE do E1). */
type MediaFamily = "image" | "video" | "document"

/** Caps por família, em bytes (limites do WhatsApp — iguais ao backend). */
const CAPS_BY_FAMILY: Record<MediaFamily, number> = {
  image: 5 * 1024 * 1024, // 5 MB
  video: 16 * 1024 * 1024, // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
}

/** Rótulo amigável do cap por família (para a mensagem de erro pré-upload). */
const CAP_LABEL: Record<MediaFamily, string> = {
  image: "imagem 5MB",
  video: "vídeo 16MB",
  document: "PDF 100MB",
}

/** Infere a família a partir do MIME declarado (pré-checagem amistosa apenas). */
function familyFromMime(mime: string): MediaFamily | null {
  const m = mime.toLowerCase()
  if (m.startsWith("image/")) return "image"
  if (m.startsWith("video/")) return "video"
  if (m === "application/pdf") return "document"
  return null
}

/** Erro do FE de tamanho — devolve null se passar na pré-checagem. */
function precheckSize(file: File): string | null {
  const family = familyFromMime(file.type)
  // MIME desconhecido/ausente: deixa o backend decidir (sniff é a verdade).
  if (!family) return null
  if (file.size > CAPS_BY_FAMILY[family]) {
    return `Arquivo grande demais (${CAP_LABEL[family]})`
  }
  return null
}

/** Traduz status HTTP + corpo do backend em mensagem PT-BR. */
function messageForStatus(status: number, errorCode: string | null): string {
  if (status === 415) {
    return "Tipo não suportado (use imagem, vídeo MP4 ou PDF)"
  }
  if (status === 413) {
    return "Arquivo grande demais (imagem 5MB, vídeo 16MB, PDF 100MB)"
  }
  if (status === 503) {
    return "Armazenamento indisponível"
  }
  if (status === 401) {
    return "Sessão expirada — entre novamente"
  }
  // Fallbacks por código conhecido, caso o status seja genérico.
  switch (errorCode) {
    case "unsupported_media":
    case "invalid_media_signature":
      return "Tipo não suportado (use imagem, vídeo MP4 ou PDF)"
    case "file_too_large":
      return "Arquivo grande demais (imagem 5MB, vídeo 16MB, PDF 100MB)"
    case "storage_unavailable":
    case "collection_unavailable":
      return "Armazenamento indisponível"
    default:
      return "Falha no upload da mídia"
  }
}

/** Tenta extrair o `error` do corpo JSON (route handler), sem lançar. */
function parseErrorCode(responseText: string): string | null {
  try {
    const j = JSON.parse(responseText) as { error?: string }
    return typeof j?.error === "string" ? j.error : null
  } catch {
    return null
  }
}

/**
 * Sobe um arquivo via XHR para acompanhar o progresso real. Resolve em sucesso,
 * rejeita com a mensagem PT-BR já traduzida em erro.
 */
function uploadWithProgress(
  file: File,
  projectId: string,
  caption: string | null,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const fd = new FormData()
    fd.append("projectId", projectId)
    fd.append("file", file)
    if (caption) fd.append("caption", caption)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/v1/builder/media/upload")
    xhr.withCredentials = true

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        const code = parseErrorCode(xhr.responseText)
        reject(new Error(messageForStatus(xhr.status, code)))
      }
    }

    xhr.onerror = () => reject(new Error("Falha de rede no upload da mídia"))
    xhr.onabort = () => reject(new Error("Upload cancelado"))

    xhr.send(fd)
  })
}

export function MediaUpload({
  projectId,
  onUploaded,
}: {
  projectId: string
  onUploaded: () => void
}) {
  const { tokens } = useAppTokens()
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const handleFile = React.useCallback(
    async (file: File) => {
      setError(null)

      const sizeError = precheckSize(file)
      if (sizeError) {
        setError(sizeError)
        return
      }

      setBusy(true)
      setProgress(0)
      try {
        await uploadWithProgress(file, projectId, null, setProgress)
        onUploaded()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha no upload da mídia")
      } finally {
        setBusy(false)
        setProgress(0)
        if (fileRef.current) fileRef.current.value = ""
      }
    },
    [projectId, onUploaded],
  )

  const onDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      if (busy) return
      const file = e.dataTransfer.files?.[0]
      if (file) void handleFile(file)
    },
    [busy, handleFile],
  )

  return (
    <div className="flex flex-col gap-2">
      {/* Dropzone + clique para escolher */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Enviar mídia para o catálogo (imagem, vídeo MP4 ou PDF)"
        aria-busy={busy}
        aria-disabled={busy}
        onClick={() => {
          if (!busy) fileRef.current?.click()
        }}
        onKeyDown={(e) => {
          if (busy) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            fileRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
        style={{
          borderColor: dragOver ? tokens.brandBorder : tokens.divider,
          backgroundColor: dragOver ? tokens.brandSubtle : tokens.bgSurface,
          opacity: busy ? 0.7 : 1,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />

        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: tokens.brand }} />
        ) : (
          <UploadCloud className="h-6 w-6" style={{ color: tokens.brandText }} />
        )}

        <p className="text-[13px] font-medium" style={{ color: tokens.textPrimary }}>
          {busy ? "Enviando…" : "Arraste um arquivo ou clique para enviar"}
        </p>
        <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
          Imagem (5MB), vídeo MP4 (16MB) ou PDF (100MB)
        </p>
      </div>

      {/* Barra de progresso (token-driven) */}
      {busy && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: tokens.bgElevated }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso do upload"
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${progress}%`,
              backgroundColor: tokens.brand,
            }}
          />
        </div>
      )}

      {/* Erro */}
      {error && (
        <div
          className="flex items-start justify-between gap-2 rounded-md px-2.5 py-1.5"
          style={{ backgroundColor: tokens.dangerSubtle }}
        >
          <p className="text-[11px]" style={{ color: tokens.dangerText }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dispensar mensagem de erro"
            className="shrink-0 rounded outline-none focus-visible:ring-2"
            style={{ color: tokens.dangerText }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
