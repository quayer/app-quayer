"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { PanelLeft } from "lucide-react"
import { BuilderSidebar } from "./builder-sidebar"
import { SidebarProvider } from "@/client/components/ui/sidebar"

interface AppShellClientProps {
  recentProjects: Array<{ id: string; name: string; status: string }>
  isSuperAdmin: boolean
  children: ReactNode
  /**
   * Sidebar override. Quando presente, substitui a BuilderSidebar padrão.
   * O wrapper ainda recebe o `onToggle` via contexto através de React cloneElement.
   * Usado por /admin/* pra renderizar AdminNav como única sidebar.
   */
  sidebarOverride?: ReactNode
}

const STORAGE_KEY = "quayer.sidebar.collapsed"

/**
 * AppShellClient — camada client do AppShell.
 *
 * Responsável por:
 *  - Estado de colapso da sidebar (persistido em localStorage)
 *  - Botão flutuante pra reabrir a sidebar quando colapsada
 *  - Atalho ⌘B / Ctrl+B pra toggle
 *  - Wrapper SidebarProvider (compat com páginas legadas que têm
 *    <SidebarTrigger> no header)
 *  - Suporte a sidebar override (admin usa AdminNav em vez de BuilderSidebar)
 */
export function AppShellClient({
  recentProjects,
  isSuperAdmin,
  children,
  sidebarOverride,
}: AppShellClientProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const { resolvedTheme } = useTheme()
  const isLight = hydrated && resolvedTheme === "light"
  const mainBg = isLight ? "#FFFFFF" : "#000000"
  const mainText = isLight ? "#1A0800" : "#FFFFFF"

  // Carrega estado persistido após hidratação + registra atalho ⌘B
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === "true") setCollapsed(true)
    } catch {}
    setHydrated(true)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCollapsed((prev) => {
          const next = !prev
          try {
            localStorage.setItem(STORAGE_KEY, String(next))
          } catch {}
          return next
        })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {}
      return next
    })
  }

  const sidebar = sidebarOverride ?? (
    <BuilderSidebar
      recentProjects={recentProjects}
      isSuperAdmin={isSuperAdmin}
      onToggle={toggle}
    />
  )

  return (
    <div
      data-app-v3="true"
      className="flex min-h-screen"
      style={{
        backgroundColor: mainBg,
        color: mainText,
        fontFamily: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Durante hidratação OU quando não-colapsado, renderiza sidebar.
          suppressHydrationWarning pro caso de o estado inicial ser colapsado. */}
      {(!hydrated || !collapsed) && sidebar}

      <SidebarProvider className="relative flex-1 !min-h-0 !w-auto">
        {hydrated && collapsed && (
          <button
            type="button"
            onClick={toggle}
            className="fixed left-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-lg border transition-all hover:bg-white/5"
            style={{
              backgroundColor: "var(--color-bg-surface, #060402)",
              borderColor:
                "var(--color-border-default, rgba(255,255,255,0.1))",
              color: "var(--color-text-secondary, rgba(255,255,255,0.75))",
              boxShadow: "0 4px 12px -2px rgba(0,0,0,0.4)",
            }}
            aria-label="Mostrar sidebar"
            title="Mostrar sidebar (⌘B)"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}

        <main className="flex min-h-screen flex-1 flex-col min-w-0">
          {children}
        </main>
      </SidebarProvider>
    </div>
  )
}
