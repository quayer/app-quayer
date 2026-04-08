import type { Config } from 'tailwindcss'

/**
 * Tailwind v4 config — most theming lives in `src/app/globals.css` via @theme.
 * This file extends the theme with `ds-*` prefixed tokens that resolve to the
 * Auth v3 design system CSS vars defined under `[data-auth-v3="true"]`.
 * The `ds-` prefix prevents collisions with existing dashboard utilities.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'ds-p-amber': {
          50: 'var(--p-amber-50)',
          100: 'var(--p-amber-100)',
          200: 'var(--p-amber-200)',
          300: 'var(--p-amber-300)',
          400: 'var(--p-amber-400)',
          500: 'var(--p-amber-500)',
          600: 'var(--p-amber-600)',
          700: 'var(--p-amber-700)',
          a04: 'var(--p-amber-a04)',
          a08: 'var(--p-amber-a08)',
          a12: 'var(--p-amber-a12)',
          a20: 'var(--p-amber-a20)',
          a35: 'var(--p-amber-a35)',
        },
        'ds-p-white': {
          a06: 'var(--p-white-a06)',
          a10: 'var(--p-white-a10)',
          a18: 'var(--p-white-a18)',
          a28: 'var(--p-white-a28)',
          a30: 'var(--p-white-a30)',
          a40: 'var(--p-white-a40)',
          a45: 'var(--p-white-a45)',
          a55: 'var(--p-white-a55)',
          a75: 'var(--p-white-a75)',
        },
        'ds-p-green': {
          400: 'var(--p-green-400)',
          a10: 'var(--p-green-a10)',
          a20: 'var(--p-green-a20)',
        },
        'ds-p-red': {
          400: 'var(--p-red-400)',
          a10: 'var(--p-red-a10)',
          a20: 'var(--p-red-a20)',
        },
        'ds-p-blue': {
          400: 'var(--p-blue-400)',
          a10: 'var(--p-blue-a10)',
          a20: 'var(--p-blue-a20)',
        },
        'ds-p-orange': {
          400: 'var(--p-orange-400)',
          a10: 'var(--p-orange-a10)',
          a20: 'var(--p-orange-a20)',
        },
        'ds-brand': {
          DEFAULT: 'var(--color-brand)',
          hover: 'var(--color-brand-hover)',
          muted: 'var(--color-brand-muted)',
          subtle: 'var(--color-brand-subtle)',
          emphasis: 'var(--color-brand-emphasis)',
        },
        'ds-bg': {
          base: 'var(--color-bg-base)',
          surface: 'var(--color-bg-surface)',
          elevated: 'var(--color-bg-elevated)',
          overlay: 'var(--color-bg-overlay)',
          inverse: 'var(--color-bg-inverse)',
        },
        'ds-border': {
          subtle: 'var(--color-border-subtle)',
          DEFAULT: 'var(--color-border-default)',
          strong: 'var(--color-border-strong)',
          brand: 'var(--color-border-brand)',
          'brand-strong': 'var(--color-border-brand-strong)',
        },
        'ds-text': {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          disabled: 'var(--color-text-disabled)',
          brand: 'var(--color-text-brand)',
          inverse: 'var(--color-text-inverse)',
        },
        'ds-success': {
          DEFAULT: 'var(--color-success)',
          bg: 'var(--color-success-bg)',
          border: 'var(--color-success-border)',
        },
        'ds-error': {
          DEFAULT: 'var(--color-error)',
          bg: 'var(--color-error-bg)',
          border: 'var(--color-error-border)',
        },
        'ds-info': {
          DEFAULT: 'var(--color-info)',
          bg: 'var(--color-info-bg)',
          border: 'var(--color-info-border)',
        },
        'ds-warning': {
          DEFAULT: 'var(--color-warning)',
          bg: 'var(--color-warning-bg)',
          border: 'var(--color-warning-border)',
        },
      },
      spacing: {
        'ds-1': 'var(--space-1)',
        'ds-2': 'var(--space-2)',
        'ds-3': 'var(--space-3)',
        'ds-4': 'var(--space-4)',
        'ds-5': 'var(--space-5)',
        'ds-6': 'var(--space-6)',
        'ds-8': 'var(--space-8)',
        'ds-10': 'var(--space-10)',
        'ds-12': 'var(--space-12)',
        'ds-16': 'var(--space-16)',
        'ds-20': 'var(--space-20)',
        'ds-24': 'var(--space-24)',
      },
      borderRadius: {
        'ds-sm': 'var(--radius-sm)',
        'ds-md': 'var(--radius-md)',
        'ds-lg': 'var(--radius-lg)',
        'ds-xl': 'var(--radius-xl)',
        'ds-2xl': 'var(--radius-2xl)',
        'ds-full': 'var(--radius-full)',
      },
      fontSize: {
        'ds-label': 'var(--text-label)',
        'ds-caption': 'var(--text-caption)',
        'ds-meta': 'var(--text-meta)',
        'ds-body': 'var(--text-body)',
        'ds-body-lg': 'var(--text-body-lg)',
        'ds-heading': 'var(--text-heading)',
        'ds-title': 'var(--text-title)',
        'ds-display': 'var(--text-display)',
        'ds-hero': 'var(--text-hero)',
        'ds-jumbo': 'var(--text-jumbo)',
      },
      fontFamily: {
        'ds-sans': ['var(--font-dm-sans)', 'DM Sans', 'Helvetica Neue', 'sans-serif'],
        'ds-mono': ['var(--font-dm-mono)', 'DM Mono', 'SF Mono', 'monospace'],
      },
      fontWeight: {
        'ds-regular': 'var(--font-regular)',
        'ds-medium': 'var(--font-medium)',
        'ds-bold': 'var(--font-bold)',
        'ds-black': 'var(--font-black)',
      },
      lineHeight: {
        'ds-tight': 'var(--leading-tight)',
        'ds-snug': 'var(--leading-snug)',
        'ds-normal': 'var(--leading-normal)',
        'ds-relaxed': 'var(--leading-relaxed)',
      },
      letterSpacing: {
        'ds-tighter': 'var(--tracking-tighter)',
        'ds-tight': 'var(--tracking-tight)',
        'ds-snug': 'var(--tracking-snug)',
        'ds-normal': 'var(--tracking-normal)',
        'ds-wide': 'var(--tracking-wide)',
        'ds-wider': 'var(--tracking-wider)',
        'ds-widest': 'var(--tracking-widest)',
      },
      boxShadow: {
        'ds-xs': 'var(--shadow-xs)',
        'ds-sm': 'var(--shadow-sm)',
        'ds-md': 'var(--shadow-md)',
        'ds-lg': 'var(--shadow-lg)',
        'ds-xl': 'var(--shadow-xl)',
        'ds-brand': 'var(--shadow-brand)',
        'ds-glow': 'var(--shadow-glow)',
      },
      backgroundImage: {
        'ds-gradient-icon': 'var(--gradient-icon)',
      },
    },
  },
}

export default config
