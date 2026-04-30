"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import {
  FolderKanban,
  Moon,
  PanelLeft,
  Plus,
  Shield,
  Sun,
  ChevronRight,
  Building2,
  ChevronsUpDown,
  Check,
  Settings2,
  Users,
  Key,
  FileText,
  CreditCard,
  LogOut,
  UserCircle,
  Smartphone,
  Plug,
} from "lucide-react"
import { Logo } from "@/client/components/ds/logo"
import { getProjectStatusStyle, PROJECT_STATUS_LABEL } from "@/lib/project-status"
import type { ProjectStatus } from "@/client/components/projetos/types"
import { getProjectTypeMeta } from "@/lib/project-type"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu"
import { useAuth } from "@/lib/auth/auth-provider"
import {
  useCurrentOrganization,
  useSwitchOrganization,
} from "@/client/hooks/useOrganization"

// ─── Types ───────────────────────────────────────────────────────────────────

interface BuilderSidebarProject {
  id: string
  name: string
  status: string
  type: string
}

interface BuilderSidebarProps {
  recentProjects: BuilderSidebarProject[]
  isSuperAdmin: boolean
  onToggle?: () => void
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

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

const TOKENS: SidebarTokens = {
  bg:           "var(--q-sidebar-bg)",
  border:       "var(--q-border)",
  divider:      "var(--q-divider)",
  textPrimary:  "var(--q-text-primary)",
  textSecondary:"var(--q-text-secondary)",
  textTertiary: "var(--q-text-tertiary)",
  hoverBg:      "var(--q-hover-bg)",
  activeBg:     "var(--q-sidebar-active-bg)",
  activeText:   "var(--q-sidebar-active-text)",
  activeBorder: "var(--q-sidebar-active-border)",
  brand:        "var(--q-brand)",
  brandDim:     "var(--q-sidebar-brand-dim)",
  ctaBorder:    "var(--q-sidebar-cta-border)",
  kbdBg:        "var(--q-sidebar-kbd-bg)",
  kbdText:      "var(--q-sidebar-kbd-text)",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_VISIBLE_PROJECTS = 3

function getInitials(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0][0].toUpperCase()
  }
  if (email?.trim()) return email[0].toUpperCase()
  return "?"
}

// ─── BuilderSidebar ──────────────────────────────────────────────────────────

