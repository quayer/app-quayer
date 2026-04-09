import Link from "next/link"
import { Plus, FolderKanban, Settings, Shield } from "lucide-react"
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
 * BuilderSidebar — US-020 + v3 design tokens
 *
 * Sidebar principal do Quayer Builder usada em TODAS as rotas autenticadas
 * via <AppShell>. Segue o DS v3 (quayer-ds-v3.html): fundo #000, texto branco,
 * DM Sans, acentos ambar/laranja.
 *
 * Visível apenas em telas >= lg (1024px). Mobile terá drawer em etapa futura.
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
        borderRight: "1px solid var(--color-border-subtle, rgba(255,255,255,0.06))",
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header — logo Q-bolt */}
      <div className="flex h-16 items-center px-6">
        <Link
          href="/"
          className="flex items-center transition-opacity hover:opacity-90"
          aria-label="Quayer — início"
        >
          <Logo size={26} variant="color" />
        </Link>
      </div>

      {/* Novo projeto */}
      <div className="px-4 pb-5 pt-2">
        <Link
          href="/"
          className="group flex h-11 w-full items-center justify-between gap-2 rounded-lg px-4 text-sm font-semibold transition-all"
          style={{
            backgroundColor: "var(--color-brand, #FFD60A)",
            color: "var(--color-text-inverse, #1A0800)",
            boxShadow: "0 0 0 1px var(--color-border-brand-strong, rgba(255,214,10,0.35))",
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

      {/* Meus projetos */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="px-4 pb-2 pt-1">
          <h3
            className="text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-text-tertiary, rgba(255,255,255,0.4))" }}
          >
            Meus projetos
          </h3>
        </div>

        {visibleProjects.length === 0 ? (
          <p
            className="px-4 py-2 text-xs"
            style={{ color: "var(--color-text-tertiary, rgba(255,255,255,0.4))" }}
          >
            Nenhum projeto ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visibleProjects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projetos/${project.id}`}
                  className="flex items-center gap-2.5 rounded-md px-4 py-2 text-sm transition-colors"
                  style={{
                    color: "var(--color-text-secondary, rgba(255,255,255,0.55))",
                  }}
                  onMouseEnter={undefined}
                >
                  <FolderKanban
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--color-text-tertiary, rgba(255,255,255,0.4))" }}
                  />
                  <span className="truncate">{project.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="px-4 pt-2">
          <Link
            href="/projetos"
            className="text-xs transition-colors"
            style={{ color: "var(--color-text-tertiary, rgba(255,255,255,0.4))" }}
          >
            ver todos →
          </Link>
        </div>
      </div>

      {/* Footer — navegação secundária */}
      <div
        className="mt-auto flex flex-col gap-0.5 border-t p-3"
        style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.06))" }}
      >
        <SidebarLink href="/user/seguranca" icon={Settings} label="Configurações" />
        <SidebarLink href="/integracoes" icon={FolderKanban} label="Integrações" />
        {isSuperAdmin && (
          <SidebarLink href="/admin" icon={Shield} label="Admin" />
        )}
      </div>
    </aside>
  )
}

function SidebarLink({
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
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors"
      style={{ color: "var(--color-text-secondary, rgba(255,255,255,0.55))" }}
    >
      <Icon
        className="h-4 w-4"
        style={{ color: "var(--color-text-tertiary, rgba(255,255,255,0.4))" }}
      />
      {label}
    </Link>
  )
}
