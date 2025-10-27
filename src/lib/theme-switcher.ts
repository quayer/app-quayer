/**
 * Theme Switcher
 * Sistema de troca de temas para app-quayer
 */

export type ThemeVersion = 'v1-base' | 'v2-pro' | 'v3-premium' | 'v4-marketing' | 'v5-shadcnuikit'

export interface ThemeMetadata {
  id: ThemeVersion
  name: string
  description: string
  colors: {
    primary: string
    secondary: string
    accent: string
  }
  features: string[]
  isPremium: boolean
}

/**
 * Metadados dos temas disponíveis
 */
export const THEMES: Record<ThemeVersion, ThemeMetadata> = {
  'v1-base': {
    id: 'v1-base',
    name: 'Base',
    description: 'Interface funcional com shadcn/ui + Magic UI',
    colors: {
      primary: '#3b82f6', // Blue
      secondary: '#25d366', // WhatsApp Green
      accent: '#a855f7', // Purple
    },
    features: [
      'Componentes shadcn/ui',
      'Animações Magic UI',
      'Interface minimalista',
      'Performance otimizada',
    ],
    isPremium: false,
  },
  'v2-pro': {
    id: 'v2-pro',
    name: 'Pro',
    description: 'Features avançadas com componentes 21st.dev',
    colors: {
      primary: '#a855f7', // Purple
      secondary: '#06b6d4', // Cyan
      accent: '#25d366', // WhatsApp Green
    },
    features: [
      'AI Chat integrado',
      'File Upload avançado',
      'Advanced Tables',
      'Sistema de notificações',
    ],
    isPremium: false,
  },
  'v3-premium': {
    id: 'v3-premium',
    name: 'Premium',
    description: 'Experiência enterprise com shadcn/ui Kit PRO',
    colors: {
      primary: '#fbbf24', // Gold
      secondary: '#1e3a8a', // Deep Blue
      accent: '#25d366', // WhatsApp Green
    },
    features: [
      'Advanced Charts PRO',
      'Premium Cards',
      'Multi-step Forms',
      'Executive Dashboard',
    ],
    isPremium: true,
  },
  'v4-marketing': {
    id: 'v4-marketing',
    name: 'Marketing',
    description: 'Landing pages com Aceternity UI',
    colors: {
      primary: '#667eea', // Gradient start
      secondary: '#f093fb', // Gradient start
      accent: '#25d366', // WhatsApp Green
    },
    features: [
      'Hero Sections',
      'Pricing Tables',
      'Testimonials',
      'CTA Sections',
    ],
    isPremium: true,
  },
  'v5-shadcnuikit': {
    id: 'v5-shadcnuikit',
    name: 'ShadcnUIKit',
    description: 'Design moderno inspirado em ShadcnUIKit',
    colors: {
      primary: '#6366F1', // Indigo
      secondary: '#14B8A6', // Teal
      accent: '#A855F7', // Purple
    },
    features: [
      'Design profissional',
      'Contraste WCAG AAA',
      'Hierarquia visual clara',
      'Elevações sutis',
    ],
    isPremium: true,
  },
}

/**
 * Define o tema ativo
 * @param theme - ID do tema a ser aplicado
 */
export function setTheme(theme: ThemeVersion): void {
  if (typeof window === 'undefined') return

  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('app-theme', theme)

  // Dispatch custom event para listeners
  window.dispatchEvent(
    new CustomEvent('themechange', {
      detail: { theme, metadata: THEMES[theme] },
    })
  )
}

/**
 * Retorna o tema atual
 * @returns Tema ativo ou tema padrão
 */
export function getTheme(): ThemeVersion {
  if (typeof window === 'undefined') return 'v1-base'

  const savedTheme = localStorage.getItem('app-theme') as ThemeVersion
  return savedTheme && THEMES[savedTheme] ? savedTheme : 'v1-base'
}

/**
 * Retorna os metadados do tema atual
 * @returns Metadados do tema ativo
 */
export function getCurrentThemeMetadata(): ThemeMetadata {
  return THEMES[getTheme()]
}

/**
 * Retorna lista de todos os temas disponíveis
 * @returns Array de metadados de temas
 */
export function getAllThemes(): ThemeMetadata[] {
  return Object.values(THEMES)
}

/**
 * Retorna apenas temas gratuitos
 * @returns Array de metadados de temas gratuitos
 */
export function getFreeThemes(): ThemeMetadata[] {
  return Object.values(THEMES).filter((theme) => !theme.isPremium)
}

/**
 * Retorna apenas temas premium
 * @returns Array de metadados de temas premium
 */
export function getPremiumThemes(): ThemeMetadata[] {
  return Object.values(THEMES).filter((theme) => theme.isPremium)
}

/**
 * Verifica se um tema é premium
 * @param theme - ID do tema
 * @returns true se o tema for premium
 */
export function isThemePremium(theme: ThemeVersion): boolean {
  return THEMES[theme].isPremium
}

/**
 * Inicializa o tema ao carregar a página
 */
export function initializeTheme(): void {
  if (typeof window === 'undefined') return

  try {
    const savedTheme = getTheme()
    document.documentElement.setAttribute('data-theme', savedTheme)
  } catch (error) {
    console.error('Error initializing theme:', error)
    document.documentElement.setAttribute('data-theme', 'v1-base')
  }
}

/**
 * Hook para React - adicionar listener de mudança de tema
 * @param callback - Função chamada quando o tema muda
 * @returns Função para remover o listener
 */
export function onThemeChange(
  callback: (theme: ThemeVersion, metadata: ThemeMetadata) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{
      theme: ThemeVersion
      metadata: ThemeMetadata
    }>
    callback(customEvent.detail.theme, customEvent.detail.metadata)
  }

  window.addEventListener('themechange', handler)

  return () => {
    window.removeEventListener('themechange', handler)
  }
}