"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Building2,
  Plug,
  MonitorSmartphone,
  Mail,
  Bell,
  FileSearch,
  CreditCard,
  Shield,
  Settings,
  ChevronLeft,
} from "lucide-react"

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
 * AdminNav — navegação secundária da jornada administrativa.
 *
 * Renderizada dentro de `src/app/admin/layout.tsx` ao lado do <main>,
 * permitindo acesso direto a todas as páginas do admin sem depender
 * da BuilderSidebar principal.
 *
 * Visível apenas em telas >= lg (1024px). Em mobile, o usuário acessa
 * as sub-páginas via cards no /admin dashboard.
 */
export function AdminNav() {
  const pathname = usePathname()

  return (
    <aside
      className="hidden lg:flex lg:w-[220px] lg:shrink-0 lg:flex-col"
      aria-label="Navegação do painel admin"
      style={{
        backgroundColor: "var(--color-bg-surface, #060402)",
        borderRight:
          "1px solid var(--color-border-subtle, rgba(255,255,255,0.06))",
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        className="flex h-16 items-center gap-2 px-5"
        style={{
          borderBottom:
            "1px solid var(--color-border-subtle, rgba(255,255,255,0.06))",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs transition-colors hover:underline"
          style={{
            color: "var(--color-text-tertiary, rgba(255,255,255,0.5))",
          }}
        >
          <ChevronLeft className="h-3 w-3" />
          Voltar
        </Link>
        <span
          className="ml-auto text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-brand, #FFD60A)" }}
        >
          Admin
        </span>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {ADMIN_MENU.map((item) => {
            const Icon = item.icon
            const isActive = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href) ?? false
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors"
                  style={{
                    backgroundColor: isActive
                      ? "rgba(255,214,10,0.08)"
                      : "transparent",
                    color: isActive
                      ? "var(--color-brand, #FFD60A)"
                      : "var(--color-text-secondary, rgba(255,255,255,0.65))",
                  }}
                >
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    style={{
                      color: isActive
                        ? "var(--color-brand, #FFD60A)"
                        : "var(--color-text-tertiary, rgba(255,255,255,0.4))",
                    }}
                  />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
