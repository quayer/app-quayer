"use client"

/**
 * Builder Cards — Test Drive (Jornada v2, T46 — fase Testar)
 *
 * cardKey `test_drive`. Gate SOFT da fase "Testar" (decisão 2 da spec §9): o
 * fluxo conduz ao teste antes de publicar, mas existe um escape EXPLÍCITO
 * ("Publicar sem testar"). As duas ações de submit flipam o MESMO sentinel
 * `confirmations.testDrive` server-side; o backend ramifica só a copy do ACK e o
 * evento de funil (`tested` → `test_done`, `skip` → `test_skipped`) — ver
 * `testDrivePayloadSchema` (card-submit.schemas.ts).
 *
 * Três affordances honestas (FR-20):
 *   1. "Abrir teste"        — PRIMÁRIO. NÃO submete: troca para a tab "Testar"
 *                             (`onTabChange('playground')`). O flip de `testDrive`
 *                             acontece no primeiro turno bem-sucedido do
 *                             `playgroundStream` (auto-flip fail-open, plan §3.3),
 *                             então o clique não precisa confirmar nada.
 *   2. "Já testei"          — SECUNDÁRIO. `onSubmit({ action: 'tested' })` —
 *                             fallback manual de quem testou e quer avançar.
 *   3. "Publicar sem testar" — ESCAPE. `onSubmit({ action: 'skip' })` — pula o
 *                             gate sem prometer que o agente foi validado.
 *
 * FR-20 (estados honestos): enquanto o agente ainda NÃO existe, "Abrir teste"
 * fica DESABILITADO com o motivo explícito — não há o que testar antes de criar
 * o agente. As ações de confirmar/pular continuam disponíveis (o usuário pode
 * avançar a jornada mesmo sem o playground).
 *
 * PRESENTATIONAL ONLY: lê `props.value.confirmations.testDrive`, bloqueia
 * enquanto `props.disabled` (chat streaming) e dispara `props.onSubmit` /
 * `props.onTabChange` — nunca faz fetch (chat-panel é dono do POST + SSE e a tab
 * é trocada pelo workspace).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog) + plan §3.3 item 3.
 */

import * as React from "react"
import { Check, FlaskConical, PlayCircle, Rocket } from "lucide-react"

import type { PreviewTab } from "@/client/components/projetos/types"
import type { TestDrivePayload } from "@/server/ai-module/builder/cards/card-submit.schemas"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"

/**
 * Submit payload deste card. Espelha `testDrivePayloadSchema` SEM o discriminador
 * `cardKey` — o `ActiveStepCard` anexa a chave da rota ao `onSubmit` (padrão de
 * todos os cards do catálogo; ver active-step-card.tsx `handleSubmit`).
 */
export type TestDriveCardPayload = Omit<TestDrivePayload, "cardKey">

/** A tab "Testar" do workspace (tab-registry.tsx → value `playground`). */
const TEST_TAB: PreviewTab = "playground"

/** Props — contrato base + as affordances OPCIONAIS de navegação/contexto. */
export interface TestDriveCardProps
  extends CardComponentProps<TestDriveCardPayload> {
  /**
   * Troca a tab do preview (FR-20 / plan §3.3): "Abrir teste" leva à tab
   * "Testar". OPCIONAL e retro-compatível — sem a prop, o CTA primário fica
   * desabilitado com motivo (não há para onde abrir o teste). Injetada pela
   * etapa de wiring do `ActiveStepCard`.
   */
  onTabChange?: (tab: PreviewTab) => void
  /**
   * Se o agente JÁ foi criado. OPCIONAL — a jornada v2 só surfa este passo
   * depois de `agent_approval`, então o default é `true`; o wiring passa `false`
   * explicitamente para honrar a borda em que o agente ainda não existe (FR-20).
   */
  agentExists?: boolean
}

/**
 * TestDriveCard — convida a testar o agente no playground antes de publicar,
 * com escape explícito. Lê o sentinel `testDrive` só para refletir o estado já
 * confirmado (a confirmação não esconde o card; ele sai do slot quando a jornada
 * avança). Submete `{ action }` — o backend re-valida e flipa o sentinel.
 */
export function TestDriveCard({
  value,
  disabled = false,
  onSubmit,
  onTabChange,
  agentExists = true,
  tokens,
}: TestDriveCardProps) {
  const alreadyTested = value.confirmations.testDrive === true

  // "Abrir teste" só faz sentido com agente criado E uma tab para abrir. Sem
  // qualquer um dos dois, desabilita com motivo honesto (FR-20).
  const canOpenTest = agentExists && typeof onTabChange === "function"

  const openTestReason = !agentExists
    ? "Crie o agente primeiro — ainda não há nada para testar."
    : undefined

  const handleOpenTest = React.useCallback(() => {
    if (!canOpenTest) return
    onTabChange?.(TEST_TAB)
  }, [canOpenTest, onTabChange])

  const handleTested = React.useCallback(() => {
    onSubmit({ action: "tested" })
  }, [onSubmit])

  const handleSkip = React.useCallback(() => {
    onSubmit({ action: "skip" })
  }, [onSubmit])

  return (
    <CardShell
      icon={<FlaskConical className="h-4 w-4" />}
      title="Que tal testar o agente?"
      reason={
        alreadyTested
          ? "Você já testou este agente. Pode publicar com tranquilidade — ou abrir o teste de novo."
          : "Converse com o agente no simulador antes de publicar. É opcional, mas evita surpresas com clientes reais."
      }
      tokens={tokens}
      actions={[
        {
          label: "Abrir teste",
          onClick: handleOpenTest,
          variant: "primary",
          icon: <PlayCircle className="h-3.5 w-3.5" />,
          disabled: disabled || !canOpenTest,
        },
        {
          label: alreadyTested ? "Avançar" : "Já testei",
          onClick: handleTested,
          variant: "secondary",
          icon: <Check className="h-3.5 w-3.5" />,
          disabled,
        },
        {
          label: "Publicar sem testar",
          onClick: handleSkip,
          variant: "secondary",
          icon: <Rocket className="h-3.5 w-3.5" />,
          disabled,
        },
      ]}
    >
      {/* Motivo explícito do CTA desabilitado (FR-20): só aparece quando "Abrir
          teste" está bloqueado por falta do agente — nunca como ruído. */}
      {openTestReason != null && (
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: tokens.textTertiary }}
        >
          {openTestReason}
        </p>
      )}
    </CardShell>
  )
}

export default TestDriveCard
