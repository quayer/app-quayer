import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ContaClient } from './conta-client'

export const metadata: Metadata = {
  title: 'Minha Conta | Quayer',
  description: 'Configurações pessoais: perfil, segurança, notificações e sessões.',
}

/**
 * /conta — Configurações pessoais do usuário.
 *
 * Server Component responsável apenas pelo shell e metadata. A experiência
 * com tabs (Perfil / Segurança / Notificações / Sessões) é toda client-side
 * em `ContaClient`, onde cada tab consome os endpoints via fetch autenticado
 * com cookies (o `authProcedure` valida do lado do servidor).
 *
 * Configurações da organização (membros, billing, domínios, provedores)
 * ficam em /org — fora do escopo deste arquivo.
 */
export default function ContaPage() {
  return (
    <Suspense>
      <ContaClient />
    </Suspense>
  )
}
