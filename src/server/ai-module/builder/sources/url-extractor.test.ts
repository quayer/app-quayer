/**
 * Tests for the pure `extractSourceRefs` source detector.
 *
 * Hermetic: no DB, no fetch, no mocks — the function is pure. We drive it with
 * crafted chat strings.
 *
 * Covers:
 *   - plain chat → [] (non-source turns untouched)
 *   - http(s) site URL → { type:'url' }
 *   - Instagram link + @handle → { type:'instagram' }, canonical URL
 *   - dedupe across the three IG forms (@h / instagram.com/h / https://...)
 *   - tracking-param stripping + host lowercasing + trailing-slash normalization
 */

import { describe, it, expect } from 'vitest'
import { canonicalizeSourceValue, extractSourceRefs } from './url-extractor'

describe('extractSourceRefs', () => {
  it('returns [] for plain chat with no link or handle', () => {
    expect(extractSourceRefs('quero um agente pra minha clínica')).toEqual([])
    expect(extractSourceRefs('')).toEqual([])
    expect(extractSourceRefs('   ')).toEqual([])
  })

  it('does NOT treat an email address as an Instagram handle', () => {
    expect(extractSourceRefs('me manda em contato@acme.com.br')).toEqual([])
  })

  it('detects a plain http(s) site URL', () => {
    const refs = extractSourceRefs('nosso site é https://www.acme.com.br/precos')
    expect(refs).toEqual([
      { value: 'https://www.acme.com.br/precos', type: 'url' },
    ])
  })

  it('lowercases the host but preserves the path casing', () => {
    const refs = extractSourceRefs('https://ACME.COM.BR/Produtos/Camisas')
    expect(refs).toEqual([
      { value: 'https://acme.com.br/Produtos/Camisas', type: 'url' },
    ])
  })

  it('strips tracking params (utm_*, fbclid, igshid, ...)', () => {
    const refs = extractSourceRefs(
      'https://acme.com.br/p?utm_source=ig&fbclid=xyz&id=42&igshid=abc',
    )
    expect(refs).toEqual([
      { value: 'https://acme.com.br/p?id=42', type: 'url' },
    ])
  })

  it('normalizes a trailing slash and drops the fragment', () => {
    const refs = extractSourceRefs('https://acme.com.br/sobre/#equipe')
    expect(refs).toEqual([
      { value: 'https://acme.com.br/sobre', type: 'url' },
    ])
  })

  it('detects an @handle as an instagram source (canonical URL)', () => {
    const refs = extractSourceRefs('segue a gente no @acme.oficial')
    expect(refs).toEqual([
      { value: 'https://www.instagram.com/acme.oficial', type: 'instagram' },
    ])
  })

  it('detects a bare instagram.com link as an instagram source', () => {
    const refs = extractSourceRefs('perfil: instagram.com/Acme_Oficial/')
    expect(refs).toEqual([
      { value: 'https://www.instagram.com/acme_oficial', type: 'instagram' },
    ])
  })

  it('detects a scheme\'d instagram link and classifies it as instagram', () => {
    const refs = extractSourceRefs('https://www.instagram.com/Acme?igshid=zzz')
    expect(refs).toEqual([
      { value: 'https://www.instagram.com/acme', type: 'instagram' },
    ])
  })

  it('dedupes the three Instagram forms of the same handle into one', () => {
    const refs = extractSourceRefs(
      'siga @acme — link instagram.com/acme ou https://www.instagram.com/acme/',
    )
    expect(refs).toEqual([
      { value: 'https://www.instagram.com/acme', type: 'instagram' },
    ])
  })

  it('detects a site + an instagram handle together (mixed turn)', () => {
    const refs = extractSourceRefs(
      'meu site https://acme.com.br e meu insta @acme',
    )
    expect(refs).toEqual(
      expect.arrayContaining([
        { value: 'https://acme.com.br', type: 'url' },
        { value: 'https://www.instagram.com/acme', type: 'instagram' },
      ]),
    )
    expect(refs).toHaveLength(2)
  })

  it('trims trailing punctuation clinging to a pasted URL', () => {
    const refs = extractSourceRefs('dá uma olhada em https://acme.com.br/precos.')
    expect(refs).toEqual([
      { value: 'https://acme.com.br/precos', type: 'url' },
    ])
  })

  it('ignores a lone @ and dot/underscore-only noise', () => {
    expect(extractSourceRefs('preço @ vista, parcelado em @___')).toEqual([])
  })

  it('dedupes two identical site URLs in the same message', () => {
    const refs = extractSourceRefs(
      'acme.com? não: https://acme.com.br e de novo https://acme.com.br/',
    )
    expect(refs).toEqual([
      { value: 'https://acme.com.br', type: 'url' },
    ])
  })
})

describe('canonicalizeSourceValue', () => {
  it('strips the trailing slash (with-slash === without-slash)', () => {
    expect(canonicalizeSourceValue('https://vibraresidencial.com.br/')).toBe(
      'https://vibraresidencial.com.br',
    )
    expect(canonicalizeSourceValue('https://acme.com.br/sobre/')).toBe(
      'https://acme.com.br/sobre',
    )
  })

  it('is idempotent on already-canonical values', () => {
    const canonical = 'https://vibraresidencial.com.br'
    expect(canonicalizeSourceValue(canonical)).toBe(canonical)
    expect(canonicalizeSourceValue(canonicalizeSourceValue(canonical))).toBe(
      canonical,
    )
  })

  it('matches the extractSourceRefs canon (host lowercased, tracking/fragment stripped)', () => {
    expect(
      canonicalizeSourceValue('https://ACME.COM.BR/p/?utm_source=ig#topo'),
    ).toBe('https://acme.com.br/p')
  })

  it('keeps real query strings (and the slash WHATWG requires before them)', () => {
    expect(canonicalizeSourceValue('https://acme.com.br/p?id=42')).toBe(
      'https://acme.com.br/p?id=42',
    )
  })

  it('fails open on non-URL input (trimmed, unchanged — Zod owns rejection)', () => {
    expect(canonicalizeSourceValue('  texto solto  ')).toBe('texto solto')
    expect(canonicalizeSourceValue('')).toBe('')
  })
})
