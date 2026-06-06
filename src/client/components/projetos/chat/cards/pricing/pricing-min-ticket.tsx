"use client"

/**
 * Builder Cards — Pricing / Valor mínimo (G5a, Onda B)
 *
 * Subcomponente do card `pricing`. Renderiza:
 *   1. um checkbox "Tem valor mínimo?" e
 *   2. quando marcado, um input BRL MASCARADO condicional (dígitos preenchem da
 *      direita pra esquerda, então digitar "25000" vira "R$ 250,00").
 *
 * Modelagem do estado (o PAI é dono): o valor canônico é `minTicketCents`, um
 * `number | null`:
 *   - `null`            → não há valor mínimo (checkbox desmarcado).
 *   - número inteiro    → o ticket mínimo em CENTAVOS (checkbox marcado + valor).
 *
 * Contrato de callback (consumido por outros arquivos — NÃO alterar a forma):
 *   - desmarcar o checkbox   → `onChange(null)`
 *   - digitar/editar o valor → `onChange(cents)` com `cents` inteiro >= 0
 *
 * Detalhe de UX: o usuário pode MARCAR o checkbox e ainda não ter digitado nada.
 * Nesse intervalo o pai permanece `null` (não existe valor mínimo de fato) — só
 * promovemos pra um inteiro quando um valor é efetivamente digitado. Mantemos um
 * `localEnabled` interno só pra revelar o input nesse meio-tempo, sem vazar um
 * `0` enganoso pro estado persistido (o card de pricing nunca guarda 0 falso).
 *
 * PRESENTACIONAL: não faz fetch e não muta nada além de chamar `onChange`.
 * Estilizado 100% por design tokens (sem cor hard-coded), copy PT-BR.
 *
 * Reaproveita a mesma lógica de máscara de centavos do `pricing-card.tsx`
 * (digitsToCents / centsToMasked) — duplicada aqui de forma pura porque os
 * helpers do card irmão não são exportados e aquele arquivo não pode ser tocado.
 */

import * as React from "react"
import { Wallet } from "lucide-react"

import { Input } from "@/client/components/ui/input"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

/**
 * Props deste subcomponente. O pai é dono de `minTicketCents` e reage ao
 * `onChange`. `tokens` vem do `useAppTokens()` do pai (não chamamos o hook aqui
 * pra manter o componente puramente apresentacional e fácil de testar).
 */
export interface PricingMinTicketProps {
  /** Ticket mínimo em CENTAVOS, ou `null` quando não há valor mínimo. */
  minTicketCents: number | null
  /** Bloqueia toda interação (ex.: enquanto o card está enviando). */
  disabled?: boolean
  /** Paleta de design tokens (referências a CSS variables). */
  tokens: AppTokens
  /** `null` ao desmarcar; inteiro de centavos quando um valor é digitado. */
  onChange: (cents: number | null) => void
}

/**
 * Tira todo caractere não-numérico e lê os dígitos restantes como um inteiro de
 * CENTAVOS. "R$ 1.234,50" → "123450" → 123450. Limita a magnitude pra um colar
 * gigante não estourar. Puro, nunca produz float.
 */
function digitsToCents(raw: string): number {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 0) return 0
  // Limita a 12 dígitos (até ~bilhões de reais) pra evitar overflow.
  const bounded = digits.slice(-12)
  const cents = Number.parseInt(bounded, 10)
  return Number.isFinite(cents) ? cents : 0
}

/**
 * Renderiza um inteiro de centavos como string BRL mascarada: 1234 → "R$ 12,34".
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

/**
 * PricingMinTicket — checkbox "Tem valor mínimo?" + input BRL condicional.
 *
 * @see PricingMinTicketProps para o contrato exato consumido pelo pai.
 */
export function PricingMinTicket({
  minTicketCents,
  disabled = false,
  tokens,
  onChange,
}: PricingMinTicketProps): React.JSX.Element {
  // O checkbox aparece marcado quando há um valor persistido OU quando o usuário
  // acabou de marcar e ainda não digitou (estado intermediário local).
  const [localEnabled, setLocalEnabled] = React.useState<boolean>(
    minTicketCents !== null,
  )

  // Se o pai mudar de fora (ex.: pré-preenchimento ao reabrir o card), reflete.
  React.useEffect(() => {
    if (minTicketCents !== null) setLocalEnabled(true)
  }, [minTicketCents])

  const checked = localEnabled || minTicketCents !== null

  const handleToggle = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.checked
      setLocalEnabled(next)
      // Ao desmarcar, zera o valor no pai. Ao marcar, NÃO emitimos ainda — só
      // revelamos o input; o pai segue `null` até um valor ser digitado.
      if (!next) onChange(null)
    },
    [onChange],
  )

  const handleValueChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const cents = digitsToCents(event.target.value)
      // Campo limpo (sem dígitos) volta o pai pra `null` — não há valor mínimo.
      onChange(cents > 0 ? cents : null)
    },
    [onChange],
  )

  return (
    <div
      className="rounded-md border border-dashed p-3"
      style={{ backgroundColor: tokens.bgBase, borderColor: tokens.divider }}
    >
      <label className="flex cursor-pointer items-start gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={checked}
          onChange={handleToggle}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{ accentColor: tokens.brand }}
          aria-label="Definir um valor mínimo de atendimento"
        />
        <span className="min-w-0">
          <span
            className="flex items-center gap-1.5 font-medium"
            style={{ color: tokens.textPrimary }}
          >
            <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Tem valor mínimo?
          </span>
          <span
            className="mt-0.5 block text-[11px]"
            style={{ color: tokens.textTertiary }}
          >
            O agente usa esse piso quando o cliente pergunta o valor de serviços
            sob orçamento.
          </span>
        </span>
      </label>

      {checked ? (
        <Input
          // inputMode numeric → teclado numérico no mobile; o value é a string
          // mascarada, mas o pai recebe sempre o inteiro de centavos.
          inputMode="numeric"
          value={centsToMasked(minTicketCents ?? 0)}
          onChange={handleValueChange}
          placeholder="R$ 0,00"
          disabled={disabled}
          className="mt-2 h-8 w-40 text-[12px]"
          aria-label="Valor mínimo em reais"
        />
      ) : null}
    </div>
  )
}

export default PricingMinTicket
