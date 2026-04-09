"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeft,
  Bell,
  Building2,
  CreditCard,
  FileSearch,
  LayoutDashboard,
  Mail,
  MonitorSmartphone,
  Plug,
  Settings,
  Shield,
} from "lucide-react"
import { Logo } from "@/client/components/ds/logo"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

interface AdminMenuItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
}

const ADMIN_MENU: AdminMenuItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/organizations", label: "Organizações", icon: Building2 },
  { href: "/admin/integracoes", label: "Conexões", icon: Plug },
  { href: "/admin/sessions", label: "Sessões", icon: MonitorSmartphone },
  { href: "/admin/invitations", label: "Convites", icon: Mail },
  { href: "/admin/notificacoes", label: "Notificações", icon: Bell },
  { href: "/admin/audit", label: "Auditoria", icon: FileSearch },
  { href: "/admin/billing", label: "Cobrança", icon: CreditCard },
  { href: "/admin/security", label: "Segurança", icon: Shield },
  { href: "/admin/settings", label: "Configurações", icon: Settings },
]

/**
 * AdminNav — sidebar da jornada administrativa.
 *
 * Estrutura (mesma do BuilderSidebar pra consistência visual):
 *  1. Header com Logo + tag "Admin"
 *  2. CTA "Voltar para o app" — botão grande, descritivo, destacado
 *  3. Menu (Dashboard + sub-páginas)
 *
 * Tema reativo via useAppTokens — segue o mesmo sistema do resto.
 */
export function AdminNav() {
  const pathname = usePathname()
  const { tokens, isLight } = useAppTokens()

  return (
    <aside
      className="hidden lg:flex lg:w-[252px] lg:shrink-0 lg:flex-col"
      aria-label="Navegação do painel admin"
      style={{
        backgroundColor: isLight ? "#FFFFFF" : "#0B0704",
        color: tokens.textPrimary,
        borderRight: `1px solid ${tokens.divider}`,
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header — Logo + Admin tag */}
      <div
        className="flex h-16 items-center justify-between px-5"
        style={{ borderBottom: `1px solid ${tokens.divider}` }}
      >
        <Link
          href="/admin"
          className="flex items-center transition-opacity hover:opacity-90"
          aria-label="Admin dashboard"
        >
          <Logo size={22} variant={isLight ? "light" : "color"} />
        </Link>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]"
          style={{
            color: tokens.brand,
            backgroundColor: tokens.brandSubtle,
            border: `1px solid ${tokens.brandBorder}`,
          }}
        >
          Admin
        </span>
      </div>

      {/* CTA Voltar — destacado */}
      <div className="px-3 pt-4 pb-3">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors"
          style={{
            borderColor: tokens.border,
            color: tokens.textPrimary,
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = tokens.hoverBg
            e.currentTarget.style.borderColor = tokens.brandBorder
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.borderColor = tokens.border
          }}
        >
          <ArrowLeft
            className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5"
            style={{ color: tokens.brand }}
          />
          <div className="min-w-0 flex-1">
            <div
              className="text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              Voltar para o app
            </div>
            <div
              className="text-[10px]"
              style={{ color: tokens.textTertiary }}
            >
              Início · Projetos · Recursos
            </div>
          </div>
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Admin">
        <div
          className="px-3.5 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: tokens.textTertiary }}
        >
          Painel
        </div>
        <ul className="flex flex-col gap-0.5">
          {ADMIN_MENU.map((item) => {
            const Icon = item.icon
            const isActive = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href) ?? false
            return (
              <li key={item.href}>
                <AdminNavLink
                  href={item.href}
                  icon={Icon}
                  label={item.label}
                  active={isActive}
                  tokens={tokens}
                />
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

function AdminNavLink({
  href,
  icon: Icon,
  label,
  active,
  tokens,
}: {
  href: string
  icon: typeof LayoutDashboard
  label: string
  active: boolean
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors"
      style={{
        backgroundColor: active ? tokens.brandSubtle : "transparent",
        color: active ? tokens.brandText : tokens.textSecondary,
        borderLeft: active
          ? `2px solid ${tokens.brandBorder}`
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
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={active ? 2.5 : 2}
        style={{
          color: active ? tokens.brandText : tokens.textTertiary,
        }}
      />
      {label}
    </Link>
  )
}
