"use client"

/**
 * Builder Cards — Pricing / tabela de preços (Orayon Uplift, W3 + Onda B)
 *
 * cardKey `pricing`. Lista editável de linhas de preço, cada uma com:
 *   - name           → rótulo do serviço/produto (obrigatório)
 *   - price          → BRL via input de centavos MASCARADO (dígitos preenchem da
 *                      direita; "1234" vira "R$ 12,34"). priceCents é INT — nunca
 *                      parseamos float, evitando drift 19.99 → 1998.99999.
 *   - category       → rótulo de agrupamento (opcional)
 *   - priceMaxCents  → (G4) teto da faixa, só quando o estilo é "Faixa média"
 *   - imageUrl       → (G5b) foto do serviço (catálogo visual)
 *
 * Onda B adiciona, GLOBAL ao card:
 *   - disclosureStyle (G4) → COMO o agente fala o preço (exact/from/average/none)
 *   - minTicketCents  (G5a) → valor mínimo de atendimento (opcional)
 *   - import G3            → "Importar de planilha" popula a tabela
 *
 * PRESENTACIONAL: pré-preenche de `props.value.pricing`, deixa add/remover linhas
 * e no confirm chama
 *   props.onSubmit({ items, currency:"BRL", disclosureStyle, minTicketCents? })
 * O payload BATE 1:1 com `pricingPayloadSchema`. Não faz fetch do submit — o
 * chat-panel é dono de POST + SSE. (O import G3 faz UM fetch stateless à parte.)
 *
 * Estilo via CardShell + useAppTokens (props.tokens). Copy PT-BR.
 *
 * Contrato: docs/builder/ORAYON_UPLIFT_SPEC.md (pricing — BRL em cents).
 */

import * as React from "react"
import { AlertTriangle, Check, Plus, Tag, Trash2 } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import {
  PricingStyleTabs,
  type PricingDisclosureStyle,
} from "./pricing/pricing-style-tabs"
import { PricingMinTicket } from "./pricing/pricing-min-ticket"
import { PricingImageUploader } from "./pricing/pricing-image-uploader"
import {
  PricingSheetImport,
  type ParsedSheetItem,
} from "./pricing/pricing-sheet-import"
import { formatDisclosure, isRowComplete } from "./pricing/disclosure-format"

/** Uma linha de preço submetida — espelha `pricingItemSchema` (cents INT). */
export interface PricingCardItem {
  name: string
  priceCents: number
  category?: string
  /** G4 — teto da faixa (só quando disclosureStyle === "average"). */
  priceMaxCents?: number
  /** G5b — URL https da foto do serviço. */
  imageUrl?: string
}

/** O payload exato submetido para cardKey `pricing` — BATE 1:1 com o Zod. */
export interface PricingCardPayload {
  items: PricingCardItem[]
  currency: "BRL"
  /** G4 — como o agente DIVULGA o preço. */
  disclosureStyle: PricingDisclosureStyle
  /** G5a — valor mínimo global, em centavos. Omitido quando não há. */
  minTicketCents?: number
}

/** Soft cap pra um colar descontrolado não renderizar centenas de inputs. */
const MAX_ROWS = 50

/** Linha-rascunho editável — `priceCents` é o INT canônico; o input é mascarado. */
interface DraftRow {
  /** Key estável pro React (linhas reordenam ao deletar). */
  id: string
  name: string
  priceCents: number
  category: string
  /** G4 — teto da faixa em centavos (0 = sem teto). */
  priceMaxCents: number
  /** G5b — URL da foto ("" = sem foto). */
  imageUrl: string
}

let rowSeq = 0
function nextRowId(): string {
  rowSeq += 1
  return `row-${rowSeq}`
}

function makeEmptyRow(): DraftRow {
  return {
    id: nextRowId(),
    name: "",
    priceCents: 0,
    category: "",
    priceMaxCents: 0,
    imageUrl: "",
  }
}

/**
 * Pré-preenche as linhas-rascunho a partir do estado canônico. Sempre devolve ao
 * menos uma linha pra abrir o card com uma linha editável.
 */
