/**
 * Chatwoot Feature Module
 * 
 * @description Exports all Chatwoot-related functionality.
 * Provides integration with Chatwoot for unified customer support.
 * 
 * @version 1.0.0
 */

// ============================================
// Controllers
// ============================================
export { chatwootController } from './controllers/chatwoot.controller';

// ============================================
// Procedures
// ============================================
export { chatwootProcedure, type ChatwootContext } from './procedures/chatwoot.procedure';

// ============================================
// Repository
// ============================================
export { ChatwootRepository } from './repositories/chatwoot.repository';

// ============================================
// Services
// ============================================
export { ChatwootClient, createChatwootClient } from './services/chatwoot.client';
export {
  normalizeChatwootWebhook,
  shouldSendToWhatsApp,
  shouldSyncContact,
  addBotSignature,
  removeBotSignature,
} from './services/chatwoot.normalizer';

// NOTE: ChatwootSyncService is NOT exported here to avoid circular dependencies
// Import directly: import { chatwootSyncService } from '@/features/chatwoot/services/chatwoot.sync.service'
// Or use dynamic import: const { chatwootSyncService } = await import('@/features/chatwoot/services/chatwoot.sync.service')
// Types SyncMessageInput and SyncResult are exported from chatwoot.interfaces (via export * below)

// Lazy getter for chatwootSyncService to avoid circular imports
let _chatwootSyncService: any = null;
export const getChatwootSyncService = async () => {
  if (!_chatwootSyncService) {
    const mod = await import('./services/chatwoot.sync.service');
    _chatwootSyncService = mod.chatwootSyncService;
  }
  return _chatwootSyncService;
};

// ============================================
// Types & Interfaces
// ============================================
export * from './chatwoot.interfaces';
