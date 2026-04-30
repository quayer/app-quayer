"use client"

/**
 * PreviewPanel — workspace direita (tabs do projeto).
 *
 * Usa `getTabsForProjectWithLocked` para mostrar SEMPRE todas as tabs
 * elegíveis ao type — locked quando requiresAgent e sem agent ainda.
 * Isso evita layout shift quando o agente é criado mid-session.
 *
 * Banners (working / error) ficam DENTRO do scroll container (sticky top-0)
 * para não empurrar o tab strip a cada ferramenta que a AI executa.
 */

import { useMemo, useState } from "react"
import { Lock } from "lucide-react"
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
import { BuilderWorkingBanner } from "@/client/components/projetos/preview/banners/builder-working-banner"
import { ErrorBanner } from "@/client/components/projetos/preview/banners/error-banner"
import { getBannerState } from "@/client/components/projetos/preview/banners/derive-banner-state"

export function PreviewPanel({
  project,
  activeTab,
  onTabChange,
  messages,
}: PreviewPanelProps) {
  const { tokens } = useAppTokens()

  // Inclui tabs bloqueadas — layout estável desde o início
  const tabs = useMemo(() => getTabsForProjectWithLocked(project), [project])

  // Tabs desbloqueadas para fallback e renderização de conteúdo
  const unlockedTabs = useMemo(() => tabs.filter((t) => !t.locked), [tabs])

  // Fallback: se a URL aponta para tab bloqueada ou inexistente → overview
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

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ backgroundColor: tokens.bgBase }}
    >
      <Tabs
        value={safeActiveTab}
        onValueChange={(v) => onTabChange(v as PreviewTab)}
        className="flex h-full min-h-0 flex-col"
      >
        {/* Tab strip — sempre estável, locked tabs não clicáveis */}
        <div
          className="flex shrink-0 items-center px-4 py-3"
          style={{ borderBottom: `1px solid ${tokens.divider}` }}
        >
          <TabsList
            className="h-9 gap-1 border p-1"
            style={{
              backgroundColor: tokens.bgSurface,
              borderColor: tokens.divider,
            }}
          >
            {tabs.map((tab) =>
              tab.locked ? (
                <button
                  key={tab.value}
                  type="button"
                  disabled
                  title="Disponível após o Builder criar o agente"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium cursor-not-allowed select-none"
                  style={{ color: tokens.textTertiary, opacity: 0.55 }}
                >
                  <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  {tab.label}
                </button>
              ) : (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-md px-3 text-[12px] font-medium transition-colors data-[state=active]:shadow-none"
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
                  onDismiss={() =>
                    setDismissedErrorId(errorBanner.lastErrorId)
                  }
                />
              )}
            </div>
          )}

          {unlockedTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="m-0 p-6">
              {tab.render({ project, messages, onTabChange })}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  )
}
