/**
 * Onda D1 — Unit tests do ORQUESTRADOR de extração de imagens (website-first).
 *
 * Alvo: `extractImagesForSource` (image-pipeline.ts). É o ponto onde caps, dedup,
 * fail-open e os short-circuits convergem. Todos os seams de IO são mockados —
 * SEM rede, SEM storage real, SEM DB real, SEM modelo de visão real:
 *
 *   - `@/server/services/storage`            → storage.isAvailable / storage.upload
 *   - `@/server/services/database`           → knowledgeImage.create/update + knowledgeSource.findFirst
 *   - `./image-caption.service`              → captionImage (caminho multimodal novo)
 *   - `../../ai-agents/knowledge/text-extraction` → safeFetch (download SSRF-guarded)
 *   - `@/lib/images/sniff-image`             → sniffImage (magic bytes compartilhado)
 *   - `image-size`                           → imageSize (dimensão ≥ 200px)
 *
 * O que cobre (contrato §6):
 *   1. CAPS: respeita MAX_IMAGES_PER_SOURCE (30), MAX_IMAGE_BYTES (5MB) e
 *      MIN_DIMENSION_PX (200) — descarta o que excede/é pequeno sem derrubar.
 *   2. DEDUP: colisão Prisma P2002 em `knowledgeImage.create` vira SKIP silencioso
 *      (NÃO conta como erro, NÃO derruba o batch concorrente).
 *   3. FAIL-OPEN ABSOLUTO: storage off, captionImage falha, safeFetch lança, upload
 *      lança, create lança (não-P2002) — NADA disso faz `extractImagesForSource`
 *      throw. O texto/RAG nunca é bloqueado.
 *   4. GATE: short-circuit zerado quando storage indisponível OU imagesEnabled=false.
 *      (O gate website-first `type === 'url'` é UPSTREAM no source-enrich.job — o
 *      input do pipeline é type-agnóstico por design; documentado abaixo.)
 *
 * Constantes do contrato são importadas (não hard-coded) para o teste seguir a
 * implementação se os números mudarem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted ANTES de qualquer import que os toque)
// ---------------------------------------------------------------------------

// Tipos de retorno dos seams (espelham as assinaturas reais), para os mocks
// aceitarem TODOS os ramos que os testes exercitam (null/ok:false/etc) sem `any`.
type SniffResult = { ext: 'jpg' | 'png' | 'webp' | 'gif'; contentType: string } | null
type CaptionResult = { ok: true; caption: string } | { ok: false; error: string }
type Dimensions = { width: number; height: number }
type KnowledgeImageRow = { id: string }
type SourceFlagRow = { imagesEnabled: boolean } | null

const mockIsAvailable = vi.hoisted(() => vi.fn<() => boolean>(() => true))
const mockUpload = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ path: string }>>(async () => ({
    path: 'ok',
  })),
)

vi.mock('@/server/services/storage', () => ({
  BUCKETS: { MEDIA: 'media-whatsapp' },
  storage: {
    isAvailable: mockIsAvailable,
    upload: mockUpload,
    getSignedUrl: vi.fn(),
    remove: vi.fn(),
  },
}))

const mockImageCreate = vi.hoisted(() =>
  vi.fn<(arg: { data: Record<string, unknown> }) => Promise<KnowledgeImageRow>>(
    async () => ({ id: 'img-1' }),
  ),
)
const mockImageUpdate = vi.hoisted(() =>
  vi.fn<
    (arg: {
      where: { id: string }
      data: { caption?: string }
    }) => Promise<KnowledgeImageRow>
  >(async () => ({ id: 'img-1' })),
)
const mockSourceFindFirst = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<SourceFlagRow>>(async () => ({
    imagesEnabled: true,
  })),
)

vi.mock('@/server/services/database', () => ({
  database: {
    knowledgeImage: {
      create: mockImageCreate,
      update: mockImageUpdate,
    },
    knowledgeSource: {
      findFirst: mockSourceFindFirst,
    },
  },
}))

const mockCaptionImage = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<CaptionResult>>(async () => ({
    ok: true,
    caption: 'Foto de um produto.',
  })),
)

vi.mock('./image-caption.service', () => ({
  captionImage: mockCaptionImage,
}))

// safeFetch / assertPublicHttpUrl reexportados de text-extraction (hoje privados,
// exportados em D1). O pipeline só consome `safeFetch`.
const mockSafeFetch = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<Response>>(),
)

vi.mock('@/server/ai-module/ai-agents/knowledge/text-extraction', () => ({
  safeFetch: mockSafeFetch,
  assertPublicHttpUrl: vi.fn(),
}))

const mockSniffImage = vi.hoisted(() =>
  vi.fn<(buffer: Buffer) => SniffResult>(() => ({
    ext: 'jpg',
    contentType: 'image/jpeg',
  })),
)

vi.mock('@/lib/images/sniff-image', () => ({
  sniffImage: mockSniffImage,
}))

// image-size: named export `imageSize`. Mockamos ambas as formas (default + named)
// para não depender de qual o pipeline importa.
const mockImageSize = vi.hoisted(() =>
  vi.fn<(buffer: Buffer) => Dimensions>(() => ({ width: 800, height: 600 })),
)

vi.mock('image-size', () => ({
  default: mockImageSize,
  imageSize: mockImageSize,
}))

// sharp (downscale de imagens oversized): mock encadeável controlável pelo
// toBuffer. O pipeline importa via dynamic import('sharp') lazy + fail-open.
type SharpToBufferResult = {
  data: Buffer
  info: { width: number; height: number }
}
const mockSharpToBuffer = vi.hoisted(() =>
  vi.fn<() => Promise<SharpToBufferResult>>(async () => ({
    data: Buffer.alloc(1024),
    info: { width: 1600, height: 1200 },
  })),
)
const mockSharpFactory = vi.hoisted(() =>
  vi.fn(() => {
    const chain = {
      rotate: () => chain,
      resize: () => chain,
      jpeg: () => chain,
      png: () => chain,
      webp: () => chain,
      toBuffer: mockSharpToBuffer,
    }
    return chain
  }),
)

vi.mock('sharp', () => ({ default: mockSharpFactory }))

// ---------------------------------------------------------------------------
// Import após os mocks registrados
// ---------------------------------------------------------------------------

import {
  extractImagesForSource,
  MAX_IMAGES_PER_SOURCE,
  MAX_IMAGE_BYTES,
  MAX_DOWNLOAD_BYTES,
  MAX_STORED_DIMENSION_PX,
  MIN_DIMENSION_PX,
  IMAGE_CONCURRENCY,
  OVERSIZE_READ_CONCURRENCY,
  type ExtractImagesInput,
} from './image-pipeline'

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

/** Resposta de imagem "boa" (Response-like que `safeFetch` devolveria).
 *  `declaredLength` simula o header content-length (cap de download declarado). */
