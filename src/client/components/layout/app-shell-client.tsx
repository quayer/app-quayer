"use client"

import { useEffect, useState, type ReactNode } from "react"
import { PanelLeft } from "lucide-react"
import { BuilderSidebar } from "./builder-sidebar"
import { SidebarProvider } from "@/client/components/ui/sidebar"

interface AppShellClientProps {
  recentProjects: Array<{ id: string; name: string; status: string }>
  isSuperAdmin: boolean
  children: ReactNode
}

const STORAGE_KEY = "quayer.sidebar.collapsed"

/**
 * AppShellClient — camada client do AppShell.
 *
 * Responsável por:
 *  - Estado de colapso da BuilderSidebar (persistido em localStorage)
 *  - Botão flutuante pra reabrir a sidebar quando ela está colapsada
 *  - Wrapper SidebarProvider (compat com páginas legadas que têm
 *    <SidebarTrigger> no header)
 */
export function AppShellClient({
  recentProjects,
  isSuperAdmin,
  children,
}: AppShellClientProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Carrega estado persistido após hidratação
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === "true") setCollapsed(true)
    } catch {
      // localStorage indisponível — ignora
    }
    setHydrated(true)
  }, [])

  // Atalho ⌘B / Ctrl+B pra toggle
  useEffect(() => {
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

  // Evita flash durante hidratação (se usuário tinha colapsado)
  if (!hydrated) {
    return (
      <div
        data-app-v3="true"
        className="flex min-h-screen"
        style={{
          backgroundColor: "var(--color-bg-base, #000000)",
          color: "var(--color-text-primary, #ffffff)",
          fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
        }}
      >
        <BuilderSidebar
          recentProjects={recentProjects}
          isSuperAdmin={isSuperAdmin}
          onToggle={toggle}
        />
        <SidebarProvider className="flex-1 !min-h-0 !w-auto">
          <main className="flex min-h-screen flex-1 flex-col min-w-0">
            {children}
          </main>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div
      data-app-v3="true"
      className="flex min-h-screen"
      style={{
        backgroundColor: "var(--color-bg-base, #000000)",
        color: "var(--color-text-primary, #ffffff)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      {!collapsed && (
        <BuilderSidebar
          recentProjects={recentProjects}
          isSuperAdmin={isSuperAdmin}
          onToggle={toggle}
        />
      )}

      <SidebarProvider className="relative flex-1 !min-h-0 !w-auto">
        {/* Floating show-sidebar button when collapsed */}
        {collapsed && (
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
