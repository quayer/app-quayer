"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

/**
 * AppTokens — paleta v3 unificada usada pelo chrome (sidebar, shell)
 * e por páginas content (home, projetos, recursos, etc).
 *
 * Fonte de verdade: quayer-ds-v3.html
 *   --color-bg-base       #000000   (dark base)
 *   --color-bg-surface    #060402   (dark surface)
 *   --color-bg-elevated   #0C0804   (dark elevated)
 *   --color-bg-inverse    #F5F2ED   (light base)
 *   --color-text-primary  #FFFFFF   (dark)
 *   --color-text-inverse  #1A0800   (light)
 */
export interface AppTokens {
  bgBase: string         // background principal da página
  bgSurface: string      // cards, inputs (1 nível acima)
  bgElevated: string     // popovers, dropdowns (2 níveis acima)
  border: string         // borders subtle padrão
  borderStrong: string   // borders mais visíveis (input focado)
  divider: string        // linhas de separação entre seções
  textPrimary: string
  textSecondary: string
  textTertiary: string
  textDisabled: string
  brand: string
  brandSubtle: string
  brandBorder: string
  brandText: string      // text-brand sobre brand-subtle (active states)
  hoverBg: string
  textInverse: string    // texto sobre brand bg
  shadow: string         // box-shadow padrão pros cards
}

const DARK: AppTokens = {
  bgBase: "#000000",
  bgSurface: "#060402",
  bgElevated: "#0C0804",
  border: "rgba(255,255,255,0.12)",
  borderStrong: "rgba(255,255,255,0.18)",
  divider: "rgba(255,255,255,0.10)",
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.72)",
  textTertiary: "rgba(255,255,255,0.48)",
  textDisabled: "rgba(255,255,255,0.32)",
  brand: "#FFD60A",
  brandSubtle: "rgba(255,214,10,0.10)",
  brandBorder: "rgba(255,214,10,0.30)",
  brandText: "#FFE566",
  hoverBg: "rgba(255,255,255,0.06)",
  textInverse: "#1A0800",
  shadow: "0 16px 48px -16px rgba(0,0,0,0.75)",
}

const LIGHT: AppTokens = {
  bgBase: "#F5F2ED",        // DS v3 --color-bg-inverse
  bgSurface: "#FFFFFF",     // cards levam puro branco pra pop sobre cream
  bgElevated: "#FFFFFF",
  border: "rgba(26,8,0,0.12)",
  borderStrong: "rgba(26,8,0,0.20)",
  divider: "rgba(26,8,0,0.08)",
  textPrimary: "#1A0800",   // DS v3 --color-text-inverse
  textSecondary: "rgba(26,8,0,0.68)",
  textTertiary: "rgba(26,8,0,0.45)",
  textDisabled: "rgba(26,8,0,0.30)",
  brand: "#9A3D08",         // dark amber pra contraste em fundo claro
  brandSubtle: "rgba(232,64,0,0.10)",
  brandBorder: "rgba(154,61,8,0.32)",
  brandText: "#9A3D08",
  hoverBg: "rgba(26,8,0,0.05)",
  textInverse: "#FFFFFF",
  shadow: "0 12px 36px -12px rgba(26,8,0,0.18)",
}

/**
 * Hook reativo ao tema. Antes da hidratação, retorna DARK pra evitar
 * flash claro→escuro em SSR. `isLight` indica explicitamente quando
 * podemos confiar no resolvedTheme.
 */
export function useAppTokens(): { tokens: AppTokens; isLight: boolean } {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()
  useEffect(() => setMounted(true), [])
  const isLight = mounted && resolvedTheme === "light"
  return { tokens: isLight ? LIGHT : DARK, isLight }
}
