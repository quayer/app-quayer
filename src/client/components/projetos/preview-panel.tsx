"use client"

/**
 * PreviewPanel — workspace direita (tabs do projeto).
 *
 * Usa `getTabsForProjectWithLocked` com o `readiness` içado (lido do
 * {@link ReadinessContext} provido pelo `workspace.tsx`). Em projetos v2
 * (`readiness.journey` presente), o registry FILTRA as tabs por fase — revelação
 * progressiva, sem tabs visíveis-porém-bloqueadas (T53/T54, FR-19). Em v1 (sem
 * `journey`), mantém o comportamento legado: mostra SEMPRE todas as tabs
 * elegíveis ao type — locked quando `requiresAgent` e sem agent ainda — evitando
 * layout shift quando o agente é criado mid-session (NFR-03).
 *
 * Banners (working / error) ficam DENTRO do scroll container (sticky top-0)
 * para não empurrar o tab strip a cada ferramenta que a AI executa.
 */

import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { Lock } from "lucide-react"
import { toast } from "sonner"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/client/components/ui/tabs"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type {
  PreviewPanelProps,
  PreviewTab,
} from "@/client/components/projetos/types"
import {
  getTabsForProjectWithLocked,
} from "@/client/components/projetos/preview/tab-registry"
import { ReadinessContext } from "@/client/components/projetos/chat/use-chat-stream"
import { BuilderWorkingBanner } from "@/client/components/projetos/preview/banners/builder-working-banner"
import { ErrorBanner } from "@/client/components/projetos/preview/banners/error-banner"
import { getBannerState } from "@/client/components/projetos/preview/banners/derive-banner-state"

/** Erro de tool não deve ser eterno — o banner se auto-oculta após ~10s. */
const ERROR_BANNER_AUTO_DISMISS_MS = 10_000

