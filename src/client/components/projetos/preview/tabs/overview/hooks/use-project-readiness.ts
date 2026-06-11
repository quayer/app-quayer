"use client"

/**
 * useProjectReadiness — dono do `GET /builder/projects/:id/readiness` na
 * Overview (FR-18: fonte única de progresso/prontidão, a mesma do banner do
 * chat e do card de passo ativo).
 *
 * Polling LEVE, sem WebSocket novo (quick-win item 4):
 *   - refetch quando a janela recupera o foco (o provider global desliga
 *     `refetchOnWindowFocus`, então o listener é explícito aqui);
 *   - refetch quando a conversa avança (novo turno OU novo tool-result) —
 *     1x por mudança de sinal, via ref-guard. O sinal é derivado de
 *     `messages.length` + contagem de tool-results, estável durante o
 *     streaming token-a-token (não refaz a cada chunk).
 *
 * DEPENDÊNCIA IMPLÍCITA DE REMOUNT: mudanças feitas em OUTRAS tabs (conectar
 * canal no wizard de publicação, salvar prompt/identidade) não geram turno nem
 * focus — o snapshot só atualiza porque o Radix Tabs DESMONTA o conteúdo
 * inativo e o useQuery refaz no mount ao voltar para a Overview. Se algum dia
 * usarmos `forceMount` nas tabs, invalidar esta query nos onSuccess das
 * mutações que afetam blockers (attach de canal, updatePrompt, publish).
 */

import * as React from "react"

import { api } from "@/igniter.client"
import type { ChatMessage } from "@/client/components/projetos/types"
import type { Readiness } from "@/server/ai-module/builder/state/readiness.types"
import {
  blockersToChecklist,
  journeyToPhases,
  stepsToStages,
  unwrapReadiness,
} from "../helpers/readiness-adapters"
import type { JourneyPhaseView, ReadinessItem, Stage } from "../types"

interface ProjectReadiness {
  /** Snapshot canônico do step-engine; null enquanto carrega ou em erro. */
  readiness: Readiness | null
  /** Checklist da jornada adaptado para o StageList. */
  stages: Stage[]
  /**
   * Visão por fases (Journey v2) — `null` em projetos v1, quando a Overview
   * cai no `stages` plano (render byte-idêntico, NFR-03).
   */
  phases: JourneyPhaseView[] | null
  /** Os 6 pre-deploy checks adaptados para a Prontidão. */
  checklist: ReadinessItem[]
  /** True apenas no primeiro load (sem snapshot ainda). */
  isLoading: boolean
}

export function useProjectReadiness(
  projectId: string,
  messages: ChatMessage[],
): ProjectReadiness {
  const { data, isLoading, refetch } = api.builder.getReadiness.useQuery({
    params: { id: projectId },
  })

  // Identidade estável para os efeitos de refetch (o hook gerado pode trocar
  // a identidade de `refetch` a cada render).
  const refetchRef = React.useRef(refetch)
  React.useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  // Refetch on window focus — o usuário volta da aba do WhatsApp/chat e o
  // progresso acompanha sem F5.
  React.useEffect(() => {
    const onFocus = () => {
      void refetchRef.current()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  // Refetch quando a conversa avança (inclui submits de card, que geram um
  // turno novo). Sinal barato: nº de mensagens + nº de tool-results.
  const activitySignal = React.useMemo(() => {
    let toolResults = 0
    for (const msg of messages) {
      if (!msg.toolCalls) continue
      for (const call of msg.toolCalls) {
        if (call.result !== undefined) toolResults += 1
      }
    }
    return `${messages.length}:${toolResults}`
  }, [messages])

  const lastSignalRef = React.useRef(activitySignal)
  React.useEffect(() => {
    if (lastSignalRef.current === activitySignal) return
    lastSignalRef.current = activitySignal
    void refetchRef.current()
  }, [activitySignal])

  const readiness = React.useMemo(() => unwrapReadiness(data), [data])
  const stages = React.useMemo(
    () => (readiness ? stepsToStages(readiness) : []),
    [readiness],
  )
  const phases = React.useMemo(
    () => (readiness ? journeyToPhases(readiness) : null),
    [readiness],
  )
  const checklist = React.useMemo(
    () => (readiness ? blockersToChecklist(readiness) : []),
    [readiness],
  )

  return {
    readiness,
    stages,
    phases,
    checklist,
    isLoading: readiness === null && Boolean(isLoading),
  }
}
