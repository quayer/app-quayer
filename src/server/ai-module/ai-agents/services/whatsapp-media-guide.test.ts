/**
 * Unit tests do guia de mídia do WhatsApp.
 *
 * O teste LOAD-BEARING é o anti-drift: as tags de exemplo ESCRITAS no guia têm
 * que ser reconhecidas pelo parser real (tag-parser.service). Se alguém editar a
 * sintaxe do guia de forma incompatível, este teste quebra — protegendo o agente
 * de ser ensinado a emitir tags que o pipeline outbound não converte.
 */

import { describe, it, expect } from 'vitest'

import { renderWhatsAppMediaGuide } from './whatsapp-media-guide'
import { parseTags } from '@/server/communication/services/tag-parser.service'

describe('renderWhatsAppMediaGuide', () => {
  it('inclui o header e o guardrail de NÃO inventar URL', () => {
    const guide = renderWhatsAppMediaGuide()
    expect(guide).toContain('## Envio de mídia no WhatsApp')
    expect(guide).toMatch(/NUNCA invente URLs/i)
  })

  it('anti-drift: as tags de exemplo do guia são reconhecidas pelo parser', () => {
    const { tagsFound } = parseTags(renderWhatsAppMediaGuide())
    const types = tagsFound.map((t) => t.type)
    // Os 4 tipos de mídia ensinados precisam casar com o parser real.
    expect(types).toEqual(
      expect.arrayContaining(['image', 'video', 'audio', 'document']),
    )
    // E todas as tags de exemplo trouxeram uma URL extraível.
    expect(tagsFound.every((t) => Boolean(t.url))).toBe(true)
  })

  it('foto: a sintaxe ensinada extrai url + legenda', () => {
    const msg = 'Claro! [url da imagem:"https://site/foto.jpg"|"Nossa fachada"]'
    const { tagsFound } = parseTags(msg)
    expect(tagsFound).toHaveLength(1)
    expect(tagsFound[0].type).toBe('image')
    expect(tagsFound[0].url).toBe('https://site/foto.jpg')
    expect(tagsFound[0].caption).toBe('Nossa fachada')
  })

  it('galeria: várias fotos viram várias tags image', () => {
    const { tagsFound } = parseTags(
      '[url da imagem:"https://s/1.jpg"] [url da imagem:"https://s/2.jpg"]',
    )
    expect(tagsFound).toHaveLength(2)
    expect(tagsFound.every((t) => t.type === 'image')).toBe(true)
  })
})
