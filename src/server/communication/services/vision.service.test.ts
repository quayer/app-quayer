/**
 * Vision Service — image/PDF processing via OpenAI Vision (TDD)
 *
 * Cobre:
 *  - enabled=false e mimetype nao suportado
 *  - Fluxo feliz com imagem e descricao
 *  - Erros da API e do download
 *  - Reuso de mediaBase64 (sem refazer fetch)
 *  - imagePrompt e visionModel customizados
 *  - Limite de tamanho (>20MB)
 *
 * Rodar:
 *   npx vitest run src/server/communication/services/vision.service.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { processImage } from './vision.service'

// Helpers --------------------------------------------------------------------

function makeImageDownload(size = 1024, contentType = 'image/jpeg') {
  const buffer = new ArrayBuffer(size)
  return {
    ok: true,
    status: 200,
    headers: {
      get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null),
    },
    arrayBuffer: async () => buffer,
    text: async () => '',
  } as unknown as Response
}

function makeVisionApiResponse(
  content = 'descricao da imagem',
  ok = true,
  status = 200
) {
  const body = { choices: [{ message: { content } }] }
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('processImage', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna success=false com error "disabled" quando enabled=false', async () => {
    const result = await processImage('https://x/img.jpg', 'image/jpeg', 'sk-test', {
      enabled: false,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('disabled')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorna success=false com error "unsupported" para mimetype text/plain', async () => {
    const result = await processImage('https://x/file.txt', 'text/plain', 'sk-test')

    expect(result.success).toBe(false)
    expect(result.error).toBe('unsupported')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('processa imagem image/jpeg com sucesso retornando text e method="vision"', async () => {
    fetchMock
      .mockResolvedValueOnce(makeImageDownload())
      .mockResolvedValueOnce(makeVisionApiResponse('um cachorro na grama'))

    const result = await processImage(
      'https://x/img.jpg',
      'image/jpeg',
      'sk-test'
    )

    expect(result.success).toBe(true)
    expect(result.text).toBe('um cachorro na grama')
    expect(result.method).toBe('vision')
    expect(result.type).toBe('image')
  })

  it('retorna success=false quando OpenAI Vision responde 500', async () => {
    fetchMock
      .mockResolvedValueOnce(makeImageDownload())
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'server error',
      } as unknown as Response)

    const result = await processImage(
      'https://x/img.jpg',
      'image/jpeg',
      'sk-test'
    )

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/500|API/i)
    expect(result.type).toBe('image')
  })

  it('processa application/pdf retornando texto ou fallback', async () => {
    fetchMock
      .mockResolvedValueOnce(makeImageDownload(2048, 'application/pdf'))
      .mockResolvedValueOnce(makeVisionApiResponse('texto extraido do pdf'))

    const result = await processImage(
      'https://x/doc.pdf',
      'application/pdf',
      'sk-test'
    )

    expect(result.type).toBe('pdf')
    // O servico ou retorna sucesso (vision-as-fallback) ou retorna fallback explicito.
    if (result.success) {
      expect(result.text).toBeTruthy()
    } else {
      expect(result.error).toBeTruthy()
    }
  })

  it('quando mediaBase64 e fornecido, NAO faz download — chama apenas a Vision API', async () => {
    fetchMock.mockResolvedValueOnce(makeVisionApiResponse('imagem em base64'))

    const result = await processImage(
      'https://x/img.jpg',
      'image/jpeg',
      'sk-test',
      { mediaBase64: 'AAAA' }
    )

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('usa imagePrompt customizado no payload', async () => {
    fetchMock
      .mockResolvedValueOnce(makeImageDownload())
      .mockResolvedValueOnce(makeVisionApiResponse('ok'))

    await processImage('https://x/img.jpg', 'image/jpeg', 'sk-test', {
      imagePrompt: 'Liste os ingredientes da receita.',
    })

    const visionCall = fetchMock.mock.calls[1]
    const body = JSON.parse((visionCall[1] as RequestInit).body as string)
    const textPart = body.messages[0].content.find(
      (c: { type: string }) => c.type === 'text'
    )
    expect(textPart.text).toBe('Liste os ingredientes da receita.')
  })

  it('usa visionModel customizado', async () => {
    fetchMock
      .mockResolvedValueOnce(makeImageDownload())
      .mockResolvedValueOnce(makeVisionApiResponse('ok'))

    await processImage('https://x/img.jpg', 'image/jpeg', 'sk-test', {
      visionModel: 'gpt-4o',
    })

    const body = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string
    )
    expect(body.model).toBe('gpt-4o')
  })

  it('retorna success=false quando download da imagem falha', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => 'not found',
    } as unknown as Response)

    const result = await processImage(
      'https://x/missing.jpg',
      'image/jpeg',
      'sk-test'
    )

    expect(result.success).toBe(false)
    expect(result.error?.toLowerCase()).toMatch(/download|fetch|404/)
  })

  it('rejeita imagem maior que 20MB com success=false', async () => {
    const huge = 21 * 1024 * 1024
    fetchMock.mockResolvedValueOnce(makeImageDownload(huge))

    const result = await processImage(
      'https://x/huge.jpg',
      'image/jpeg',
      'sk-test'
    )

    expect(result.success).toBe(false)
    expect(result.error?.toLowerCase()).toMatch(/size|large|20mb/)
    // Nao deve chamar a Vision API se rejeitou pelo tamanho.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('default model = gpt-4o-mini quando nao especificado', async () => {
    fetchMock
      .mockResolvedValueOnce(makeImageDownload())
      .mockResolvedValueOnce(makeVisionApiResponse('ok'))

    await processImage('https://x/img.jpg', 'image/jpeg', 'sk-test')

    const body = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string
    )
    expect(body.model).toBe('gpt-4o-mini')
  })
})
