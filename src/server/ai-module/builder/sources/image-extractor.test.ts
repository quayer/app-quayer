/**
 * Tests for the pure `extractImageRefs` image-ref detector (Onda D1, vision/G2).
 *
 * Hermetic: no DB, no fetch, no network, no mocks — the function is PURE and
 * IO-free (it mirrors `url-extractor.ts`). We drive it with crafted HTML
 * fragments + a `baseUrl` and assert the absolute http(s) image URLs it emits.
 *
 * Contract (Onda D1 §3 image-extractor.ts):
 *   export interface ExtractedImageRef { url: string }   // always absolute http(s)
 *   export function extractImageRefs(html: string, baseUrl: string): ExtractedImageRef[]
 *
 * Behaviour under test:
 *   - <img src>                          → absolute url
 *   - <img srcset> / <source srcset>     → picks the LARGEST candidate
 *   - background-image:url(...) (inline style + <style> block)
 *   - relative → absolute via new URL(src, baseUrl)
 *   - discards: data: URIs, .svg, placeholders (1x1/spacer/blank/pixel/
 *     tracking-pixel by name), any scheme != http/https
 *   - dedupe by normalized URL
 *   - [] when nothing relevant (caller just continues)
 */

import { describe, it, expect } from 'vitest'
import { extractImageRefs, type ExtractedImageRef } from './image-extractor'

const BASE = 'https://www.acme.com.br/loja/'

/** Convenience: pull the bare url strings out, order-independent assertions. */
function urls(refs: ExtractedImageRef[]): string[] {
  return refs.map((r) => r.url)
}

