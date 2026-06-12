/**
 * Builder Module — Media reconciliation (Fase E, materialização do CATÁLOGO de mídia)
 *
 * Helper PURO (zero IO, zero Prisma, zero `any`) que (1) SANITIZA as duas origens
 * materializadas do catálogo de mídia enviável pelo agente — galeria visual
 * (`KnowledgeImage`, Onda D) e fotos de preço (`PriceItem.imageUrl`, M2) — para o
 * SHAPE de runtime (`DesiredMediaAsset`), e (2) decide o que DESATIVAR no
 * `MediaAsset` quando o deploy roda o passo `materialize_media`. Toda a regra vive
 * aqui, isolada de DB/Prisma, para ser testável unitariamente. Espelha
 * `pricing-reconcile.ts` (M2) e `team-reconcile.ts` (M1) — mesma forma, mesma
 * garantia de idempotência, mesma disciplina de soft-delete.
 *
 * Por que o plano é SÓ `toDeactivate` (e não toCreate/toUpdate como pricing/team):
 *  - `MediaAsset` TEM `@@unique([source, sourceRef])` (GLOBAL). Logo o handler faz
 *    create/update via `upsert` por essa chave — não precisa que o helper distinga
 *    novo de existente. O único cálculo EM MEMÓRIA que sobra é a reconciliação
 *    "quem sumiu": linhas de `source IN ('gallery','pricing')` que existem no DB mas
 *    não estão mais no `desired` (a galeria foi recortada, a foto de preço removida).
 *    Essas entram em `toDeactivate` (soft-delete via `deletedAt`), NUNCA hard-delete.
 *  - `source = 'upload'` está FORA do controle do materialize (uploads são do
 *    usuário, intencionais e independentes do builderState). O helper NUNCA inclui
 *    um upload em `toDeactivate` — e, defensivamente, o caller já filtra o `existing`
 *    por `source IN ('gallery','pricing')`; aqui reforçamos a invariante.
 *  - Idempotência: rodar 2x com o mesmo catálogo converge ao mesmo estado (upsert
 *    no-op + nada a desativar). Seguro para retry pós-crash, coerente com os steps.
 *
 * Sanitização (defensiva — o caller já carrega linhas do DB, mas o helper re-valida):
 *  - GALLERY: descarta qualquer imagem SEM `storageKey` (sem path no bucket não há
 *    como assinar on-read → não vira mídia enviável). `caption`/`mimeType`/`sizeBytes`
 *    nuláveis viram `null`. `externalUrl` é sempre `null` (galeria assina on-read).
 *  - PRICING: só sobrevive item com `imageUrl` https VÁLIDA (mesma regra `isHttpUrl`
 *    do pricing-reconcile). `externalUrl = imageUrl` (usado direto, não assinado);
 *    `storageKey` é sempre `null`; `caption = name` (legenda = nome do serviço);
 *    `category` trimada, vazia vira `null`.
 *
 * Dependency-free: zero imports de domínio, zero IO, zero `any`. Só calcula o plano
 * + sanitiza; o handler (`materialize-media.handler.ts`) faz toda a I/O (upsert +
 * update `deletedAt`).
 */

// ==========================================
// Tipos públicos
// ==========================================

/** Origem materializada de um asset do catálogo. `'upload'` NUNCA é produzido aqui
 *  (uploads não passam pelo materialize); existe no tipo só para espelhar o schema. */
export type MediaAssetSource = 'gallery' | 'pricing' | 'upload'

/**
 * Um asset de mídia JÁ NORMALIZADO e pronto para virar (via upsert) uma linha de
 * `MediaAsset`. Campos nuláveis usam `null` (não `undefined`) DE PROPÓSITO: no
 * `update` do upsert o `null` instrui o Prisma a LIMPAR a coluna (ex.: a imagem
 * perdeu a legenda), enquanto `undefined` deixaria o valor antigo — semântica errada
 * para um catálogo re-materializado wholesale a cada deploy.
 *
 * `source` + `sourceRef` formam a CHAVE de idempotência (`@@unique([source, sourceRef])`):
 *  - gallery → `sourceRef = KnowledgeImage.id`
 *  - pricing → `sourceRef = PriceItem.id`
 */
