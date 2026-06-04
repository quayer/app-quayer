import { NextResponse } from 'next/server'

import { uazapiService } from '@/lib/api/uazapi.service'
import { database } from '@/server/services/database'

interface RouteContext {
  params: Promise<{ token: string }>
}

function isExpired(expiresAt: Date | null): boolean {
  return !expiresAt || expiresAt.getTime() <= Date.now()
}

function normalizeStatus(status: string): 'connected' | 'connecting' | 'disconnected' {
  const value = status.toLowerCase()
  if (value === 'connected') return 'connected'
  if (value === 'connecting') return 'connecting'
  return 'disconnected'
}

async function findSharedConnection(token: string) {
  return database.connection.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      name: true,
      status: true,
      phoneNumber: true,
      profileName: true,
      qrCode: true,
      pairingCode: true,
      shareTokenExpiresAt: true,
      uazapiToken: true,
      organization: {
        select: { name: true },
      },
    },
  })
}

function connectionPayload(connection: NonNullable<Awaited<ReturnType<typeof findSharedConnection>>>) {
  return {
    id: connection.id,
    name: connection.name,
    status: normalizeStatus(connection.status),
    phoneNumber: connection.phoneNumber,
    profileName: connection.profileName,
    qrCode: connection.qrCode,
    pairingCode: connection.pairingCode,
    expiresAt: connection.shareTokenExpiresAt?.toISOString(),
    organizationName: connection.organization?.name ?? 'Organização',
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params
  const connection = await findSharedConnection(token)

  if (!connection || isExpired(connection.shareTokenExpiresAt)) {
    return NextResponse.json(
      { error: 'Link de conexão expirado ou não encontrado' },
      { status: 404 },
    )
  }

  return NextResponse.json({ data: connectionPayload(connection) })
}

export async function POST(_request: Request, context: RouteContext) {
  const { token } = await context.params
  const connection = await findSharedConnection(token)

  if (!connection || isExpired(connection.shareTokenExpiresAt)) {
    return NextResponse.json(
      { error: 'Link de conexão expirado ou não encontrado' },
      { status: 404 },
    )
  }

  if (!connection.uazapiToken) {
    return NextResponse.json(
      {
        error:
          'Esta conexão de teste não possui token UAZapi para gerar QR Code real.',
      },
      { status: 400 },
    )
  }

  const qrResult = await uazapiService.generateQR(connection.uazapiToken)
  if (!qrResult.success || !qrResult.data?.qrcode) {
    return NextResponse.json(
      { error: qrResult.error ?? 'Erro ao gerar QR Code' },
      { status: 502 },
    )
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  const updated = await database.connection.update({
    where: { id: connection.id },
    data: {
      qrCode: qrResult.data.qrcode,
      shareTokenExpiresAt: expiresAt,
    },
    select: {
      qrCode: true,
      shareTokenExpiresAt: true,
    },
  })

  return NextResponse.json({
    data: {
      qrCode: updated.qrCode,
      expiresAt: updated.shareTokenExpiresAt?.toISOString(),
    },
  })
}
