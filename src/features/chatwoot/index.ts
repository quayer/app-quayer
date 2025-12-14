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
export { 
  ChatwootSyncService, 
  chatwootSyncService,
  type SyncMessageInput,
  type SyncResult,
} from './services/chatwoot.sync.service';

// ============================================
// Types & Interfaces
// ============================================
export * from './chatwoot.interfaces';
