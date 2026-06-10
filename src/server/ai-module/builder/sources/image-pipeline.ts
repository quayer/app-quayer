/**
 * Builder Module — Image extraction PIPELINE (Onda D1, vision/G2, website-first).
 *
 * O ORQUESTRADOR da extração de imagens de UMA fonte (site). Dado o HTML já
 * extraído pelo ingest (sem 2º fetch) + a baseUrl da fonte, para CADA imagem
 * candidata, sob um semáforo de concorrência (`p-limit`):
 *
 *   extractImageRefs → cap MAX_IMAGES_PER_SOURCE →
 *     [ safeFetch (SSRF-guarded, revalida cada hop de redirect)
 *       → cap MAX_DOWNLOAD_BYTES (lê o corpo com contador, aborta se passar;
 *         corpos > MAX_IMAGE_BYTES passam pelo semáforo oversize)
 *       → sniffImage (magic bytes; ignora content-type spoofado)
 *       → imageSize (descarta < MIN_DIMENSION_PX em qualquer eixo)
 *       → downscale (sharp, fail-open) quando > MAX_IMAGE_BYTES ou
 *         > MAX_STORED_DIMENSION_PX — REDUZ em vez de descartar; o cap
 *         MAX_IMAGE_BYTES vale para o buffer FINAL armazenado/legendado
 *       → sha256 (content-addressed; é a chave de dedup)
 *       → storage.upload(BUCKETS.MEDIA, storageKey)
 *       → database.knowledgeImage.create (catch P2002 = dedup → skip silencioso)
 *       → captionImage (vision-LLM PT-BR) → update caption ]
 *
 * FAIL-OPEN ABSOLUTO: NUNCA lança. Qualquer erro de uma imagem (download, sniff,
 * dimensão, storage, caption) só é contabilizado/logado — nunca muda o status da
 * fonte, nunca derruba o source-enrich.job, nunca bloqueia o RAG/texto. O caption
 * é o último passo e o mais frágil: se falhar, a imagem fica SEM legenda (NULL) e
 * segue persistida (curadoria/recaption fica para D2/D3).
 *
 * SHORT-CIRCUIT (antes de qualquer trabalho): se `storage.isAvailable()` for false
 * (sem bucket configurado) OU `KnowledgeSource.imagesEnabled === false` (opt-out
 * da fonte), retorna um resultado zerado sem tocar a rede nem o LLM.
 *
 * storageKey content-addressed (BUCKETS.MEDIA):
 *   `knowledge/${organizationId}/${sourceId}/${sha256}.${ext}`
 * Persiste SÓ o storageKey (path) — NUNCA a signed URL (que expira em 7d; assina
 * on-read em D2). `captionEmbedding` fica NULL no MVP (não embeda agora).
 *
 * Contrato/decisões: docs/builder/ONDA_D_VISION_PLAN.md (§ migration/pipeline/riscos).
 */

import { createHash } from 'node:crypto'

import pLimit from 'p-limit'
import { imageSize } from 'image-size'

import { database } from '@/server/services/database'
import { BUCKETS, storage } from '@/server/services/storage'
import { sniffImage, type ImageKind } from '@/lib/images/sniff-image'
import { safeFetch } from '@/server/ai-module/ai-agents/knowledge/text-extraction'

import { extractImageRefs } from './image-extractor'
import { captionImage } from './image-caption.service'

// ---------------------------------------------------------------------------
// Caps DUROS (constantes exportadas) — ver ONDA_D_VISION_PLAN §Pipeline/Riscos.
// ---------------------------------------------------------------------------

/** Máximo de imagens persistidas por fonte (controle de custo de visão). */
export const MAX_IMAGES_PER_SOURCE = 30
/** Tamanho máximo ARMAZENADO por imagem em bytes (5 MB). Imagens maiores não são
 *  mais descartadas direto: são absorvidas até MAX_DOWNLOAD_BYTES e REDUZIDAS
 *  (downscale via sharp, fail-open) até caber — só viram skip se nem reduzidas
 *  couberem (ou se o sharp estiver indisponível). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** Cap de DOWNLOAD por imagem (64 MB) — fotos de galeria/imobiliária em alta
 *  resolução chegam a dezenas de MB (caso real: 6–62 MB por foto); baixamos até
 *  aqui APENAS para reduzir, nunca para armazenar/legendar no tamanho original. */
export const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024
/** Dimensão máxima (px) armazenada em cada eixo — acima disso a imagem é reduzida
 *  (fit inside, sem ampliar). 2048px é suficiente p/ curadoria + envio WhatsApp e
 *  mantém o caption multimodal dentro dos limites dos provedores de visão. */
