"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUp,
  Bot,
  ChevronDown,
  Loader2,
  Mic,
  Paperclip,
  Sparkles,
  Square,
  X,
} from "lucide-react"
import { Logo } from "@/client/components/ds/logo"
import { ClaudeIcon, CodexIcon } from "@/client/components/ds/model-icons"
import {
  PROJECT_STATUS_LABEL,
  getProjectStatusStyle,
} from "@/lib/project-status"
import type { ProjectStatus } from "@/client/components/projetos/types"
import { useSpeechToText } from "@/client/hooks/use-speech-to-text"

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
  "ex: agente de captação de leads pra advocacia tributária que qualifica por urgência, tipo de imposto e faturamento da empresa..."

/** Tipos de arquivo aceitos para anexar ao prompt do agente. */
const ACCEPTED_FILE_TYPES =
  "image/*,application/pdf,text/plain,text/markdown,.md,.csv"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function HomePage({ recentProjects }: HomePageProps) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [prompt, setPrompt] = useState("")
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[0]!)
  const [modelOpen, setModelOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("my-projects")

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

  // Web Speech API — transcrição ao vivo pro textarea
  const appendTranscript = useCallback((text: string) => {
    setPrompt((prev) => (prev ? `${prev} ${text}`.trim() : text.trim()))
  }, [])

  const {
    isSupported: speechSupported,
    isListening,
    start: startRecording,
    stop: stopRecording,
    error: speechError,
  } = useSpeechToText({
    lang: "pt-BR",
    onFinalTranscript: appendTranscript,
  })

  const toggleRecording = () => {
    if (isListening) stopRecording()
    else startRecording()
  }

  const submit = () => {
    const trimmed = prompt.trim()
    if (trimmed.length < 10) {
      setError("Descreva com mais detalhe (mínimo 10 caracteres).")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/builder/projects/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed, type: "ai_agent" }),
        })

        // Igniter retorna formatos distintos:
        //  - Success: { success, data: { projectId, ... }, message }
        //  - Error:   { error: { code, message, data? } }
        const body = (await res.json().catch(() => null)) as
          | {
              success?: boolean
              data?: { projectId?: string; conversationId?: string }
              message?: string
              error?: { code?: string; message?: string }
            }
          | null

        if (!res.ok || !body) {
          const msg =
            body?.error?.message ??
            body?.message ??
            `HTTP ${res.status} — resposta vazia`
          console.error("[home] create project failed:", {
            status: res.status,
            body,
          })
          throw new Error(msg)
        }

        const projectId = body.data?.projectId
        if (!projectId) {
          console.error("[home] create project response missing projectId:", body)
          throw new Error(
            "Resposta inválida do servidor (projectId ausente).",
          )
        }
        router.push(`/projetos/${projectId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      submit()
    }
  }

  const canSubmit = prompt.trim().length >= 10 && !isPending

  return (
    <div
      className="relative flex min-h-screen flex-col"
      style={{
        backgroundColor: "var(--color-bg-base, #000000)",
        color: "var(--color-text-primary, #ffffff)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Subtle ambient gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,214,10,0.05), transparent 70%)",
        }}
      />

      <div className="relative flex flex-1 flex-col items-center px-6 pt-24 pb-16">
        <div className="w-full max-w-[640px]">
          {/* Announcement tag — não é actionable, é info */}
          <div className="mb-8 flex justify-center">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium"
              style={{
                borderColor: "var(--color-border-brand, rgba(255,214,10,0.25))",
                backgroundColor: "var(--color-brand-muted, rgba(255,214,10,0.08))",
                color: "var(--color-brand, #FFD60A)",
                minHeight: "36px",
              }}
              role="status"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span>
                Build locally with{" "}
                <span style={{ fontWeight: 700 }}>QuayerCLI</span>
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{
                  backgroundColor: "rgba(255,214,10,0.18)",
                  color: "var(--color-brand, #FFD60A)",
                }}
              >
                em breve
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
                color: "var(--color-text-primary, #ffffff)",
              }}
            >
              O que vamos criar hoje?
            </h1>
          </div>

          {/* Input card */}
          <div
            className="rounded-2xl border transition-all focus-within:shadow-[0_0_0_3px_rgba(255,214,10,0.12)]"
            style={{
              backgroundColor: "var(--color-bg-surface, #060402)",
              borderColor: error
                ? "rgba(239,68,68,0.4)"
                : "var(--color-border-default, rgba(255,255,255,0.1))",
              boxShadow: "0 12px 40px -12px rgba(0,0,0,0.6)",
            }}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileChange}
              className="hidden"
              aria-hidden
            />

            {/* Attached file chip */}
            {attachedFile && (
              <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
                style={{
                  borderColor:
                    "var(--color-border-subtle, rgba(255,255,255,0.06))",
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: "rgba(255,214,10,0.1)",
                      color: "var(--color-brand, #FFD60A)",
                    }}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[13px] font-medium"
                      style={{ color: "var(--color-text-primary, #fff)" }}
                    >
                      {attachedFile.name}
                    </p>
                    <p
                      className="text-[11px]"
                      style={{
                        color:
                          "var(--color-text-tertiary, rgba(255,255,255,0.6))",
                      }}
                    >
                      {formatFileSize(attachedFile.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeFile}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/5"
                  style={{
                    color: "var(--color-text-tertiary, rgba(255,255,255,0.6))",
                  }}
                  aria-label="Remover anexo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder={INPUT_PLACEHOLDER}
              rows={3}
              disabled={isPending}
              className="w-full resize-none rounded-t-2xl bg-transparent px-5 pt-5 pb-3 text-[15px] leading-relaxed outline-none placeholder:opacity-40 disabled:opacity-50"
              style={{ color: "var(--color-text-primary, #ffffff)" }}
            />

            {/* Action row */}
            <div className="flex items-center justify-between gap-2 px-3 pb-3">
              {/* Left: attach + model picker */}
              <div className="flex items-center gap-1.5">
                {/* Attach */}
                <button
                  type="button"
                  onClick={pickFile}
                  disabled={isPending}
                  className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-white/5 disabled:opacity-50"
                  style={{
                    borderColor: attachedFile
                      ? "var(--color-border-brand, rgba(255,214,10,0.35))"
                      : "var(--color-border-default, rgba(255,255,255,0.12))",
                    backgroundColor: attachedFile
                      ? "rgba(255,214,10,0.08)"
                      : "transparent",
                    color: attachedFile
                      ? "var(--color-brand, #FFD60A)"
                      : "var(--color-text-primary, #ffffff)",
                  }}
                  aria-label="Anexar arquivo"
                  title="Anexar imagem, PDF ou texto (até 10 MB)"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                {/* Model picker */}
                <div className="relative">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setModelOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={modelOpen}
                    className="flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
                    style={{
                      borderColor:
                        "var(--color-border-default, rgba(255,255,255,0.12))",
                      color: "var(--color-text-primary, #ffffff)",
                    }}
                  >
                    <selectedModel.icon size={14} />
                    {selectedModel.label}
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </button>

                  {modelOpen && (
                    <>
                      <div
                        aria-hidden
                        className="fixed inset-0 z-10"
                        onClick={() => setModelOpen(false)}
                      />
                      <div
                        role="listbox"
                        className="absolute bottom-11 left-0 z-20 min-w-[160px] overflow-hidden rounded-xl border p-1 shadow-xl"
                        style={{
                          backgroundColor: "var(--color-bg-elevated, #0C0804)",
                          borderColor:
                            "var(--color-border-default, rgba(255,255,255,0.14))",
                          boxShadow:
                            "0 12px 40px -12px rgba(0,0,0,0.8)",
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
                              onClick={() => {
                                setSelectedModel(model)
                                setModelOpen(false)
                              }}
                              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-white/5"
                              style={{
                                backgroundColor: selected
                                  ? "rgba(255,214,10,0.08)"
                                  : "transparent",
                                color: selected
                                  ? "var(--color-brand, #FFD60A)"
                                  : "var(--color-text-primary, #ffffff)",
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

              {/* Right: audio + send */}
              <div className="flex items-center gap-1.5">
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={isPending}
                    className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-50"
                    style={{
                      borderColor: isListening
                        ? "rgba(239,68,68,0.45)"
                        : "var(--color-border-default, rgba(255,255,255,0.12))",
                      backgroundColor: isListening
                        ? "rgba(239,68,68,0.12)"
                        : "transparent",
                      color: isListening
                        ? "#ef4444"
                        : "var(--color-text-primary, #ffffff)",
                    }}
                    aria-label={
                      isListening ? "Parar gravação" : "Gravar por áudio"
                    }
                    aria-pressed={isListening}
                    title={
                      isListening
                        ? "Parar gravação"
                        : "Falar em vez de digitar"
                    }
                  >
                    {isListening ? (
                      <Square
                        className="h-3.5 w-3.5 animate-pulse"
                        fill="currentColor"
                      />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-all disabled:opacity-30"
                  style={{
                    backgroundColor: canSubmit
                      ? "var(--color-brand, #FFD60A)"
                      : "rgba(255,255,255,0.08)",
                    color: canSubmit
                      ? "var(--color-text-inverse, #1A0800)"
                      : "rgba(255,255,255,0.4)",
                    boxShadow: canSubmit
                      ? "0 4px 12px -2px rgba(255,214,10,0.35)"
                      : "none",
                  }}
                  aria-label="Criar projeto"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {(error || speechError) && (
            <p
              className="mt-3 text-center text-sm"
              role="alert"
              style={{ color: "#ef4444" }}
            >
              {error ?? speechError}
            </p>
          )}

          {/* Separator — divide input (ação) da listagem (histórico) */}
          <div className="relative mt-16 mb-8 flex items-center justify-center">
            <div
              className="absolute inset-x-0 top-1/2 h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent, var(--color-border-subtle, rgba(255,255,255,0.08)) 20%, var(--color-border-subtle, rgba(255,255,255,0.08)) 80%, transparent)",
              }}
            />
            <div
              className="relative inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1"
              style={{
                borderColor:
                  "var(--color-border-subtle, rgba(255,255,255,0.1))",
                backgroundColor: "var(--color-bg-base, #000)",
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
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-all"
      style={{
        backgroundColor: active ? "rgba(255,255,255,0.08)" : "transparent",
        color: active
          ? "var(--color-text-primary, #ffffff)"
          : "var(--color-text-tertiary, rgba(255,255,255,0.55))",
      }}
    >
      {label}
      {badge > 0 && (
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{
            backgroundColor: active
              ? "var(--color-brand, #FFD60A)"
              : "rgba(255,255,255,0.12)",
            color: active
              ? "var(--color-text-inverse, #1A0800)"
              : "var(--color-text-secondary, rgba(255,255,255,0.7))",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function MyProjectsTab({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Bot}
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
          <a
            key={project.id}
            href={`/projetos/${project.id}`}
            className="group flex items-center gap-4 rounded-xl border p-4 transition-all hover:-translate-y-0.5"
            style={{
              backgroundColor: "var(--color-bg-surface, #060402)",
              borderColor:
                "var(--color-border-default, rgba(255,255,255,0.1))",
            }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor: "rgba(255,214,10,0.08)",
                color: "var(--color-brand, #FFD60A)",
              }}
            >
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-sm font-semibold"
                style={{ color: "var(--color-text-primary, #ffffff)" }}
              >
                {project.name}
              </h3>
              <p
                className="truncate text-xs"
                style={{
                  color:
                    "var(--color-text-tertiary, rgba(255,255,255,0.55))",
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
          </a>
        )
      })}
      <a
        href="/projetos"
        className="mt-1 text-center text-xs transition-colors hover:underline"
        style={{ color: "var(--color-brand, #FFD60A)" }}
      >
        Ver todos os projetos →
      </a>
    </div>
  )
}

function TeamTab() {
  return (
    <EmptyState
      icon={Bot}
      title="Projetos do time em breve"
      description="Veja o que outras pessoas da sua organização estão construindo."
    />
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Bot
  title: string
  description: string
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border py-14 text-center"
      style={{
        backgroundColor: "var(--color-bg-surface, #060402)",
        borderColor: "var(--color-border-subtle, rgba(255,255,255,0.06))",
      }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: "rgba(255,214,10,0.08)",
          color: "var(--color-brand, #FFD60A)",
        }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h3
        className="text-sm font-semibold"
        style={{ color: "var(--color-text-primary, #ffffff)" }}
      >
        {title}
      </h3>
      <p
        className="max-w-sm text-xs"
        style={{
          color: "var(--color-text-tertiary, rgba(255,255,255,0.55))",
        }}
      >
        {description}
      </p>
    </div>
  )
}