export interface DesiredMediaAsset {
  /** Sempre 'gallery' ou 'pricing' (o materialize não produz 'upload'). */
  source: 'gallery' | 'pricing'
  /** Id da linha de origem (`KnowledgeImage.id` ou `PriceItem.id`). */
  sourceRef: string
  /** Mídia materializada é sempre imagem (galeria + foto de preço). */
  mediaType: 'image'
  /** Path no BUCKETS.MEDIA (assina on-read); preenchido só para 'gallery'. */
  storageKey: string | null
  /** URL pública externa (usada direto); preenchida só para 'pricing'. */
  externalUrl: string | null
  /** Legenda/título; `null` quando ausente. */
  caption: string | null
  /** MIME da origem; `null` quando ausente. */
  mimeType: string | null
  /** Tamanho em bytes da origem; `null` quando ausente. */
  sizeBytes: number | null
  /** Categoria livre; `null` quando ausente/vazia. */
  category: string | null
  /**
   * Curadoria herdada da origem. Usado pela galeria para materializar também
   * fotos pendentes na aba Mídias sem liberar o runtime antes da confirmação.
   * Pricing segue intencional e é confirmado no create pelo handler.
   */
  confirmedAt?: Date | null
}

/**
 * Imagem da galeria (`KnowledgeImage`) — campos mínimos que o sanitize consome.
 * Espelha as colunas selecionadas pelo handler; nuláveis seguem o schema.
 */
export interface GalleryImageRow {
  id: string
  storageKey: string | null
  caption: string | null
  mimeType: string | null
  sizeBytes: number | null
  confirmedAt?: Date | null
}

/**
 * Item de preço (`PriceItem`) — campos mínimos que o sanitize consome. `imageUrl`
 * é a foto do serviço (G5b); só vira asset quando é https válida.
 */
export interface PricingItemRow {
  id: string
  name: string
  imageUrl: string | null
  category: string | null
}

/** Linha mínima que a reconciliação precisa do DB: id + source + sourceRef. */
export interface ExistingMediaRow {
  id: string
  source: string
  sourceRef: string | null
}

/**
 * Plano de reconciliação consumido pelo passo `materialize_media`:
 *  - `toDeactivate` → ids de `MediaAsset` (source IN gallery/pricing) que sumiram do
 *    `desired` por chave `source+sourceRef` (DESATIVA via `deletedAt`, nunca deleta).
 *
 * Não há `toCreate`/`toUpdate` (ao contrário de pricing/team): o handler resolve
 * create/update via `upsert` na chave `@@unique([source, sourceRef])`.
 */
export interface MediaReconcilePlan {
  toDeactivate: string[]
}

// ==========================================
// Internos
// ==========================================

/** `true` quando uma URL http(s) é confiável o suficiente para persistir (paridade
 *  com `isHttpUrl` do pricing-reconcile). */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/** Trim de um nulável de texto: vazio/`null`/`undefined` viram `null`. */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Chave canônica de reconciliação de um asset materializado: `${source}::${sourceRef}`.
 * Só faz sentido para `gallery`/`pricing` com `sourceRef` presente. Retorna `null`
 * para uploads (sourceRef NULL) ou linhas sem ref — que NUNCA são reconciliadas aqui.
 */
function assetKey(source: string, sourceRef: string | null): string | null {
  if (source !== 'gallery' && source !== 'pricing') return null
  if (sourceRef === null) return null
  const ref = sourceRef.trim()
  if (ref.length === 0) return null
  return `${source}::${ref}`
}

// ==========================================
// sanitizeGalleryAssets
// ==========================================

/**
 * Normaliza as imagens CONFIRMADAS da galeria (`KnowledgeImage`) para
 * `DesiredMediaAsset[]`. Regras (defensivas):
 *  - DESCARTA qualquer imagem sem `storageKey` (trim) — sem path no bucket não há
 *    o que assinar on-read, logo não vira mídia enviável.
 *  - `source='gallery'`, `mediaType='image'`, `externalUrl=null` (assina on-read).
 *  - `caption`/`mimeType` trimados (vazio → `null`); `sizeBytes` finito >= 0 ou `null`.
 *  - `category` sempre `null` (galeria não tem categoria de catálogo).
 *
 * Função pura: não lê DB, não muta o input, sem `any`.
 */
export function sanitizeGalleryAssets(
  images: readonly GalleryImageRow[],
): DesiredMediaAsset[] {
  const out: DesiredMediaAsset[] = []
  for (const image of images) {
    const storageKey = nullableText(image.storageKey)
    // Sem path no bucket → não há mídia assinável; descarta.
    if (storageKey === null) continue

    const sourceRef = image.id.trim()
    if (sourceRef.length === 0) continue

    const sizeBytes =
      typeof image.sizeBytes === 'number' &&
      Number.isFinite(image.sizeBytes) &&
      image.sizeBytes >= 0
        ? Math.trunc(image.sizeBytes)
        : null

    out.push({
      source: 'gallery',
      sourceRef,
      mediaType: 'image',
      storageKey,
      externalUrl: null,
      caption: nullableText(image.caption),
      mimeType: nullableText(image.mimeType),
      sizeBytes,
      category: null,
      confirmedAt: image.confirmedAt ?? null,
    })
  }
  return out
}

