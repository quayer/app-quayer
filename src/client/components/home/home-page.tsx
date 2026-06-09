"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Bot, Sparkles } from "lucide-react"
import { Logo } from "@/client/components/ds/logo"
import { MessageInput } from "@/client/components/ds/message-input"
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

const INPUT_PLACEHOLDER =
  "Crie um agente de captação de leads para advocacia tributária"

export function HomePage({
  recentProjects,
}: HomePageProps) {
  const router = useRouter()
  const { tokens } = useAppTokens()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [prompt, setPrompt] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const createProject = api.builder.createProject as any

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
        if (err && typeof err === "object" && "error" in err) {
          const msg = String((err as { error: unknown }).error)
          // Auth errors mean session expired — redirect to login
          if (msg.toLowerCase().includes("token") || msg.includes("autenticad")) {
            router.push("/login?redirect=/")
            return
          }
          setError(msg)
        } else {
          setError(err instanceof Error ? err.message : "Erro desconhecido")
        }
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
            voiceEnabled
            voiceLang="pt-BR"
          />

          {error && (
            <p className="mt-2 px-4 text-left text-sm" role="alert" style={{ color: "#ef4444" }}>
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
                active
                label="Meus Projetos"
                badge={recentProjects.length}
              />
            </div>
          </div>

          {/* Tab content */}
          <div className="min-h-[200px]">
            <MyProjectsTab projects={recentProjects} />
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
  onClick?: () => void
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
