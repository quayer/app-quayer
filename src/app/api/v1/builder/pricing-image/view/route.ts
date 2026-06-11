/**
 * GET /api/v1/builder/pricing-image/view?key=<storageKey>
 *
 * URL ESTÁVEL da foto de preço: assina o storageKey on-read (BUCKETS.MEDIA) e
 * redireciona (302) para a signed URL fresca. É o link que a rota irmã /upload
 * devolve e que o FE persiste em PriceItem.imageUrl — substitui a signed URL
 * crua que expirava (~7 dias no Supabase) e quebrava grade + envio WhatsApp.
 *
 * PÚBLICO-POR-LINK by design (igual GET /api/v1/files do driver local): a key
 * embute um UUID v4 não-adivinhável e o shape é validado por regex estrita
 * (`isPricingStorageKey` — só `pricing/{org}/{project}/{uuid}.{ext}`), então a
 * rota não assina keys arbitrárias. Sem auth de sessão DE PROPÓSITO: a URL é
 * consumida por clientes sem cookie — o WhatsApp/UAZ baixa a imagem quando o
 * get_pricing/buscar_media a expõe, e o <img> do preview a segue.
 *
 * No driver `local` o getSignedUrl devolve a URL pública /api/v1/files/… (não
 * expira) — o redirect continua correto.
 */

import { NextRequest, NextResponse } from 'next/server'

import { isPricingStorageKey } from '@/server/ai-module/builder/media/pricing-image-url'
import { BUCKETS, storage } from '@/server/services/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const key = req.nextUrl.searchParams.get('key')
  // Shape estrito: prefixo pricing/ + uuid no filename. Qualquer outra coisa é
  // 404 opaco (não vaza se a key existe ou não).
  if (!key || !isPricingStorageKey(key)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (!storage.isAvailable()) {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 })
  }

  try {
    const signedUrl = await storage.getSignedUrl(BUCKETS.MEDIA, key)
    return NextResponse.redirect(signedUrl, 302)
  } catch (err) {
    console.error('[builder/pricing-image/view] falha ao assinar storageKey:', err)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
}
