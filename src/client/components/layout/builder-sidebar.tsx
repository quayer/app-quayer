"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import {
  Home,
  MessageSquareText,
  BookOpen,
  MoreHorizontal,
  Moon,
  PanelLeft,
  Plus,
  Settings,
  Shield,
  Sun,
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

// ─── Tokens por tema ─────────────────────────────────────────────
// Hierarquia explícita de tons — cada tema tem seus próprios valores
// pra garantir separação visual em ambos dark e light.

interface SidebarTokens {
  bg: string
  border: string
  divider: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  hoverBg: string
  activeBg: string
  activeText: string
  activeBorder: string
  brand: string
  brandDim: string
  ctaBorder: string
  kbdBg: string
  kbdText: string
}

const DARK_TOKENS: SidebarTokens = {
  bg: "#0B0704",              // elevated (1 passo acima do main #000)
  border: "rgba(255,255,255,0.14)",
  divider: "rgba(255,255,255,0.10)",
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.72)",
  textTertiary: "rgba(255,255,255,0.48)",
  hoverBg: "rgba(255,255,255,0.06)",
  activeBg: "rgba(255,214,10,0.14)",
  activeText: "#FFE566",       // amber 300 brighter
  activeBorder: "rgba(255,214,10,0.55)",
  brand: "#FFD60A",
  brandDim: "rgba(255,214,10,0.55)",
  ctaBorder: "rgba(255,255,255,0.16)",
  kbdBg: "rgba(255,255,255,0.08)",
  kbdText: "rgba(255,255,255,0.48)",
}

