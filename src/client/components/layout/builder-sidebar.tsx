"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  FolderKanban,
  MessageSquareText,
  BookOpen,
  Search,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Settings,
  Shield,
  ChevronRight,
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

interface NavItem {
  href: string
  label: string
  icon: typeof Home
  exact?: boolean
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Início", icon: Home, exact: true },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/conversas", label: "Conversas", icon: MessageSquareText },
  { href: "/recursos", label: "Recursos", icon: BookOpen },
]

/**
 * BuilderSidebar — inspirada no v0 dev UI (Buscar / Início / Projetos /
 * Conversas / Recursos). Segue DS v3 tokens.
 *
 * Estrutura:
 *  - Logo + botão colapsar
 *  - CTA "+ Nova conversa" (amber)
 *  - Buscar (modal trigger, placeholder por enquanto)
 *  - Nav primária (Início / Projetos / Conversas / Recursos)
 *  - Recentes (último 3 projetos + "ver todos")
 *  - Footer (Configurações + Admin se super)
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
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
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

      {/* CTA Nova conversa */}
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
            Nova conversa
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

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {/* Buscar (placeholder — vira command palette no futuro) */}
        <button
          type="button"
          className="mb-2 flex w-full items-center gap-2.5 rounded-md px-3.5 py-2 text-[13px] transition-colors hover:bg-white/5"
          style={{
            color: "var(--color-text-secondary, rgba(255,255,255,0.85))",
          }}
          aria-label="Buscar"
          title="Buscar (⌘/)"
        >
          <Search
            className="h-3.5 w-3.5 shrink-0"
            style={{
              color: "var(--color-text-tertiary, rgba(255,255,255,0.65))",
            }}
          />
          <span className="flex-1 text-left">Buscar</span>
          <kbd
            className="rounded px-1.5 font-mono text-[10px]"
            style={{
              color: "var(--color-text-tertiary, rgba(255,255,255,0.65))",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            ⌘/
          </kbd>
        </button>

        {/* Primary nav */}
        <nav aria-label="Principal">
          <ul className="flex flex-col">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  active={isActive(item.href, item.exact)}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* Recentes */}
        {hasAnyProjects && (
          <section
            className="mt-5"
            aria-labelledby="sidebar-recents-label"
          >
            <div className="flex items-center justify-between px-3.5 pb-1.5 pt-1">
              <h3
                id="sidebar-recents-label"
                className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{
                  color: "var(--color-text-tertiary, rgba(255,255,255,0.65))",
                }}
              >
                Recentes
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
                      className="flex items-center gap-2.5 rounded-md px-3.5 py-2 text-[13px] transition-colors hover:bg-white/5"
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
  icon: typeof Home
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-white/5"
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
