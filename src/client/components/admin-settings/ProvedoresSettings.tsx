'use client'

import { UAZapiSettings } from './UAZapiSettings'
import { WebhookSettings } from './WebhookSettings'

/**
 * ProvedoresSettings — Credenciais UAZapi + Webhook Global
 *
 * Unifica configuração de conexão com o servidor UAZapi e os eventos de
 * webhook que o UAZapi envia para a plataforma. São dois aspectos do mesmo
 * serviço e fazem sentido na mesma tab.
 */
export function ProvedoresSettings() {
  return (
    <div className="space-y-8">
      <UAZapiSettings />
      <WebhookSettings />
    </div>
  )
}
