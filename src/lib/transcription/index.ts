/**
 * Transcription Module - Public Exports
 *
 * Sistema completo de transcrição de mídia usando OpenAI
 */

// Core Engine
export { TranscriptionEngine, transcriptionEngine } from './transcription.engine';
export type { TranscriptionResult } from './transcription.engine';

// Queues only - Worker is in a separate file to avoid side effects during SSR/build
export { transcriptionQueue, transcriptionDLQ } from './transcription.queue';
export type { TranscriptionJob } from './transcription.queue';

// ===== USAGE EXAMPLE =====
// import { transcriptionQueue } from '@/lib/transcription';
//
// // Em webhook processor:
// await transcriptionQueue.add('transcribe-media', {
//   messageId: savedMessage.id,
//   instanceId,
//   mediaType: 'audio',
//   mediaUrl: message.media.mediaUrl,
//   mimeType: message.media.mimeType,
// });
