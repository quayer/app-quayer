"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Bot, ChevronDown, Paperclip, Sparkles, X } from "lucide-react"
import { Logo } from "@/client/components/ds/logo"
import { MessageInput } from "@/client/components/ds/message-input"
import { ClaudeIcon, CodexIcon } from "@/client/components/ds/model-icons"
import { EmptyState } from "@/client/components/custom/empty-state"
import {
  PROJECT_STATUS_LABEL,
  getProjectStatusStyle,
} from "@/lib/project-status"
import type { ProjectStatus } from "@/client/components/projetos/types"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import { api } from "@/igniter.client"

interface Project {
  id: string
  name: string
  status: string
  type: string
}

interface HomePageProps {
  recentProjects: Project[]
}

type Tab = "my-projects" | "team-projects"

interface ModelOption {
  id: string
  label: string
  icon: typeof ClaudeIcon
}

const MODELS: ModelOption[] = [
  { id: "claude", label: "Claude", icon: ClaudeIcon },
  { id: "codex", label: "Codex", icon: CodexIcon },
]

const INPUT_PLACEHOLDER =
  "ex: agente de captação de leads pra advocacia tributária..."

/** Tipos de arquivo aceitos para anexar ao prompt do agente. */
const ACCEPTED_FILE_TYPES =
  "image/*,application/pdf,text/plain,text/markdown,.md,.csv"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function HomePage({
  recentProjects,
}: HomePageProps) {
  const router = useRouter()
  const { tokens } = useAppTokens()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [prompt, setPrompt] = useState("")
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[0]!)
  const [modelOpen, setModelOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("my-projects")
  const createProject = api.builder.createProject as any

  const pickFile = () => fileInputRef.current?.click()
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (file && file.size > 10 * 1024 * 1024) {
      setError("Arquivo acima de 10 MB. Escolha um menor.")
      return
    }
    setAttachedFile(file)
    if (error) setError(null)
  }
  const removeFile = () => {
    setAttachedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // Auto-focus no mount — cobre navegação via ⌘K e clique em "Nova conversa"
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])


  const submit = useCallback(() => {
    const trimmed = prompt.trim()
    if (trimmed.length < 10) {
      setError("Descreva com mais detalhe (mínimo 10 caracteres).")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await createProject.mutate({
          body: { prompt: trimmed, type: "ai_agent" },
        })
        const projectId = result?.data?.data?.projectId
        if (!projectId) throw new Error("Projeto criado mas ID não retornado")
        router.push(`/projetos/${projectId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      }
    })
  }, [prompt, router, createProject])


  return (
    <div
      className="relative flex min-h-screen flex-col"
      style={{
        backgroundColor: tokens.bgBase,
        color: tokens.textPrimary,
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Subtle ambient gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 40% at 50% -10%, rgba(255,214,10,0.10), transparent 65%)",
        }}
      />

      <div className="relative flex flex-1 flex-col items-center px-6 pt-24 pb-16">
        <div className="w-full max-w-[640px]">
          {/* Announcement tag — não é actionable, é info */}
          <div className="mb-8 flex justify-center">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium"
              style={{
                borderColor: tokens.brandBorder,
                backgroundColor: tokens.brandSubtle,
                color: tokens.brand,
                minHeight: "36px",
              }}
              role="status"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span>
                Build locally with{" "}
                <span style={{ fontWeight: 700 }}>QuayerCLI</span>
              </span>
            </div>
          </div>

          {/* Heading — logo inline à esquerda pra economizar altura vertical */}
          <div className="mb-10 flex items-center justify-center gap-4">
            <Logo size={44} variant="color" showWordmark={false} />
            <h1
              className="text-[2.25rem] font-bold sm:text-[2.75rem]"
              style={{
                letterSpacing: "-0.03em",
                lineHeight: "1.05",
                color: tokens.textPrimary,
              }}
            >
              O que vamos criar hoje?
            </h1>
          </div>

          {/* Input — hidden file trigger fora do MessageInput */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleFileChange}
            className="hidden"
            aria-hidden
          />

          <MessageInput
            value={prompt}
            onChange={(v) => { setPrompt(v); if (error) setError(null) }}
            onSend={submit}
            disabled={isPending}
            placeholder={INPUT_PLACEHOLDER}
            minLength={10}
            rows={3}
            sendOnEnter
            tokens={tokens}
            borderColor={error ? "rgba(239,68,68,0.45)" : undefined}
            textareaRef={textareaRef}
            textareaProps={{ id: "builder-home-input" }}
            aboveTextarea={attachedFile ? (
              <div
                className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
                style={{ borderColor: tokens.divider }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: "rgba(255,214,10,0.1)", color: tokens.brand }}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium" style={{ color: tokens.textPrimary }}>
                      {attachedFile.name}
                    </p>
                    <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
                      {formatFileSize(attachedFile.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeFile}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/5"
                  style={{ color: tokens.textTertiary }}
                  aria-label="Remover anexo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : undefined}
            leftSlot={
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={pickFile}
                  disabled={isPending}
                  className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-white/5 disabled:opacity-50"
                  style={{
                    borderColor: attachedFile ? tokens.brandBorder : tokens.border,
                    backgroundColor: attachedFile ? "rgba(255,214,10,0.08)" : "transparent",
                    color: attachedFile ? tokens.brand : tokens.textSecondary,
                  }}
                  aria-label="Anexar arquivo"
                  title="Anexar imagem, PDF ou texto (até 10 MB)"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setModelOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={modelOpen}
                    className="flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
                    style={{ borderColor: tokens.border, color: tokens.textPrimary }}
                  >
                    <selectedModel.icon size={14} />
                    {selectedModel.label}
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </button>

                  {modelOpen && (
                    <>
                      <div aria-hidden className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} />
                      <div
                        role="listbox"
                        className="absolute bottom-11 left-0 z-20 min-w-[160px] overflow-hidden rounded-xl border p-1 shadow-xl"
                        style={{
                          backgroundColor: tokens.bgElevated,
                          borderColor: tokens.border,
                          boxShadow: "0 12px 40px -12px rgba(0,0,0,0.8)",
                        }}
                      >
                        {MODELS.map((model) => {
                          const selected = model.id === selectedModel.id
                          const Icon = model.icon
                          return (
                            <button
                              key={model.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => { setSelectedModel(model); setModelOpen(false) }}
                              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-white/5"
                              style={{
                                backgroundColor: selected ? "rgba(255,214,10,0.08)" : "transparent",
                                color: selected ? tokens.brand : tokens.textPrimary,
                              }}
                            >
                              <Icon size={14} />
                              {model.label}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            }
          />

          {error && (
            <p className="mt-3 text-center text-sm" role="alert" style={{ color: "#ef4444" }}>
              {error}
            </p>
          )}

          {/* Separator — divide input (ação) da listagem (histórico) */}
          <div className="relative mt-16 mb-8 flex items-center justify-center">
            <div
              className="absolute inset-x-0 top-1/2 h-px"
              style={{
                background: `linear-gradient(to right, transparent, ${tokens.divider} 20%, ${tokens.divider} 80%, transparent)`,
              }}
            />
            <div
              className="relative inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1"
              style={{
                borderColor:
                  tokens.divider,
                backgroundColor: tokens.bgBase,
              }}
            >
              <TabButton
                active={activeTab === "my-projects"}
                onClick={() => setActiveTab("my-projects")}
                label="Meus Projetos"
                badge={recentProjects.length}
              />
              <TabButton
                active={activeTab === "team-projects"}
                onClick={() => setActiveTab("team-projects")}
                label="Do Time"
                badge={0}
              />
            </div>
          </div>

          {/* Tab content */}
          <div className="min-h-[200px]">
            {activeTab === "my-projects" && (
              <MyProjectsTab projects={recentProjects} />
            )}
            {activeTab === "team-projects" && <TeamTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- helpers ----------

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  label: string
  badge: number
}) {
  const { tokens } = useAppTokens()
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-all"
      style={{
        backgroundColor: active ? tokens.hoverBg : "transparent",
        color: active ? tokens.textPrimary : tokens.textTertiary,
      }}
    >
      {label}
      {badge > 0 && (
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{
            backgroundColor: active ? tokens.brand : tokens.hoverBg,
            color: active ? tokens.textInverse : tokens.textSecondary,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function MyProjectsTab({ projects }: { projects: Project[] }) {
  const { tokens } = useAppTokens()
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Bot className="h-5 w-5" />}
        title="Você ainda não criou nada"
        description="Descreva sua ideia lá em cima e o Builder cria o primeiro agente em segundos."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {projects.slice(0, 6).map((project) => {
        const statusStyle = getProjectStatusStyle(project.status)
        return (
          <Link
            key={project.id}
            href={`/projetos/${project.id}`}
            className="group flex items-center gap-4 rounded-xl border p-4 transition-all hover:-translate-y-0.5"
            style={{
              backgroundColor: tokens.bgSurface,
              borderColor: tokens.border,
            }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor: "rgba(255,214,10,0.08)",
                color: tokens.brand,
              }}
            >
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-sm font-semibold"
                style={{ color: tokens.textPrimary }}
              >
                {project.name}
              </h3>
              <p
                className="truncate text-xs"
                style={{
                  color:
                    tokens.textTertiary,
                }}
              >
                Agente de WhatsApp
              </p>
            </div>
            <span
              className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium"
              style={{
                backgroundColor: statusStyle.bg,
                color: statusStyle.color,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: statusStyle.dot }}
              />
              {PROJECT_STATUS_LABEL[project.status as ProjectStatus] ??
                project.status}
            </span>
          </Link>
        )
      })}
      <Link
        href="/projetos"
        className="mt-1 text-center text-xs transition-colors hover:underline"
        style={{ color: tokens.brand }}
      >
        Ver todos os projetos →
      </Link>
    </div>
  )
}

function TeamTab() {
  return (
    <EmptyState
      icon={<Bot className="h-5 w-5" />}
      title="Projetos do time em breve"
      description="Veja o que outras pessoas da sua organização estão construindo."
    />
  )
}
