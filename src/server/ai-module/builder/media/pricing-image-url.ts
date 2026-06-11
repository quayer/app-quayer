/**
 * Builder Module — helpers da URL ESTÁVEL de foto de preço (pricing-image).
 *
 * PROBLEMA (audit alto): a rota POST /api/v1/builder/pricing-image/upload
 * devolvia uma SIGNED URL do storage, que o FE persistia em PriceItem.imageUrl.
 * No backend Supabase a signed URL expira (default
 * SUPABASE_STORAGE_SIGNED_URL_EXPIRY = 604800s ≈ 7 dias) → a foto quebrava na
 * grade da aba Mídias e era enviada QUEBRADA ao cliente no WhatsApp.
 *
 * SOLUÇÃO (sign-on-read, mesmo padrão de source-images/media-curation):
 *  - o upload devolve uma URL ESTÁVEL apontando para
 *    GET /api/v1/builder/pricing-image/view?key=<storageKey> — a rota assina o
 *    storageKey on-read e redireciona; o link persistido NUNCA expira.
 *  - o materialize_media reconhece essa URL (e a signed URL LEGADA do Supabase,
 *    healing de dados antigos) via `extractPricingStorageKey` e grava o
 *    MediaAsset com `storageKey` (assinado on-read pelo runtime/aba Mídias) em
 *    vez de `externalUrl` vencível. URLs realmente EXTERNAS (coladas pelo
 *    usuário no fallback) seguem como `externalUrl`, como antes.
 *
 * Helpers PUROS (zero IO, zero Prisma, zero `any`) — testáveis unitariamente.
 * Consumidores: upload/route.ts, view/route.ts (app router) e
 * materialize-media.handler.ts (saga de deploy).
 */

/** Path (relativo à origem do app) da rota pública de leitura sign-on-read. */
export const PRICING_IMAGE_VIEW_PATH = '/api/v1/builder/pricing-image/view'

/**
 * Shape EXATO da key gerada pelo upload: `pricing/{orgId}/{projectId}/{uuid}.{ext}`.
 * O UUID v4 no filename torna a key não-adivinhável (público-por-link, igual à
 * rota GET /api/v1/files do driver local) e o prefixo `pricing/` + shape rígido
 * impedem que a rota /view assine keys arbitrárias de outros diretórios.
 */
const PRICING_STORAGE_KEY_REGEX =
  /^pricing\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp|gif)$/i

/** `true` quando o valor tem o shape exato de uma storage key de foto de preço. */
export function isPricingStorageKey(value: string): boolean {
  return PRICING_STORAGE_KEY_REGEX.test(value)
}

/**
 * Monta a URL ESTÁVEL (absoluta) da foto de preço — é ISTO que o FE persiste em
 * PriceItem.imageUrl. `origin` deve ser a base pública do app
 * (NEXT_PUBLIC_APP_URL em prod/homol; req.nextUrl.origin como fallback em dev).
 */
export function buildPricingImageViewUrl(
  origin: string,
  storageKey: string,
): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}${PRICING_IMAGE_VIEW_PATH}?key=${encodeURIComponent(storageKey)}`
}

/**
 * Signed URL LEGADA do Supabase Storage:
 * `{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{key}?token=…` — dados
 * persistidos ANTES desta correção. Capturamos a key (sem o token) para o
 * materialize "curar" o registro no próximo deploy.
 */
const SUPABASE_SIGNED_PATH_REGEX =
  /\/storage\/v1\/object\/sign\/[^/]+\/(pricing\/[^?]+)$/

/**
 * Extrai a storage key de uma URL de foto de preço gerada pelo APP, ou `null`
 * quando a URL é realmente externa (colada pelo usuário) ou não parseável.
 * Reconhece DOIS formatos:
 *  1. a URL estável da rota /view (formato novo);
 *  2. a signed URL legada do Supabase (healing de PriceItem.imageUrl antigos).
 * A key extraída só é aceita com o shape exato (`isPricingStorageKey`) —
 * defesa contra falso-positivo em URLs externas que contenham "/pricing/".
 */
export function extractPricingStorageKey(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  // 1. URL estável da rota /view (formato novo): key no query param.
  if (parsed.pathname === PRICING_IMAGE_VIEW_PATH) {
    const key = parsed.searchParams.get('key')
    return key !== null && isPricingStorageKey(key) ? key : null
  }

  // 2. Signed URL legada do Supabase: key no path, após o bucket.
  const match = SUPABASE_SIGNED_PATH_REGEX.exec(parsed.pathname)
  if (match) {
    let key: string
    try {
      key = decodeURIComponent(match[1])
    } catch {
      return null
    }
    return isPricingStorageKey(key) ? key : null
  }

  return null
}
