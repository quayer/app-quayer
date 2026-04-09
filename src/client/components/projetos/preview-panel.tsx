"use client"

/**
 * PreviewPanel — workspace direita (tabs do agente)
 *
 * Tema reativo via useAppTokens. Usa shadcn Tabs como base mas com
 * estilização inline pra combinar com o tom v3 (tabs pill + active
 * amber). Owns no state — tudo vem via props do workspace.
 */

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

import { OverviewTab } from "@/client/components/projetos/tabs/overview-tab"
import { PromptTab } from "@/client/components/projetos/tabs/prompt-tab"
import { PlaygroundTab } from "@/client/components/projetos/tabs/playground-tab"
import { DeployTab } from "@/client/components/projetos/tabs/deploy-tab"

export function PreviewPanel({
  project,
  activeTab,
  onTabChange,
}: PreviewPanelProps) {
  const { tokens } = useAppTokens()

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ backgroundColor: tokens.bgBase }}
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as PreviewTab)}
        className="flex h-full min-h-0 flex-col"
      >
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
            {(
              [
                { value: "overview", label: "Visão geral" },
                { value: "prompt", label: "Prompt" },
                { value: "playground", label: "Playground" },
                { value: "deploy", label: "Publicar" },
              ] as const
            ).map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-7 rounded-md px-3 text-[12px] font-medium transition-colors data-[state=active]:shadow-none"
                style={{
                  color:
                    activeTab === tab.value
                      ? tokens.brandText
                      : tokens.textSecondary,
                  backgroundColor:
                    activeTab === tab.value ? tokens.brandSubtle : "transparent",
                }}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Tab content area — single scroll container */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <TabsContent value="overview" className="m-0 p-6">
            <OverviewTab project={project} onTabChange={onTabChange} />
          </TabsContent>
          <TabsContent value="prompt" className="m-0 p-6">
            <PromptTab project={project} />
          </TabsContent>
          <TabsContent value="playground" className="m-0 p-6">
            <PlaygroundTab project={project} />
          </TabsContent>
          <TabsContent value="deploy" className="m-0 p-6">
            <DeployTab project={project} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
