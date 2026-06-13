/**
 * Unit (FR-50, #11/#13) — entrada de ferramentas externas via Capacidades.
 *
 * Cobre a lógica PURA de roteamento extraída em `capabilities-section.logic.ts`:
 *   - `isIntegrationBuilderFlagOn` — gate dark/on espelhando a IntegrationsSection
 *     (off => false; on/percentage:N => true client-side);
 *   - `EXTERNAL_TOOL_SHORTCUTS` — os 2-3 atalhos de negócio (FR-49) com mensagem
 *     pré-pronta de PEDIDO (FR-09: nunca decisão/tool);
 *   - `emitExternalToolRequest` — despacha `builder:focus-chat` com a mensagem
 *     (o MESMO canal do IntegrationTemplatePicker) e NÃO auto-envia.
 *
 * Mora em `test/unit/react/builder/` porque depende de `window` (happy-dom do
 * projeto "react"); a lógica em si é pura e não renderiza componente.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  EXTERNAL_TOOL_SHORTCUTS,
  emitExternalToolRequest,
  isIntegrationBuilderFlagOn,
} from '@/client/components/projetos/preview/tabs/overview/components/capabilities-section.logic'

const FLAG = 'NEXT_PUBLIC_INTEGRATION_BUILDER'

describe('isIntegrationBuilderFlagOn (gate dark/on)', () => {
  afterEach(() => {
    delete process.env[FLAG]
  })

  it('retorna false por padrão (var ausente) — dark', () => {
    delete process.env[FLAG]
    expect(isIntegrationBuilderFlagOn()).toBe(false)
  })

  it("retorna false quando 'off' — dark", () => {
    process.env[FLAG] = 'off'
    expect(isIntegrationBuilderFlagOn()).toBe(false)
  })

  it("retorna true quando 'on'", () => {
    process.env[FLAG] = 'on'
    expect(isIntegrationBuilderFlagOn()).toBe(true)
  })

  it("trata 'percentage:N' como ON client-side (gate por org fica no servidor)", () => {
    process.env[FLAG] = 'percentage:25'
    expect(isIntegrationBuilderFlagOn()).toBe(true)
  })

  it('ignora espaços ao redor do valor', () => {
    process.env[FLAG] = '  off  '
    expect(isIntegrationBuilderFlagOn()).toBe(false)
  })
})

describe('EXTERNAL_TOOL_SHORTCUTS (atalhos de negócio FR-49)', () => {
  it('oferece 2-3 atalhos com ids estáveis e únicos', () => {
    expect(EXTERNAL_TOOL_SHORTCUTS.length).toBeGreaterThanOrEqual(2)
    expect(EXTERNAL_TOOL_SHORTCUTS.length).toBeLessThanOrEqual(3)
    const ids = EXTERNAL_TOOL_SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('crm_lead')
    expect(ids).toContain('webhook_api')
    expect(ids).toContain('other')
  })

  it('cada mensagem é um PEDIDO em linguagem de negócio (sem nome de tool/decisão)', () => {
    for (const shortcut of EXTERNAL_TOOL_SHORTCUTS) {
      expect(shortcut.label.length).toBeGreaterThan(0)
      expect(shortcut.message).toContain('ferramenta externa')
      // FR-09: não decide — não cita propose_integration/create_custom_tool.
      expect(shortcut.message).not.toMatch(/propose_integration|create_custom_tool/i)
    }
  })
})

describe('emitExternalToolRequest (roteia p/ o chat, não auto-envia)', () => {
  it('despacha builder:focus-chat com a mensagem do atalho e sem autoSend', () => {
    const handler = vi.fn()
    window.addEventListener('builder:focus-chat', handler)
    try {
      const shortcut = EXTERNAL_TOOL_SHORTCUTS[0]
      emitExternalToolRequest(shortcut.message)

      expect(handler).toHaveBeenCalledTimes(1)
      const event = handler.mock.calls[0][0] as CustomEvent<{
        message?: string
        autoSend?: boolean
      }>
      expect(event.type).toBe('builder:focus-chat')
      expect(event.detail?.message).toBe(shortcut.message)
      // Não auto-envia: o usuário revisa/edita antes de mandar (FR-09).
      expect(event.detail?.autoSend).toBeUndefined()
    } finally {
      window.removeEventListener('builder:focus-chat', handler)
    }
  })
})