export function BuilderSidebar({
  recentProjects,
  isSuperAdmin,
  onToggle,
}: BuilderSidebarProps) {
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [supportsHover, setSupportsHover] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    if (typeof window !== "undefined" && window.matchMedia) {
       
      setSupportsHover(window.matchMedia("(hover: hover)").matches)
    }
  }, [])

  // mounted guard: evita hydration mismatch em renders condicionais (Logo variant etc.)
  // Cores não precisam — vêm de CSS variables já corretas no primeiro paint.
  const isLight = mounted && resolvedTheme === "light"
  const tokens = TOKENS

  const visibleProjects = recentProjects.slice(0, MAX_VISIBLE_PROJECTS)
  const hasMoreProjects = recentProjects.length > MAX_VISIBLE_PROJECTS
  const hasAnyProjects = recentProjects.length > 0

  const isActive = (href: string, exact = false): boolean =>
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/")

  return (
    <aside
      className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[252px] lg:shrink-0 lg:flex-col"
      aria-label="Navegação do Quayer"
      style={{
        backgroundColor: tokens.bg,
        color: tokens.textPrimary,
        borderRight: `1px solid ${tokens.border}`,
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex h-16 items-center justify-between px-5"
        style={{ borderBottom: `1px solid ${tokens.divider}` }}
      >
        <Link
          href="/"
          className="bsb-focus-ring flex items-center rounded-sm transition-opacity hover:opacity-90"
          aria-label="Quayer — página inicial"
        >
          <Logo size={24} variant={isLight ? "light" : "color"} />
        </Link>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="bsb-focus-ring flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            style={{ color: tokens.textTertiary }}
            onMouseEnter={(e) => {
              if (!supportsHover) return
              e.currentTarget.style.backgroundColor = tokens.hoverBg
              e.currentTarget.style.color = tokens.textPrimary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
              e.currentTarget.style.color = tokens.textTertiary
            }}
            aria-label="Ocultar sidebar (⌘B)"
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ── Org Switcher ── */}
      <OrgSwitcherSection tokens={tokens} supportsHover={supportsHover} />

      {/* ── CTA Novo projeto ── */}
      <div className="px-3 pt-4 pb-3">
        <Link
          href="/"
          className="bsb-focus-ring group flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-[13px] font-semibold transition-all"
          style={{
            borderColor: tokens.ctaBorder,
            color: tokens.textPrimary,
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => {
            if (!supportsHover) return
            e.currentTarget.style.backgroundColor = tokens.hoverBg
            e.currentTarget.style.borderColor = tokens.brandDim
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.borderColor = tokens.ctaBorder
          }}
          aria-label="Criar novo projeto (⌘K)"
        >
          <span className="flex items-center gap-2">
            <Plus
              className="h-4 w-4"
              strokeWidth={2.5}
              style={{ color: tokens.brand }}
              aria-hidden="true"
            />
            Novo projeto
          </span>
          <kbd
            className="pointer-events-none hidden rounded px-1.5 py-0.5 font-mono text-[11px] leading-none sm:inline-flex"
            style={{ color: tokens.kbdText, backgroundColor: tokens.kbdBg }}
            aria-hidden="true"
          >
            ⌘K
          </kbd>
        </Link>
      </div>

      {/* ── Nav + Recentes (scrollable) ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <nav aria-label="Principal">
          <ul className="flex flex-col gap-1" role="list">
            <li>
              <NavLink
                href="/projetos"
                icon={FolderKanban}
                label="Projetos"
                active={isActive("/projetos")}
                tokens={tokens}
                supportsHover={supportsHover}
              />
            </li>
          </ul>
        </nav>

        {/* Recentes */}
        {hasAnyProjects && (
          <section className="mt-6" aria-labelledby="sidebar-recents-label">
            <div
              className="flex items-center px-3.5 pb-2"
              style={{
                borderTop: `1px solid ${tokens.divider}`,
                marginLeft: "6px",
                marginRight: "6px",
                paddingTop: "14px",
              }}
            >
              <h3
                id="sidebar-recents-label"
                className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: tokens.textTertiary }}
              >
                Recentes
              </h3>
            </div>

            <ul className="flex flex-col gap-1" role="list">
              {visibleProjects.map((project) => {
                const active = pathname === `/projetos/${project.id}`
                const statusStyle = getProjectStatusStyle(project.status)
                const statusLabel =
                  PROJECT_STATUS_LABEL[project.status as ProjectStatus] ??
                  project.status
                const typeMeta = getProjectTypeMeta(project.type)
                return (
                  <li key={project.id}>
                    <RecentProjectLink
                      href={`/projetos/${project.id}`}
                      name={project.name}
                      typeLabel={typeMeta.label}
                      statusLabel={statusLabel}
                      typeIcon={typeMeta.icon}
                      dotColor={statusStyle.dot}
                      active={active}
                      tokens={tokens}
                      supportsHover={supportsHover}
                    />
                  </li>
                )
              })}
            </ul>

            {hasMoreProjects && (
              <div className="px-2 pt-1">
                <Link
                  href="/projetos"
                  className="bsb-focus-ring inline-flex min-h-[28px] items-center gap-1 rounded-md px-2 py-1.5 text-[11px] transition-colors"
                  style={{ color: tokens.textTertiary }}
                  onMouseEnter={(e) => {
                    if (!supportsHover) return
                    e.currentTarget.style.color = tokens.textPrimary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = tokens.textTertiary
                  }}
                  aria-label={`Ver todos os projetos (${recentProjects.length} no total)`}
                >
                  Ver todos ({recentProjects.length})
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── Footer ── */}
      <div
        className="flex flex-col gap-0.5 p-2"
        style={{ borderTop: `1px solid ${tokens.divider}` }}
      >
        <NavLink
          href="/org/billing"
          icon={CreditCard}
          label="Plano & Uso"
          active={isActive("/org/billing")}
          tokens={tokens}
          supportsHover={supportsHover}
        />

        {/* User menu */}
        <UserMenuSection
          tokens={tokens}
          supportsHover={supportsHover}
          isSuperAdmin={isSuperAdmin}
        />
      </div>
    </aside>
  )
}

// ─── NavLink ─────────────────────────────────────────────────────────────────

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  tokens,
  supportsHover,
}: {
  href: string
  icon: typeof FolderKanban
  label: string
  active: boolean
  tokens: SidebarTokens
  supportsHover: boolean
}) {
  return (
    <Link
      href={href}
      className="bsb-focus-ring flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium leading-5 transition-colors"
      style={{
        color: active ? tokens.activeText : tokens.textSecondary,
        backgroundColor: active ? tokens.activeBg : "transparent",
        borderLeft: active
          ? `2px solid ${tokens.activeBorder}`
          : "2px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!supportsHover || active) return
        e.currentTarget.style.backgroundColor = tokens.hoverBg
        e.currentTarget.style.color = tokens.textPrimary
      }}
      onMouseLeave={(e) => {
        if (active) return
        e.currentTarget.style.backgroundColor = "transparent"
        e.currentTarget.style.color = tokens.textSecondary
      }}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className="h-4 w-4 shrink-0"
        strokeWidth={active ? 2.5 : 2}
        style={{ color: active ? tokens.activeText : tokens.textTertiary }}
        aria-hidden="true"
      />
      {label}
    </Link>
  )
}

