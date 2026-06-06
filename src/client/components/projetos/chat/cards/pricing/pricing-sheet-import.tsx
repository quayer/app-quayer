"use client"

/**
 * Builder Cards — Pricing / Importar de planilha Google Sheets (Onda B, G3)
 *
 * Seção COLAPSÁVEL do card `pricing`. Fluxo:
 *   1. O usuário cola a URL de uma planilha PÚBLICA do Google Sheets.
 *   2. POST `/api/v1/builder/projects/:id/sheet/parse` (route Igniter do builder,
 *      SSRF-safe: só docs.google.com, timeout, cap de bytes/linhas) → devolve
 *      { headers, rows (preview ≤50), rowCount, hasHeader, columnSuggestions }.
 *   3. O usuário MAPEIA cada coluna detectada para um papel (serviço / preço /
 *      categoria / foto / ignorar), pré-preenchido pelas sugestões do backend.
 *   4. "Usar X itens" converte as linhas mapeadas em PricingCardItem[] e os
 *      entrega ao PAI via `onImport`, que popula a tabela do card.
 *
 * PRESENTATIONAL + 1 fetch stateless: não persiste nada (a persistência é o
 * submit normal do card). Estilizado 100% por design tokens (sem cor hard-coded),
 * copy PT-BR. O parse de centavos espelha a máscara do card (INT, nunca float).
 *
 * Contrato do PAI (pricing-card.tsx):
 *   <PricingSheetImport projectId value=undefined tokens disabled onImport/>
 *   onImport(items: ParsedSheetItem[]) — itens prontos pra virar linhas da tabela.
 */

import * as React from "react"
import { FileSpreadsheet, Loader2, Table2, X } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

// ==========================================
// Contrato público
// ==========================================

/** Papéis que uma coluna da planilha pode assumir (espelha SheetColumnRole + ignore). */
export type SheetMapRole =
  | "service_name"
  | "price"
  | "category"
  | "image_url"
  | "ignore"

/** Item já convertido a partir da planilha — pronto pra virar linha da tabela. */
export interface ParsedSheetItem {
  name: string
  priceCents: number
  category?: string
  imageUrl?: string
}

export interface PricingSheetImportProps {
  /** Projeto Builder — vai no path da rota de parse. */
  projectId: string
  /** Tokens do design system (useAppTokens via parent). */
  tokens: AppTokens
  /** Bloqueia tudo (ex.: card em submit). */
  disabled?: boolean
  /** Entrega os itens convertidos ao parent, que popula a tabela. */
  onImport: (items: ParsedSheetItem[]) => void
}

// ==========================================
// Tipos do resultado do parse (espelham o contrato da rota sheet-parse)
// ==========================================

type BackendColumnRole =
  | "service_name"
  | "price"
  | "category"
  | "description"
  | "image_url"

interface SheetParseSuccess {
  headers: string[]
  rows: string[][]
  rowCount: number
  hasHeader: boolean
  columnSuggestions: Record<string, BackendColumnRole | null>
}

/** Endpoint Igniter do builder (fora do client gerado → fetch direto, estável). */
const PARSE_ENDPOINT = (projectId: string): string =>
  `/api/v1/builder/projects/${encodeURIComponent(projectId)}/sheet/parse`

// ==========================================
// Helpers puros — parse de preço PT-BR → centavos INT
// ==========================================

/**
 * Converte uma célula de preço (PT-BR ou EN) num inteiro de CENTAVOS.
 * Aceita "R$ 1.234,56", "1234,56", "1234.56", "1.234", "1234", "R$ 250".
 * Heurística: o ÚLTIMO separador ( , ou . ) seguido de 1–2 dígitos é o decimal;
 * os demais separadores são milhar e são removidos. Sem decimal → reais inteiros.
 * Nunca produz float (monta os centavos via inteiros). 0 quando não há número.
 */
export function priceTextToCents(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, "").trim()
  if (cleaned.length === 0) return 0

  // Acha o último separador decimal plausível (vírgula OU ponto com 1–2 casas).
  const decimalMatch = cleaned.match(/[.,](\d{1,2})$/)
  let reaisPart: string
  let centsPart: string

  if (decimalMatch) {
    const sepIndex = cleaned.length - decimalMatch[0].length
    reaisPart = cleaned.slice(0, sepIndex).replace(/[.,]/g, "")
    centsPart = decimalMatch[1].padEnd(2, "0").slice(0, 2)
  } else {
    // Sem decimal → tudo é reais (remove separadores de milhar).
    reaisPart = cleaned.replace(/[.,]/g, "")
    centsPart = "00"
  }

  const reais = reaisPart.length > 0 ? Number.parseInt(reaisPart, 10) : 0
  const cents = Number.parseInt(centsPart, 10)
  if (!Number.isFinite(reais) || !Number.isFinite(cents)) return 0
  // Cap defensivo (mesma ordem de grandeza do card): evita overflow de colagem.
  const total = reais * 100 + cents
  return Math.max(0, Math.min(total, 999_999_999_99))
}

