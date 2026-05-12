import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { IntegracoesPage } from '@/client/components/integracoes/integracoes-page'

/**
 * /integracoes — BYOK (Bring Your Own Key).
 *
 * Permite que o owner da org cole suas próprias chaves de API
 * (OpenAI, Anthropic, Google) para que o agente use em vez das
 * chaves globais da plataforma.
 *
 * Server Component apenas valida auth (middleware injeta headers).
 * O Client Component faz fetch('/api/v1/providers') no mount —
 * isso evita ter que repassar cookies cross-boundary e degrada
 * graciosamente caso o backend ainda não esteja pronto.
 */

export const metadata: Metadata = {
  title: 'Integrações | Quayer',
}

export const dynamic = 'force-dynamic'

export default async function IntegracoesRoute() {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')

  if (!userId) {
    redirect('/login')
  }
  if (!orgId) {
    redirect('/')
  }

  return <IntegracoesPage />
}