// Light tokens — alinhados com quayer-ds-v3.html:
//   --color-bg-inverse:   #F5F2ED  (warm cream)
//   --color-text-inverse: #1A0800  (dark brown-red)
const LIGHT_TOKENS: SidebarTokens = {
  bg: "#F5F2ED",              // DS v3 --color-bg-inverse
  border: "rgba(26,8,0,0.14)",
  divider: "rgba(26,8,0,0.10)",
  textPrimary: "#1A0800",      // DS v3 --color-text-inverse
  textSecondary: "rgba(26,8,0,0.68)",
  textTertiary: "rgba(26,8,0,0.45)",
  hoverBg: "rgba(26,8,0,0.05)",
  activeBg: "rgba(232,64,0,0.10)",   // orange brand subtle
  activeText: "#9A3D08",       // dark amber/orange — passa AAA em #F5F2ED
  activeBorder: "rgba(154,61,8,0.55)",
  brand: "#9A3D08",            // dark amber pra contraste em fundo claro
  brandDim: "rgba(154,61,8,0.55)",
  ctaBorder: "rgba(26,8,0,0.20)",
  kbdBg: "rgba(26,8,0,0.07)",
  kbdText: "rgba(26,8,0,0.60)",
}

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
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Antes da hidratação, usa dark default pra evitar flash.
  // Depois, escolhe baseado no tema resolvido (system → light/dark).
  const isLight = mounted && resolvedTheme === "light"
  const tokens: SidebarTokens = isLight ? LIGHT_TOKENS : DARK_TOKENS

  const visibleProjects = recentProjects.slice(0, MAX_VISIBLE_PROJECTS)
  const hasMoreProjects = recentProjects.length > MAX_VISIBLE_PROJECTS
  const hasAnyProjects = recentProjects.length > 0

  const isActive = (href: string, exact = false): boolean =>
    exact ? pathname === href : pathname?.startsWith(href) ?? false

  const toggleTheme = () => setTheme(isLight ? "dark" : "light")

  return (
    <aside
      className="hidden lg:flex lg:w-[252px] lg:shrink-0 lg:flex-col"
      aria-label="Navegação do Quayer"
      style={{
        backgroundColor: tokens.bg,
        color: tokens.textPrimary,
        borderRight: `1px solid ${tokens.border}`,
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header — logo + toggle */}
      <div
        className="flex h-16 items-center justify-between px-5"
        style={{ borderBottom: `1px solid ${tokens.divider}` }}
      >
        <Link
          href="/"
          className="flex items-center transition-opacity hover:opacity-90"
          aria-label="Quayer"
        >
          <Logo size={24} variant={isLight ? "light" : "color"} />
        </Link>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            style={{ color: tokens.textTertiary }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tokens.hoverBg
              e.currentTarget.style.color = tokens.textPrimary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
              e.currentTarget.style.color = tokens.textTertiary
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
            borderColor: tokens.ctaBorder,
            color: tokens.textPrimary,
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = tokens.hoverBg
            e.currentTarget.style.borderColor = tokens.brandDim
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.borderColor = tokens.ctaBorder
          }}
        >
          <span className="flex items-center gap-2">
            <Plus
              className="h-4 w-4"
              strokeWidth={2.5}
              style={{ color: tokens.brand }}
            />
            Nova conversa
          </span>
          <kbd
            className="pointer-events-none hidden rounded px-1.5 font-mono text-[10px] sm:inline-flex"
            style={{
              color: tokens.kbdText,
              backgroundColor: tokens.kbdBg,
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
                  tokens={tokens}
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
                borderTop: `1px solid ${tokens.divider}`,
                marginLeft: "6px",
                marginRight: "6px",
                paddingTop: "14px",
              }}
            >
              <h3
                id="sidebar-recents-label"
                className="text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: tokens.textTertiary }}
              >
                Recentes
              </h3>
              {hasMoreProjects && (
                <Link
                  href="/projetos"
                  className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                  style={{ color: tokens.textTertiary }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = tokens.hoverBg
                    e.currentTarget.style.color = tokens.textPrimary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent"
                    e.currentTarget.style.color = tokens.textTertiary
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
                      tokens={tokens}
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
                  style={{ color: tokens.textTertiary }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = tokens.textPrimary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = tokens.textTertiary
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
        style={{ borderTop: `1px solid ${tokens.divider}` }}
      >
        <NavLink
          href="/user/seguranca"
          icon={Settings}
          label="Configurações"
          active={isActive("/user/seguranca")}
          tokens={tokens}
        />
        {isSuperAdmin && (
          <NavLink
            href="/admin"
            icon={Shield}
            label="Admin"
            active={isActive("/admin")}
            tokens={tokens}
          />
        )}

        {/* Theme toggle — última row do footer */}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors"
          style={{
            backgroundColor: "transparent",
            color: tokens.textSecondary,
            borderLeft: "2px solid transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = tokens.hoverBg
            e.currentTarget.style.color = tokens.textPrimary
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.color = tokens.textSecondary
          }}
          aria-label={isLight ? "Mudar para tema escuro" : "Mudar para tema claro"}
          title={isLight ? "Tema escuro" : "Tema claro"}
        >
          {isLight ? (
            <Moon
              className="h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: tokens.textTertiary }}
            />
          ) : (
            <Sun
              className="h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: tokens.textTertiary }}
            />
          )}
          {isLight ? "Tema escuro" : "Tema claro"}
        </button>
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
  tokens,
}: {
  href: string
  icon: typeof Home
  label: string
  active: boolean
  tokens: SidebarTokens
}) {
  const baseStyle = {
    color: active ? tokens.activeText : tokens.textSecondary,
    backgroundColor: active ? tokens.activeBg : "transparent",
    borderLeft: active
      ? `2px solid ${tokens.activeBorder}`
      : "2px solid transparent",
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors"
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = tokens.hoverBg
          e.currentTarget.style.color = tokens.textPrimary
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent"
          e.currentTarget.style.color = tokens.textSecondary
        }
      }}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className="h-4 w-4 shrink-0"
        strokeWidth={active ? 2.5 : 2}
        style={{
          color: active ? tokens.activeText : tokens.textTertiary,
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
  tokens,
}: {
  href: string
  name: string
  dotColor: string
  active: boolean
  tokens: SidebarTokens
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3.5 py-1.5 text-[13px] transition-colors"
      style={{
        backgroundColor: active ? tokens.activeBg : "transparent",
        color: active ? tokens.activeText : tokens.textSecondary,
        borderLeft: active
          ? `2px solid ${tokens.activeBorder}`
          : "2px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = tokens.hoverBg
          e.currentTarget.style.color = tokens.textPrimary
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent"
          e.currentTarget.style.color = tokens.textSecondary
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
