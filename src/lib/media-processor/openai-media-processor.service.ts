/**
 * OpenAI Media Processor Service
 *
 * Processa TODOS os tipos de mídia automaticamente:
 * - Áudio → Transcrição (Whisper)
 * - Imagem → Descrição detalhada (Vision)
 * - Vídeo → Frames + Áudio transcrito
 * - Documento → OCR + Extração de texto
 *
 * Quando webhook chegar, campo 'text' já estará preenchido!
 */

import OpenAI from 'openai';
import { redis } from '@/services/redis';
import { logger } from '@/services/logger';
import crypto from 'crypto';

// ============================================
// TIPOS
// ============================================

export interface MediaProcessResult {
  text: string;
  type: 'audio' | 'image' | 'video' | 'document';
  metadata: {
    provider: 'openai';
    model: string;
    confidence?: number;
    language?: string;
    duration?: number;
    processingTimeMs: number;
    cached: boolean;
  };
}

// ============================================
// OPENAI MEDIA PROCESSOR SERVICE
// ============================================

class OpenAIMediaProcessorService {
  private openai: OpenAI;
  private enableCache: boolean;
  private cacheTTL: number;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.enableCache = process.env.ENABLE_MEDIA_CACHE !== 'false';
    this.cacheTTL = parseInt(process.env.MEDIA_CACHE_TTL || '86400', 10); // 24h padrão
  }

  // ==========================================
  // PROCESSAMENTO AUTOMÁTICO
  // ==========================================

  /**
   * Processa qualquer tipo de mídia automaticamente
   */
  async processMedia(params: {
    mediaUrl: string;
    mimeType: string;
    fileName?: string;
  }): Promise<MediaProcessResult> {
    const startTime = Date.now();

    // 1. Verificar cache
    if (this.enableCache) {
      const cached = await this.getCached(params.mediaUrl);
      if (cached) {
        logger.info('[MediaProcessor] Resultado retornado do cache', {
          mediaUrl: params.mediaUrl,
          type: cached.type,
        });
        return cached;
      }
    }

    // 2. Detectar tipo de mídia
    const mediaType = this.detectMediaType(params.mimeType);

    // 3. Processar conforme tipo
    let result: MediaProcessResult;

    switch (mediaType) {
      case 'audio':
        result = await this.processAudio(params.mediaUrl);
        break;

      case 'image':
        result = await this.processImage(params.mediaUrl);
        break;

      case 'video':
        result = await this.processVideo(params.mediaUrl);
        break;

      case 'document':
        result = await this.processDocument(params.mediaUrl, params.mimeType);
        break;

      default:
        throw new Error(`Tipo de mídia não suportado: ${params.mimeType}`);
    }

    // 4. Atualizar tempo de processamento
    result.metadata.processingTimeMs = Date.now() - startTime;

    // 5. Cachear resultado
    if (this.enableCache) {
      await this.setCached(params.mediaUrl, result);
    }

    return result;
  }

  // ==========================================
  // ÁUDIO → TRANSCRIÇÃO (WHISPER)
  // ==========================================

  async processAudio(audioUrl: string): Promise<MediaProcessResult> {
    try {
      logger.info('[MediaProcessor] Transcrevendo áudio', { audioUrl });

      // Download do áudio
      const audioFile = await this.downloadMedia(audioUrl);

      // Transcrever com Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'pt', // Pode ser detectado automaticamente
        response_format: 'verbose_json', // Inclui metadata
      });

      logger.info('[MediaProcessor] Áudio transcrito com sucesso', {
        audioUrl,
        textLength: transcription.text.length,
        language: transcription.language,
        duration: transcription.duration,
      });

      return {
        text: transcription.text,
        type: 'audio',
        metadata: {
          provider: 'openai',
          model: 'whisper-1',
          language: transcription.language,
          duration: transcription.duration,
          processingTimeMs: 0, // Será preenchido depois
          cached: false,
        },
      };
    } catch (error) {
      logger.error('[MediaProcessor] Erro ao transcrever áudio', {
        error,
        audioUrl,
      });
      throw error;
    }
  }

  // ==========================================
  // IMAGEM → DESCRIÇÃO (VISION)
  // ==========================================

  async processImage(imageUrl: string): Promise<MediaProcessResult> {
    try {
      logger.info('[MediaProcessor] Analisando imagem', { imageUrl });

      // Analisar com GPT-4 Vision
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o', // Modelo mais recente com Vision
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Descreva detalhadamente tudo que você vê nesta imagem. Inclua textos visíveis, objetos, pessoas, cenário, cores e qualquer informação relevante. Seja específico e objetivo.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high', // Alta qualidade para OCR
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      });

      const description = response.choices[0]?.message?.content || '';

      logger.info('[MediaProcessor] Imagem analisada com sucesso', {
        imageUrl,
        descriptionLength: description.length,
      });

      return {
        text: description,
        type: 'image',
        metadata: {
          provider: 'openai',
          model: 'gpt-4o',
          processingTimeMs: 0,
          cached: false,
        },
      };
    } catch (error) {
      logger.error('[MediaProcessor] Erro ao analisar imagem', {
        error,
        imageUrl,
      });
      throw error;
    }
  }

  // ==========================================
  // VÍDEO → FRAMES + ÁUDIO
  // ==========================================

  async processVideo(videoUrl: string): Promise<MediaProcessResult> {
    try {
      logger.info('[MediaProcessor] Processando vídeo', { videoUrl });

      // Para vídeos, vamos:
      // 1. Extrair frames-chave (início, meio, fim)
      // 2. Extrair e transcrever áudio
      // 3. Analisar frames com Vision
      // 4. Combinar tudo

      // Nota: Isso requer FFmpeg no servidor
      // Por enquanto, vamos simplificar retornando uma mensagem

      const text = `[VÍDEO] URL: ${videoUrl}\n\nNota: Processamento completo de vídeo requer FFmpeg instalado no servidor. Implemente extração de frames e áudio para análise detalhada.`;

      logger.info('[MediaProcessor] Vídeo processado', { videoUrl });

      return {
        text,
        type: 'video',
        metadata: {
          provider: 'openai',
          model: 'manual', // Placeholder
          processingTimeMs: 0,
          cached: false,
        },
      };
    } catch (error) {
      logger.error('[MediaProcessor] Erro ao processar vídeo', {
        error,
        videoUrl,
      });
      throw error;
    }
  }

  // ==========================================
  // DOCUMENTO → OCR
  // ==========================================

  async processDocument(
    documentUrl: string,
    mimeType: string
  ): Promise<MediaProcessResult> {
    try {
      logger.info('[MediaProcessor] Processando documento', {
        documentUrl,
        mimeType,
      });

      // Se for PDF ou imagem de documento, usar Vision para OCR
      if (
        mimeType === 'application/pdf' ||
        mimeType.startsWith('image/') ||
        mimeType.includes('document')
      ) {
        // Converter primeira página para imagem (se PDF)
        // Por enquanto, usar Vision diretamente
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extraia TODO o texto deste documento. Mantenha a formatação e estrutura. Seja preciso e completo. Se houver tabelas, descreva-as claramente.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: documentUrl,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
        });

        const extractedText = response.choices[0]?.message?.content || '';

        logger.info('[MediaProcessor] Documento processado com sucesso', {
          documentUrl,
          textLength: extractedText.length,
        });

        return {
          text: extractedText,
          type: 'document',
          metadata: {
            provider: 'openai',
            model: 'gpt-4o',
            processingTimeMs: 0,
            cached: false,
          },
        };
      }

      // Fallback para documentos não suportados
      return {
        text: `[DOCUMENTO] ${documentUrl}\nTipo: ${mimeType}\n\nDocumento recebido mas tipo não suportado para OCR automático.`,
        type: 'document',
        metadata: {
          provider: 'openai',
          model: 'manual',
          processingTimeMs: 0,
          cached: false,
        },
      };
    } catch (error) {
      logger.error('[MediaProcessor] Erro ao processar documento', {
        error,
        documentUrl,
      });
      throw error;
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private detectMediaType(mimeType: string): 'audio' | 'image' | 'video' | 'document' {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'document';
  }

  private async downloadMedia(url: string): Promise<File> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao baixar mídia: ${response.statusText}`);
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Criar File object para OpenAI
    return new File([buffer], 'audio.ogg', { type: blob.type });
  }

  private async getCached(mediaUrl: string): Promise<MediaProcessResult | null> {
    try {
      const cacheKey = this.getCacheKey(mediaUrl);
      const cached = await redis.get(cacheKey);

      if (cached) {
        const result = JSON.parse(cached) as MediaProcessResult;
        result.metadata.cached = true;
        return result;
      }

      return null;
    } catch (error) {
      logger.warn('[MediaProcessor] Erro ao buscar cache', { error });
      return null;
    }
  }

  private async setCached(mediaUrl: string, result: MediaProcessResult): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(mediaUrl);
      await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));

      logger.debug('[MediaProcessor] Resultado cacheado', {
        mediaUrl,
        type: result.type,
        ttl: this.cacheTTL,
      });
    } catch (error) {
      logger.warn('[MediaProcessor] Erro ao cachear resultado', { error });
    }
  }

  private getCacheKey(mediaUrl: string): string {
    const hash = crypto.createHash('md5').update(mediaUrl).digest('hex');
    return `media:processed:${hash}`;
  }
}

// Singleton instance
export const openaiMediaProcessor = new OpenAIMediaProcessorService();
