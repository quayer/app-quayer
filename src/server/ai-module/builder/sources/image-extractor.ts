/**
 * Builder Module — Image ref extractor (Onda D1, vision/images, website-first)
 *
 * PURE, IO-free detector for `<img>` / `srcset` / `background-image:url()` in the
 * HTML already pulled by the source-enrich pipeline. Given the extracted HTML and
 * the source's base URL it finds every image reference, RESOLVES relative→absolute
 * (`new URL(src, baseUrl)`), discards noise (data: URIs, svg, 1x1/spacer/tracking
 * pixels, non-http(s) schemes), dedupes by absolute URL, and returns the refs.
 *
 * Mirrors the idiom of `url-extractor.ts`: liberal regex capture, WHATWG `URL`
 * parser as the validator, Map-based dedupe, `[]` when nothing is found so the
 * caller (image-pipeline.ts) can short-circuit cleanly.
 *
 * IMPORTANT — NO FETCH HERE. The download (SSRF-guarded `safeFetch`), sniff,
 * dimension check, storage upload and vision caption all happen later in the
 * orchestrator (image-pipeline.ts). The per-source cap (MAX_IMAGES_PER_SOURCE)
 * is also applied there — this detector returns ALL distinct candidates.
 *
 * Contract: docs/builder/ONDA_D_VISION_PLAN.md (Onda D1) — section 3.
 */

/** A single detected image reference (pre-fetch). `url` is always absolute http(s). */
export interface ExtractedImageRef {
  /** Absolute http(s) URL of the candidate image, ready for the guarded fetch path. */
  url: string
}

// ---------------------------------------------------------------------------
// Detection regexes
// ---------------------------------------------------------------------------

/**
 * `<img ...>` tag. We grab the whole tag body so we can pull both `src` and
 * `srcset` (and inline `style`) from the same element. Non-greedy up to `>`.
 */
const IMG_TAG_REGEX = /<img\b[^>]*>/gi

/**
 * `<source ...>` element (inside `<picture>`). Carries `srcset` candidates.
 */
const SOURCE_TAG_REGEX = /<source\b[^>]*>/gi

/** Pull the `src="..."` / `src='...'` value out of a tag body. The negative
 *  lookbehind keeps it from matching the tail of `data-src=`/`data-lazy-src=`
 *  (those lazy-load attributes are handled explicitly below). */
