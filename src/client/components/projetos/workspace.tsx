"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Bot, MessageSquare, MoreVertical } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Input } from "@/client/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import {
  PROJECT_STATUS_LABEL,
  getProjectStatusStyle,
} from "@/lib/project-status"

import { ChatPanel } from "./chat-panel"
import { PreviewPanel } from "./preview-panel"
import type { ChatMessage, PreviewTab, WorkspaceProject } from "./types"

interface WorkspaceProps {
  project: WorkspaceProject
  initialMessages: ChatMessage[]
}

const VALID_TABS: PreviewTab[] = ["overview", "prompt", "playground", "deploy"]

function parseTab(value: string | null): PreviewTab {
  if (value && (VALID_TABS as string[]).includes(value)) {
    return value as PreviewTab
  }
  return "overview"
}

/**
 * Workspace — split layout (chat à esquerda, preview à direita)
 *
 * Header sticky com:
 *  - back button → /projetos
 *  - rename inline (shadcn Input)
 *  - status badge (paleta compartilhada via project-status.ts)
 *  - mobile toggle (shadcn ToggleGroup) entre chat / preview
 *  - menu ⋯ com ações (Renomear / Duplicar / Arquivar)
 *
 * Tema reativo via useAppTokens — mesmo padrão da home + sidebar.
 */
export function Workspace({ project, initialMessages }: WorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tokens } = useAppTokens()

  const [name, setName] = React.useState(project.name)
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [mobilePanel, setMobilePanel] = React.useState<"chat" | "preview">(
    "chat",
  )

  const status = getProjectStatusStyle(project.status)
  const statusLabel = PROJECT_STATUS_LABEL[project.status]

  const activeTab = React.useMemo(
    () => parseTab(searchParams.get("tab")),
    [searchParams],
  )

  const handleTabChange = React.useCallback(
    (tab: PreviewTab) => {
      const params = new URLSearchParams(searchParams.toString())
      if (tab === "overview") params.delete("tab")
      else params.set("tab", tab)
      const qs = params.toString()
      router.replace(`/projetos/${project.id}${qs ? `?${qs}` : ""}`, {
        scroll: false,
      })
    },
    [project.id, router, searchParams],
  )

  const handleNameSubmit = React.useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (trimmed && trimmed !== project.name) {
        // TODO: POST /api/v1/builder/projects/:id/rename
        console.log("[workspace] rename stub", { id: project.id, name: trimmed })
        setName(trimmed)
      } else {
        setName(project.name)
      }
      setIsEditingName(false)
    },
    [project.id, project.name],
  )

  const handleMenuAction = React.useCallback(
    (action: "archive" | "duplicate" | "rename") => {
      console.log("[workspace] menu stub", { id: project.id, action })
      if (action === "rename") setIsEditingName(true)
    },
    [project.id],
  )

  return (
    <div
      className="flex h-screen flex-col"
      style={{
        backgroundColor: tokens.bgBase,
        color: tokens.textPrimary,
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* ───── Sticky header ───── */}
      <header
        className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 px-3 backdrop-blur md:px-4"
        style={{
          borderBottom: `1px solid ${tokens.divider}`,
          backgroundColor: `${tokens.bgBase}cc`, // 80% alpha
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="shrink-0"
            style={{ color: tokens.textSecondary }}
          >
            <Link href="/projetos" aria-label="Voltar para projetos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          {isEditingName ? (
            <Input
              autoFocus
              defaultValue={name}
              onBlur={(e) => handleNameSubmit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                }
                if (e.key === "Escape") {
                  setIsEditingName(false)
                }
              }}
              className="h-8 max-w-xs text-sm font-semibold"
              aria-label="Nome do projeto"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingName(true)}
              className="min-w-0 truncate rounded-md px-2 py-1 text-left text-sm font-semibold transition-colors"
              style={{ color: tokens.textPrimary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = tokens.hoverBg
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent"
              }}
              title="Clique para renomear"
            >
              {name}
            </button>
          )}

          {/* Status badge — shared palette */}
          <span
            className="hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide sm:inline-flex"
            style={{ backgroundColor: status.bg, color: status.color }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: status.dot }}
            />
            {statusLabel}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Mobile toggle — shadcn ToggleGroup (radiogroup a11y) */}
          <ToggleGroup
            type="single"
            value={mobilePanel}
            onValueChange={(v) => {
              if (v === "chat" || v === "preview") setMobilePanel(v)
            }}
            className="md:hidden"
            size="sm"
          >
            <ToggleGroupItem value="chat" aria-label="Ver chat" className="gap-1.5 px-2.5 text-xs">
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </ToggleGroupItem>
            <ToggleGroupItem value="preview" aria-label="Ver agente" className="gap-1.5 px-2.5 text-xs">
              <Bot className="h-3.5 w-3.5" />
              Agente
            </ToggleGroupItem>
          </ToggleGroup>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                style={{ color: tokens.textSecondary }}
                aria-label="Ações do projeto"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => handleMenuAction("rename")}>
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleMenuAction("duplicate")}>
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleMenuAction("archive")}
                className="text-destructive focus:text-destructive"
              >
                Arquivar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ───── Body: split layout ───── */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col md:max-w-[50%] ${
            mobilePanel === "chat" ? "flex" : "hidden md:flex"
          }`}
          style={{
            borderRight: `1px solid ${tokens.divider}`,
          }}
        >
          <ChatPanel projectId={project.id} initialMessages={initialMessages} />
        </section>

        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col md:max-w-[50%] ${
            mobilePanel === "preview" ? "flex" : "hidden md:flex"
          }`}
        >
          <PreviewPanel
            project={project}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </section>
      </main>
    </div>
  )
}
