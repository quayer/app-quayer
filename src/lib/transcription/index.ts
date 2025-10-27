/**
 * Transcription Module - Public Exports
 *
 * Sistema completo de transcrição de mídia usando OpenAI
 */

// Core Engine
export { TranscriptionEngine, transcriptionEngine } from './transcription.engine';
export type { TranscriptionResult } from './transcription.engine';

// Worker (BullMQ)
export { transcriptionQueue, transcriptionWorker } from './transcription.worker';
export type { TranscriptionJob } from './transcription.worker';

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