function okImageResponse(bytes: number, declaredLength?: number): Response {
  const body = new Uint8Array(bytes)
  return {
    ok: true,
    status: 200,
    headers: {
      get: (h: string) => {
        const header = h.toLowerCase()
        if (header === 'content-type') return 'image/jpeg'
        if (header === 'content-length' && declaredLength !== undefined) {
          return String(declaredLength)
        }
        return null
      },
    },
    // O pipeline lê o corpo via arrayBuffer (cap de bytes aplicado lendo length).
    arrayBuffer: async () => body.buffer,
  } as unknown as Response
}

/** Monta um HTML com N <img> de URLs distintas (cada um vira 1 candidata). */
function htmlWithImages(n: number): string {
  let imgs = ''
  for (let i = 0; i < n; i += 1) {
    imgs += `<img src="/img-${i}.jpg" alt="p${i}">`
  }
  return `<!doctype html><html><body>${imgs}</body></html>`
}

const BASE_INPUT: ExtractImagesInput = {
  sourceId: 'src-1',
  collectionId: 'col-1',
  organizationId: 'org-1',
  userId: 'user-1',
  projectId: 'proj-1',
  html: htmlWithImages(1),
  baseUrl: 'https://acme.com.br',
}

/** Erro Prisma com `code` (idiom Igniter/Prisma: err.code === 'P2002'). */
function prismaError(code: string): Error & { code: string } {
  const e = new Error(`prisma ${code}`) as Error & { code: string }
  e.code = code
  return e
}

