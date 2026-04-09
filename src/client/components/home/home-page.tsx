"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUp,
  AudioLines,
  Bot,
  ChevronDown,
  Loader2,
  Paperclip,
  Sparkles,
} from "lucide-react"
import { Logo } from "@/client/components/ds/logo"
import {
  PROJECT_STATUS_LABEL,
  getProjectStatusStyle,
} from "@/lib/project-status"
import type { ProjectStatus } from "@/client/components/projetos/types"

interface Project {
  id: string
  name: string
  status: string
  type: string
}

interface HomePageProps {
  recentProjects: Project[]
}

type Tab = "learn" | "my-projects" | "team-projects"

const MODELS = [
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
]

export function HomePage({ recentProjects }: HomePageProps) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [prompt, setPrompt] = useState("")
  const [selectedModel, setSelectedModel] = useState(MODELS[0]!)
  const [modelOpen, setModelOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(
    recentProjects.length > 0 ? "my-projects" : "learn",
  )

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
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            message?: string
          }
          throw new Error(data.message ?? "Erro ao criar projeto")
        }
        const data = (await res.json()) as {
          data?: { projectId: string }
        }
        const projectId = data.data?.projectId
        if (!projectId) throw new Error("Resposta inválida do servidor")
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
          {/* Top badge — QuayerCLI tease */}
          <div className="mb-8 flex justify-center">
            <button
              type="button"
              className="group inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-medium transition-all hover:-translate-y-0.5"
              style={{
                borderColor: "var(--color-border-brand, rgba(255,214,10,0.20))",
                backgroundColor: "var(--color-brand-muted, rgba(255,214,10,0.08))",
                color: "var(--color-brand, #FFD60A)",
              }}
              aria-label="Build locally with QuayerCLI — em breve"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span>
                Build locally with{" "}
                <span style={{ fontWeight: 700 }}>QuayerCLI</span>
              </span>
              <span
                className="ml-1 rounded-full border px-1.5 py-px text-[10px] uppercase tracking-[0.12em]"
                style={{
                  borderColor: "rgba(255,214,10,0.25)",
                  color: "var(--color-text-tertiary, rgba(255,255,255,0.55))",
                }}
              >
                em breve
              </span>
            </button>
          </div>

          {/* Big heading with logo mark */}
          <div className="mb-10 flex flex-col items-center gap-5 text-center">
            <Logo size={52} variant="color" showWordmark={false} />
            <h1
              className="text-[2.5rem] font-bold sm:text-[3rem]"
              style={{
                letterSpacing: "-0.03em",
                lineHeight: "1.05",
                color: "var(--color-text-primary, #ffffff)",
              }}
            >
              O que vamos criar hoje?
            </h1>
            <p
              className="max-w-md text-[15px]"
              style={{
                color: "var(--color-text-secondary, rgba(255,255,255,0.55))",
                lineHeight: "1.5",
              }}
            >
              Descreva sua ideia e o Builder transforma em um agente de
              WhatsApp funcional.
            </p>
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
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Descreva o agente que você quer construir…"
              rows={3}
              disabled={isPending}
              className="w-full resize-none rounded-t-2xl bg-transparent px-5 pt-5 pb-3 text-[15px] leading-relaxed outline-none placeholder:opacity-40 disabled:opacity-50"
              style={{ color: "var(--color-text-primary, #ffffff)" }}
            />

            {/* Action row */}
            <div className="flex items-center justify-between gap-2 px-3 pb-3">
              {/* Left: attach + model */}
              <div className="flex items-center gap-1.5">
                {/* Attach */}
                <button
                  type="button"
                  disabled={isPending}
                  className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors hover:bg-white/5 disabled:opacity-50"
                  style={{
                    color: "var(--color-text-secondary, rgba(255,255,255,0.65))",
                  }}
                  aria-label="Anexar arquivo"
                  title="Anexar (em breve)"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Anexar</span>
                </button>

                {/* Model picker */}
                <div className="relative">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setModelOpen((v) => !v)}
                    className="flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors hover:bg-white/5 disabled:opacity-50"
                    style={{
                      borderColor:
                        "var(--color-border-subtle, rgba(255,255,255,0.08))",
                      color:
                        "var(--color-text-secondary, rgba(255,255,255,0.85))",
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: "var(--color-brand, #FFD60A)" }}
                    />
                    {selectedModel.name}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>

                  {modelOpen && (
                    <>
                      <div
                        aria-hidden
                        className="fixed inset-0 z-10"
                        onClick={() => setModelOpen(false)}
                      />
                      <div
                        className="absolute bottom-11 left-0 z-20 min-w-[220px] overflow-hidden rounded-xl border p-1 shadow-xl"
                        style={{
                          backgroundColor:
                            "var(--color-bg-elevated, #0C0804)",
                          borderColor:
                            "var(--color-border-default, rgba(255,255,255,0.12))",
                        }}
                      >
                        {MODELS.map((model) => {
                          const selected = model.id === selectedModel.id
                          return (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setSelectedModel(model)
                                setModelOpen(false)
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/5"
                              style={{
                                color: selected
                                  ? "var(--color-brand, #FFD60A)"
                                  : "var(--color-text-secondary, rgba(255,255,255,0.85))",
                              }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  backgroundColor: selected
                                    ? "var(--color-brand, #FFD60A)"
                                    : "rgba(255,255,255,0.25)",
                                }}
                              />
                              <div className="flex-1">
                                <div className="font-medium">{model.name}</div>
                                <div
                                  className="text-[11px] opacity-50"
                                  style={{ textTransform: "capitalize" }}
                                >
                                  {model.provider}
                                </div>
                              </div>
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
                <button
                  type="button"
                  disabled={isPending}
                  className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-white/5 disabled:opacity-50"
                  style={{
                    borderColor:
                      "var(--color-border-subtle, rgba(255,255,255,0.08))",
                    color:
                      "var(--color-text-secondary, rgba(255,255,255,0.85))",
                  }}
                  aria-label="Entrada por áudio"
                  title="Áudio (em breve)"
                >
                  <AudioLines className="h-4 w-4" />
                </button>

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

          {error && (
            <p className="mt-3 text-center text-sm" style={{ color: "#ef4444" }}>
              {error}
            </p>
          )}

          {/* Tabs */}
          <div className="mt-12 mb-6 flex items-center justify-center">
            <div
              className="inline-flex items-center gap-1 rounded-full border p-1"
              style={{
                borderColor:
                  "var(--color-border-subtle, rgba(255,255,255,0.08))",
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              <TabButton
                active={activeTab === "learn"}
                onClick={() => setActiveTab("learn")}
                label="Explorar"
                badge={0}
              />
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
            {activeTab === "learn" && <LearnTab />}
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

function LearnTab() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-2xl border py-12 text-center"
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
        <Sparkles className="h-5 w-5" />
      </div>
      <div>
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary, #ffffff)" }}
        >
          Guias, workshops e cheatsheets
        </h3>
        <p
          className="mx-auto mt-1 max-w-sm text-xs"
          style={{
            color: "var(--color-text-tertiary, rgba(255,255,255,0.55))",
          }}
        >
          Aprenda Claude Code, MCPs, anatomia de prompts e muito mais.
        </p>
      </div>
      <a
        href="/recursos"
        className="inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition-opacity hover:opacity-90"
        style={{
          backgroundColor: "var(--color-brand, #FFD60A)",
          color: "var(--color-text-inverse, #1A0800)",
        }}
      >
        Explorar recursos
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