const SRC_ATTR_REGEX = /(?<![\w-])src\s*=\s*(["'])(.*?)\1/i

/** Pull the `srcset="..."` / `srcset='...'` value out of a tag body (same
 *  lookbehind guard against `data-srcset=`/`data-lazy-srcset=`). */
const SRCSET_ATTR_REGEX = /(?<![\w-])srcset\s*=\s*(["'])(.*?)\1/i

/**
 * Lazy-load src attributes (WP lazy-load plugins, lazysizes, Elementor, Sliders):
 * `data-src` / `data-lazy-src` / `data-original` / `data-bg`. On those pages the
 * real image lives here while `src` is a 1x1/`data:` placeholder — without this
 * the extractor sees only the placeholder and the catalog comes out empty.
 */
const DATA_SRC_ATTR_REGEX =
  /\bdata-(?:src|lazy-src|original|bg)\s*=\s*(["'])(.*?)\1/gi

/** Lazy-load srcset attributes: `data-srcset` / `data-lazy-srcset`. */
const DATA_SRCSET_ATTR_REGEX =
  /\bdata-(?:srcset|lazy-srcset)\s*=\s*(["'])(.*?)\1/gi

/** Pull the `style="..."` / `style='...'` value out of a tag body (inline css). */
const STYLE_ATTR_REGEX = /\bstyle\s*=\s*(["'])(.*?)\1/i

/**
 * `background-image:url(...)` (and bare `background:...url(...)`) anywhere — both
 * in inline `style` attributes and inside `<style>` blocks. The url() target may
 * be quoted (single/double) or bare. Capture group 2 = the raw url payload.
 */
const BG_URL_REGEX = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi

/**
 * `srcset` is a comma-separated list of `<url> <descriptor>` candidates. We split
 * on commas that are NOT inside a url, then take the url token (first whitespace
 * chunk) of each candidate and its descriptor (e.g. `640w` or `2x`).
 */
const SRCSET_CANDIDATE_SPLIT = /\s*,\s*/

// ---------------------------------------------------------------------------
// Noise filters
// ---------------------------------------------------------------------------

/**
 * Filename/path patterns that are almost always layout shims or analytics
 * beacons rather than real catalog imagery. Matched case-insensitively against
 * the resolved URL's pathname.
 */
const PLACEHOLDER_NAME_REGEX =
  /(?:^|[\/_-])(?:spacer|blank|pixel|transparent|placeholder|loader|loading|1x1|grey|gray|dot|beacon|tracking|track|analytics|empty|clear|shim)(?:[._\-/]|$)/i

/** Tracking-pixel query hints (e.g. `?ev=PageView`, common beacon params). */
const TRACKING_QUERY_REGEX = /\b(?:ev|fbp|fbq|gif|impression|imp|t)=/i

/** Extensions we never caption (vectors / non-raster / favicons). */
const SKIP_EXT_REGEX = /\.(?:svg|ico|cur|webmanifest|json|js|css)(?:$|[?#])/i

// ---------------------------------------------------------------------------
// Resolution / normalization
// ---------------------------------------------------------------------------

/**
 * Resolve a raw `src`/url payload against `baseUrl`, validate it, and return the
 * canonical absolute http(s) string used as the dedupe key. Returns null for
 * anything we will not download: data: / blob: URIs, non-http(s) schemes, svg /
 * ico / non-raster extensions, and obvious placeholder / tracking pixels.
 */
function resolveImageUrl(raw: string, baseUrl: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  // Cheap pre-checks before the (relatively) expensive URL parse.
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('data:') || lower.startsWith('blob:')) return null

  let url: URL
  try {
    url = new URL(trimmed, baseUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  // Drop the fragment (never content-bearing) and lowercase the host.
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()

  if (SKIP_EXT_REGEX.test(url.pathname) || SKIP_EXT_REGEX.test(url.href)) return null
  if (PLACEHOLDER_NAME_REGEX.test(url.pathname)) return null
  if (TRACKING_QUERY_REGEX.test(url.search)) return null

  return url.toString()
}

/**
 * Pick the "biggest" candidate out of a `srcset` value. Each candidate is
 * `<url> <descriptor>` where the descriptor is `<n>w` (width) or `<n>x` (pixel
 * density). We prefer the largest width; if no width descriptors are present we
 * fall back to the largest density; if none have descriptors we take the last
 * (CDNs typically order ascending). Returns the raw url token (unresolved).
 */
function pickLargestFromSrcset(srcset: string): string | null {
  const candidates = srcset.split(SRCSET_CANDIDATE_SPLIT)
  let best: { url: string; width: number; density: number } | null = null

  for (const candidate of candidates) {
    const parts = candidate.trim().split(/\s+/)
    const url = parts[0]
    if (!url) continue

    let width = 0
    let density = 0
    for (let i = 1; i < parts.length; i++) {
      const desc = parts[i]
      if (/^\d+w$/i.test(desc)) width = Math.max(width, parseInt(desc, 10))
      else if (/^[\d.]+x$/i.test(desc)) density = Math.max(density, parseFloat(desc))
    }

    if (best === null) {
      best = { url, width, density }
      continue
    }

    // Width wins over density; density breaks width ties; otherwise keep later.
    if (width > best.width) best = { url, width, density }
    else if (width === best.width && density > best.density) best = { url, width, density }
    else if (width === best.width && density === best.density) best = { url, width, density }
  }

  return best ? best.url : null
}

// ---------------------------------------------------------------------------
// extractImageRefs
// ---------------------------------------------------------------------------

/**
 * Detect, resolve, filter and dedupe image references in extracted HTML.
 *
 * Pure — no IO, no fetch. Every returned `url` is an absolute http(s) URL.
 * Returns `[]` when the HTML contains no usable image reference (the caller
 * short-circuits the whole image pipeline in that case).
 *
 * Sources scanned:
 *   - `<img src=...>` + lazy-load `data-src`/`data-lazy-src`/`data-original`/`data-bg`
 *   - `<img srcset=...>` / `data-srcset` / `data-lazy-srcset` (largest candidate)
 *     + inline `<img style="...url()">`
 *   - `<source srcset=...>` (inside `<picture>`, incl. lazy variants)
 *   - `background-image:url(...)` in inline styles and `<style>` blocks
 *
 * Dedupe key is the resolved absolute URL, so the same asset referenced from a
 * `src`, a `srcset` and a CSS `url()` collapses to one ref.
 */
export function extractImageRefs(html: string, baseUrl: string): ExtractedImageRef[] {
  if (typeof html !== 'string' || html.length === 0) return []
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) return []

  const byUrl = new Map<string, ExtractedImageRef>()

  const add = (raw: string | null | undefined): void => {
    if (!raw) return
    const resolved = resolveImageUrl(raw, baseUrl)
    if (!resolved) return
    if (!byUrl.has(resolved)) byUrl.set(resolved, { url: resolved })
  }

  // 1) <img> elements — src, lazy-load data-src variants, srcset (largest),
  //    lazy srcset variants, and inline style url().
  for (const tag of html.matchAll(IMG_TAG_REGEX)) {
    const body = tag[0]

    const src = SRC_ATTR_REGEX.exec(body)
    if (src) add(src[2])

    for (const dataSrc of body.matchAll(DATA_SRC_ATTR_REGEX)) add(dataSrc[2])

    const srcset = SRCSET_ATTR_REGEX.exec(body)
    if (srcset) add(pickLargestFromSrcset(srcset[2]))

    for (const dataSrcset of body.matchAll(DATA_SRCSET_ATTR_REGEX)) {
      add(pickLargestFromSrcset(dataSrcset[2]))
    }

    const style = STYLE_ATTR_REGEX.exec(body)
    if (style) {
      for (const bg of style[2].matchAll(BG_URL_REGEX)) add(bg[2])
    }
  }

  // 2) <source srcset=...> inside <picture> (incl. lazy-load variants).
  for (const tag of html.matchAll(SOURCE_TAG_REGEX)) {
    const body = tag[0]
    const srcset = SRCSET_ATTR_REGEX.exec(body)
    if (srcset) add(pickLargestFromSrcset(srcset[2]))
    for (const dataSrcset of body.matchAll(DATA_SRCSET_ATTR_REGEX)) {
      add(pickLargestFromSrcset(dataSrcset[2]))
    }
  }

  // 3) Every `url(...)` in the document — covers <style> blocks AND any inline
  //    style on non-<img> elements (e.g. hero <div> backgrounds). Inline-style
  //    url()s already added above are deduped by the resolved-URL Map.
  for (const bg of html.matchAll(BG_URL_REGEX)) add(bg[2])

  return [...byUrl.values()]
}