// ---------------------------------------------------------------------------
// beforeEach — reset ao "caminho feliz" de 1 imagem válida e captionável
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAvailable.mockReturnValue(true)
  mockSourceFindFirst.mockResolvedValue({ imagesEnabled: true })
  mockSafeFetch.mockResolvedValue(okImageResponse(1024))
  mockSniffImage.mockReturnValue({ ext: 'jpg', contentType: 'image/jpeg' })
  mockImageSize.mockReturnValue({ width: 800, height: 600 })
  mockUpload.mockResolvedValue({ path: 'ok' })
  mockImageCreate.mockResolvedValue({ id: 'img-1' })
  mockImageUpdate.mockResolvedValue({ id: 'img-1' })
  mockCaptionImage.mockResolvedValue({ ok: true, caption: 'Foto.' })
  mockSharpToBuffer.mockResolvedValue({
    data: Buffer.alloc(1024),
    info: { width: 1600, height: 1200 },
  })
})

// ===========================================================================
// 0. Constantes do contrato (caps DUROS exportados)
// ===========================================================================

describe('image-pipeline — constantes de cap (contrato §6)', () => {
  it('expõe os caps duros nos valores do contrato', () => {
    expect(MAX_IMAGES_PER_SOURCE).toBe(30)
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024)
    expect(MAX_DOWNLOAD_BYTES).toBe(64 * 1024 * 1024)
    expect(MAX_STORED_DIMENSION_PX).toBe(2048)
    expect(MIN_DIMENSION_PX).toBe(200)
    expect(IMAGE_CONCURRENCY).toBe(8)
    expect(OVERSIZE_READ_CONCURRENCY).toBe(2)
  })
})

// ===========================================================================
// 1. Caminho feliz — 1 imagem extraída, persistida e legendada
// ===========================================================================

describe('extractImagesForSource — caminho feliz', () => {
  it('baixa, persiste e legenda 1 imagem válida', async () => {
    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.candidates).toBe(1)
    expect(r.downloaded).toBe(1)
    expect(r.persisted).toBe(1)
    expect(r.captioned).toBe(1)
    expect(r.skipped).toBe(0)
    expect(r.errors).toBe(0)

    // Persistência via knowledgeImage.create (tipado), captionEmbedding OMITIDO (NULL).
    expect(mockImageCreate).toHaveBeenCalledTimes(1)
    const createArg = mockImageCreate.mock.calls[0]![0]
    expect(createArg.data.organizationId).toBe('org-1')
    expect(createArg.data.sourceId).toBe('src-1')
    expect(createArg.data.collectionId).toBe('col-1')
    // storageKey é PATH (nunca signed URL).
    expect(String(createArg.data.storageKey)).toMatch(
      /^knowledge\/org-1\/src-1\/[0-9a-f]{64}\.jpg$/,
    )
    expect(createArg.data.storageKey).not.toMatch(/^https?:\/\//)
    // captionEmbedding NÃO entra no INSERT (fica NULL no MVP).
    expect('captionEmbedding' in createArg.data).toBe(false)

    // upload no bucket MEDIA com o mesmo path, NUNCA persistindo a signed URL.
    expect(mockUpload).toHaveBeenCalledTimes(1)
    const uploadArgs = mockUpload.mock.calls[0]!
    const bucket = uploadArgs[0]
    const path = uploadArgs[1]
    expect(bucket).toBe('media-whatsapp')
    expect(String(path)).toBe(String(createArg.data.storageKey))

    // caption gravada via update separado (fail-open: caption não bloqueia create).
    expect(mockImageUpdate).toHaveBeenCalledTimes(1)
    const updArg = mockImageUpdate.mock.calls[0]![0]
    expect(updArg.data.caption).toBe('Foto.')
  })
})

// ===========================================================================
// 2. CAPS
// ===========================================================================

