import { describe, expect, it } from 'vitest'
import { normalizeForAI } from './message-normalizer.service'

describe('normalizeForAI', () => {
  it('returns text content for text messages', () => {
    expect(normalizeForAI({ type: 'text', content: '  Ola   mundo  ' })).toBe('Ola mundo')
  })

  it('prefers audio transcription with explicit prefix', () => {
    expect(
      normalizeForAI({
        type: 'audio',
        content: 'caption ignorada',
        transcription: 'cliente quer remarcar para amanha',
        mediaUrl: 'https://cdn/audio.ogg',
      }),
    ).toBe('[Audio transcrito]: cliente quer remarcar para amanha')
  })

  it('summarizes media with caption and useful metadata', () => {
    expect(
      normalizeForAI({
        type: 'image',
        content: 'comprovante do pagamento',
        fileName: 'comprovante.jpg',
        mediaType: 'image',
        mimeType: 'image/jpeg',
        mediaUrl: 'https://cdn/comprovante.jpg',
      }),
    ).toBe(
      '[Imagem] | comprovante do pagamento | fileName: comprovante.jpg | mediaType: image | mimeType: image/jpeg | mediaUrl: https://cdn/comprovante.jpg',
    )
  })

  it('uses mediaType when type is generic', () => {
    expect(
      normalizeForAI({
        type: 'media',
        mediaType: 'document',
        content: 'contrato assinado',
        fileName: 'contrato.pdf',
      }),
    ).toBe('[Documento] | contrato assinado | fileName: contrato.pdf | mediaType: document')
  })

  it('summarizes location details with address and coordinates', () => {
    expect(
      normalizeForAI({
        type: 'location',
        locationName: 'Loja Centro',
        geoAddress: 'Rua A, 123',
        geoNeighborhood: 'Centro',
        geoCity: 'Sao Paulo',
        geoState: 'SP',
        geoPostalCode: '01000-000',
        latitude: -23.55,
        longitude: -46.63,
      }),
    ).toBe(
      '[Localizacao] | Loja Centro | geoAddress: Rua A, 123 | neighborhood: Centro | city: Sao Paulo | state: SP | postalCode: 01000-000 | lat/lng: -23.55, -46.63',
    )
  })

  it('produces compact labels for contacts and buttons', () => {
    expect(
      normalizeForAI({
        type: 'contact',
        contact: {
          displayName: 'Maria Silva',
          phoneNumber: '+5511999999999',
        },
      }),
    ).toBe('[Contato] | Maria Silva | phone: +5511999999999')

    expect(
      normalizeForAI({
        type: 'buttons',
        content: 'Escolha uma opcao',
        buttons: [{ title: 'Comprar' }, { title: 'Falar com atendente' }],
      }),
    ).toBe('[Botoes] | Escolha uma opcao | opcoes: Comprar, Falar com atendente')
  })

  it('falls back defensively for unknown objects', () => {
    expect(normalizeForAI({ type: 'custom', content: 'valor util' })).toBe('[custom]: valor util')
    expect(normalizeForAI(undefined)).toBe('')
    expect(normalizeForAI(42)).toBe('42')
  })
})
