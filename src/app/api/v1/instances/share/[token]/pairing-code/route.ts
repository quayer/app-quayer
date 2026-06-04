import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Código de pareamento ainda não está disponível neste endpoint. Use QR Code.',
    },
    { status: 501 },
  )
}
