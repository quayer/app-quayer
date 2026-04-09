import Link from "next/link"
import {
  Plus,
  FolderKanban,
  Settings,
  Shield,
  MessagesSquare,
  Plug,
  Bot,
  FileText,
  Megaphone,
  Wrench,
  ShieldCheck,
  ChevronDown,
  Users,
  Contact,
} from "lucide-react"
import { Logo } from "@/client/components/ds/logo"

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
 * BuilderSidebar — v3 design tokens
 *
 * Sidebar principal do Quayer usada em TODAS as rotas autenticadas via
 * <AppShell>. Segue o DS v3 (quayer-ds-v3.html): fundo #000, texto branco,
 * DM Sans, acentos ambar.
 *
 * Seções:
 *  - Hero: + Novo projeto (CTA amber)
 *  - Meus projetos (últimos 7 builder projects)
 *  - Workspace (links principais da operação)
 *  - Admin (colapsível — só para super_admin)
 *  - Footer: Segurança
 *
 * Visível apenas em telas >= lg (1024px). Mobile drawer = etapa futura.
 */
export function BuilderSidebar({
  recentProjects,
  isSuperAdmin,
}: BuilderSidebarProps) {
  const visibleProjects = recentProjects.slice(0, 7)

  return (
    <aside
      className="hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col"
      aria-label="Navegação do Quayer"
      style={{
        backgroundColor: "var(--color-bg-base, #000000)",
        color: "var(--color-text-primary, #ffffff)",
        borderRight:
          "1px solid var(--color-border-subtle, rgba(255,255,255,0.06))",
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header — logo */}
      <div className="flex h-16 items-center px-6">
        <Link
          href="/"
          className="flex items-center transition-opacity hover:opacity-90"
          aria-label="Quayer — início"
        >
          <Logo size={26} variant="color" />
        </Link>
      </div>

      {/* CTA Novo projeto */}
      <div className="px-4 pb-4 pt-1">
        <Link
          href="/"
          className="group flex h-11 w-full items-center justify-between gap-2 rounded-lg px-4 text-sm font-semibold transition-all"
          style={{
            backgroundColor: "var(--color-brand, #FFD60A)",
            color: "var(--color-text-inverse, #1A0800)",
            boxShadow:
              "0 0 0 1px var(--color-border-brand-strong, rgba(255,214,10,0.35))",
          }}
        >
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Novo projeto
          </span>
          <kbd
            className="pointer-events-none hidden items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-flex"
            style={{
              borderColor: "rgba(26,8,0,0.25)",
              color: "rgba(26,8,0,0.7)",
              backgroundColor: "rgba(26,8,0,0.08)",
            }}
          >
            ⌘K
          </kbd>
        </Link>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {/* Seção: Meus projetos */}
        <SectionLabel>Meus projetos</SectionLabel>
        {visibleProjects.length === 0 ? (
          <p
            className="px-4 py-1.5 text-xs"
            style={{
              color: "var(--color-text-tertiary, rgba(255,255,255,0.4))",
            }}
          >
            Nenhum projeto ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visibleProjects.map((project) => (
              <li key={project.id}>
                <NavItem
                  href={`/projetos/${project.id}`}
                  icon={FolderKanban}
                  label={project.name}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 pt-1 pb-3">
          <Link
            href="/projetos"
            className="text-xs transition-colors hover:underline"
            style={{
              color: "var(--color-text-tertiary, rgba(255,255,255,0.4))",
            }}
          >
            ver todos →
          </Link>
        </div>

        {/* Seção: Workspace */}
        <SectionLabel>Workspace</SectionLabel>
        <ul className="flex flex-col gap-0.5 pb-3">
          <li>
            <NavItem
              href="/conversas"
              icon={MessagesSquare}
              label="Conversas"
            />
          </li>
          <li>
            <NavItem
              href="/contatos"
              icon={Contact}
              label="Contatos"
            />
          </li>
          <li>
            <NavItem href="/integracoes" icon={Plug} label="Conexões" />
          </li>
          <li>
            <NavItem
              href="/integracoes/agents"
              icon={Bot}
              label="Agentes IA"
            />
          </li>
          <li>
            <NavItem
              href="/integracoes/settings/templates"
              icon={FileText}
              label="Templates"
            />
          </li>
          <li>
            <NavItem
              href="/integracoes/settings/campaigns"
              icon={Megaphone}
              label="Campanhas"
            />
          </li>
          <li>
            <NavItem href="/ferramentas" icon={Wrench} label="Ferramentas" />
          </li>
        </ul>

        {/* Seção: Admin (colapsível, só super) */}
        {isSuperAdmin && (
          <details
            className="group pb-3"
            style={{
              borderTop:
                "1px solid var(--color-border-subtle, rgba(255,255,255,0.06))",
              paddingTop: "12px",
              marginTop: "4px",
            }}
          >
            <summary
              className="flex cursor-pointer select-none items-center justify-between rounded-md px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors"
              style={{
                color: "var(--color-text-tertiary, rgba(255,255,255,0.4))",
                listStyle: "none",
              }}
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-3 w-3" />
                Admin
              </span>
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-1 flex flex-col gap-0.5">
              <li>
                <NavItem href="/admin" icon={Shield} label="Dashboard" />
              </li>
              <li>
                <NavItem
                  href="/admin/organizations"
                  icon={Users}
                  label="Organizações"
                />
              </li>
              <li>
                <NavItem
                  href="/admin/integracoes"
                  icon={Plug}
                  label="Conexões"
                />
              </li>
              <li>
                <NavItem
                  href="/admin/sessions"
                  icon={MessagesSquare}
                  label="Sessões"
                />
              </li>
              <li>
                <NavItem
                  href="/admin/invitations"
                  icon={FileText}
                  label="Convites"
                />
              </li>
              <li>
                <NavItem
                  href="/admin/notificacoes"
                  icon={Megaphone}
                  label="Notificações"
                />
              </li>
              <li>
                <NavItem
                  href="/admin/audit"
                  icon={FileText}
                  label="Auditoria"
                />
              </li>
              <li>
                <NavItem
                  href="/admin/billing"
                  icon={FileText}
                  label="Cobrança"
                />
              </li>
              <li>
                <NavItem
                  href="/admin/security"
                  icon={Shield}
                  label="Segurança"
                />
              </li>
              <li>
                <NavItem
                  href="/admin/settings"
                  icon={Settings}
                  label="Configurações"
                />
              </li>
            </ul>
          </details>
        )}
      </div>

      {/* Footer — user settings */}
      <div
        className="mt-auto flex flex-col gap-0.5 border-t p-3"
        style={{
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.06))",
        }}
      >
        <NavItem
          href="/integracoes/settings"
          icon={Settings}
          label="Configurações da org"
        />
        <NavItem
          href="/user/seguranca"
          icon={Shield}
          label="Minha segurança"
        />
      </div>
    </aside>
  )
}

// ---------- helpers ----------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-1.5 pt-2">
      <h3
        className="text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{
          color: "var(--color-text-tertiary, rgba(255,255,255,0.4))",
        }}
      >
        {children}
      </h3>
    </div>
  )
}

function NavItem({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Settings
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-4 py-2 text-sm transition-colors hover:bg-white/5"
      style={{
        color: "var(--color-text-secondary, rgba(255,255,255,0.55))",
      }}
    >
      <Icon
        className="h-4 w-4 shrink-0"
        style={{
          color: "var(--color-text-tertiary, rgba(255,255,255,0.4))",
        }}
      />
      <span className="truncate">{label}</span>
    </Link>
  )
}