export const MAX_STORED_DIMENSION_PX = 2048
/** Qualidade JPEG/WebP do downscale. */
export const RESIZE_QUALITY = 82
/** Dimensão mínima (px) em CADA eixo — descarta ícones/spacers/tracking pixels. */
export const MIN_DIMENSION_PX = 200
/** Concorrência do download/caption (semáforo p-limit) — equilíbrio custo/latência. */
export const IMAGE_CONCURRENCY = 8
/** Concorrência EXTRA (interna) p/ leitura de corpos ACIMA de MAX_IMAGE_BYTES:
 *  limita o pico de memória do caminho oversized a ~2×MAX_DOWNLOAD_BYTES. */
export const OVERSIZE_READ_CONCURRENCY = 2

// ---------------------------------------------------------------------------
// Contrato de I/O
// ---------------------------------------------------------------------------

/**
 * Entrada do orquestrador. `html` é o HTML cru já extraído pelo ingest (evita 2º
 * fetch e re-entrada no guard SSRF); `baseUrl` = `KnowledgeSource.source` (URL do
 * site) usado para resolver `src` relativo → absoluto.
 */
export interface ExtractImagesInput {
  sourceId: string
  collectionId: string
  organizationId: string
  userId: string
  projectId: string
  html: string
  baseUrl: string
}

/**
 * Telemetria do processamento (para log/observabilidade; NUNCA altera o status da
 * fonte). `errors` agrega falhas não-fatais (download/sniff/caption) — fail-open.
 */
export interface ExtractImagesResult {
  /** Candidatas extraídas do HTML (antes do cap). */
  candidates: number
  /** Baixadas com sucesso e validadas (sniff + dimensão). */
  downloaded: number
  /** Persistidas em `knowledge_images` (exclui dedup P2002 e skips). */
  persisted: number
  /** Persistidas que também ganharam legenda (caption ok). */
  captioned: number
  /** Descartadas por regra (não-imagem, pequena, byte-cap, dedup). */
  skipped: number
  /** Falhas não-fatais agregadas (só para log; fail-open). */
  errors: number
}

// ---------------------------------------------------------------------------
// Resultado zerado (short-circuit) — sem nenhum trabalho de rede/LLM.
// ---------------------------------------------------------------------------

function emptyResult(): ExtractImagesResult {
  return {
    candidates: 0,
    downloaded: 0,
    persisted: 0,
    captioned: 0,
    skipped: 0,
    errors: 0,
  }
}

// ---------------------------------------------------------------------------
// extractImagesForSource — ORQUESTRADOR. NUNCA lança.
// ---------------------------------------------------------------------------

/**
 * Extrai, valida, persiste e legenda as imagens de UMA fonte (website-first).
 * Fail-open absoluto: toda falha é capturada e contabilizada — nunca propagada.
 *
 * @param input  contexto org-scoped + html/baseUrl da fonte.
 * @returns      telemetria do processamento (sempre resolve, nunca rejeita).
 */
