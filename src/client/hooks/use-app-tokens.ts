"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"

/**
 * AppTokens — paleta v3 unificada usada pelo chrome (sidebar, shell)
 * e por páginas content (home, projetos, recursos, etc).
 *
 * Os valores são referências a CSS variables definidas em globals.css.
 * O next-themes injeta o class via script inline ANTES do React hidratar,
 * então as CSS variables estão corretas no primeiro paint. Porém, isLight
 * depende de resolvedTheme que é undefined no SSR — por isso o mounted guard:
 * ambos server e client inicial vêem isLight=false, evitando hydration mismatch.
 */
export interface AppTokens {
  bgBase: string
  bgSurface: string
  bgElevated: string
  border: string
  borderStrong: string
  divider: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  textDisabled: string
  brand: string
  brandSubtle: string
  brandBorder: string
  brandText: string
  hoverBg: string
  textInverse: string
  shadow: string
}

const TOKENS: AppTokens = {
  bgBase:        "var(--q-bg-base)",
  bgSurface:     "var(--q-bg-surface)",
  bgElevated:    "var(--q-bg-elevated)",
  border:        "var(--q-border)",
  borderStrong:  "var(--q-border-strong)",
  divider:       "var(--q-divider)",
  textPrimary:   "var(--q-text-primary)",
  textSecondary: "var(--q-text-secondary)",
  textTertiary:  "var(--q-text-tertiary)",
  textDisabled:  "var(--q-text-disabled)",
  brand:         "var(--q-brand)",
  brandSubtle:   "var(--q-brand-subtle)",
  brandBorder:   "var(--q-brand-border)",
  brandText:     "var(--q-brand-text)",
  hoverBg:       "var(--q-hover-bg)",
  textInverse:   "var(--q-text-inverse)",
  shadow:        "var(--q-shadow)",
}

export function useAppTokens(): { tokens: AppTokens; isLight: boolean } {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true) }, [])
  const isLight = mounted && resolvedTheme === "light"
  return { tokens: TOKENS, isLight }
}
