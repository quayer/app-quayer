'use client'

import { useState, useEffect } from 'react'
import { Palette, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  type ThemeVersion,
  type ThemeMetadata,
  setTheme,
  getTheme,
  getAllThemes,
  onThemeChange,
} from '@/lib/theme-switcher'

/**
 * @component ThemeSwitcher
 * @description Componente para trocar entre as 4 versões de UI
 * Exibe dropdown com preview de cores e features de cada tema
 */
export function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState<ThemeVersion>('v1-base')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Inicializar tema ao montar
    setCurrentTheme(getTheme())

    // Listener para mudanças de tema
    const unsubscribe = onThemeChange((theme) => {
      setCurrentTheme(theme)
    })

    return unsubscribe
  }, [])

  const handleThemeChange = (theme: ThemeVersion) => {
    setTheme(theme)
    setIsOpen(false)
  }

  const themes = getAllThemes()
  const activeTheme = themes.find((t) => t.id === currentTheme)

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 bg-gray-800/50 border-gray-700 hover:border-gray-600 text-white"
        >
          <Palette className="h-4 w-4" />
          <span className="hidden sm:inline">{activeTheme?.name || 'Tema'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-gray-800 border-gray-700">
        <DropdownMenuLabel className="text-gray-300">
          Escolher Versão de UI
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-700" />

        {themes.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => handleThemeChange(theme.id)}
            className="flex flex-col items-start gap-2 p-3 cursor-pointer text-gray-300 hover:text-white hover:bg-gray-700"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="font-medium">{theme.name}</span>
                {theme.isPremium && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20"
                  >
                    Premium
                  </Badge>
                )}
              </div>
              {currentTheme === theme.id && (
                <Check className="h-4 w-4 text-emerald-400" />
              )}
            </div>

            <p className="text-xs text-gray-400">{theme.description}</p>

            {/* Color Preview */}
            <div className="flex gap-2 mt-1">
              <div
                className="w-6 h-6 rounded-full border-2 border-gray-600"
                style={{ backgroundColor: theme.colors.primary }}
                title="Primary"
              />
              <div
                className="w-6 h-6 rounded-full border-2 border-gray-600"
                style={{ backgroundColor: theme.colors.secondary }}
                title="Secondary"
              />
              <div
                className="w-6 h-6 rounded-full border-2 border-gray-600"
                style={{ backgroundColor: theme.colors.accent }}
                title="Accent"
              />
            </div>

            {/* Features */}
            <div className="flex flex-wrap gap-1 mt-1">
              {theme.features.slice(0, 2).map((feature, index) => (
                <span
                  key={index}
                  className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400"
                >
                  {feature}
                </span>
              ))}
              {theme.features.length > 2 && (
                <span className="text-xs text-gray-500">
                  +{theme.features.length - 2} mais
                </span>
              )}
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="bg-gray-700" />
        <div className="p-2 text-xs text-gray-500 text-center">
          Cada versão oferece componentes e estilos únicos
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * @component ThemeInitializer
 * @description Inicializa o tema ao carregar a página (SSR-safe)
 * Adicionar no layout raiz
 */
export function ThemeInitializer() {
  useEffect(() => {
    const { initializeTheme } = require('@/lib/theme-switcher')
    initializeTheme()
  }, [])

  return null
}