export async function extractImagesForSource(
  input: ExtractImagesInput,
): Promise<ExtractImagesResult> {
  const result = emptyResult()

  // ── Short-circuit 1: storage indisponível → nada a fazer (sem upload possível).
  if (!storage.isAvailable()) {
    return result
  }

  // ── Short-circuit 2: opt-out da fonte (imagesEnabled=false). Lê org-scoped; em
  //    qualquer falha de leitura, fail-open → segue (não bloqueia por DB hiccup).
  try {
    const source = await database.knowledgeSource.findFirst({
      where: { id: input.sourceId, organizationId: input.organizationId },
      select: { imagesEnabled: true },
    })
    // Fonte inexistente para o org OU opt-out explícito → não processa.
    if (!source || source.imagesEnabled === false) {
      return result
    }
  } catch (err) {
    console.warn(
      '[image-pipeline] falha ao ler imagesEnabled (fail-open, prossegue):',
      input.sourceId,
      errorMessage(err),
    )
  }

  // ── Extração das candidatas (PURE, IO-free) + cap duro de quantidade. ────────
  let refs: ReturnType<typeof extractImageRefs>
  try {
    refs = extractImageRefs(input.html, input.baseUrl)
  } catch (err) {
    // Extrator é puro e não deveria lançar; mas mantemos fail-open por garantia.
    console.warn(
      '[image-pipeline] extractImageRefs falhou (fail-open):',
      input.sourceId,
      errorMessage(err),
    )
    return result
  }

  result.candidates = refs.length
  if (refs.length === 0) return result

  const capped = refs.slice(0, MAX_IMAGES_PER_SOURCE)

  // ── Processa cada candidata sob semáforo de concorrência. ────────────────────
  const limit = pLimit(IMAGE_CONCURRENCY)
  const outcomes = await Promise.all(
    capped.map((ref) => limit(() => processCandidate(ref.url, input))),
  )

  // Agrega telemetria (fold puro — não muda status de fonte).
  for (const outcome of outcomes) {
    switch (outcome) {
      case 'persisted-captioned':
        result.downloaded += 1
        result.persisted += 1
        result.captioned += 1
        break
      case 'persisted-no-caption':
        result.downloaded += 1
        result.persisted += 1
        result.errors += 1 // caption falhou (só log; imagem fica sem legenda)
        break
      case 'skipped':
        result.skipped += 1
        break
      case 'error':
        result.errors += 1
        break
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// processCandidate — UMA imagem (download → validações → persist → caption).
// Retorna um discriminante; NUNCA lança (todo erro vira 'error'/'skipped').
// ---------------------------------------------------------------------------

type CandidateOutcome =
  | 'persisted-captioned'
  | 'persisted-no-caption'
  | 'skipped'
  | 'error'

/** Semáforo GLOBAL p/ leitura de corpos acima de MAX_IMAGE_BYTES (cap de memória:
 *  no pior caso OVERSIZE_READ_CONCURRENCY × MAX_DOWNLOAD_BYTES em buffers). */
const oversizeReadLimit = pLimit(OVERSIZE_READ_CONCURRENCY)

async function processCandidate(
  url: string,
  input: ExtractImagesInput,
): Promise<CandidateOutcome> {
  try {
    // 1. Download SSRF-guarded (revalida cada hop de redirect). safeFetch NÃO
    //    limita o corpo — o cap de bytes é aplicado na leitura abaixo.
    let res: Response
    try {
      res = await safeFetch(url)
    } catch {
      // URL privada/bloqueada, timeout, redirects demais, DNS, etc. → skip.
      return 'skipped'
    }
    if (!res.ok) return 'skipped'

    // Rejeita cedo o que claramente não é imagem (content-type declarado). A
    // checagem dura é o sniff de magic bytes — mas se já se declara não-imagem,
    // evitamos alocar o buffer.
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    if (contentType && !contentType.startsWith('image/')) {
      return 'skipped'
    }

    // 2. Lê o corpo com cap de DOWNLOAD (aborta se passar de MAX_DOWNLOAD_BYTES).
    //    Corpos declaradamente acima do cap de ARMAZENAMENTO passam pelo semáforo
    //    oversize (limita o pico de memória do caminho de downscale).
    const declaredLength = Number(res.headers.get('content-length') ?? '')
    const declaredOversize =
      Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES
    const buffer = declaredOversize
      ? await oversizeReadLimit(() => readBodyCapped(res, MAX_DOWNLOAD_BYTES))
      : await readBodyCapped(res, MAX_DOWNLOAD_BYTES)
    if (!buffer) return 'skipped' // > cap de download ou corpo ilegível.

    // 3. Valida a assinatura REAL (magic bytes) — content-type é spoofável.
    const kind = sniffImage(buffer)
    if (!kind) return 'skipped'

    // 4. Dimensão mínima (descarta ícones/spacers/tracking pixels < 200px).
    const dims = readDimensions(buffer)
    if (
      dims.width === null ||
      dims.height === null ||
      dims.width < MIN_DIMENSION_PX ||
      dims.height < MIN_DIMENSION_PX
    ) {
      return 'skipped'
    }

    // 4.5 Normalização: acima do cap de bytes OU da dimensão máxima → REDUZ
    //     (downscale via sharp, fail-open) em vez de descartar. Caso real: sites
    //     imobiliários servem fotos de galeria de 6–62 MB que antes viravam skip
    //     em massa ("não consegui ler as fotos"). GIF fica de fora (animação).
    //     Se a redução falhar/indisponível, o original só segue se couber no cap.
    let finalBuffer = buffer
    let finalKind: ImageKind = kind
    let finalWidth = dims.width
    let finalHeight = dims.height
    const needsShrink =
      buffer.length > MAX_IMAGE_BYTES ||
      dims.width > MAX_STORED_DIMENSION_PX ||
      dims.height > MAX_STORED_DIMENSION_PX
    if (needsShrink && kind.ext !== 'gif') {
      const shrunk = await downscaleImage(buffer, kind)
      if (shrunk) {
        finalBuffer = shrunk.buffer
        finalKind = shrunk.kind
        finalWidth = shrunk.width
        finalHeight = shrunk.height
      }
    }
    // Guards finais pós-normalização: nem reduzida coube no cap de armazenamento
    // (ou sharp indisponível p/ um corpo grande) → skip; reduzida abaixo do mínimo
    // (aspect ratio extremo) → skip.
    if (finalBuffer.length > MAX_IMAGE_BYTES) return 'skipped'
    if (finalWidth < MIN_DIMENSION_PX || finalHeight < MIN_DIMENSION_PX) {
      return 'skipped'
    }

    // 5. sha256 (content-addressed, sobre o buffer FINAL armazenado) → storageKey
    //    → upload → persist.
    const sha256 = createHash('sha256').update(finalBuffer).digest('hex')
    const storageKey = buildStorageKey(
      input.organizationId,
      input.sourceId,
      sha256,
      finalKind.ext,
    )

    // Dedup ANTES do upload/insert: páginas reais repetem a mesma imagem em URLs
    // diferentes (srcset/galerias) — sem este check cada duplicata vira um P2002
    // que o logger interno do Prisma imprime como erro (ruído de monitoramento),
    // além de um upload redundante. Corrida residual continua coberta pelo catch
    // P2002 abaixo. Fail-open: erro na consulta → segue para o insert normal.
    try {
      const existing = await database.knowledgeImage.findUnique({
        where: { sourceId_sha256: { sourceId: input.sourceId, sha256 } },
        select: { id: true },
      })
      if (existing) return 'skipped'
    } catch {
      // segue para o caminho normal — o catch do create cobre o dedup
    }

    try {
      await storage.upload(BUCKETS.MEDIA, storageKey, finalBuffer, {
        contentType: finalKind.contentType,
        upsert: true,
      })
    } catch (err) {
      console.warn(
        '[image-pipeline] upload falhou (fail-open):',
        storageKey,
        errorMessage(err),
      )
      return 'error'
    }

    // INSERT tipado. captionEmbedding/confirmedAt/deletedAt omitidos → NULL no MVP.
    // P2002 (@@unique([sourceId, sha256])) = dedup: a MESMA imagem já existe
    // (ou duas candidatas idênticas colidiram no batch concorrente) → skip
    // silencioso, NÃO conta como erro.
    let imageId: string
    try {
      const created = await database.knowledgeImage.create({
        data: {
          organizationId: input.organizationId,
          collectionId: input.collectionId,
          sourceId: input.sourceId,
          originalUrl: url,
          storageKey,
          width: finalWidth,
          height: finalHeight,
          sizeBytes: finalBuffer.length,
          sha256,
          mimeType: finalKind.contentType,
        },
        select: { id: true },
      })
      imageId = created.id
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Dedup — imagem já persistida. NÃO é erro (e o blob no storage é
        // content-addressed: o upsert acima reescreveu o mesmo path com o mesmo
        // conteúdo, então não há lixo).
        return 'skipped'
      }
      console.warn(
        '[image-pipeline] knowledgeImage.create falhou (fail-open):',
        storageKey,
        errorMessage(err),
      )
      return 'error'
    }

    // 6. Caption multimodal (vision-LLM PT-BR). É o último passo e o mais frágil:
    //    a imagem JÁ está persistida; se a legenda falhar, fica NULL (fail-open).
    let caption: { ok: true; caption: string } | { ok: false; error: string }
    try {
      caption = await captionImage(
        { buffer: finalBuffer, mimeType: finalKind.contentType },
        {
          organizationId: input.organizationId,
          userId: input.userId,
          projectId: input.projectId,
        },
      )
    } catch (err) {
      // captionImage é contratualmente fail-open, mas mantemos a rede de segurança.
      caption = { ok: false, error: errorMessage(err) }
    }

    if (!caption.ok) {
      return 'persisted-no-caption'
    }

    // Grava a legenda (best-effort). Falha aqui não regride a persistência.
    try {
      await database.knowledgeImage.update({
        where: { id: imageId },
        data: { caption: caption.caption },
      })
    } catch (err) {
      console.warn(
        '[image-pipeline] update caption falhou (fail-open):',
        imageId,
        errorMessage(err),
      )
      return 'persisted-no-caption'
    }

    return 'persisted-captioned'
  } catch (err) {
    // Rede de segurança final — NADA escapa de processCandidate.
    console.warn(
      '[image-pipeline] erro inesperado ao processar candidata (fail-open):',
      url,
      errorMessage(err),
    )
    return 'error'
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ── Downscale (sharp, lazy + fail-open) ─────────────────────────────────────

/** Resultado de uma redução bem-sucedida (buffer final + formato + dimensões). */
interface DownscaledImage {
  buffer: Buffer
  kind: ImageKind
  width: number
  height: number
}

type SharpModule = typeof import('sharp')

/** Loader lazy do sharp. O sharp chega transitivamente via Next.js (image
 *  optimization) — se um dia estiver ausente do runtime, o caminho oversized
 *  degrada para o comportamento antigo (skip), NUNCA derruba o worker. */
let sharpModulePromise: Promise<SharpModule | null> | null = null
function loadSharp(): Promise<SharpModule | null> {
  if (!sharpModulePromise) {
    sharpModulePromise = import('sharp')
      .then((mod) => {
        const withDefault = mod as unknown as { default?: SharpModule }
        return withDefault.default ?? (mod as unknown as SharpModule)
      })
      .catch(() => null)
  }
  return sharpModulePromise
}

/**
 * Reduz a imagem para caber em MAX_STORED_DIMENSION_PX (fit inside, nunca amplia),
 * re-encodando no MESMO formato (jpeg/png/webp) com RESIZE_QUALITY e respeitando a
 * orientação EXIF. FAIL-OPEN: retorna `null` em qualquer falha (sharp ausente,
 * buffer corrompido, formato não suportado) — o caller decide se o original cabe.
 */
async function downscaleImage(
  buffer: Buffer,
  kind: ImageKind,
): Promise<DownscaledImage | null> {
  const sharp = await loadSharp()
  if (!sharp) return null
  try {
    const resized = sharp(buffer)
      .rotate() // auto-orient via EXIF antes de descartar metadados
      .resize({
        width: MAX_STORED_DIMENSION_PX,
        height: MAX_STORED_DIMENSION_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
    const encoded =
      kind.ext === 'png'
        ? resized.png()
        : kind.ext === 'webp'
          ? resized.webp({ quality: RESIZE_QUALITY })
          : resized.jpeg({ quality: RESIZE_QUALITY })
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true })
    const outKind: ImageKind =
      kind.ext === 'png'
        ? { ext: 'png', contentType: 'image/png' }
        : kind.ext === 'webp'
          ? { ext: 'webp', contentType: 'image/webp' }
          : { ext: 'jpg', contentType: 'image/jpeg' }
    return {
      buffer: Buffer.from(data),
      kind: outKind,
      width: info.width,
      height: info.height,
    }
  } catch (err) {
    console.warn(
      '[image-pipeline] downscale falhou (fail-open):',
      errorMessage(err),
    )
    return null
  }
}

/**
 * storageKey content-addressed em BUCKETS.MEDIA:
 *   `knowledge/${organizationId}/${sourceId}/${sha256}.${ext}`
 */
function buildStorageKey(
  organizationId: string,
  sourceId: string,
  sha256: string,
  ext: string,
): string {
  return `knowledge/${organizationId}/${sourceId}/${sha256}.${ext}`
}

/**
 * Lê o corpo da Response acumulando chunks, abortando a leitura assim que o total
 * passar de `maxBytes` (não materializa blobs gigantes). Retorna `null` se exceder
 * o cap, se o corpo for ilegível, ou se vier vazio.
 *
 * Usa `res.body` (ReadableStream) quando disponível para cortar cedo; cai em
 * `arrayBuffer()` com checagem posterior quando o stream não existe.
 */
async function readBodyCapped(
  res: Response,
  maxBytes: number,
): Promise<Buffer | null> {
  // Atalho barato: se o servidor declara um content-length acima do cap, nem lê.
  const declaredLength = Number(res.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return null
  }

  const body = res.body
  if (!body) {
    // Sem stream — lê tudo e checa o tamanho depois (pior caso: aloca até o que
    // o servidor mandar; o content-length acima já filtrou o caso declarado).
    try {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0 || buf.length > maxBytes) return null
      return buf
    } catch {
      return null
    }
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        // Estoura o cap — aborta a leitura e descarta.
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  } catch {
    await reader.cancel().catch(() => undefined)
    return null
  }

  if (total === 0) return null
  return Buffer.concat(chunks, total)
}

/**
 * Lê largura/altura via `image-size`. Retorna `{ width: null, height: null }` se
 * indeterminado/corrompido (caller trata como skip). Nunca lança.
 */
function readDimensions(buffer: Buffer): {
  width: number | null
  height: number | null
} {
  try {
    const { width, height } = imageSize(buffer)
    return {
      width: typeof width === 'number' ? width : null,
      height: typeof height === 'number' ? height : null,
    }
  } catch {
    return { width: null, height: null }
  }
}

/** True quando o erro é uma violação de unique constraint do Prisma (P2002). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  )
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
