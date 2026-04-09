"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  MessageSquareText,
  BookOpen,
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
  { href: "/projetos", label: "Conversas", icon: MessageSquareText },
  { href: "/recursos", label: "Recursos", icon: BookOpen },
]

// ─── Tokens locais — hierarquia explícita de tons ────────────────────
// Sidebar fica 1 nível acima do main bg (elevated). Isso cria
// separação visual óbvia sem precisar de borda pesada.
const SIDEBAR_BG = "#0B0704"      // --color-bg-elevated (slight warm dark)
const SIDEBAR_BORDER = "rgba(255,255,255,0.14)"
const DIVIDER = "rgba(255,255,255,0.10)"

const TEXT_PRIMARY = "#FFFFFF"    // 100% — headings, active
const TEXT_SECONDARY = "rgba(255,255,255,0.72)"  // nav items idle
const TEXT_TERTIARY = "rgba(255,255,255,0.48)"   // labels, icons idle
const TEXT_DISABLED = "rgba(255,255,255,0.32)"

const HOVER_BG = "rgba(255,255,255,0.06)"
const ACTIVE_BG = "rgba(255,214,10,0.14)"
const ACTIVE_TEXT = "#FFE566"     // amber 300 (mais claro que #FFD60A pra pop sobre bg escuro)
const ACTIVE_BORDER = "rgba(255,214,10,0.55)"

const BRAND = "#FFD60A"
const BRAND_DIM = "rgba(255,214,10,0.55)"

/**
 * BuilderSidebar — hierarquia tonal explícita
 *
 * Layers:
 *   main bg    = #000000   (base)
 *   sidebar bg = #0B0704   (elevated, cria contraste com main)
 *   hover      = +6% white sobre sidebar bg
 *   active     = 14% amber bg + amber 300 text + left border brand
 *
 * Text hierarchy:
 *   primary   100%  — nav ativo, headings
 *   secondary 72%   — nav idle (legível sem competir)
 *   tertiary  48%   — section labels, icons idle
 *   disabled  32%   — placeholders
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
        backgroundColor: SIDEBAR_BG,
        color: TEXT_PRIMARY,
        borderRight: `1px solid ${SIDEBAR_BORDER}`,
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header — logo + toggle */}
      <div
        className="flex h-16 items-center justify-between px-5"
        style={{ borderBottom: `1px solid ${DIVIDER}` }}
      >
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
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            style={{ color: TEXT_TERTIARY }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = HOVER_BG
              e.currentTarget.style.color = TEXT_PRIMARY
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
              e.currentTarget.style.color = TEXT_TERTIARY
            }}
            aria-label="Ocultar sidebar"
            title="Ocultar (⌘B)"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* CTA Nova conversa — subtle bordered button */}
      <div className="px-3 pt-4 pb-3">
        <Link
          href="/"
          className="group flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-[13px] font-medium transition-all"
          style={{
            borderColor: "rgba(255,255,255,0.16)",
            color: TEXT_PRIMARY,
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = HOVER_BG
            e.currentTarget.style.borderColor = BRAND_DIM
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"
          }}
        >
          <span className="flex items-center gap-2">
            <Plus
              className="h-4 w-4"
              strokeWidth={2.5}
              style={{ color: BRAND }}
            />
            Nova conversa
          </span>
          <kbd
            className="pointer-events-none hidden rounded px-1.5 font-mono text-[10px] sm:inline-flex"
            style={{
              color: TEXT_TERTIARY,
              backgroundColor: "rgba(255,255,255,0.08)",
            }}
          >
            ⌘K
          </kbd>
        </Link>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {/* Primary nav */}
        <nav aria-label="Principal">
          <ul className="flex flex-col gap-0.5">
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
            className="mt-6"
            aria-labelledby="sidebar-recents-label"
          >
            <div
              className="flex items-center justify-between px-3.5 pb-2 pt-2"
              style={{
                borderTop: `1px solid ${DIVIDER}`,
                marginLeft: "6px",
                marginRight: "6px",
                paddingTop: "14px",
              }}
            >
              <h3
                id="sidebar-recents-label"
                className="text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: TEXT_TERTIARY }}
              >
                Recentes
              </h3>
              {hasMoreProjects && (
                <Link
                  href="/projetos"
                  className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                  style={{ color: TEXT_TERTIARY }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = HOVER_BG
                    e.currentTarget.style.color = TEXT_PRIMARY
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent"
                    e.currentTarget.style.color = TEXT_TERTIARY
                  }}
                  aria-label="Ver todos os projetos"
                  title={`Ver todos (${recentProjects.length})`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            <ul className="flex flex-col gap-0.5">
              {visibleProjects.map((project) => {
                const active = pathname === `/projetos/${project.id}`
                const statusStyle = getProjectStatusStyle(project.status)
                return (
                  <li key={project.id}>
                    <RecentProjectLink
                      href={`/projetos/${project.id}`}
                      name={project.name}
                      dotColor={statusStyle.dot}
                      active={active}
                    />
                  </li>
                )
              })}
            </ul>

            {hasMoreProjects && (
              <div className="px-3.5 pt-2">
                <Link
                  href="/projetos"
                  className="inline-flex items-center gap-1 text-[11px] transition-colors"
                  style={{ color: TEXT_TERTIARY }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = TEXT_PRIMARY
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = TEXT_TERTIARY
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
        className="flex flex-col gap-0.5 p-2"
        style={{ borderTop: `1px solid ${DIVIDER}` }}
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

// ──────────────────────────────────────────────────────────────────
// Sub-components with explicit hover/active handlers (pro contraste
// ficar óbvio — Tailwind hover: tinha sido insuficiente).
// ──────────────────────────────────────────────────────────────────

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
  const baseStyle = {
    color: active ? ACTIVE_TEXT : TEXT_SECONDARY,
    backgroundColor: active ? ACTIVE_BG : "transparent",
    borderLeft: active
      ? `2px solid ${ACTIVE_BORDER}`
      : "2px solid transparent",
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors"
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = HOVER_BG
          e.currentTarget.style.color = TEXT_PRIMARY
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent"
          e.currentTarget.style.color = TEXT_SECONDARY
        }
      }}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className="h-4 w-4 shrink-0"
        strokeWidth={active ? 2.5 : 2}
        style={{
          color: active ? ACTIVE_TEXT : TEXT_TERTIARY,
        }}
      />
      {label}
    </Link>
  )
}

function RecentProjectLink({
  href,
  name,
  dotColor,
  active,
}: {
  href: string
  name: string
  dotColor: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3.5 py-1.5 text-[13px] transition-colors"
      style={{
        backgroundColor: active ? ACTIVE_BG : "transparent",
        color: active ? ACTIVE_TEXT : TEXT_SECONDARY,
        borderLeft: active
          ? `2px solid ${ACTIVE_BORDER}`
          : "2px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = HOVER_BG
          e.currentTarget.style.color = TEXT_PRIMARY
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent"
          e.currentTarget.style.color = TEXT_SECONDARY
        }
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span className="truncate">{name}</span>
    </Link>
  )
}
