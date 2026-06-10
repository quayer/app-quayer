"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Layout, MessageSquare, MoreVertical, Pencil } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/igniter.client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/client/components/ui/alert-dialog"
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
import { getTabByValue } from "./preview/tab-registry"
import type { ChatMessage, PreviewTab, WorkspaceProject } from "./types"

interface WorkspaceProps {
  project: WorkspaceProject
  initialMessages: ChatMessage[]
}

export function Workspace(props: WorkspaceProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-screen bg-background" aria-hidden="true" />
  }

  return <WorkspaceContent {...props} />
}

/**
 * Workspace — split layout (chat à esquerda, preview à direita)
 *
 * Header sticky com:
 *  - back button → /projetos
 *  - rename inline (shadcn Input)
 *  - status badge (paleta compartilhada via project-status.ts)
 *  - mobile toggle (shadcn ToggleGroup) entre chat / preview
 *  - menu ⋯ com ações (Renomear / Duplicar / Arquivar ou Restaurar / Excluir)
 *
 * Tema reativo via useAppTokens — mesmo padrão da home + sidebar.
 */
function WorkspaceContent({ project, initialMessages }: WorkspaceProps) {
  const { tokens } = useAppTokens()
  const router = useRouter()

  const [name, setName] = React.useState(project.name)
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = React.useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)
  const [mobilePanel, setMobilePanel] = React.useState<"chat" | "preview">(
    "chat",
  )
  // Tab state is LOCAL + mirrored to URL via `window.history.replaceState`.
  // We deliberately avoid `next/navigation`'s router.replace: on a dynamic
  // route like /projetos/[id] it would trigger RSC refetch + AuthProvider
  // re-fetch + network errors on every tab click. `history.replaceState`
  // updates the URL with zero navigation, zero RSC cascade — pure client
  // deep-linking. Initial value is hydrated from `?tab=` in a mount effect
  // (guarded for SSR; useState initializer runs on the server too).
  const [activeTab, setActiveTab] = React.useState<PreviewTab>("overview")

  // Hydrate active tab from the URL on mount (client-only).
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const raw = params.get("tab")
    if (!raw) return
    const descriptor = getTabByValue(raw)
    if (descriptor) {
      setActiveTab(descriptor.value)
    }
  }, [])
  // Shared messages state — ChatPanel reports changes so PreviewPanel can
  // derive dynamic progress from tool calls.
  const [liveMessages, setLiveMessages] = React.useState<ChatMessage[]>(initialMessages)

  // ── Refetch pós-create_agent (destravar tabs sem F5) ──────────────────────
  // `project` é um snapshot RSC: quando o Builder cria o agente (ou a instância
  // WhatsApp) no meio da conversa, as tabs Prompt/Testar/Publicar ficariam
  // travadas até um F5. Este efeito observa os tool-results do chat e dispara
  // UM `router.refresh()` por evento (guard por toolName via ref) para
  // rebuscar o Server Component. Sem loop: o tool já marcado nunca re-dispara,
  // e o guard de staleness pula histórico antigo cujo efeito já está no snapshot.
  const handledUnlockToolsRef = React.useRef<Set<string>>(new Set())
  React.useEffect(() => {
    const staleChecks: ReadonlyArray<{
      toolName: string
      isStale: () => boolean
    }> = [
      { toolName: "create_agent", isStale: () => project.aiAgent === null },
      {
        toolName: "create_whatsapp_instance",
        isStale: () => !project.hasWhatsAppConnection,
      },
    ]
    for (const msg of liveMessages) {
      if (msg.role !== "assistant" || !msg.toolCalls) continue
      for (const call of msg.toolCalls) {
        const check = staleChecks.find((c) => c.toolName === call.toolName)
        if (!check || !call.result) continue
        const result = call.result as Record<string, unknown>
        if (result.success === false) continue
        if (handledUnlockToolsRef.current.has(call.toolName)) continue
        handledUnlockToolsRef.current.add(call.toolName)
        if (!check.isStale()) continue
        router.refresh()
        return
      }
    }
  }, [liveMessages, project.aiAgent, project.hasWhatsAppConnection, router])

  const status = getProjectStatusStyle(project.status)
  const statusLabel = PROJECT_STATUS_LABEL[project.status]

  // ── Lifecycle mutations ─────────────────────────────────────────────────────
  // Rename: optimistic UI update, revert on error
  const renameMutation = api.builder.renameProject.useMutation({
    onSuccess: () => {
      toast.success("Projeto renomeado")
    },
    onError: (error: unknown) => {
      // Revert optimistic name change
      setName(project.name)
      const message =
        error instanceof Error ? error.message : "Erro ao renomear projeto"
      toast.error(message)
    },
  })

  // Archive: navigate back to /projetos on success
  const archiveMutation = api.builder.archiveProject.useMutation({
    onSuccess: () => {
      toast.success("Projeto arquivado")
      router.push("/projetos")
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Erro ao arquivar projeto"
      toast.error(message)
    },
  })

  // Duplicate: redirect to the new project on success
  const duplicateMutation = api.builder.duplicateProject.useMutation({
    onSuccess: (result) => {
      const newId = result?.data?.id
      toast.success("Projeto duplicado")
      if (newId) {
        router.push(`/projetos/${newId}?tab=overview`)
      } else {
        router.push("/projetos")
      }
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Erro ao duplicar projeto"
      toast.error(message)
    },
  })

  // Restore: archived → draft, refresh to update the status badge in place
  const unarchiveMutation = api.builder.unarchiveProject.useMutation({
    onSuccess: () => {
      toast.success("Projeto restaurado")
      router.refresh()
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Erro ao restaurar projeto"
      toast.error(message)
    },
  })

  // Delete: PERMANENT — navigate back to /projetos on success
  const deleteMutation = api.builder.deleteProject.useMutation({
    onSuccess: () => {
      toast.success("Projeto excluído permanentemente")
      router.push("/projetos")
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Erro ao excluir projeto"
      toast.error(message)
    },
  })

  const handleTabChange = React.useCallback((tab: PreviewTab) => {
    setActiveTab(tab)
    if (typeof window !== "undefined") {
      // Pure client URL update — no RSC navigation, no router.replace.
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?tab=${tab}`,
      )
    }
  }, [])

  React.useEffect(() => {
    const handleFocusChat = () => setMobilePanel("chat")
    window.addEventListener("builder:focus-chat", handleFocusChat)
    return () => window.removeEventListener("builder:focus-chat", handleFocusChat)
  }, [])

  const handleNameSubmit = React.useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (trimmed && trimmed !== project.name) {
        // Optimistic update: reflect change immediately in the UI
        setName(trimmed)
        setIsEditingName(false)
        renameMutation.mutate({ params: { id: project.id }, body: { name: trimmed } })
      } else {
        setName(project.name)
        setIsEditingName(false)
      }
    },
    [project.id, project.name, renameMutation],
  )

  const handleMenuAction = React.useCallback(
    (action: "archive" | "duplicate" | "rename") => {
      if (action === "rename") {
        setIsEditingName(true)
        return
      }
      if (action === "archive") {
        setArchiveConfirmOpen(true)
        return
      }
      if (action === "duplicate") {
        duplicateMutation.mutate({ params: { id: project.id }, body: {} })
        return
      }
    },
    [project.id, duplicateMutation],
  )

  return (
    <>
    <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar projeto?</AlertDialogTitle>
          <AlertDialogDescription>
            O projeto <strong>{name}</strong> será arquivado e removido da lista
            principal. Você pode encontrá-lo nos projetos arquivados depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              archiveMutation.mutate({ params: { id: project.id }, body: {} })
            }
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Arquivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação é <strong>irreversível</strong>. O projeto{" "}
            <strong>{name}</strong>, sua conversa com o Builder e o histórico de
            mensagens do projeto serão apagados. O agente já publicado é
            desativado para parar de responder no WhatsApp.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              deleteMutation.mutate({ params: { id: project.id } })
            }
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

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
              className="group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm font-semibold transition-colors"
              style={{ color: tokens.textPrimary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = tokens.hoverBg
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent"
              }}
              aria-label="Renomear projeto"
            >
              <span className="truncate">{name}</span>
              <Pencil
                className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
                aria-hidden="true"
              />
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

        <div className="flex shrink-0 items-center gap-3">
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
            <ToggleGroupItem value="preview" aria-label="Ver painel" className="gap-1.5 px-2.5 text-xs">
              <Layout className="h-3.5 w-3.5" />
              Painel
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
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => handleMenuAction("rename")}>
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleMenuAction("duplicate")}>
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {project.status === "archived" ? (
                <DropdownMenuItem
                  onClick={() =>
                    unarchiveMutation.mutate({
                      params: { id: project.id },
                      body: {},
                    })
                  }
                >
                  Restaurar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => handleMenuAction("archive")}
                  className="text-destructive focus:text-destructive"
                >
                  Arquivar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setDeleteConfirmOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                Excluir permanentemente
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
          <ChatPanel
            projectId={project.id}
            initialMessages={initialMessages}
            onMessagesChange={setLiveMessages}
          />
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
            messages={liveMessages}
          />
        </section>
      </main>
    </div>
    </>
  )
}
