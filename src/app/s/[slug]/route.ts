import { NextRequest, NextResponse } from 'next/server'
import { database as db } from '@/server/services/database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const shortLink = await db.shortLink.findUnique({
    where: { slug },
  })

  if (!shortLink) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Check expiry
  if (shortLink.expiresAt && shortLink.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  // Increment click counter and record event in parallel
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = request.headers.get('user-agent') ?? null

  await Promise.all([
    db.shortLink.update({
      where: { id: shortLink.id },
      data: { clicks: { increment: 1 } },
    }),
    db.shortLinkClick.create({
      data: {
        shortLinkId: shortLink.id,
        ipAddress: ip,
        userAgent,
      },
    }),
  ])

  return NextResponse.redirect(shortLink.originalUrl, { status: 302 })
}
