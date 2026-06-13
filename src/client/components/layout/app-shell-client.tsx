"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { PanelLeftOpen } from "lucide-react"
import { BuilderSidebar } from "./builder-sidebar"
import { SidebarProvider } from "@/client/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip"

interface AppShellClientProps {
  recentProjects: Array<{ id: string; name: string; status: string; type: string }>
  children: ReactNode
  /** Sidebar override. Quando presente, substitui a BuilderSidebar padrão. */
  sidebarOverride?: ReactNode
  /** Estado vindo do server para evitar flash de layout na primeira pintura. */
  initialCollapsed?: boolean
}

const STORAGE_KEY = "quayer.sidebar.collapsed"
const COOKIE_KEY = "quayer.sidebar.collapsed"
const SIDEBAR_NAV_ID = "builder-sidebar-navigation"

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

function isProjectWorkspacePath(pathname: string | null): boolean {
  return /^\/projetos\/[^/]+/.test(pathname ?? "")
}

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  } catch (e) {
    console.warn("[sidebar] localStorage indisponível:", e)
    return false
  }
}

function persistCollapsedPreference(collapsed: boolean) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch (e) {
      console.warn("[sidebar] localStorage indisponível:", e)
    }
  }

  if (typeof document !== "undefined") {
    document.cookie = [
      `${COOKIE_KEY}=${String(collapsed)}`,
      "path=/",
      "max-age=31536000",
      "SameSite=Lax",
    ].join("; ")
  }
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null ||
    target.getAttribute("role") === "textbox" ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  )
}

/**
 * AppShellClient — camada client do AppShell.
 *
 * Responsável por:
 *  - Estado de colapso da sidebar (persistido em localStorage)
 *  - Handle lateral pra reabrir a sidebar quando colapsada
 *  - Atalho ⌘B / Ctrl+B pra toggle
 *  - Wrapper SidebarProvider (compat com páginas legadas que têm
 *    <SidebarTrigger> no header)
 *  - Suporte a sidebar override (caller pode injetar sidebar customizada)
 */
export function AppShellClient({
  recentProjects,
  children,
  sidebarOverride,
  initialCollapsed = false,
}: AppShellClientProps) {
  const pathname = usePathname()
  const isProjectWorkspace = isProjectWorkspacePath(pathname)
  const [collapsed, setCollapsed] = useState(
    () => initialCollapsed || isProjectWorkspace,
  )
  const [hydrated, setHydrated] = useState(false)
  const { resolvedTheme } = useTheme()
  const router = useRouter()
  const isLight = hydrated && resolvedTheme === "light"
  // DS v3 tokens:
  //   --color-bg-base    #000000 (dark)
  //   --color-bg-inverse #F5F2ED (light)
  //   --color-text-inverse #1A0800
  const mainBg = isLight ? "#F5F2ED" : "#000000"
  const mainText = isLight ? "#1A0800" : "#FFFFFF"

  // Carrega preferencia legada do localStorage após hidratação + registra atalho.
  useEffect(() => {
    if (!initialCollapsed && readStoredCollapsed()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(true)
    }
    setHydrated(true)

    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "b" &&
        (e.metaKey || e.ctrlKey) &&
        !isEditableShortcutTarget(e.target)
      ) {
        e.preventDefault()
        setCollapsed((prev) => {
          const next = !prev
          persistCollapsedPreference(next)
          return next
        })
      }
      // ⌘K / Ctrl+K — Nova conversa
      //   Na home (/): foca o textarea
      //   Fora da home: navega pra /; focus acontece no mount do home-page
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        const input = document.getElementById(
          "builder-home-input",
        ) as HTMLTextAreaElement | null
        if (input) {
          input.focus()
          input.select()
        } else {
          router.push("/")
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [initialCollapsed, router])

  // Entrar no WORKSPACE de um projeto (e só nele) auto-minimiza a sidebar —
  // chat + painel ganham a tela inteira (ex.: mandou mensagem na home e caiu
  // no projeto recém-criado). Decisão de sessão: NÃO persiste no localStorage,
  // então a preferência global do usuário (⌘B/botão, que persistem) fica intacta
  // e reabrir a sidebar não briga com novas navegações dentro do workspace.
  const wasProjectWorkspaceRef = useRef(isProjectWorkspace)
  useIsomorphicLayoutEffect(() => {
    const was = wasProjectWorkspaceRef.current
    wasProjectWorkspaceRef.current = isProjectWorkspace
    if (isProjectWorkspace && !was) setCollapsed(true)
  }, [isProjectWorkspace])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      persistCollapsedPreference(next)
      return next
    })
  }

  const sidebar = sidebarOverride ?? (
    <BuilderSidebar
      recentProjects={recentProjects}
      onToggle={toggle}
      navigationId={SIDEBAR_NAV_ID}
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black focus:shadow-lg focus:outline-none"
      >
        Pular para o conteúdo
      </a>

      {!collapsed && sidebar}

      <SidebarProvider className="relative flex-1 !min-h-0 !w-auto">
        {hydrated && collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                className="bsb-focus-ring fixed left-0 top-4 z-40 inline-flex h-10 w-9 items-center justify-center rounded-r-md border border-l-0 bg-[var(--q-sidebar-bg)] text-[var(--q-text-secondary)] transition-colors hover:bg-[var(--q-hover-bg)] hover:text-[var(--q-text-primary)]"
                style={{
                  borderColor: "var(--q-border-strong)",
                  boxShadow: "0 8px 18px -16px rgba(0,0,0,0.7)",
                }}
                aria-label="Abrir navegação lateral"
                aria-controls={SIDEBAR_NAV_ID}
                aria-expanded={false}
              >
                <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" align="start">
              Abrir navegação lateral
            </TooltipContent>
          </Tooltip>
        )}

        <main
          id="main-content"
          className="flex min-h-screen flex-1 flex-col min-w-0"
          style={{ scrollMarginLeft: '260px' }}
        >
          {children}
        </main>
      </SidebarProvider>
    </div>
  )
}