/** `true` quando a string parece uma URL http(s) (para validar a coluna de foto). */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

/**
 * Sugestão do backend → papel inicial do mapper. `description` não tem coluna na
 * tabela de preços (só serviço/preço/categoria/foto), então cai em "ignore".
 */
function roleFromSuggestion(
  suggestion: BackendColumnRole | null | undefined,
): SheetMapRole {
  switch (suggestion) {
    case "service_name":
      return "service_name"
    case "price":
      return "price"
    case "category":
      return "category"
    case "image_url":
      return "image_url"
    default:
      return "ignore"
  }
}

const ROLE_OPTIONS: ReadonlyArray<{ value: SheetMapRole; label: string }> = [
  { value: "service_name", label: "Serviço / produto" },
  { value: "price", label: "Preço" },
  { value: "category", label: "Categoria" },
  { value: "image_url", label: "Foto (URL)" },
  { value: "ignore", label: "Ignorar" },
]

// ==========================================
// Conversão linhas + mapa → itens
// ==========================================

/**
 * Aplica o mapa coluna→papel às linhas e produz os itens. Mantém só linhas com
 * nome não-vazio. Preço/categoria/foto vêm das colunas mapeadas (a primeira de
 * cada papel vence quando há duplicatas). Pura.
 */
function rowsToItems(
  rows: readonly string[][],
  roles: readonly SheetMapRole[],
): ParsedSheetItem[] {
  const nameCol = roles.indexOf("service_name")
  const priceCol = roles.indexOf("price")
  const categoryCol = roles.indexOf("category")
  const imageCol = roles.indexOf("image_url")

  const out: ParsedSheetItem[] = []
  for (const row of rows) {
    const name = (nameCol >= 0 ? (row[nameCol] ?? "") : "").trim()
    if (name.length === 0) continue

    const priceCents =
      priceCol >= 0 ? priceTextToCents(row[priceCol] ?? "") : 0
    const category =
      categoryCol >= 0 ? (row[categoryCol] ?? "").trim() : ""
    const imageRaw = imageCol >= 0 ? (row[imageCol] ?? "").trim() : ""
    const imageUrl = isHttpUrl(imageRaw) ? imageRaw.slice(0, 2000) : ""

    out.push({
      name,
      priceCents,
      ...(category.length > 0 ? { category } : {}),
      ...(imageUrl.length > 0 ? { imageUrl } : {}),
    })
  }
  return out
}

// ==========================================
// Componente
// ==========================================