describe('extractImagesForSource — caps', () => {
  it('respeita MAX_IMAGES_PER_SOURCE (30): nunca persiste mais que o cap', async () => {
    // 50 candidatas, todas válidas → no máximo 30 downloads/persistências.
    const r = await extractImagesForSource({
      ...BASE_INPUT,
      html: htmlWithImages(50),
    })

    expect(r.candidates).toBe(50)
    expect(r.downloaded).toBeLessThanOrEqual(MAX_IMAGES_PER_SOURCE)
    expect(r.persisted).toBeLessThanOrEqual(MAX_IMAGES_PER_SOURCE)
    expect(mockImageCreate.mock.calls.length).toBeLessThanOrEqual(
      MAX_IMAGES_PER_SOURCE,
    )
    // E o cap é respeitado mesmo na concorrência: o fetch não é chamado 50x.
    expect(mockSafeFetch.mock.calls.length).toBeLessThanOrEqual(
      MAX_IMAGES_PER_SOURCE,
    )
  })

  it('REDUZ (downscale) imagem acima de MAX_IMAGE_BYTES em vez de descartar — persiste o buffer reduzido', async () => {
    // Caso real (Vibra Butantã): fotos de galeria de 6–62MB; antes viravam skip
    // em massa e o catálogo saía vazio.
    mockSafeFetch.mockResolvedValue(okImageResponse(MAX_IMAGE_BYTES + 1))

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.candidates).toBe(1)
    expect(r.skipped).toBe(0)
    expect(r.persisted).toBe(1)
    expect(r.errors).toBe(0)
    // Persistiu o REDUZIDO (dimensões/bytes do sharp, não do original).
    const createArg = mockImageCreate.mock.calls[0]![0]
    expect(createArg.data.sizeBytes).toBe(1024)
    expect(createArg.data.width).toBe(1600)
    expect(createArg.data.height).toBe(1200)
  })

  it('REDUZ imagem acima de MAX_STORED_DIMENSION_PX mesmo quando cabe em bytes', async () => {
    mockImageSize.mockReturnValue({
      width: MAX_STORED_DIMENSION_PX + 1,
      height: 1000,
    })

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.persisted).toBe(1)
    expect(mockSharpToBuffer).toHaveBeenCalledTimes(1)
    const createArg = mockImageCreate.mock.calls[0]![0]
    expect(createArg.data.width).toBe(1600)
    expect(createArg.data.height).toBe(1200)
  })

  it('downscale falhando (sharp lança) em imagem > cap → skip, não erro (fail-open)', async () => {
    mockSafeFetch.mockResolvedValue(okImageResponse(MAX_IMAGE_BYTES + 1))
    mockSharpToBuffer.mockRejectedValue(new Error('unsupported image format'))

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.candidates).toBe(1)
    expect(r.skipped).toBe(1)
    expect(r.persisted).toBe(0)
    expect(r.errors).toBe(0) // exceder cap sem conseguir reduzir NÃO é erro
    expect(mockImageCreate).not.toHaveBeenCalled()
  })

  it('descarta download acima de MAX_DOWNLOAD_BYTES (content-length declarado) sem ler o corpo', async () => {
    mockSafeFetch.mockResolvedValue(
      okImageResponse(1024, MAX_DOWNLOAD_BYTES + 1),
    )

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.skipped).toBe(1)
    expect(r.persisted).toBe(0)
    expect(r.errors).toBe(0)
    expect(mockSharpToBuffer).not.toHaveBeenCalled()
  })

  it('aceita imagem exatamente no limite de bytes sem reduzir (boundary inclusivo)', async () => {
    mockSafeFetch.mockResolvedValue(okImageResponse(MAX_IMAGE_BYTES))

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.skipped).toBe(0)
    expect(r.persisted).toBe(1)
    expect(mockSharpToBuffer).not.toHaveBeenCalled()
  })

  it('descarta dimensão < MIN_DIMENSION_PX em qualquer eixo (largura OU altura)', async () => {
    // largura ok, altura curta → skip
    mockImageSize.mockReturnValue({ width: 800, height: MIN_DIMENSION_PX - 1 })

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.skipped).toBe(1)
    expect(r.persisted).toBe(0)
    expect(r.errors).toBe(0)
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockImageCreate).not.toHaveBeenCalled()
  })

  it('aceita dimensão exatamente em MIN_DIMENSION_PX (boundary inclusivo)', async () => {
    mockImageSize.mockReturnValue({
      width: MIN_DIMENSION_PX,
      height: MIN_DIMENSION_PX,
    })

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.persisted).toBe(1)
    expect(r.skipped).toBe(0)
  })

  it('descarta quando sniffImage não reconhece a imagem (null → skip)', async () => {
    mockSniffImage.mockReturnValue(null)

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.skipped).toBe(1)
    expect(r.persisted).toBe(0)
    expect(r.errors).toBe(0)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('descarta quando a dimensão é indeterminada (imageSize lança → skip, fail-open)', async () => {
    mockImageSize.mockImplementation(() => {
      throw new Error('unsupported format')
    })

    const r = await extractImagesForSource(BASE_INPUT)

    // imageSize lançar não derruba o pipeline; a candidata vira skip.
    expect(r.persisted).toBe(0)
    expect(r.skipped + r.errors).toBe(1)
    expect(mockImageCreate).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 3. DEDUP (P2002 = skip silencioso, NÃO erro)
// ===========================================================================

describe('extractImagesForSource — dedup P2002', () => {
  it('trata P2002 do create como SKIP silencioso (não conta como erro)', async () => {
    mockImageCreate.mockRejectedValue(prismaError('P2002'))

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.candidates).toBe(1)
    expect(r.persisted).toBe(0)
    expect(r.skipped).toBe(1) // dedup = skip
    expect(r.errors).toBe(0) // NUNCA erro
    // como não persistiu, não tenta atualizar caption dessa imagem.
    expect(mockImageUpdate).not.toHaveBeenCalled()
  })

  it('em batch concorrente, dois candidatos com mesmo sha256 colidindo (P2002) não viram erro', async () => {
    // Primeira create OK, demais colidem por P2002 (mesma imagem repetida).
    mockImageCreate
      .mockResolvedValueOnce({ id: 'img-1' })
      .mockRejectedValue(prismaError('P2002'))

    const r = await extractImagesForSource({
      ...BASE_INPUT,
      html: htmlWithImages(5),
    })

    expect(r.errors).toBe(0)
    expect(r.persisted).toBe(1)
    expect(r.skipped).toBe(4)
  })

  it('um erro de DB NÃO-P2002 conta como erro (não silencia falhas reais), mas não throws', async () => {
    mockImageCreate.mockRejectedValue(prismaError('P2003'))

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.persisted).toBe(0)
    expect(r.errors).toBe(1)
    expect(r.skipped).toBe(0)
  })
})

// ===========================================================================
// 4. FAIL-OPEN ABSOLUTO — nada derruba o pipeline
// ===========================================================================

describe('extractImagesForSource — fail-open absoluto (NUNCA throws)', () => {
  it('storage OFF → short-circuit com result zerado, sem tocar em nada', async () => {
    mockIsAvailable.mockReturnValue(false)

    const r = await extractImagesForSource({
      ...BASE_INPUT,
      html: htmlWithImages(10),
    })

    expect(r).toEqual({
      candidates: 0,
      downloaded: 0,
      persisted: 0,
      captioned: 0,
      skipped: 0,
      errors: 0,
    })
    expect(mockSafeFetch).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockImageCreate).not.toHaveBeenCalled()
  })

  it('captionImage falhando NÃO derruba: imagem fica sem caption (fail-open)', async () => {
    mockCaptionImage.mockResolvedValue({ ok: false, error: 'vision timeout' })

    const r = await extractImagesForSource(BASE_INPUT)

    // Persistiu mesmo sem caption.
    expect(r.persisted).toBe(1)
    expect(r.captioned).toBe(0)
    // caption falha conta só p/ log via errors; jamais throw.
    expect(mockImageCreate).toHaveBeenCalledTimes(1)
  })

  it('captionImage lançando (apesar do contrato "nunca throws") é absorvido', async () => {
    mockCaptionImage.mockRejectedValue(new Error('boom'))

    // Não deve propagar: o orquestrador é fail-open em cima do fail-open.
    await expect(extractImagesForSource(BASE_INPUT)).resolves.toBeDefined()
    const r = await extractImagesForSource(BASE_INPUT)
    expect(r.persisted).toBe(1)
    expect(r.captioned).toBe(0)
  })

  it('safeFetch lançando (rede/SSRF) é absorvido: candidata vira skip/erro, sem throw', async () => {
    mockSafeFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.candidates).toBe(1)
    expect(r.downloaded).toBe(0)
    expect(r.persisted).toBe(0)
    // erro de fetch não derruba o batch.
    expect(r.skipped + r.errors).toBe(1)
  })

  it('safeFetch !ok (404/500) → skip, não persiste', async () => {
    mockSafeFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response)

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.persisted).toBe(0)
    expect(r.skipped).toBe(1)
    expect(mockImageCreate).not.toHaveBeenCalled()
  })

  it('content-type não-imagem → skip (não tenta sniff/persistir)', async () => {
    mockSafeFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === 'content-type' ? 'text/html' : null,
      },
      arrayBuffer: async () => new ArrayBuffer(64),
    } as unknown as Response)

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.skipped).toBe(1)
    expect(r.persisted).toBe(0)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('storage.upload lançando é absorvido: conta erro, não throw', async () => {
    mockUpload.mockRejectedValue(new Error('bucket explodiu'))

    const r = await extractImagesForSource(BASE_INPUT)

    expect(r.persisted).toBe(0)
    expect(r.errors).toBe(1)
    expect(mockImageCreate).not.toHaveBeenCalled()
  })

  it('uma candidata ruim no meio NÃO aborta as boas (batch resiliente)', async () => {
    // 3 imagens; a do meio falha no fetch, as outras seguem.
    mockSafeFetch
      .mockResolvedValueOnce(okImageResponse(1024))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(okImageResponse(1024))

    const r = await extractImagesForSource({
      ...BASE_INPUT,
      html: htmlWithImages(3),
    })

    expect(r.candidates).toBe(3)
    expect(r.persisted).toBe(2)
    expect(r.skipped + r.errors).toBe(1)
  })

  it('HTML sem nenhuma imagem → result zerado, sem erro', async () => {
    const r = await extractImagesForSource({
      ...BASE_INPUT,
      html: '<html><body><p>sem imagens aqui</p></body></html>',
    })

    expect(r).toEqual({
      candidates: 0,
      downloaded: 0,
      persisted: 0,
      captioned: 0,
      skipped: 0,
      errors: 0,
    })
    expect(mockSafeFetch).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 5. GATE imagesEnabled (short-circuit) + nota website-first
// ===========================================================================

describe('extractImagesForSource — gate imagesEnabled / website-first', () => {
  it('imagesEnabled=false → short-circuit zerado (não baixa nada)', async () => {
    mockSourceFindFirst.mockResolvedValue({ imagesEnabled: false })

    const r = await extractImagesForSource({
      ...BASE_INPUT,
      html: htmlWithImages(5),
    })

    expect(r).toEqual({
      candidates: 0,
      downloaded: 0,
      persisted: 0,
      captioned: 0,
      skipped: 0,
      errors: 0,
    })
    expect(mockSafeFetch).not.toHaveBeenCalled()
    expect(mockImageCreate).not.toHaveBeenCalled()
  })

  it('source não encontrada (org guard / row ausente) → não derruba, result zerado', async () => {
    mockSourceFindFirst.mockResolvedValue(null)

    const r = await extractImagesForSource(BASE_INPUT)

    // Sem flag legível, o seguro é não extrair (fail-closed no GATE, fail-open no resto).
    expect(r.persisted).toBe(0)
    expect(mockSafeFetch).not.toHaveBeenCalled()
  })

  it('o input do pipeline é type-agnóstico: o gate website-first (type===url) é UPSTREAM no source-enrich.job', () => {
    // Documenta o contrato §6/§9: `ExtractImagesInput` NÃO carrega `type`; quem
    // garante "só sites" é o hook do job (que só chama o pipeline p/ type==='url').
    const keys = Object.keys(BASE_INPUT)
    expect(keys).not.toContain('type')
    expect(keys.sort()).toEqual(
      [
        'baseUrl',
        'collectionId',
        'html',
        'organizationId',
        'projectId',
        'sourceId',
        'userId',
      ].sort(),
    )
  })
})

// ===========================================================================
// 6. Isolamento por organizationId (regra dura CLAUDE.md)
// ===========================================================================

describe('extractImagesForSource — isolamento por organizationId', () => {
  it('propaga organizationId em TODA persistência (create) e no path do storage', async () => {
    await extractImagesForSource({ ...BASE_INPUT, organizationId: 'org-XYZ' })

    const createArg = mockImageCreate.mock.calls[0]![0]
    expect(createArg.data.organizationId).toBe('org-XYZ')
    expect(String(createArg.data.storageKey)).toMatch(/^knowledge\/org-XYZ\//)
  })
})
