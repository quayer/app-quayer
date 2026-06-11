/**
 * Testes dos helpers PUROS da URL estável de foto de preço
 * (src/server/ai-module/builder/media/pricing-image-url.ts).
 *
 * Co-locado aqui (e não em builder/media/) porque o include do vitest.config.ts
 * cobre `src/app/api/**\/*.test.ts` mas não builder/media/** — e o contrato
 * testado é exatamente o da rota /view + /upload deste diretório.
 *
 * Contrato coberto:
 *  - isPricingStorageKey: só aceita o shape exato pricing/{org}/{project}/{uuid}.{ext};
 *  - buildPricingImageViewUrl: URL absoluta estável com a key URL-encodada;
 *  - extractPricingStorageKey: round-trip da URL estável, healing da signed URL
 *    legada do Supabase e rejeição de URLs realmente externas.
 */

import { describe, expect, it } from 'vitest'

import {
  PRICING_IMAGE_VIEW_PATH,
  buildPricingImageViewUrl,
  extractPricingStorageKey,
  isPricingStorageKey,
} from '@/server/ai-module/builder/media/pricing-image-url'

const VALID_KEY =
  'pricing/org_cltest123/2f1f3a9e-1111-4222-8333-444455556666/9a8b7c6d-1e2f-4a5b-8c9d-0e1f2a3b4c5d.jpg'

describe('isPricingStorageKey', () => {
  it('aceita o shape exato pricing/{org}/{project}/{uuid}.{ext}', () => {
    expect(isPricingStorageKey(VALID_KEY)).toBe(true)
    expect(isPricingStorageKey(VALID_KEY.replace('.jpg', '.webp'))).toBe(true)
    expect(isPricingStorageKey(VALID_KEY.replace('.jpg', '.PNG'))).toBe(true)
  })

  it('rejeita prefixo errado, traversal e filename sem uuid', () => {
    expect(isPricingStorageKey('media/abc/def/arquivo.jpg')).toBe(false)
    expect(isPricingStorageKey('pricing/../../etc/passwd')).toBe(false)
    expect(isPricingStorageKey('pricing/org/proj/foto.jpg')).toBe(false)
    expect(
      isPricingStorageKey(
        'pricing/org/proj/9a8b7c6d-1e2f-4a5b-8c9d-0e1f2a3b4c5d.pdf',
      ),
    ).toBe(false)
    expect(isPricingStorageKey('')).toBe(false)
  })
})

describe('buildPricingImageViewUrl + extractPricingStorageKey (round-trip)', () => {
  it('monta URL absoluta estável e extrai a mesma key de volta', () => {
    const url = buildPricingImageViewUrl('https://app.quayer.com', VALID_KEY)
    expect(url.startsWith(`https://app.quayer.com${PRICING_IMAGE_VIEW_PATH}?key=`)).toBe(
      true,
    )
    expect(extractPricingStorageKey(url)).toBe(VALID_KEY)
  })

  it('tolera barra final na origem (não gera // no path)', () => {
    const url = buildPricingImageViewUrl('https://app.quayer.com/', VALID_KEY)
    expect(url).toContain(`com${PRICING_IMAGE_VIEW_PATH}?key=`)
    expect(extractPricingStorageKey(url)).toBe(VALID_KEY)
  })
})

describe('extractPricingStorageKey — signed URL legada do Supabase (healing)', () => {
  it('extrai a key de uma signed URL legada persistida antes da correção', () => {
    const legacy = `https://xyz.supabase.co/storage/v1/object/sign/media-whatsapp/${VALID_KEY}?token=abc.def.ghi`
    expect(extractPricingStorageKey(legacy)).toBe(VALID_KEY)
  })

  it('rejeita signed URL de key fora de pricing/ (não assina lixo de outro diretório)', () => {
    const other =
      'https://xyz.supabase.co/storage/v1/object/sign/media-whatsapp/uploads/org/file.jpg?token=t'
    expect(extractPricingStorageKey(other)).toBeNull()
  })
})

describe('extractPricingStorageKey — URLs realmente externas seguem externas', () => {
  it('devolve null para URL externa (fallback de colar URL)', () => {
    expect(
      extractPricingStorageKey('https://instagram.com/p/abc/media.jpg'),
    ).toBeNull()
    // Mesmo contendo /pricing/ no path, sem o shape exato não extrai.
    expect(
      extractPricingStorageKey('https://site.com/pricing/foto.jpg'),
    ).toBeNull()
  })

  it('devolve null para não-URL', () => {
    expect(extractPricingStorageKey('não é url')).toBeNull()
    expect(extractPricingStorageKey('')).toBeNull()
  })

  it('devolve null para a rota /view com key inválida', () => {
    expect(
      extractPricingStorageKey(
        `https://app.quayer.com${PRICING_IMAGE_VIEW_PATH}?key=${encodeURIComponent('uploads/org/x.jpg')}`,
      ),
    ).toBeNull()
  })
})
