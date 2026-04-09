import Link from "next/link"
import { PanelLeft, Plus, Settings, Shield } from "lucide-react"
import { Logo } from "@/client/components/ds/logo"

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

/**
 * BuilderSidebar — US-020 (minimalista, per PRD)
 *
 * Apenas:
 *  - Logo topo
 *  - CTA "+ Novo projeto"
 *  - Lista "Meus projetos" (7 mais recentes)
 *  - Footer: Configurações + Admin (se super)
 *
 * Visível em >= lg (1024px). Mobile terá drawer futuramente.
 */
export function BuilderSidebar({
  recentProjects,
  isSuperAdmin,
  onToggle,
}: BuilderSidebarProps) {
  const visibleProjects = recentProjects.slice(0, 7)

  return (
    <aside
      className="hidden lg:flex lg:w-[248px] lg:shrink-0 lg:flex-col"
      aria-label="Navegação do Quayer"
      style={{
        backgroundColor: "var(--color-bg-base, #000000)",
        color: "var(--color-text-primary, #ffffff)",
        borderRight:
          "1px solid var(--color-border-subtle, rgba(255,255,255,0.06))",
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header — logo + collapse toggle */}
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
          className="group flex h-10 w-full items-center justify-between gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition-all"
          style={{
            backgroundColor: "var(--color-brand, #FFD60A)",
            color: "var(--color-text-inverse, #1A0800)",
          }}
        >
          <span className="flex items-center gap-2">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
            Novo projeto
          </span>
          <kbd
            className="pointer-events-none hidden rounded px-1.5 font-mono text-[10px] font-medium sm:inline-flex"
            style={{
              color: "rgba(26,8,0,0.6)",
              backgroundColor: "rgba(26,8,0,0.1)",
            }}
          >
            ⌘K
          </kbd>
        </Link>
      </div>

      {/* Meus projetos */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="px-3.5 pb-1.5 pt-1">
          <h3
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{
              color: "var(--color-text-tertiary, rgba(255,255,255,0.4))",
            }}
          >
            Meus projetos
          </h3>
        </div>

        {visibleProjects.length === 0 ? (
          <p
            className="px-3.5 py-1.5 text-xs"
            style={{
              color: "var(--color-text-tertiary, rgba(255,255,255,0.4))",
            }}
          >
            Nenhum ainda.
          </p>
        ) : (
          <ul className="flex flex-col">
            {visibleProjects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projetos/${project.id}`}
                  className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] transition-colors hover:bg-white/5"
                  style={{
                    color: "var(--color-text-secondary, rgba(255,255,255,0.85))",
                  }}
                >
                  <StatusDot status={project.status} />
                  <span className="truncate">{project.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {visibleProjects.length > 0 && (
          <div className="px-3.5 pt-2">
            <Link
              href="/projetos"
              className="text-xs transition-colors hover:underline"
              style={{
                color: "var(--color-text-tertiary, rgba(255,255,255,0.4))",
              }}
            >
              ver todos
            </Link>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="mt-auto flex flex-col border-t p-2"
        style={{
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.06))",
        }}
      >
        <FooterLink href="/user/seguranca" icon={Settings} label="Configurações" />
        {isSuperAdmin && (
          <FooterLink href="/admin" icon={Shield} label="Admin" />
        )}
      </div>
    </aside>
  )
}

// ---------- helpers ----------

function StatusDot({ status }: { status: string }) {
  const color =
    status === "production"
      ? "#22c55e"
      : status === "draft"
        ? "#FFD60A"
        : status === "paused"
          ? "#ef4444"
          : "rgba(255,255,255,0.25)"
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

function FooterLink({
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
      className="flex items-center gap-2.5 rounded-md px-3.5 py-2 text-[13px] transition-colors hover:bg-white/5"
      style={{ color: "var(--color-text-secondary, rgba(255,255,255,0.85))" }}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: "var(--color-text-tertiary, rgba(255,255,255,0.4))" }}
      />
      {label}
    </Link>
  )
}