// ─── RecentProjectLink ───────────────────────────────────────────────────────

function RecentProjectLink({
  href,
  name,
  typeLabel,
  statusLabel,
  typeIcon: TypeIcon,
  dotColor,
  active,
  tokens,
  supportsHover,
}: {
  href: string
  name: string
  typeLabel?: string
  statusLabel?: string
  typeIcon: typeof FolderKanban
  dotColor: string
  active: boolean
  tokens: SidebarTokens
  supportsHover: boolean
}) {
  // WCAG 1.4.1 — aria-label inclui status para screen readers
  const ariaLabel = [name, typeLabel, statusLabel && `Status: ${statusLabel}`]
    .filter(Boolean)
    .join(", ")

  return (
    <Link
      href={href}
      aria-label={ariaLabel || name}
      aria-current={active ? "page" : undefined}
      className="bsb-focus-ring group flex items-center gap-2.5 rounded-md px-3.5 py-2 text-[13px] leading-5 transition-colors"
      style={{
        backgroundColor: active ? tokens.activeBg : "transparent",
        color: active ? tokens.activeText : tokens.textSecondary,
        borderLeft: active
          ? `2px solid ${tokens.activeBorder}`
          : "2px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!supportsHover || active) return
        e.currentTarget.style.backgroundColor = tokens.hoverBg
        e.currentTarget.style.color = tokens.textPrimary
      }}
      onMouseLeave={(e) => {
        if (active) return
        e.currentTarget.style.backgroundColor = "transparent"
        e.currentTarget.style.color = tokens.textSecondary
      }}
    >
      <TypeIcon
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={active ? 2.5 : 2}
        style={{ color: active ? tokens.activeText : tokens.textTertiary }}
        aria-hidden="true"
      />
      <span className="truncate flex-1">{name}</span>
      {/* WCAG 1.4.1 — dot + texto: cor não é o único indicador de status */}
      <span className="flex items-center gap-1 shrink-0">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        {statusLabel && (
          <span
            className="text-[10px] leading-none"
            style={{ color: tokens.textTertiary }}
          >
            {statusLabel}
          </span>
        )}
      </span>
    </Link>
  )
}

// ─── OrgSwitcherSection ───────────────────────────────────────────────────────

interface OrgSummary {
  id: string
  name: string
}

interface CurrentOrgShape {
  id?: string
  name?: string
  data?: { id?: string; name?: string }
}