// ==========================================
// sanitizePricingAssets
// ==========================================

/**
 * Normaliza os itens de preço (`PriceItem`) com foto para `DesiredMediaAsset[]`.
 * Regras (defensivas — espelham a regra G5b de `sanitizePricingItemsForRuntime`):
 *  - SÓ sobrevive item com `imageUrl` https VÁLIDA (trim + cap 2000 + `isHttpUrl`);
 *    sem foto válida não há mídia, logo o item é descartado.
 *  - `source='pricing'`, `mediaType='image'`, `externalUrl=imageUrl` (usado direto),
 *    `storageKey=null`.
 *  - `caption = name` trimado (legenda = nome do serviço); `null` se vazio.
 *  - `category` trimada (vazio → `null`). `mimeType`/`sizeBytes` sempre `null`
 *    (URL externa não traz esses metadados).
 *
 * Função pura: não lê DB, não muta o input, sem `any`.
 */
export function sanitizePricingAssets(
  items: readonly PricingItemRow[],
): DesiredMediaAsset[] {
  const out: DesiredMediaAsset[] = []
  for (const item of items) {
    // G5b — só URL http(s) válida (trim + cap 2000); senão o item não vira asset.
    let externalUrl: string | null = null
    if (typeof item.imageUrl === 'string') {
      const trimmed = item.imageUrl.trim().slice(0, 2000)
      if (trimmed.length > 0 && isHttpUrl(trimmed)) externalUrl = trimmed
    }
    if (externalUrl === null) continue

    const sourceRef = item.id.trim()
    if (sourceRef.length === 0) continue

    out.push({
      source: 'pricing',
      sourceRef,
      mediaType: 'image',
      storageKey: null,
      externalUrl,
      caption: nullableText(item.name),
      mimeType: null,
      sizeBytes: null,
      category: nullableText(item.category),
    })
  }
  return out
}

// ==========================================
// reconcileMediaAssets
// ==========================================

/**
 * Calcula o plano de reconciliação entre o catálogo materializado do DB (`existing`,
 * já filtrado pelo caller para `source IN ('gallery','pricing')` e `deletedAt IS NULL`)
 * e os assets desejados (`desired`, união de gallery + pricing sanitizados).
 *
 * Match-by-key (chave = `${source}::${sourceRef}`):
 *  - presente no DB E no `desired` → permanece (o upsert do handler reescreve/reativa).
 *  - presente no DB, ausente no `desired` → `toDeactivate` (id; soft-delete via
 *    `deletedAt`, NUNCA hard-delete — preserva histórico e é reversível no próximo deploy).
 *
 * Invariantes de segurança:
 *  - NUNCA inclui `source='upload'` em `toDeactivate` (uploads são do usuário, fora do
 *    controle do materialize) — reforçado aqui mesmo que o caller já filtre o `existing`.
 *  - Linhas do DB sem chave utilizável (source inesperado, `sourceRef` NULL/vazio) são
 *    IGNORADAS — não há como reconciliá-las e não se apaga lixo desconhecido.
 *
 * Idempotência: rodar 2x com o mesmo `desired` converge (nada a desativar na 2ª run).
 *
 * Função pura: não muta os inputs, sem `any`.
 */
export function reconcileMediaAssets(
  existing: readonly ExistingMediaRow[],
  desired: readonly DesiredMediaAsset[],
): MediaReconcilePlan {
  // Conjunto das chaves desejadas (gallery + pricing). Last-write-wins é irrelevante
  // aqui (só presença importa), mas a chave inclui source → nunca colide entre origens.
  const desiredKeys = new Set<string>()
  for (const asset of desired) {
    const key = assetKey(asset.source, asset.sourceRef)
    if (key !== null) desiredKeys.add(key)
  }

  const toDeactivate: string[] = []
  for (const row of existing) {
    // Blindagem dura: nunca toca uploads (sourceRef NULL → assetKey já daria null,
    // mas o `===` explícito documenta a invariante crítica).
    if (row.source === 'upload') continue

    const key = assetKey(row.source, row.sourceRef)
    if (key === null) continue // source inesperado / sourceRef ausente → ignora (não apaga lixo).

    if (!desiredKeys.has(key)) {
      toDeactivate.push(row.id)
    }
  }

  return { toDeactivate }
}
