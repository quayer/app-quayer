"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

interface OrgTab {
  href: string
  label: string
  matches: (pathname: string) => boolean
}

const TABS: OrgTab[] = [
  {
    href: "/org",
    label: "Geral",
    matches: (p) => p === "/org",
  },
  {
    href: "/org/equipe",
    label: "Equipe",
    matches: (p) => p.startsWith("/org/equipe"),
  },
  {
    href: "/org/billing",
    label: "Plano & Uso",
    matches: (p) => p.startsWith("/org/billing"),
  },
]

export function OrgTabs() {
  const pathname = usePathname()
  const { tokens } = useAppTokens()

  return (
    <div
      className="flex items-center gap-1 border-b"
      style={{ borderColor: tokens.divider }}
      role="tablist"
      aria-label="Configurações da organização"
    >
      {TABS.map((tab) => {
        const isActive = tab.matches(pathname ?? "")
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className="relative px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: isActive ? tokens.brand : tokens.textSecondary,
            }}
          >
            {tab.label}
            {isActive ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full"
                style={{ backgroundColor: tokens.brand }}
              />
            ) : null}
          </Link>
        )
      })}
    </div>
  )
}
