"use client"

/**
 * KnowledgeAddSource — três entradas para alimentar a base: PDF (upload),
 * URL (fetch+extract) e texto colado. Cada uma dispara a ingestão e chama
 * onAdded() para o tab recarregar a lista.
 */

import * as React from "react"
import { Upload, Loader2 } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { Input } from "@/client/components/ui/input"
import { Textarea } from "@/client/components/ui/textarea"

type Busy = null | "url" | "text" | "pdf"

/** Extrai a mensagem de erro da resposta (Igniter ou route handler), com fallback. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as {
      error?: string | { message?: string }
      message?: string
    }
    if (typeof j?.error === "string") return j.error
    if (j?.error && typeof j.error.message === "string") return j.error.message
    if (typeof j?.message === "string") return j.message
    return fallback
  } catch {
    return fallback
  }
}

export function KnowledgeAddSource({
  projectId,
  onAdded,
}: {
  projectId: string
  onAdded: () => void
}) {
  const { tokens } = useAppTokens()
  const [url, setUrl] = React.useState("")
  const [text, setText] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [busy, setBusy] = React.useState<Busy>(null)
  const [error, setError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const base = `/api/v1/builder/knowledge/${projectId}`

  const addUrl = async () => {
    if (!url.trim()) return
    setBusy("url"); setError(null)
    try {
      const res = await fetch(`${base}/source/url`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })
      if (!res.ok) throw new Error(await readError(res, "Falha ao processar a URL"))
      setUrl(""); onAdded()
    } catch (e) { setError(e instanceof Error ? e.message : "Erro") }
    finally { setBusy(null) }
  }

  const addText = async () => {
    if (!text.trim()) return
    setBusy("text"); setError(null)
    try {
      const res = await fetch(`${base}/source/text`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || undefined, text: text.trim() }),
      })
      if (!res.ok) throw new Error(await readError(res, "Falha ao processar o texto"))
      setText(""); setTitle(""); onAdded()
    } catch (e) { setError(e instanceof Error ? e.message : "Erro") }
    finally { setBusy(null) }
  }

  const addPdf = async (file: File) => {
    setBusy("pdf"); setError(null)
    try {
      const fd = new FormData()
      fd.append("projectId", projectId)
      fd.append("file", file)
      const res = await fetch(`/api/v1/knowledge/upload`, {
        method: "POST", credentials: "same-origin", body: fd,
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error === "file_too_large" ? "PDF muito grande (máx 15MB)" : "Falha no upload do PDF")
      }
      onAdded()
    } catch (e) { setError(e instanceof Error ? e.message : "Erro") }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = "" }
  }

  const btnStyle: React.CSSProperties = {
    borderColor: tokens.brand,
    backgroundColor: tokens.brand,
    color: "#fff",
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: tokens.divider }}>
      {/* PDF */}
      <div className="flex items-center gap-2">
        <input
          ref={fileRef} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void addPdf(f) }}
        />
        <button
          type="button" onClick={() => fileRef.current?.click()} disabled={busy !== null}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] transition-colors disabled:opacity-50"
          style={btnStyle}
        >
          {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Enviar PDF
        </button>
        <span className="text-[11px]" style={{ color: tokens.textTertiary }}>até 15MB</span>
      </div>

      {/* URL */}
      <div className="flex items-center gap-2">
        <Input
          value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://site.com/faq" className="h-9 text-[13px]"
          onKeyDown={(e) => { if (e.key === "Enter") void addUrl() }}
        />
        <button
          type="button" onClick={() => void addUrl()} disabled={busy !== null || !url.trim()}
          className="shrink-0 rounded-md border px-3 py-1.5 text-[12px] disabled:opacity-50" style={btnStyle}
        >
          {busy === "url" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Adicionar URL"}
        </button>
      </div>

      {/* Texto */}
      <div className="flex flex-col gap-1.5">
        <Input
          value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Título (opcional)" className="h-8 text-[12px]"
        />
        <Textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Cole aqui informações sobre a empresa, FAQ, políticas…"
          className="min-h-[64px] text-[13px]"
        />
        <button
          type="button" onClick={() => void addText()} disabled={busy !== null || !text.trim()}
          className="self-end rounded-md border px-3 py-1.5 text-[12px] disabled:opacity-50" style={btnStyle}
        >
          {busy === "text" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Adicionar texto"}
        </button>
      </div>

      {error && <p className="text-[11px]" style={{ color: tokens.dangerText }}>{error}</p>}
    </div>
  )
}
