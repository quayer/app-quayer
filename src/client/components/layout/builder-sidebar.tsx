"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  ChevronRight,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Settings,
  Shield,
} from "lucide-react"
import { Logo } from "@/client/components/ds/logo"
import { getProjectStatusStyle } from "@/lib/project-status"

interface BuilderSidebarProject {
  id: string
  name: string
  status: string
}

interface BuilderSidebarProps {
  recentProjects: BuilderSidebarProject[]
  isSuperAdmin: boolean
  onToggle?: () => void
}

const MAX_VISIBLE_PROJECTS = 3

/**
 * BuilderSidebar — v3 design tokens
 *
 * Sidebar principal do Quayer. Seções:
 *  - Logo + botão colapsar
 *  - CTA "+ Novo projeto" (amber)
 *  - Meus projetos (max 3 + "ver todos" menu se >3)
 *  - Navegação (Recursos)
 *  - Footer (Configurações + Admin se super)
 *
 * Contraste: text-primary/secondary/tertiary via tokens v3.
 * Amber accent em hover state + active route (via usePathname).
 */
export function BuilderSidebar({
  recentProjects,
  isSuperAdmin,
  onToggle,
}: BuilderSidebarProps) {
  const pathname = usePathname()
  const visibleProjects = recentProjects.slice(0, MAX_VISIBLE_PROJECTS)
  const hasMoreProjects = recentProjects.length > MAX_VISIBLE_PROJECTS
  const hasAnyProjects = recentProjects.length > 0
  const isActive = (href: string, exact = false): boolean =>
    exact ? pathname === href : pathname?.startsWith(href) ?? false

  return (
    <aside
      className="hidden lg:flex lg:w-[252px] lg:shrink-0 lg:flex-col"
      aria-label="Navegação do Quayer"
      style={{
        backgroundColor: "var(--color-bg-base, #000000)",
        color: "var(--color-text-primary, #ffffff)",
        borderRight:
          "1px solid var(--color-border-subtle, rgba(255,255,255,0.08))",
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header — logo + toggle */}
      <div className="flex h-16 items-center justify-between px-5">
        <Link
          href="/"
          className="flex items-center transition-opacity hover:opacity-90"
          aria-label="Quayer"
        >
          <Logo size={24} variant="color" />
        </Link>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-white/5"
            style={{
              color: "var(--color-text-tertiary, rgba(255,255,255,0.65))",
            }}
            aria-label="Ocultar sidebar"
            title="Ocultar (⌘B)"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* CTA Novo projeto */}
      <div className="px-3 pb-4 pt-1">
        <Link
          href="/"
          className="group flex h-10 w-full items-center justify-between gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition-all hover:opacity-90"
          style={{
            backgroundColor: "var(--color-brand, #FFD60A)",
            color: "var(--color-text-inverse, #1A0800)",
            boxShadow: "0 4px 14px -4px rgba(255,214,10,0.45)",
          }}
        >
          <span className="flex items-center gap-2">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
            Novo projeto
          </span>
          <kbd
            className="pointer-events-none hidden rounded px-1.5 font-mono text-[10px] font-medium sm:inline-flex"
            style={{
              color: "rgba(26,8,0,0.65)",
              backgroundColor: "rgba(26,8,0,0.12)",
            }}
          >
            ⌘K
          </kbd>
        </Link>
      </div>

      {/* Nav scrollable area */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {/* Meus projetos — só se existirem */}
        {hasAnyProjects && (
          <section className="mb-4" aria-labelledby="sidebar-projects-label">
            <div className="flex items-center justify-between px-3.5 pb-1.5 pt-1">
              <h3
                id="sidebar-projects-label"
                className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{
                  color: "var(--color-text-tertiary, rgba(255,255,255,0.65))",
                }}
              >
                Meus projetos
              </h3>
              {hasMoreProjects && (
                <Link
                  href="/projetos"
                  className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/5"
                  style={{
                    color:
                      "var(--color-text-tertiary, rgba(255,255,255,0.65))",
                  }}
                  aria-label="Ver todos os projetos"
                  title={`Ver todos (${recentProjects.length})`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            <ul className="flex flex-col">
              {visibleProjects.map((project) => {
                const active = pathname === `/projetos/${project.id}`
                const statusStyle = getProjectStatusStyle(project.status)
                return (
                  <li key={project.id}>
                    <Link
                      href={`/projetos/${project.id}`}
                      className="flex items-center gap-2.5 rounded-md px-3.5 py-2 text-[13px] transition-colors"
                      style={{
                        backgroundColor: active
                          ? "rgba(255,214,10,0.08)"
                          : "transparent",
                        color: active
                          ? "var(--color-brand, #FFD60A)"
                          : "var(--color-text-secondary, rgba(255,255,255,0.85))",
                      }}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: statusStyle.dot }}
                      />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>

            {hasMoreProjects && (
              <div className="px-3.5 pt-1.5">
                <Link
                  href="/projetos"
                  className="inline-flex items-center gap-1 text-[11px] transition-colors hover:underline"
                  style={{
                    color:
                      "var(--color-text-tertiary, rgba(255,255,255,0.65))",
                  }}
                >
                  Ver todos ({recentProjects.length})
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </section>
        )}

        {/* Navegação */}
        <section aria-labelledby="sidebar-nav-label">
          <div className="px-3.5 pb-1.5 pt-1">
            <h3
              id="sidebar-nav-label"
              className="text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{
                color: "var(--color-text-tertiary, rgba(255,255,255,0.65))",
              }}
            >
              Navegação
            </h3>
          </div>
          <ul className="flex flex-col">
            <li>
              <NavLink
                href="/recursos"
                icon={BookOpen}
                label="Recursos"
                active={isActive("/recursos")}
              />
            </li>
          </ul>
        </section>
      </div>

      {/* Footer */}
      <div
        className="mt-auto flex flex-col border-t p-2"
        style={{
          borderColor:
            "var(--color-border-subtle, rgba(255,255,255,0.08))",
        }}
      >
        <NavLink
          href="/user/seguranca"
          icon={Settings}
          label="Configurações"
          active={isActive("/user/seguranca")}
        />
        {isSuperAdmin && (
          <NavLink
            href="/admin"
            icon={Shield}
            label="Admin"
            active={isActive("/admin")}
          />
        )}
      </div>
    </aside>
  )
}

// ---------- helpers ----------

function NavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string
  icon: typeof Settings
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3.5 py-2 text-[13px] transition-colors hover:bg-white/5"
      style={{
        backgroundColor: active ? "rgba(255,214,10,0.08)" : "transparent",
        color: active
          ? "var(--color-brand, #FFD60A)"
          : "var(--color-text-secondary, rgba(255,255,255,0.85))",
      }}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        style={{
          color: active
            ? "var(--color-brand, #FFD60A)"
            : "var(--color-text-tertiary, rgba(255,255,255,0.65))",
        }}
      />
      {label}
    </Link>
  )
}