export function PricingSheetImport({
  projectId,
  tokens,
  disabled = false,
  onImport,
}: PricingSheetImportProps): React.JSX.Element {
  const [url, setUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [parsed, setParsed] = React.useState<SheetParseSuccess | null>(null)
  const [roles, setRoles] = React.useState<SheetMapRole[]>([])

  const abortRef = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => abortRef.current?.abort(), [])

  const handleParse = React.useCallback(async () => {
    const sheetUrl = url.trim()
    if (sheetUrl.length === 0 || disabled || busy) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setBusy(true)
    setError(null)
    setParsed(null)

    try {
      const res = await fetch(PARSE_ENDPOINT(projectId), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sheetUrl }),
        signal: controller.signal,
      })

      // O Igniter embrulha a resposta; a rota retorna os campos no topo OU em
      // `data`/`error`. Parse defensivo dos dois formatos.
      let json: unknown = null
      try {
        json = await res.json()
      } catch {
        json = null
      }

      if (!res.ok) {
        setError(extractErrorMessage(json))
        return
      }

      const result = extractSuccess(json)
      if (!result) {
        setError("Não consegui ler a planilha. Verifique o link e tente de novo.")
        return
      }

      setParsed(result)
      setRoles(
        result.headers.map((h) =>
          roleFromSuggestion(result.columnSuggestions[h]),
        ),
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setError("Falha de conexão ao ler a planilha. Tente novamente.")
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setBusy(false)
      }
    }
  }, [busy, disabled, projectId, url])

  const setRole = React.useCallback((index: number, role: SheetMapRole) => {
    setRoles((current) => {
      const next = current.slice()
      next[index] = role
      return next
    })
  }, [])

  const previewItems = React.useMemo<ParsedSheetItem[]>(
    () => (parsed ? rowsToItems(parsed.rows, roles) : []),
    [parsed, roles],
  )

  const hasNameColumn = roles.includes("service_name")

  const handleUse = React.useCallback(() => {
    if (previewItems.length === 0) return
    onImport(previewItems)
    // Reset da seção após importar — a tabela do card assume daqui.
    setParsed(null)
    setRoles([])
    setUrl("")
    setError(null)
  }, [onImport, previewItems])

  const handleClear = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setParsed(null)
    setRoles([])
    setError(null)
  }, [])

  return (
    <details className="rounded-md border border-dashed p-3" style={{ borderColor: tokens.divider, backgroundColor: tokens.bgBase }}>
      <summary
        className="flex cursor-pointer select-none items-center gap-1.5 text-[12px] font-medium"
        style={{ color: tokens.textSecondary }}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
        Importar de uma planilha (Google Sheets)
      </summary>

      <p className="mt-2 text-[11px] leading-snug" style={{ color: tokens.textTertiary }}>
        Cole o link de uma planilha pública (Compartilhar → &quot;Qualquer pessoa
        com o link&quot;). Detectamos as colunas e você confirma o mapeamento.
      </p>

      <div className="mt-2 flex items-start gap-2">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void handleParse()
            }
          }}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          inputMode="url"
          disabled={disabled || busy}
          aria-label="Link da planilha do Google Sheets"
          className="h-8 flex-1 text-[12px]"
        />
        <button
          type="button"
          onClick={() => void handleParse()}
          disabled={disabled || busy || url.trim().length === 0}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.divider,
            color: tokens.textSecondary,
          }}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {busy ? "Lendo…" : "Ler planilha"}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1 text-[11px] leading-snug"
          style={{ color: tokens.dangerText }}
        >
          <X className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {parsed ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[11px] font-medium" style={{ color: tokens.textSecondary }}>
            {parsed.rowCount === 1 ? "1 linha encontrada" : `${parsed.rowCount} linhas encontradas`}
            {" · "}mapeie as colunas:
          </p>

          <div className="grid gap-1.5">
            {parsed.headers.map((header, index) => (
              <div
                key={`${header}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
                style={{ borderColor: tokens.divider, backgroundColor: tokens.bgSurface }}
              >
                <span
                  className="min-w-0 flex-1 truncate text-[12px]"
                  style={{ color: tokens.textPrimary }}
                  title={header}
                >
                  {header}
                </span>
                <select
                  value={roles[index] ?? "ignore"}
                  onChange={(event) =>
                    setRole(index, event.target.value as SheetMapRole)
                  }
                  disabled={disabled}
                  aria-label={`Papel da coluna ${header}`}
                  className="h-7 shrink-0 rounded-md border px-2 text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: tokens.bgBase,
                    borderColor: tokens.divider,
                    color: tokens.textSecondary,
                  }}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!hasNameColumn ? (
            <p className="text-[11px]" style={{ color: tokens.warningText }}>
              Escolha qual coluna é o nome do serviço para importar.
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUse}
              disabled={disabled || previewItems.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: tokens.brand, color: tokens.textInverse }}
            >
              {previewItems.length === 1
                ? "Usar 1 item"
                : `Usar ${previewItems.length} itens`}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.divider,
                color: tokens.textSecondary,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </details>
  )
}

// ==========================================
// Parse defensivo da resposta (Igniter pode embrulhar em { data } / { error })
// ==========================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Extrai o corpo de sucesso aceitando { ...campos } OU { data: { ...campos } }. */
function extractSuccess(json: unknown): SheetParseSuccess | null {
  if (!isRecord(json)) return null
  const source = isRecord(json.data) ? json.data : json
  const headers = source.headers
  const rows = source.rows
  if (!Array.isArray(headers) || !Array.isArray(rows)) return null

  const safeHeaders = headers.map((h) => String(h))
  const safeRows: string[][] = rows.map((r) =>
    Array.isArray(r) ? r.map((c) => String(c ?? "")) : [],
  )
  const suggestionsRaw = isRecord(source.columnSuggestions)
    ? source.columnSuggestions
    : {}
  const columnSuggestions: Record<string, BackendColumnRole | null> = {}
  for (const [key, val] of Object.entries(suggestionsRaw)) {
    columnSuggestions[key] =
      val === "service_name" ||
      val === "price" ||
      val === "category" ||
      val === "description" ||
      val === "image_url"
        ? val
        : null
  }

  const rowCount =
    typeof source.rowCount === "number" ? source.rowCount : safeRows.length
  const hasHeader = source.hasHeader === true

  return { headers: safeHeaders, rows: safeRows, rowCount, hasHeader, columnSuggestions }
}

/** Extrai a mensagem de erro PT-BR do envelope do Igniter (ou um fallback). */
function extractErrorMessage(json: unknown): string {
  if (isRecord(json)) {
    const err = json.error
    if (typeof err === "string" && err.trim().length > 0) return err
    if (isRecord(err) && typeof err.message === "string" && err.message.trim()) {
      return err.message
    }
    if (typeof json.message === "string" && json.message.trim().length > 0) {
      return json.message
    }
  }
  return "Não consegui ler a planilha. Verifique o link e tente novamente."
}

export default PricingSheetImport
