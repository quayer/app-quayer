"use client"

import Link from "next/link"
import Image from "next/image"
import { Plus, FolderKanban, Settings, Shield } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { Separator } from "@/client/components/ui/separator"

interface BuilderSidebarProject {
  id: string
  name: string
  status: string
}

interface BuilderSidebarProps {
  recentProjects: BuilderSidebarProject[]
  isSuperAdmin: boolean
}

/**
 * BuilderSidebar — US-020
 *
 * Sidebar principal do Quayer Builder. Substitui conceitualmente o AppSidebar
 * no contexto do Builder (home `/` e rotas `/projetos/*`).
 *
 * Visível apenas em telas ≥ lg (1024px). Mobile terá drawer em etapa futura.
 */
export function BuilderSidebar({
  recentProjects,
  isSuperAdmin,
}: BuilderSidebarProps) {
  const visibleProjects = recentProjects.slice(0, 7)

  return (
    <aside
      className="hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-background"
      aria-label="Navegação do Builder"
    >
      {/* Header — logo */}
      <div className="flex h-16 items-center px-5">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.svg"
            alt="Quayer"
            width={108}
            height={24}
            priority
            className="dark:invert-0"
          />
        </Link>
      </div>

      {/* Novo projeto */}
      <div className="px-4 pb-4">
        <Button
          asChild
          className="w-full justify-between gap-2"
          size="lg"
        >
          <Link href="/">
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Novo projeto
            </span>
            <kbd className="pointer-events-none hidden items-center gap-1 rounded border border-border/60 bg-background/20 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary-foreground/80 sm:inline-flex">
              ⌘K
            </kbd>
          </Link>
        </Button>
      </div>

      {/* Meus projetos */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="px-3 pb-2 pt-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Meus projetos
          </h3>
        </div>

        {visibleProjects.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Nenhum projeto ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visibleProjects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projetos/${project.id}`}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{project.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="px-3 pt-2">
          <Link
            href="/projetos"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ver todos →
          </Link>
        </div>
      </div>

      {/* Footer — configurações */}
      <div className="mt-auto flex flex-col gap-1 p-2">
        <Separator className="mb-2" />
        <Link
          href="/user/seguranca"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          Configurações
        </Link>
        {isSuperAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            <Shield className="h-4 w-4 text-muted-foreground" />
            Admin
          </Link>
        )}
      </div>
    </aside>
  )
}