describe('extractImageRefs', () => {
  // -------------------------------------------------------------------------
  // Empty / no-op cases
  // -------------------------------------------------------------------------

  it('returns [] for empty / whitespace / non-image HTML', () => {
    expect(extractImageRefs('', BASE)).toEqual([])
    expect(extractImageRefs('   ', BASE)).toEqual([])
    expect(extractImageRefs('<p>sem imagens aqui</p>', BASE)).toEqual([])
  })

  it('returns [] when an <img> has no usable src/srcset', () => {
    expect(extractImageRefs('<img alt="logo" />', BASE)).toEqual([])
    expect(extractImageRefs('<img src="" />', BASE)).toEqual([])
  })

  // -------------------------------------------------------------------------
  // <img src> — relative → absolute
  // -------------------------------------------------------------------------

  it('extracts a plain absolute <img src>', () => {
    const refs = extractImageRefs(
      '<img src="https://cdn.acme.com.br/p/camisa.jpg" alt="camisa" />',
      BASE,
    )
    expect(refs).toEqual([{ url: 'https://cdn.acme.com.br/p/camisa.jpg' }])
  })

  it('resolves a root-relative src against baseUrl', () => {
    const refs = extractImageRefs('<img src="/img/foto.png" />', BASE)
    expect(refs).toEqual([{ url: 'https://www.acme.com.br/img/foto.png' }])
  })

  it('resolves a document-relative src against baseUrl', () => {
    const refs = extractImageRefs('<img src="fotos/loja.jpg" />', BASE)
    // base = .../loja/  → relative resolves under that path
    expect(refs).toEqual([{ url: 'https://www.acme.com.br/loja/fotos/loja.jpg' }])
  })

  it('resolves a protocol-relative src against baseUrl scheme', () => {
    const refs = extractImageRefs('<img src="//cdn.acme.com.br/x.jpg" />', BASE)
    expect(refs).toEqual([{ url: 'https://cdn.acme.com.br/x.jpg' }])
  })

  it('handles single-quoted and double-quoted attribute values', () => {
    const single = extractImageRefs("<img src='/a/single.jpg'>", BASE)
    expect(single).toEqual([{ url: 'https://www.acme.com.br/a/single.jpg' }])

    const double = extractImageRefs('<img src="/a/double.jpg">', BASE)
    expect(double).toEqual([{ url: 'https://www.acme.com.br/a/double.jpg' }])
  })

  // -------------------------------------------------------------------------
  // srcset — picks the largest candidate
  // -------------------------------------------------------------------------

  it('picks the largest candidate from <img srcset> (width descriptors)', () => {
    const refs = extractImageRefs(
      '<img srcset="/s/small.jpg 320w, /s/medium.jpg 640w, /s/large.jpg 1280w" />',
      BASE,
    )
    expect(refs).toEqual([{ url: 'https://www.acme.com.br/s/large.jpg' }])
  })

  it('picks the largest candidate from <img srcset> (density descriptors)', () => {
    const refs = extractImageRefs(
      '<img srcset="/s/1x.jpg 1x, /s/2x.jpg 2x, /s/3x.jpg 3x" />',
      BASE,
    )
    expect(refs).toEqual([{ url: 'https://www.acme.com.br/s/3x.jpg' }])
  })

  it('picks the largest candidate from <source srcset> inside <picture>', () => {
    const refs = extractImageRefs(
      '<picture>' +
        '<source srcset="/pic/sm.jpg 480w, /pic/lg.jpg 1024w" />' +
        '<img src="/pic/fallback.jpg" />' +
        '</picture>',
      BASE,
    )
    // <source> largest + <img> fallback are both legitimate refs (deduped set).
    expect(urls(refs)).toEqual(
      expect.arrayContaining([
        'https://www.acme.com.br/pic/lg.jpg',
        'https://www.acme.com.br/pic/fallback.jpg',
      ]),
    )
    expect(refs).toHaveLength(2)
  })

  // -------------------------------------------------------------------------
  // background-image: url(...) — inline style + <style> block
  // -------------------------------------------------------------------------

  it('extracts background-image url() from an inline style attribute', () => {
    const refs = extractImageRefs(
      '<div style="background-image: url(/bg/hero.jpg); color: red"></div>',
      BASE,
    )
    expect(refs).toEqual([{ url: 'https://www.acme.com.br/bg/hero.jpg' }])
  })

  it('extracts background-image url() with quotes inside url()', () => {
    const dq = extractImageRefs(
      '<div style=\'background-image:url("/bg/dq.jpg")\'></div>',
      BASE,
    )
    expect(dq).toEqual([{ url: 'https://www.acme.com.br/bg/dq.jpg' }])

    const sq = extractImageRefs(
      "<div style=\"background-image:url('/bg/sq.jpg')\"></div>",
      BASE,
    )
    expect(sq).toEqual([{ url: 'https://www.acme.com.br/bg/sq.jpg' }])
  })

  it('extracts background url() from a <style> block', () => {
    const refs = extractImageRefs(
      '<style>.hero{background: url(/css/hero.png) no-repeat;}</style>',
      BASE,
    )
    expect(refs).toEqual([{ url: 'https://www.acme.com.br/css/hero.png' }])
  })

  // -------------------------------------------------------------------------
  // Discards: data:, svg, non-http(s) schemes, placeholders / tracking pixels
  // -------------------------------------------------------------------------

  it('discards data: URIs', () => {
    const refs = extractImageRefs(
      '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" />',
      BASE,
    )
    expect(refs).toEqual([])
  })

  it('discards .svg images (vector, not catalog photos)', () => {
    const refs = extractImageRefs(
      '<img src="/icons/logo.svg" /><img src="https://cdn.acme.com.br/i/arrow.svg" />',
      BASE,
    )
    expect(refs).toEqual([])
  })

  it('discards non-http(s) schemes (file:, ftp:, javascript:)', () => {
    const refs = extractImageRefs(
      '<img src="file:///etc/passwd" />' +
        '<img src="ftp://acme.com.br/x.jpg" />' +
        '<img src="javascript:alert(1)" />',
      BASE,
    )
    expect(refs).toEqual([])
  })

  it('discards 1x1 / spacer / blank / pixel placeholders by name', () => {
    const refs = extractImageRefs(
      '<img src="/img/spacer.gif" />' +
        '<img src="/img/1x1.png" />' +
        '<img src="/img/blank.gif" />' +
        '<img src="/img/pixel.gif" />' +
        '<img src="https://track.example.com/tracking-pixel.gif" />',
      BASE,
    )
    expect(refs).toEqual([])
  })

  it('keeps a real photo while discarding placeholders mixed in the same HTML', () => {
    const refs = extractImageRefs(
      '<img src="/img/spacer.gif" />' +
        '<img src="data:image/gif;base64,R0lGOD==" />' +
        '<img src="/icons/menu.svg" />' +
        '<img src="/produtos/vestido.jpg" alt="vestido" />',
      BASE,
    )
    expect(refs).toEqual([{ url: 'https://www.acme.com.br/produtos/vestido.jpg' }])
  })

  // -------------------------------------------------------------------------
  // Dedupe by normalized URL
  // -------------------------------------------------------------------------

  it('dedupes the same absolute URL appearing multiple times', () => {
    const refs = extractImageRefs(
      '<img src="https://cdn.acme.com.br/p/a.jpg" />' +
        '<img src="https://cdn.acme.com.br/p/a.jpg" />',
      BASE,
    )
    expect(refs).toEqual([{ url: 'https://cdn.acme.com.br/p/a.jpg' }])
  })

  it('dedupes a relative ref against its absolute twin', () => {
    const refs = extractImageRefs(
      '<img src="/p/b.jpg" />' +
        '<div style="background-image:url(https://www.acme.com.br/p/b.jpg)"></div>',
      BASE,
    )
    expect(refs).toEqual([{ url: 'https://www.acme.com.br/p/b.jpg' }])
  })

  // -------------------------------------------------------------------------
  // Mixed realistic page — img + srcset + background, dedupe + discard together
  // -------------------------------------------------------------------------

  it('extracts the full distinct set from a realistic mixed page', () => {
    const html =
      '<header style="background-image:url(/bg/top.jpg)">' +
      '  <img src="/logo.svg" alt="logo" />' + // svg → discarded
      '</header>' +
      '<main>' +
      '  <img src="https://cdn.acme.com.br/p/1.jpg" />' +
      '  <picture>' +
      '    <source srcset="/p/2-sm.jpg 400w, /p/2-lg.jpg 1200w" />' +
      '    <img src="/p/2-fallback.jpg" />' +
      '  </picture>' +
      '  <img src="/img/spacer.gif" />' + // placeholder → discarded
      '  <img src="https://cdn.acme.com.br/p/1.jpg" />' + // dup of /p/1
      '</main>'

    const got = urls(extractImageRefs(html, BASE)).sort()
    expect(got).toEqual(
      [
        'https://www.acme.com.br/bg/top.jpg',
        'https://cdn.acme.com.br/p/1.jpg',
        'https://www.acme.com.br/p/2-lg.jpg',
        'https://www.acme.com.br/p/2-fallback.jpg',
      ].sort(),
    )
  })

  // -------------------------------------------------------------------------
  // Robustness — malformed input must never throw (pure, fail-open caller)
  // -------------------------------------------------------------------------

  it('never throws on malformed / truncated HTML and returns an array', () => {
    expect(() => extractImageRefs('<img src=', BASE)).not.toThrow()
    expect(() => extractImageRefs('<<>><img', BASE)).not.toThrow()
    expect(Array.isArray(extractImageRefs('<img src=', BASE))).toBe(true)
  })

  it('skips refs that cannot be resolved against the baseUrl', () => {
    // A relative src with a broken/empty baseUrl must not throw; it is skipped.
    const refs = extractImageRefs('<img src="foto.jpg" />', '')
    expect(Array.isArray(refs)).toBe(true)
  })
})