export function PreviewPanel({
  project,
  activeTab,
  onTabChange,
  messages,
}: PreviewPanelProps) {
  const { tokens } = useAppTokens()

  // Readiness içado (fonte única, FR-18): o `workspace.tsx` é o dono da query e
  // injeta via ReadinessContext. v2 (`journey` presente) → registry filtra por
  // fase; v1 → comportamento locked legado (NFR-03).
  const { readiness, refetchReadiness } = useContext(ReadinessContext)

  // v1: inclui tabs bloqueadas (layout estável). v2: filtradas por fase.
  const tabs = useMemo(
    () => getTabsForProjectWithLocked(project, readiness),
    [project, readiness],
  )

  // Tabs desbloqueadas para fallback e renderização de conteúdo
  const unlockedTabs = useMemo(() => tabs.filter((t) => !t.locked), [tabs])

  // T101c (FR-32): tab recém-liberada ganha UM pulso de destaque. One-shot e
  // local: só em v2 (revelação progressiva por fase); a baseline do 1º render
  // NUNCA pulsa, cada tab pulsa no máximo 1 vez (ref `pulsedTabs`) e a classe é
  // removida no `animationend` — nunca repete em re-render. O
  // `prefers-reduced-motion` global salta direto pro estado final.
  const journeyActive = readiness?.journey !== undefined
  const seenUnlockedRef = useRef<Set<string> | null>(null)
  const pulsedTabsRef = useRef<Set<string>>(new Set())
  const [pulsingTabs, setPulsingTabs] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const current = new Set(unlockedTabs.map((t) => t.value))
    // 1º render (ou projeto v1): grava a baseline SEM pulsar.
    if (!journeyActive || seenUnlockedRef.current === null) {
      seenUnlockedRef.current = current
      return
    }
    const seen = seenUnlockedRef.current
    const newlyLiberated: string[] = []
    for (const value of current) {
      if (!seen.has(value) && !pulsedTabsRef.current.has(value)) {
        pulsedTabsRef.current.add(value)
        newlyLiberated.push(value)
      }
    }
    seenUnlockedRef.current = current
    if (newlyLiberated.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pulso one-shot disparado pela TRANSIÇÃO de liberação de tab entre renders (não há sistema externo p/ sincronizar)
      setPulsingTabs((prev) => new Set([...prev, ...newlyLiberated]))
    }
  }, [journeyActive, unlockedTabs])

  const handlePulseEnd = (value: string) => {
    setPulsingTabs((prev) => {
      if (!prev.has(value)) return prev
      const next = new Set(prev)
      next.delete(value)
      return next
    })
  }

  // Fallback de DEEP-LINK: se a URL (?tab=) aponta para tab bloqueada ou
  // inexistente → overview. Cliques nunca caem aqui — tab travada não dispara
  // onTabChange; o clique mostra o motivo via toast/title (FR-20).
  const safeActiveTab: PreviewTab = useMemo(() => {
    const found = tabs.find((t) => t.value === activeTab)
    if (!found || found.locked) return "overview"
    return activeTab
  }, [tabs, activeTab])

  const [dismissedErrorId, setDismissedErrorId] = useState<string | null>(null)
  const bannerState = useMemo(
    () => getBannerState(messages, dismissedErrorId),
    [messages, dismissedErrorId],
  )
  const errorBanner = bannerState.error

  // Auto-dismiss: cada novo erro (lastErrorId) arma um timer de ~10s; fechar
  // manualmente ("Ocultar") ou um erro mais novo re-arma/limpa o timer.
  const lastErrorId = errorBanner?.lastErrorId ?? null
  useEffect(() => {
    if (lastErrorId === null) return
    const timer = window.setTimeout(
      () => setDismissedErrorId(lastErrorId),
      ERROR_BANNER_AUTO_DISMISS_MS,
    )
    return () => window.clearTimeout(timer)
  }, [lastErrorId])

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ backgroundColor: tokens.bgBase }}
    >
      <Tabs
        value={safeActiveTab}
        onValueChange={(v) => {
          // Trocar de tab descarta o erro corrente — ele não deve perseguir o
          // usuário pelas demais tabs.
          if (errorBanner !== null) setDismissedErrorId(errorBanner.lastErrorId)
          onTabChange(v as PreviewTab)
        }}
        className="flex h-full min-h-0 flex-col"
      >
        {/* Tab strip — sempre estável, locked tabs não clicáveis */}
        <div
          className="flex shrink-0 items-center overflow-x-auto px-4 py-3"
          style={{ borderBottom: `1px solid ${tokens.divider}` }}
        >
          <TabsList
            className="h-12 min-w-max gap-1 border p-1"
            style={{
              backgroundColor: tokens.bgSurface,
              borderColor: tokens.divider,
            }}
          >
            {tabs.map((tab) =>
              tab.locked ? (
                // Travada porém CLICÁVEL: o clique explica o porquê (toast +
                // title) em vez de não fazer nada / cair na overview (FR-20).
                // O motivo vem do registry (gate único `canOpenDeploy` para a
                // tab Publicar; regra `requiresAgent` para as demais).
                <button
                  key={tab.value}
                  type="button"
                  aria-disabled="true"
                  title={tab.lockedReason ?? undefined}
                  onClick={() => {
                    if (tab.lockedReason) toast.info(tab.lockedReason)
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium cursor-not-allowed select-none"
                  style={{ color: tokens.textTertiary, opacity: 0.55 }}
                >
                  <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  {tab.label}
                </button>
              ) : (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  onAnimationEnd={
                    pulsingTabs.has(tab.value)
                      ? () => handlePulseEnd(tab.value)
                      : undefined
                  }
                  className={`h-10 rounded-md px-3 text-[12px] font-medium transition-colors data-[state=active]:shadow-none ${
                    pulsingTabs.has(tab.value) ? "builder-tab-pulse" : ""
                  }`}
                  style={{
                    color:
                      safeActiveTab === tab.value
                        ? tokens.brandText
                        : tokens.textSecondary,
                    backgroundColor:
                      safeActiveTab === tab.value
                        ? tokens.brandSubtle
                        : "transparent",
                  }}
                >
                  {tab.label}
                </TabsTrigger>
              ),
            )}
          </TabsList>
        </div>

        {/* Scroll container — banners ficam aqui (sticky) sem afetar tab strip */}
        <div className="relative flex-1 min-h-0 overflow-y-auto">
          {/* Banners sticky no topo do conteúdo — sem layout shift no strip */}
          {(bannerState.working || errorBanner !== null) && (
            <div className="sticky top-0 z-10">
              {bannerState.working && <BuilderWorkingBanner />}
              {errorBanner !== null && (
                <ErrorBanner
                  message={errorBanner.message}
                  onDismiss={() =>
                    setDismissedErrorId(errorBanner.lastErrorId)
                  }
                />
              )}
            </div>
          )}

          {unlockedTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="m-0 p-6">
              {tab.render({
                project,
                messages,
                onTabChange,
                readiness,
                refetchReadiness,
              })}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  )
}