function rowsFromState(items: readonly PricingCardItem[]): DraftRow[] {
  if (items.length === 0) return [makeEmptyRow()]
  return items.map((item) => ({
    id: nextRowId(),
    name: item.name,
    // Clamp defensivo: nunca confia num cents negativo/float vindo do estado.
    priceCents: Math.max(0, Math.round(item.priceCents)),
    category: item.category ?? "",
    priceMaxCents:
      typeof item.priceMaxCents === "number"
        ? Math.max(0, Math.round(item.priceMaxCents))
        : 0,
    imageUrl: item.imageUrl ?? "",
  }))
}

/** Converte ParsedSheetItem (do import G3) em DraftRow novo. */
function rowFromSheetItem(item: ParsedSheetItem): DraftRow {
  return {
    id: nextRowId(),
    name: item.name,
    priceCents: Math.max(0, Math.round(item.priceCents)),
    category: item.category ?? "",
    priceMaxCents: 0,
    imageUrl: item.imageUrl ?? "",
  }
}

/**
 * Tira todo não-dígito e lê os dígitos restantes como CENTAVOS inteiros.
 * "R$ 1.234,50" → "123450" → 123450. Cap defensivo contra colagem gigante. Puro.
 */
function digitsToCents(raw: string): number {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 0) return 0
  const bounded = digits.slice(-12)
  const cents = Number.parseInt(bounded, 10)
  return Number.isFinite(cents) ? cents : 0
}

/**
 * Render de um INT de centavos como BRL mascarado: 1234 → "R$ 12,34",
 * 0 → "" (placeholder vazio, sem mostrar "R$ 0,00" obsoleto).
 */
function centsToMasked(cents: number): string {
  if (cents <= 0) return ""
  const reais = Math.floor(cents / 100)
  const remainder = cents % 100
  const reaisStr = reais.toLocaleString("pt-BR")
  const centsStr = remainder.toString().padStart(2, "0")
  return `R$ ${reaisStr},${centsStr}`
}

