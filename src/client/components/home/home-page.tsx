"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ArrowRight, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { Textarea } from "@/client/components/ui/textarea"
import { Card, CardContent } from "@/client/components/ui/card"
import { Avatar, AvatarFallback } from "@/client/components/ui/avatar"
import { toast } from "sonner"

interface HomeProject {
  id: string
  name: string
  status: string
  type: string
}

interface HomePageProps {
  recentProjects: HomeProject[]
}

const TEMPLATES: Array<{ label: string; emoji: string; prompt: string }> = [
  {
    emoji: "🤖",
    label: "Agente de vendas",
    prompt:
      "Quero um agente de vendas pra WhatsApp que qualifica leads, responde dúvidas sobre produtos e agenda reuniões com o time comercial.",
  },
  {
    emoji: "🤖",
    label: "Suporte",
    prompt:
      "Preciso de um agente de suporte que responde perguntas frequentes, abre tickets quando não souber resolver e passa para humano nos casos críticos.",
  },
  {
    emoji: "🤖",
    label: "Captação",
    prompt:
      "Quero um agente de captação de leads para a minha empresa: ele deve coletar nome, e-mail, telefone e qualificar o interesse antes de me enviar o contato.",
  },
]

/**
 * HomePage — US-021
 *
 * Tela inicial do Quayer Builder. O usuário descreve o que quer criar
 * e o backend gera o primeiro rascunho do projeto.
 */
export function HomePage({ recentProjects }: HomePageProps) {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [isPending, startTransition] = useTransition()

  const isDisabled = prompt.trim().length < 8 || isPending

  const handleSubmit = () => {
    if (isDisabled) return
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/builder/projects/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ prompt: prompt.trim(), type: "ai_agent" }),
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok || !payload?.data?.projectId) {
          toast.error("Não foi possível criar o projeto. Tente novamente.")
          return
        }
        router.push(`/projetos/${payload.data.projectId}`)
      } catch (err) {
        console.error("[HomePage] failed to create project", err)
        toast.error("Erro ao criar projeto.")
      }
    })
  }

  const handleTemplateClick = (tplPrompt: string) => {
    setPrompt(tplPrompt)
  }

  const visibleRecent = recentProjects.slice(0, 6)

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-background">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-border px-6 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.svg"
            alt="Quayer"
            width={96}
            height={22}
            priority
          />
        </Link>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">Q</AvatarFallback>
        </Avatar>
      </header>

      <div className="hidden h-16 items-center justify-end border-b border-border px-6 lg:flex">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">Q</AvatarFallback>
        </Avatar>
      </div>

      {/* Central prompt area */}
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            O que você quer criar hoje?
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Descreva em português o que precisa e o Builder monta o primeiro rascunho pra você.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="ex: agente de captação de leads pra advocacia..."
            rows={5}
            className="min-h-[120px] resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
            disabled={isPending}
          />

          <div className="mt-4 flex items-center justify-end">
            <Button
              onClick={handleSubmit}
              disabled={isDisabled}
              size="lg"
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  Criar projeto
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Template chips */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              onClick={() => handleTemplateClick(tpl.prompt)}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground/80 transition-colors hover:border-foreground/40 hover:bg-muted disabled:opacity-50"
            >
              <span>{tpl.emoji}</span>
              <span>{tpl.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Continue de onde parou */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-16">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Continue de onde parou
          </h2>
          <Link
            href="/projetos"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver todas criações →
          </Link>
        </div>

        {visibleRecent.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Você ainda não criou nada. Escolha um template acima ou descreva o que quer construir.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleRecent.map((p) => (
              <Link key={p.id} href={`/projetos/${p.id}`}>
                <Card className="h-full transition-colors hover:border-foreground/40 hover:bg-muted/40">
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {p.type.replace("_", " ")}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {p.status}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium text-foreground">
                      {p.name}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
