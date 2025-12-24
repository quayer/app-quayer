/**
 * Message Concatenation Module - Public Exports
 *
 * Sistema de concatenação de mensagens rápidas com timeout configurável
 */

// Core
export { MessageConcatenator, messageConcatenator } from './message-concatenator';
export type { IncomingMessage } from './message-concatenator';

// Queue only - Worker is in a separate file to avoid side effects during SSR/build
export { concatenationQueue } from './concatenation.queue';
export type { ConcatenationJob } from './concatenation.queue';

// ===== USAGE EXAMPLE =====
// import { messageConcatenator } from '@/lib/concatenation';
//
// // Em webhook processor:
// await messageConcatenator.addMessage(sessionId, contactId, {
//   instanceId,
//   waMessageId: message.id,
//   type: 'text',
//   content: message.content,
//   direction: 'INBOUND',
// });
//
// // Para forçar processamento imediato:
// await messageConcatenator.forceProcess(sessionId, contactId);
