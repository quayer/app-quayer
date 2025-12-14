/**
 * OpenAI Media Processor Service
 *
 * Processa TODOS os tipos de mídia automaticamente:
 * - Audio -> Transcricao (Whisper)
 * - Imagem -> Descricao detalhada (Vision)
 * - Video -> Extracao de audio + Transcricao
 * - Documento -> PDF/DOCX text extraction + OCR fallback
 *
 * Quando webhook chegar, campo 'text' ja estara preenchido!
 */

import OpenAI from 'openai';
import { redis } from '@/services/redis';
import { logger } from '@/services/logger';
import crypto from 'crypto';
// @ts-ignore - pdf-parse tem tipagem embutida
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

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
  // VIDEO -> Transcricao de audio do video
  // ==========================================

  async processVideo(videoUrl: string): Promise<MediaProcessResult> {
    try {
      logger.info('[MediaProcessor] Processando video', { videoUrl });

      // Whisper aceita varios formatos de audio e alguns containers de video
      // Formatos suportados: mp3, mp4, mpeg, mpga, m4a, wav, webm
      // Vamos tentar enviar o video diretamente para Whisper primeiro

      try {
        // Download do video
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error(`Falha ao baixar video: ${response.statusText}`);
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Determinar extensao do arquivo pelo mimeType
        const contentType = response.headers.get('content-type') || 'video/mp4';
        let extension = 'mp4';
        if (contentType.includes('webm')) extension = 'webm';
        else if (contentType.includes('mpeg')) extension = 'mpeg';
        else if (contentType.includes('mov') || contentType.includes('quicktime')) extension = 'mp4';

        // Criar File object para OpenAI
        const videoFile = new File([buffer], `video.${extension}`, { type: contentType });

        // Tentar transcrever o audio do video com Whisper
        // Whisper consegue processar containers de video que contenham audio
        const transcription = await this.openai.audio.transcriptions.create({
          file: videoFile,
          model: 'whisper-1',
          language: 'pt',
          response_format: 'verbose_json',
        });

        logger.info('[MediaProcessor] Video transcrito com sucesso', {
          videoUrl,
          textLength: transcription.text.length,
          language: transcription.language,
          duration: transcription.duration,
        });

        return {
          text: transcription.text,
          type: 'video',
          metadata: {
            provider: 'openai',
            model: 'whisper-1',
            language: transcription.language,
            duration: transcription.duration,
            processingTimeMs: 0,
            cached: false,
          },
        };
      } catch (whisperError: any) {
        // Se Whisper falhar (formato nao suportado), informar o usuario
        logger.warn('[MediaProcessor] Whisper nao conseguiu processar o video', {
          videoUrl,
          error: whisperError.message,
        });

        // Retornar mensagem informativa
        return {
          text: `[VIDEO RECEBIDO]\n\nO video foi recebido mas nao foi possivel transcrever o audio automaticamente.\n\nMotivo: ${whisperError.message || 'Formato de video nao suportado pelo Whisper'}\n\nFormatos de video suportados para transcricao: MP4, WebM, MPEG\n\nURL: ${videoUrl}`,
          type: 'video',
          metadata: {
            provider: 'openai',
            model: 'whisper-1-fallback',
            processingTimeMs: 0,
            cached: false,
          },
        };
      }
    } catch (error) {
      logger.error('[MediaProcessor] Erro ao processar video', {
        error,
        videoUrl,
      });
      throw error;
    }
  }

  // ==========================================
  // DOCUMENTO -> Extracao de texto (PDF, DOCX, etc)
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

      // Download do documento
      const documentBuffer = await this.downloadBuffer(documentUrl);

      // Processar conforme tipo de documento
      let extractedText = '';
      let model = 'native';

      // PDF - usar pdf-parse para extracao de texto
      if (mimeType === 'application/pdf') {
        try {
          const pdfData = await pdfParse(documentBuffer);
          extractedText = pdfData.text;
          model = 'pdf-parse';

          logger.info('[MediaProcessor] PDF extraido com pdf-parse', {
            documentUrl,
            pages: pdfData.numpages,
            textLength: extractedText.length,
          });

          // Se o texto extraido for muito curto, provavelmente e um PDF escaneado
          // Usar Vision como fallback para OCR
          if (extractedText.trim().length < 50) {
            logger.info('[MediaProcessor] PDF com pouco texto, tentando OCR com Vision', {
              documentUrl,
            });
            return this.processDocumentWithVision(documentUrl);
          }
        } catch (pdfError) {
          logger.warn('[MediaProcessor] Erro ao extrair PDF, tentando Vision', { pdfError });
          return this.processDocumentWithVision(documentUrl);
        }
      }
      // Word DOCX - usar mammoth para extracao
      else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword' ||
        mimeType.includes('word')
      ) {
        try {
          const result = await mammoth.extractRawText({ buffer: documentBuffer });
          extractedText = result.value;
          model = 'mammoth';

          logger.info('[MediaProcessor] DOCX extraido com mammoth', {
            documentUrl,
            textLength: extractedText.length,
            messages: result.messages,
          });
        } catch (docxError) {
          logger.warn('[MediaProcessor] Erro ao extrair DOCX', { docxError });
          extractedText = `[ERRO] Nao foi possivel extrair texto do documento Word.`;
        }
      }
      // Texto puro
      else if (mimeType === 'text/plain' || mimeType.includes('text/')) {
        extractedText = documentBuffer.toString('utf-8');
        model = 'text';
      }
      // Imagem de documento - usar Vision para OCR
      else if (mimeType.startsWith('image/')) {
        return this.processDocumentWithVision(documentUrl);
      }
      // Outros - tentar Vision como fallback
      else {
        logger.info('[MediaProcessor] Tipo de documento desconhecido, tentando Vision', {
          documentUrl,
          mimeType,
        });
        return this.processDocumentWithVision(documentUrl);
      }

      // Se nao extraiu nada, retornar erro informativo
      if (!extractedText.trim()) {
        return {
          text: `[DOCUMENTO] O documento foi recebido mas nao foi possivel extrair texto automaticamente.\nTipo: ${mimeType}\nURL: ${documentUrl}`,
          type: 'document',
          metadata: {
            provider: 'openai',
            model: 'fallback',
            processingTimeMs: 0,
            cached: false,
          },
        };
      }

      return {
        text: extractedText.trim(),
        type: 'document',
        metadata: {
          provider: 'openai',
          model,
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

  /**
   * Processa documento usando Vision (OCR para imagens/PDFs escaneados)
   */
  private async processDocumentWithVision(documentUrl: string): Promise<MediaProcessResult> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraia TODO o texto deste documento. Mantenha a formatacao e estrutura. Seja preciso e completo. Se houver tabelas, descreva-as claramente. Responda apenas com o texto extraido.',
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
        max_tokens: 4000,
      });

      const extractedText = response.choices[0]?.message?.content || '';

      logger.info('[MediaProcessor] Documento processado com Vision OCR', {
        documentUrl,
        textLength: extractedText.length,
      });

      return {
        text: extractedText,
        type: 'document',
        metadata: {
          provider: 'openai',
          model: 'gpt-4o-vision',
          processingTimeMs: 0,
          cached: false,
        },
      };
    } catch (error) {
      logger.error('[MediaProcessor] Erro no Vision OCR', { error, documentUrl });
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
      throw new Error(`Falha ao baixar midia: ${response.statusText}`);
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Criar File object para OpenAI
    return new File([buffer], 'audio.ogg', { type: blob.type });
  }

  private async downloadBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao baixar arquivo: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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