/** Uma linha editável: nome + preço mascarado + categoria + (G4) teto + (G5b) foto. */
function PriceRow({
  row,
  index,
  canRemove,
  disclosureStyle,
  projectId,
  onChange,
  onRemove,
  tokens,
  disabled,
}: {
  row: DraftRow
  index: number
  /** Esconde o lixo quando esta é a única linha (vazia). */
  canRemove: boolean
  /** G4 — estilo global, controla a 2ª entrada (teto) + o live-preview. */
  disclosureStyle: PricingDisclosureStyle
  /** G5b — projeto dono, threadado pro uploader de imagem. */
  projectId: string
  onChange: (id: string, patch: Partial<Omit<DraftRow, "id">>) => void
  onRemove: (id: string) => void
  tokens: AppTokens
  disabled: boolean
}) {
  const handlePriceChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(row.id, { priceCents: digitsToCents(event.target.value) })
    },
    [onChange, row.id],
  )

  const handleMaxChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(row.id, { priceMaxCents: digitsToCents(event.target.value) })
    },
    [onChange, row.id],
  )

  const handleImageChange = React.useCallback(
    (imageUrl: string | undefined) => {
      onChange(row.id, { imageUrl: imageUrl ?? "" })
    },
    [onChange, row.id],
  )

  const isAverage = disclosureStyle === "average"
  // Live-preview de COMO o agente vai falar o preço desta linha.
  const preview =
    row.name.trim().length > 0 || row.priceCents > 0
      ? formatDisclosure(
          disclosureStyle,
          row.priceCents,
          isAverage ? row.priceMaxCents : undefined,
        )
      : ""
  // Em "average", a linha só fica completa com teto > piso — destaca o hint.
  const rangeIncomplete =
    isAverage &&
    row.name.trim().length > 0 &&
    !isRowComplete(disclosureStyle, row.priceCents, row.priceMaxCents)

  return (
    <div
      className="rounded-md border p-3"
      style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
    >
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_140px]">
          <Input
            value={row.name}
            onChange={(event) => onChange(row.id, { name: event.target.value })}
            placeholder="Serviço ou produto"
            disabled={disabled}
            className="h-8 text-[12px]"
            aria-label={`Nome do item ${index + 1}`}
          />
          <Input
            // inputMode numeric → teclado numérico no mobile; o value é a string
            // mascarada, mas priceCents (o INT) é o que submetemos.
            inputMode="numeric"
            value={centsToMasked(row.priceCents)}
            onChange={handlePriceChange}
            placeholder={isAverage ? "Mínimo R$ 0,00" : "R$ 0,00"}
            disabled={disabled}
            className="h-8 text-[12px]"
            aria-label={
              isAverage
                ? `Preço mínimo do item ${index + 1} em reais`
                : `Preço do item ${index + 1} em reais`
            }
          />
        </div>
        <button
          type="button"
          aria-label={`Remover item ${index + 1}`}
          disabled={disabled || !canRemove}
          onClick={() => onRemove(row.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.divider,
            color: tokens.textSecondary,
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* G4 — 2ª entrada (teto) só aparece no estilo "Faixa média". */}
      {isAverage ? (
        <Input
          inputMode="numeric"
          value={centsToMasked(row.priceMaxCents)}
          onChange={handleMaxChange}
          placeholder="Máximo R$ 0,00"
          disabled={disabled}
          className="mt-2 h-8 text-[12px]"
          aria-label={`Preço máximo do item ${index + 1} em reais`}
        />
      ) : null}

      <Input
        value={row.category}
        onChange={(event) => onChange(row.id, { category: event.target.value })}
        placeholder="Categoria (opcional)"
        disabled={disabled}
        className="mt-2 h-8 text-[12px]"
        aria-label={`Categoria do item ${index + 1}`}
      />

      {/* G5b — foto do serviço (upload ou URL colada). */}
      <div className="mt-2">
        <PricingImageUploader
          projectId={projectId}
          value={row.imageUrl.length > 0 ? row.imageUrl : undefined}
          onChange={handleImageChange}
          disabled={disabled}
          tokens={tokens}
        />
      </div>

      {/* Live-preview de como o agente fala este preço + hint de faixa. */}
      {rangeIncomplete ? (
        <p
          className="mt-2 flex items-center gap-1 text-[11px]"
          style={{ color: tokens.warningText }}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Defina um valor máximo maior que o mínimo para a faixa.
        </p>
      ) : preview.length > 0 ? (
        <p className="mt-2 text-[11px]" style={{ color: tokens.textTertiary }}>
          O agente fala: <span style={{ color: tokens.textSecondary }}>{preview}</span>
        </p>
      ) : null}
    </div>
  )
}

/**
 * PricingCard — cardKey `pricing`. Renderiza as linhas editáveis dentro de uma
 * CardShell e submete `{ items, currency:"BRL", disclosureStyle, minTicketCents? }`.
 */
