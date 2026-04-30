import { NextRequest, NextResponse } from 'next/server'
import { processAgentMessage } from '@/server/ai-module/ai-agents/agent-runtime.service'
import { verifyAccessToken } from '@/lib/auth/jwt'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    const payload = verifyAccessToken(token)
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: 'Token invalido' }, { status: 401 })
    }

    const { id: agentConfigId } = await params
    const body = await request.json()
    const { message, sessionId } = body as {
      message: string
      sessionId?: string
    }

    if (!message) {
      return NextResponse.json(
        { error: 'Mensagem obrigatoria' },
        { status: 400 }
      )
    }

    // Use a simulated session ID for playground
    const playgroundSessionId =
      sessionId || `playground-${payload.userId}-${Date.now()}`

    const result = await processAgentMessage({
      agentConfigId,
      sessionId: playgroundSessionId,
      contactId: 'playground-contact',
      connectionId: 'playground-connection',
      organizationId: payload.currentOrgId || '',
      messageContent: message,
    })

    return NextResponse.json({
      text: result.text,
      toolCalls: result.toolCalls,
      usage: result.usage,
      cost: result.cost,
      latencyMs: result.latencyMs,
      model: result.model,
      provider: result.provider,
      promptVersionId: result.promptVersionId,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erro interno'
    console.error('[Playground API]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
