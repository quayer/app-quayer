"use client"

/**
 * PreviewPanel — workspace direita (tabs do projeto).
 *
 * Consome `TAB_REGISTRY` filtrado pelo `project.type`. Owns no state —
 * tudo vem via props do workspace. Tema reativo via useAppTokens.
 *
 * A lista de tabs não é mais hardcoded aqui: cada project type pode ter
 * seu próprio conjunto via `visibleFor` no registry. Hoje só `ai_agent`
 * tem tabs específicas; outros kinds caem só nas tabs _core.
 */

import { useMemo, useState } from "react"
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
import { getTabsForType } from "@/client/components/projetos/preview/tab-registry"
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

  const tabs = useMemo(() => getTabsForType(project.type), [project.type])

  // Fallback: se a URL aponta pra uma tab não disponível pro type (ex.
  // deep link antigo), cai em 'overview' que é _core para todos os tipos.
  const safeActiveTab: PreviewTab = useMemo(() => {
    return tabs.some((t) => t.value === activeTab) ? activeTab : "overview"
  }, [tabs, activeTab])

  // Persistent banners — driven by the live chat messages. "Working" is
  // auto-managed (shows while any tool call is in-flight); "error" is
  // dismissable per-message-id so a fresh failure reopens it.
  const [dismissedErrorId, setDismissedErrorId] = useState<string | null>(null)
  const bannerState = useMemo(
    () => getBannerState(messages, dismissedErrorId),
    [messages, dismissedErrorId],
  )
  // Local alias so the JSX below can narrow through a const (avoids `!`).
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
        {bannerState.working && <BuilderWorkingBanner />}
        {errorBanner !== null && (
          <ErrorBanner
            onDismiss={() => setDismissedErrorId(errorBanner.lastErrorId)}
          />
        )}

        {/* Tab strip — sticky top, same divider style as header */}
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
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-7 rounded-md px-3 text-[12px] font-medium transition-colors data-[state=active]:shadow-none"
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
            ))}
          </TabsList>
        </div>

        {/* Tab content area — single scroll container */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="m-0 p-6">
              {tab.render({ project, messages, onTabChange })}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  )
}
