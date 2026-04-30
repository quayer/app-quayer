/**
 * Shared project status labels and styles.
 *
 * Canonical source of truth for BuilderProject status rendering.
 * Replaces duplicated STATUS_LABEL / STATUS_STYLE definitions that
 * previously lived in home-page.tsx, projetos-list.tsx and overview-tab.tsx.
 *
 * Palette aligns with the v3 design tokens declared in src/app/globals.css
 * (--color-brand amber, --color-success green, --color-error red).
 */

import type { ProjectStatus } from '@/client/components/projetos/types'

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Rascunho',
  production: 'Ativo',
  paused: 'Pausado',
  archived: 'Arquivado',
}

export interface StatusStyle {
  /** Background color (rgba or css var) for inline-style consumers. */
  bg: string
  /** Text color (hex, rgba or css var). */
  color: string
  /** Dot/accent color for status pills. */
  dot: string
  /** Tailwind utility classes for legacy consumers. */
  className: string
}

export const PROJECT_STATUS_STYLE: Record<ProjectStatus, StatusStyle> = {
  production: {
    bg: 'rgba(34,197,94,0.12)',
    color: '#4ade80',
    dot: '#22c55e',
    className:
      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  draft: {
    bg: 'rgba(255,214,10,0.12)',
    color: 'var(--color-brand, #FFD60A)',
    dot: '#FFD60A',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  paused: {
    bg: 'rgba(239,68,68,0.12)',
    color: '#f87171',
    dot: '#ef4444',
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  archived: {
    bg: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.5)',
    dot: 'rgba(255,255,255,0.35)',
    className: 'bg-white/5 text-white/50 border-white/10',
  },
}

/**
 * Safe status-style lookup. Falls back to `archived` when the input is
 * an unknown string (e.g. coming from an untyped server payload).
 */
export function getProjectStatusStyle(status: string): StatusStyle {
  return (
    PROJECT_STATUS_STYLE[status as ProjectStatus] ??
    PROJECT_STATUS_STYLE.archived
  )
}
