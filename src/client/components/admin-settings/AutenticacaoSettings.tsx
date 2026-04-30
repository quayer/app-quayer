'use client'

import { OAuthSettings } from './OAuthSettings'
import { SecuritySettings } from './SecuritySettings'

/**
 * AutenticacaoSettings — OAuth + JWT/Segurança
 *
 * Unifica configuração de login social (Google OAuth) e tokens JWT/rate limit.
 * Ambos configuram como usuários se autenticam na plataforma.
 */
export function AutenticacaoSettings() {
  return (
    <div className="space-y-8">
      <OAuthSettings />
      <SecuritySettings />
    </div>
  )
}