export function PricingCard({
  projectId,
  value,
  disabled = false,
  onSubmit,
  tokens,
}: CardComponentProps<PricingCardPayload>) {
  const [rows, setRows] = React.useState<DraftRow[]>(() =>
    rowsFromState(value.pricing.items),
  )
  // G4 — estilo de divulgação (default 'exact'); G5a — min ticket (null = sem).
  const [disclosureStyle, setDisclosureStyle] =
    React.useState<PricingDisclosureStyle>(
      value.pricing.disclosureStyle ?? "exact",
    )
  const [minTicketCents, setMinTicketCents] = React.useState<number | null>(
    typeof value.pricing.minTicketCents === "number"
      ? value.pricing.minTicketCents
      : null,
  )

  const updateRow = React.useCallback(
    (id: string, patch: Partial<Omit<DraftRow, "id">>) => {
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      )
    },
    [],
  )

  const removeRow = React.useCallback((id: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id)
      // Nunca colapsa pra zero linhas — mantém uma linha vazia editável.
      return next.length > 0 ? next : [makeEmptyRow()]
    })
  }, [])

  const addRow = React.useCallback(() => {
    setRows((current) =>
      current.length >= MAX_ROWS ? current : [...current, makeEmptyRow()],
    )
  }, [])

  // G3 — import de planilha: substitui as linhas vazias e anexa os itens (cap).
  const importFromSheet = React.useCallback((items: ParsedSheetItem[]) => {
    if (items.length === 0) return
    setRows((current) => {
      // Mantém só linhas já preenchidas (descarta as vazias do placeholder).
      const filled = current.filter((row) => row.name.trim().length > 0)
      const imported = items.map(rowFromSheetItem)
      const merged = [...filled, ...imported].slice(0, MAX_ROWS)
      return merged.length > 0 ? merged : [makeEmptyRow()]
    })
  }, [])

  // Só linhas com nome não-branco viram itens; trim em tudo; dropa categoria
  // vazia; (G4) emite priceMaxCents só em 'average' e quando max > piso; (G5b)
  // emite imageUrl só quando setado. ESPELHA o sanitizer do servidor.
  const validItems = React.useMemo<PricingCardItem[]>(
    () =>
      rows
        .map((row) => {
          const name = row.name.trim()
          if (name.length === 0) return null
          const category = row.category.trim()
          const priceCents = Math.max(0, Math.round(row.priceCents))
          const item: PricingCardItem = { name, priceCents }
          if (category.length > 0) item.category = category
          if (
            disclosureStyle === "average" &&
            row.priceMaxCents > priceCents
          ) {
            item.priceMaxCents = Math.max(0, Math.round(row.priceMaxCents))
          }
          const imageUrl = row.imageUrl.trim()
          if (imageUrl.length > 0) item.imageUrl = imageUrl
          return item
        })
        .filter((item): item is PricingCardItem => item !== null),
    [rows, disclosureStyle],
  )

  const atCap = rows.length >= MAX_ROWS
  const canRemove = rows.length > 1

  const handleConfirm = React.useCallback(() => {
    onSubmit({
      items: validItems,
      currency: "BRL",
      disclosureStyle,
      minTicketCents: minTicketCents ?? undefined,
    })
  }, [onSubmit, validItems, disclosureStyle, minTicketCents])

  // No estilo "none" o agente não fala preço — o CTA reflete isso.
  const confirmLabel =
    disclosureStyle === "none"
      ? "Confirmar (sem divulgar preço)"
      : validItems.length > 0
        ? `Confirmar ${validItems.length} ${validItems.length === 1 ? "item" : "itens"}`
        : "Confirmar sem preços"

  return (
    <CardShell
      icon={<Tag className="h-4 w-4" />}
      title="Tabela de preços"
      reason="Liste os preços que o agente pode informar nas conversas. Valores em reais (R$); escolha abaixo como o agente divulga cada valor."
      tokens={tokens}
      // FR-20 (jornada-builder-v2) — passo OBRIGATÓRIO: sem "Agora não"/dismiss.
      // "Confirmar sem preços" / estilo "none" já cobrem quem não divulga valor.
      actions={[
        {
          label: confirmLabel,
          onClick: handleConfirm,
          variant: "primary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      <div className="flex flex-col gap-3">
        {/* G4 — estilo de divulgação (topo, acima das linhas). */}
        <PricingStyleTabs
          value={disclosureStyle}
          onChange={setDisclosureStyle}
          disabled={disabled}
          tokens={tokens}
        />

        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <PriceRow
              key={row.id}
              row={row}
              index={index}
              canRemove={canRemove}
              disclosureStyle={disclosureStyle}
              projectId={projectId}
              onChange={updateRow}
              onRemove={removeRow}
              tokens={tokens}
              disabled={disabled}
            />
          ))}

          <button
            type="button"
            disabled={disabled || atCap}
            onClick={addRow}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: tokens.bgBase,
              borderColor: tokens.divider,
              color: tokens.textSecondary,
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {atCap ? "Limite de itens atingido" : "Adicionar item"}
          </button>
        </div>

        {/* G3 — importar de planilha (popula a tabela). */}
        <PricingSheetImport
          projectId={projectId}
          tokens={tokens}
          disabled={disabled}
          onImport={importFromSheet}
        />

        {/* G5a — valor mínimo de atendimento. */}
        <PricingMinTicket
          minTicketCents={minTicketCents}
          onChange={setMinTicketCents}
          disabled={disabled}
          tokens={tokens}
        />
      </div>
    </CardShell>
  )
}

export default PricingCard
