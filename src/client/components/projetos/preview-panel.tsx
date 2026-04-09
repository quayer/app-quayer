'use client'

/**
 * PreviewPanel — US-025
 *
 * Tabbed preview for a workspace project. Owns no state beyond what is
 * passed in via props — tab state lives in workspace.tsx (URL source of truth).
 *
 * Extension point: for v1 we always render the 4 AI-agent tabs. When other
 * project types are introduced, branch on project.type here to swap the tab
 * set (e.g. for 'crm_automation' render different tabs).
 */

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/client/components/ui/tabs'
import type { PreviewPanelProps, PreviewTab } from '@/client/components/projetos/types'
import { OverviewTab } from '@/client/components/projetos/tabs/overview-tab'
import { PromptTab } from '@/client/components/projetos/tabs/prompt-tab'
import { PlaygroundTab } from '@/client/components/projetos/tabs/playground-tab'
import { DeployTab } from '@/client/components/projetos/tabs/deploy-tab'

export function PreviewPanel({ project, activeTab, onTabChange }: PreviewPanelProps) {
  // v1: always render the AI-agent tab set.
  // TODO(builder-v2): branch on project.type to render different tab sets
  // for other project types (e.g. crm_automation, workflow_builder, etc.)
  return (
    <div className="flex h-full flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as PreviewTab)}
        className="flex h-full flex-col"
      >
        <div className="border-b px-4 py-3">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
            <TabsTrigger value="deploy">Deploy</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="overview" className="m-0 p-6">
            <OverviewTab project={project} />
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
