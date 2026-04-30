/**
 * Integration Module - Public Exports
 *
 * Chatwoot and Organization Providers integrations
 */

// Chatwoot
export { chatwootController } from './chatwoot/controllers/chatwoot.controller'
export { chatwootProcedure } from './chatwoot/procedures/chatwoot.procedure'
export type { ChatwootContext } from './chatwoot/procedures/chatwoot.procedure'
export { ChatwootRepository } from './chatwoot/repositories/chatwoot.repository'
export { ChatwootClient, createChatwootClient } from './chatwoot/services/chatwoot.client'
export {
  normalizeChatwootWebhook,
  shouldSendToWhatsApp,
  shouldSyncContact,
  addBotSignature,
  removeBotSignature,
} from './chatwoot/services/chatwoot.normalizer'
export * from './chatwoot/chatwoot.interfaces'

// Lazy getter for chatwootSyncService to avoid circular imports
let _chatwootSyncService: any = null
export const getChatwootSyncService = async () => {
  if (!_chatwootSyncService) {
    const mod = await import('./chatwoot/services/chatwoot.sync.service')
    _chatwootSyncService = mod.chatwootSyncService
  }
  return _chatwootSyncService
}

// Organization Providers
export { organizationProvidersController } from './organization-providers/controllers/organization-providers.controller'