function OrgSwitcherSection({
  tokens,
  supportsHover,
}: {
  tokens: SidebarTokens
  supportsHover: boolean
}) {
  const { user } = useAuth()
  const { data: currentOrgData } = useCurrentOrganization()
  const switchOrg = useSwitchOrganization()
  const [open, setOpen] = useState(false)

  const current = currentOrgData as CurrentOrgShape | undefined
  const currentOrgName = current?.name || current?.data?.name || "Sem organização"
  const currentOrgId = current?.id || current?.data?.id || null

  const userOrgs: OrgSummary[] =
    currentOrgId && currentOrgName
      ? [{ id: currentOrgId, name: currentOrgName }]
      : []

  if (!user) return null

  const orgRole = user.organizationRole || "user"
  const isSystemAdmin = user.role === "admin"
  const canViewAudit = orgRole === "master" || orgRole === "manager" || isSystemAdmin
  const canViewTeam = orgRole === "master" || orgRole === "manager" || isSystemAdmin
  const isAgency = user.isAgency === true

  return (
    <div
      className="px-3 pt-3 pb-1"
      style={{ borderBottom: `1px solid ${tokens.divider}` }}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="bsb-focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors"
            style={{
              backgroundColor: open ? tokens.hoverBg : "transparent",
              color: tokens.textPrimary,
            }}
            onMouseEnter={(e) => {
              if (!supportsHover) return
              e.currentTarget.style.backgroundColor = tokens.hoverBg
            }}
            onMouseLeave={(e) => {
              if (open) return
              e.currentTarget.style.backgroundColor = "transparent"
            }}
            aria-label={`Organização: ${currentOrgName}. Abrir menu da organização`}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <Building2
              className="h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: tokens.textTertiary }}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className="truncate text-[13px] font-semibold leading-tight"
                style={{ color: tokens.textPrimary }}
              >
                {currentOrgName}
              </span>
              <span
                className="truncate text-[11px] leading-tight"
                style={{ color: tokens.textTertiary }}
              >
                Organização
              </span>
            </div>
            <ChevronsUpDown
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: tokens.textTertiary }}
              aria-hidden="true"
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-60 rounded-md" align="start" side="bottom" sideOffset={6}>
          {/* Trocar org (quando tiver múltiplas) */}
          {userOrgs.length > 1 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Trocar organização
              </DropdownMenuLabel>
              {userOrgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => {
                    if (org.id !== currentOrgId) switchOrg.mutate(org.id)
                  }}
                  className="gap-2"
                >
                  <Building2 className="size-4" aria-hidden="true" />
                  <span className="flex-1 truncate">{org.name}</span>
                  {org.id === currentOrgId && (
                    <Check className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          {/* Itens da organização */}
          <DropdownMenuItem asChild>
            <Link href="/org" className="gap-2">
              <Settings2 className="size-4" aria-hidden="true" />
              Configurações
            </Link>
          </DropdownMenuItem>

          {canViewTeam && (
            <DropdownMenuItem asChild>
              <Link href="/org/equipe" className="gap-2">
                <Users className="size-4" aria-hidden="true" />
                Equipe
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem asChild>
            <Link href="/org/api-keys" className="gap-2">
              <Key className="size-4" aria-hidden="true" />
              API Keys
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/canais" className="gap-2">
              <Smartphone className="size-4" aria-hidden="true" />
              Canais
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/integracoes" className="gap-2">
              <Plug className="size-4" aria-hidden="true" />
              Integrações
            </Link>
          </DropdownMenuItem>

          {canViewAudit && (
            <DropdownMenuItem asChild>
              <Link href="/org/auditoria" className="gap-2">
                <FileText className="size-4" aria-hidden="true" />
                Auditoria
              </Link>
            </DropdownMenuItem>
          )}

          {isAgency && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/org/nova" className="gap-2">
                  <Plus className="size-4" aria-hidden="true" />
                  Nova organização
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ─── UserMenuSection ──────────────────────────────────────────────────────────

function UserMenuSection({
  tokens,
  supportsHover,
  isSuperAdmin,
}: {
  tokens: SidebarTokens
  supportsHover: boolean
  isSuperAdmin: boolean
}) {
  const { user, logout } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true) }, [])

  if (!user) return null

  const isLight = mounted && resolvedTheme === "light"
  const firstName = (user as any).firstName || (user as any).name?.split(" ")[0] || ""
  const email = (user as any).email || ""
  const fullName = (user as any).name || firstName || email
  const initials = getInitials((user as any).name, email)

  const toggleTheme = () => setTheme(isLight ? "dark" : "light")

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="bsb-focus-ring flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium leading-5 transition-colors"
          style={{
            backgroundColor: open ? tokens.hoverBg : "transparent",
            color: tokens.textSecondary,
            borderLeft: "2px solid transparent",
          }}
          onMouseEnter={(e) => {
            if (!supportsHover) return
            e.currentTarget.style.backgroundColor = tokens.hoverBg
            e.currentTarget.style.color = tokens.textPrimary
          }}
          onMouseLeave={(e) => {
            if (open) return
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.color = tokens.textSecondary
          }}
          aria-label={`Menu do usuário: ${fullName || email}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {/* Avatar com iniciais */}
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            style={{
              backgroundColor: tokens.activeBg,
              color: tokens.activeText,
              border: `1px solid ${tokens.activeBorder}`,
            }}
            aria-hidden="true"
          >
            {initials}
          </span>
          <span className="flex-1 truncate text-left">{firstName || email}</span>
          <ChevronsUpDown
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: tokens.textTertiary }}
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-60 rounded-md" align="start" side="top" sideOffset={6}>
        {/* Header com nome + email */}
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold">
              {initials}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold">{fullName}</span>
              {email && (
                <span className="truncate text-[11px] text-muted-foreground">{email}</span>
              )}
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Minha conta */}
        <DropdownMenuItem onClick={() => router.push("/conta")} className="gap-2">
          <UserCircle className="size-4" aria-hidden="true" />
          Minha conta
        </DropdownMenuItem>

        {/* Admin — superadmin only */}
        {isSuperAdmin && (
          <DropdownMenuItem onClick={() => router.push("/admin")} className="gap-2">
            <Shield className="size-4" aria-hidden="true" />
            Admin
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* Toggle tema */}
        <DropdownMenuItem
          onClick={toggleTheme}
          className="gap-2"
          aria-label={isLight ? "Mudar para tema escuro" : "Mudar para tema claro"}
        >
          {isLight ? (
            <Moon className="size-4" aria-hidden="true" />
          ) : (
            <Sun className="size-4" aria-hidden="true" />
          )}
          {isLight ? "Tema escuro" : "Tema claro"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Sair */}
        <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:text-destructive">
          <LogOut className="size-4" aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
