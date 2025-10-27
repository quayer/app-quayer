/**
 * Tipos do Sistema de Transcrição
 *
 * Define tipos universais para transcrição de áudio,
 * independente do provider (OpenAI Whisper, Google Speech-to-Text, etc.)
 */

// ============================================
// ENUMS
// ============================================

export enum TranscriptionProvider {
  OPENAI_WHISPER = 'OPENAI_WHISPER',
  GOOGLE_SPEECH = 'GOOGLE_SPEECH',
  AWS_TRANSCRIBE = 'AWS_TRANSCRIBE',
  AZURE_SPEECH = 'AZURE_SPEECH',
}

export enum TranscriptionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CACHED = 'CACHED',
}

export enum AudioFormat {
  OGG = 'ogg',
  MP3 = 'mp3',
  WAV = 'wav',
  M4A = 'm4a',
  WEBM = 'webm',
  OPUS = 'opus',
}

// ============================================
// TRANSCRIPTION REQUEST
// ============================================

export interface TranscriptionRequest {
  audioUrl: string;
  format?: AudioFormat;
  language?: string; // ISO 639-1 (pt, en, es, etc.)
  enableTimestamps?: boolean;
  enableWordConfidence?: boolean;
  speakerDiarization?: boolean; // Identificar múltiplos falantes
}

// ============================================
// TRANSCRIPTION RESULT
// ============================================

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number; // 0.0 - 1.0
  duration?: number; // Duração do áudio em segundos
  provider: TranscriptionProvider;

  // Timestamps (opcional)
  timestamps?: Array<{
    start: number; // Segundos
    end: number;
    text: string;
  }>;

  // Confiança por palavra (opcional)
  words?: Array<{
    word: string;
    confidence: number;
    start: number;
    end: number;
  }>;

  // Speaker diarization (opcional)
  speakers?: Array<{
    speaker: number; // Speaker ID
    start: number;
    end: number;
    text: string;
  }>;

  // Metadata
  processedAt: Date;
  processingTimeMs: number;
  cached: boolean;
}

// ============================================
// TRANSCRIPTION RESPONSE
// ============================================

export interface TranscriptionResponse {
  success: boolean;
  status: TranscriptionStatus;
  data?: TranscriptionResult;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  provider: TranscriptionProvider;
  timestamp: Date;
}

// ============================================
// TRANSCRIPTION CACHE ENTRY
// ============================================

export interface TranscriptionCacheEntry {
  audioHash: string; // MD5 hash do áudio
  result: TranscriptionResult;
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
}

// ============================================
// PROVIDER CONFIG
// ============================================

export interface TranscriptionProviderConfig {
  provider: TranscriptionProvider;
  apiKey?: string;
  endpoint?: string;
  model?: string;
  enabled: boolean;
  priority: number; // Ordem de fallback
  maxRetries: number;
  timeout: number; // milliseconds
}

// ============================================
// ORCHESTRATOR CONFIG
// ============================================

export interface TranscriptionOrchestratorConfig {
  providers: TranscriptionProviderConfig[];
  enableCache: boolean;
  cacheTTL: number; // seconds
  enableFallback: boolean;
  defaultLanguage: string;
  maxAudioDuration: number; // seconds
  maxFileSize: number; // bytes
}
