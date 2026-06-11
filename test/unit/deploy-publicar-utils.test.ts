/**
 * Unit tests — utils puros da tab Publicar (deploy wizard).
 *
 * Cobre os fixes da auditoria Testar/Publicar:
 *  - unwrapVersions: envelope tolerante ({data:{versions}}, {versions}, array)
 *  - readinessToChecklist: blockers do step-engine → checklist (gate único)
 *  - readErrorMessage: extração de mensagem de envelopes Igniter/texto cru
 *  - formatCountdown: mm:ss do countdown do QR
 */

import { describe, expect, it } from 'vitest'

import { unwrapVersions } from '@/client/components/projetos/preview/tabs/deploy/version-utils'
import type { VersionListItem } from '@/client/components/projetos/preview/tabs/deploy/version-utils'
import { readinessToChecklist } from '@/client/components/projetos/preview/tabs/deploy/readiness-checklist'
import { readErrorMessage } from '@/client/components/projetos/preview/tabs/deploy/read-error-message'
import { formatCountdown } from '@/client/components/projetos/preview/tabs/deploy/use-whatsapp-provision'
import type { Readiness } from '@/server/ai-module/builder/state/readiness.types'

function makeVersion(overrides: Partial<VersionListItem>): VersionListItem {
  return {
    id: 'v-id',
    versionNumber: 1,
    content: 'prompt',
    description: null,
    createdBy: 'chat',
    publishedAt: null,
    publishedBy: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeReadiness(blockers: Readiness['blockers']): Readiness {
  return {
    step: { id: 'summary', title: 'Resumo', ask: 'Pronto?' },
    requiredMissing: [],
    completenessPct: 100,
    isDeployReady: blockers.length === 0,
    blockers,
    fieldOwnership: {},
    steps: [],
  }
}

describe('unwrapVersions', () => {
  const v1 = makeVersion({ id: 'a', versionNumber: 1 })
  const v2 = makeVersion({ id: 'b', versionNumber: 2 })

  it('desembrulha o envelope { data: { versions } } e ordena DESC', () => {
    const out = unwrapVersions({ data: { versions: [v1, v2] } })
    expect(out.map((v) => v.versionNumber)).toEqual([2, 1])
  })

  it('aceita payload plano { versions }', () => {
    expect(unwrapVersions({ versions: [v2] })).toHaveLength(1)
  })

  it('aceita payload array-wrapped [{ versions }]', () => {
    expect(unwrapVersions([{ versions: [v1, v2] }])).toHaveLength(2)
  })

  it('devolve [] para shapes desconhecidos sem lançar', () => {
    expect(unwrapVersions(null)).toEqual([])
    expect(unwrapVersions(undefined)).toEqual([])
    expect(unwrapVersions('erro')).toEqual([])
    expect(unwrapVersions({ data: null })).toEqual([])
  })
})

describe('readinessToChecklist', () => {
  it('marca tudo como met quando não há blockers', () => {
    const checklist = readinessToChecklist(makeReadiness([]))
    expect(checklist).toHaveLength(6)
    expect(checklist.every((item) => item.met)).toBe(true)
  })

  it('deriva met=false e usa o CTA real do blocker como hint', () => {
    const checklist = readinessToChecklist(
      makeReadiness([
        { check: 'byok', message: 'Sem provedor de IA', cta: 'Configure a chave em Config' },
        { check: 'channel', message: 'Sem canal WhatsApp' },
      ]),
    )
    const byCheck = new Map(checklist.map((item) => [item.key, item]))

    expect(byCheck.get('byok')?.met).toBe(false)
    expect(byCheck.get('byok')?.hint).toBe('Configure a chave em Config')
    expect(byCheck.get('channel')?.met).toBe(false)
    expect(byCheck.get('channel')?.hint).toBe('Sem canal WhatsApp')
    expect(byCheck.get('plan')?.met).toBe(true)
    expect(byCheck.get('version')?.met).toBe(true)
  })
})

describe('readErrorMessage', () => {
  it('extrai message do envelope Igniter { data: { message } }', async () => {
    const res = new Response(JSON.stringify({ data: { message: 'Projeto não encontrado' } }), {
      status: 404,
    })
    expect(await readErrorMessage(res, 'fallback')).toBe('Projeto não encontrado')
  })

  it('extrai error top-level', async () => {
    const res = new Response(JSON.stringify({ error: 'Link de conexão expirado' }), { status: 404 })
    expect(await readErrorMessage(res, 'fallback')).toBe('Link de conexão expirado')
  })

  it('trunca corpo texto/HTML em 240 chars', async () => {
    const res = new Response('x'.repeat(500), { status: 500 })
    const msg = await readErrorMessage(res, 'fallback')
    expect(msg).toHaveLength(240)
  })

  it('usa o fallback quando o corpo está vazio', async () => {
    const res = new Response('', { status: 502 })
    expect(await readErrorMessage(res, 'Erro 502 ao publicar')).toBe('Erro 502 ao publicar')
  })
})

describe('formatCountdown', () => {
  it('formata mm:ss com zero à esquerda nos segundos', () => {
    expect(formatCountdown(95)).toBe('1:35')
    expect(formatCountdown(605)).toBe('10:05')
    expect(formatCountdown(0)).toBe('0:00')
  })
})
