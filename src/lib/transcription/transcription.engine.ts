/**
 * Transcription Engine
 *
 * Sistema completo de transcrição de mídia:
 * - Áudio/Voz → OpenAI Whisper
 * - Vídeo → Extrair áudio → Whisper
 * - Imagem → GPT-4 Vision
 * - Documento → Parser específico (PDF, DOCX, etc)
 */

import OpenAI from 'openai';
import { createReadStream, existsSync } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';

export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
  confidence?: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export class TranscriptionEngine {
  private openai: OpenAI;
  private hasApiKey: boolean;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.hasApiKey = !!apiKey;

    if (!apiKey) {
      console.warn('[Transcription] OPENAI_API_KEY not found - transcription will be disabled');
    }

    this.openai = new OpenAI({
      apiKey: apiKey || 'dummy-key', // Evita erro se não configurado
    });
  }

  /**
   * Verificar se API key está configurada
   */
  private ensureApiKey(): void {
    if (!this.hasApiKey) {
      throw new Error(
        'OPENAI_API_KEY não está configurada. ' +
        'Configure a variável de ambiente ou acesse /admin/settings?tab=ai para configurar.'
      );
    }
  }

  /**
   * Transcrever áudio usando Whisper
   */
  async transcribeAudio(audioUrl: string): Promise<TranscriptionResult> {
    this.ensureApiKey();
    console.log(`[Transcription] Transcribing audio: ${audioUrl}`);

    // 1. Baixar áudio
    const filePath = await this.downloadMedia(audioUrl);

    try {
      // 2. Enviar para Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: createReadStream(filePath),
        model: 'whisper-1',
        language: 'pt', // Portuguese
        response_format: 'verbose_json',
      });

      console.log(`[Transcription] Audio transcribed successfully: ${transcription.text.substring(0, 100)}...`);

      return {
        text: transcription.text,
        language: transcription.language || 'pt',
        duration: transcription.duration,
        segments: transcription.segments,
      };
    } finally {
      // Limpar arquivo temporário
      await this.cleanupFile(filePath);
    }
  }

  /**
   * Transcrever vídeo (extrai áudio primeiro)
   */
  async transcribeVideo(videoUrl: string): Promise<TranscriptionResult> {
    this.ensureApiKey();
    console.log(`[Transcription] Transcribing video: ${videoUrl}`);

    // 1. Baixar vídeo
    const videoPath = await this.downloadMedia(videoUrl);

    try {
      // 2. Extrair áudio usando ffmpeg
      const audioPath = await this.extractAudioFromVideo(videoPath);

      try {
        // 3. Transcrever áudio extraído
        const fileStream = createReadStream(audioPath);

        const transcription = await this.openai.audio.transcriptions.create({
          file: fileStream,
          model: 'whisper-1',
          language: 'pt',
          response_format: 'verbose_json',
        });

        console.log(`[Transcription] Video transcribed successfully`);

        return {
          text: transcription.text,
          language: transcription.language || 'pt',
          duration: transcription.duration,
          segments: transcription.segments,
        };
      } finally {
        await this.cleanupFile(audioPath);
      }
    } finally {
      await this.cleanupFile(videoPath);
    }
  }

  /**
   * Descrever imagem usando GPT-4 Vision
   */
  async describeImage(imageUrl: string): Promise<TranscriptionResult> {
    this.ensureApiKey();
    console.log(`[Transcription] Describing image: ${imageUrl}`);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o', // Latest vision model
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Descreva detalhadamente o que você vê nesta imagem em português. Seja objetivo e completo.',
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'auto', // 'low', 'high', or 'auto'
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const description = response.choices[0].message.content || 'Imagem sem descrição disponível';

    console.log(`[Transcription] Image described: ${description.substring(0, 100)}...`);

    return {
      text: description,
      language: 'pt',
      confidence: 0.95, // Vision geralmente tem alta confiança
    };
  }

  /**
   * Extrair texto de documento (PDF, DOCX, TXT, etc)
   */
  async extractDocumentText(documentUrl: string, mimeType: string): Promise<TranscriptionResult> {
    console.log(`[Transcription] Extracting text from document: ${documentUrl} (${mimeType})`);

    const filePath = await this.downloadMedia(documentUrl);

    try {
      if (mimeType === 'application/pdf') {
        return await this.extractPDF(filePath);
      } else if (mimeType.includes('word') || mimeType.includes('document')) {
        return await this.extractDOCX(filePath);
      } else if (mimeType.includes('text') || mimeType === 'text/plain') {
        return await this.extractPlainText(filePath);
      } else {
        // Para outros formatos, tentar OCR como fallback
        console.warn(`[Transcription] Unsupported document type ${mimeType}, trying OCR...`);
        return await this.performOCR(filePath);
      }
    } finally {
      await this.cleanupFile(filePath);
    }
  }

  /**
   * Baixar mídia de URL
   */
  private async downloadMedia(url: string): Promise<string> {
    if (!url) {
      throw new Error('URL da mídia não fornecida');
    }

    console.log(`[Transcription] Downloading media from: ${url.substring(0, 100)}...`);

    let response: Response;
    try {
      response = await fetch(url);
    } catch (fetchError: any) {
      throw new Error(`Falha ao conectar com URL da mídia: ${fetchError?.message || 'Erro de rede'}`);
    }

    if (!response.ok) {
      throw new Error(`Falha ao baixar mídia: HTTP ${response.status} - ${response.statusText || 'Erro desconhecido'}`);
    }

    const buffer = await response.arrayBuffer();

    if (buffer.byteLength === 0) {
      throw new Error('Mídia baixada está vazia (0 bytes)');
    }

    let ext = '.tmp';
    try {
      ext = path.extname(new URL(url).pathname) || '.tmp';
    } catch {
      // URL inválida, usar extensão padrão
    }

    // Use os.tmpdir() para compatibilidade cross-platform
    const os = await import('os');
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `media_${Date.now()}${ext}`);

    // Salvar arquivo
    const fs = await import('fs/promises');
    await fs.writeFile(tempPath, Buffer.from(buffer));

    console.log(`[Transcription] Media downloaded to ${tempPath} (${buffer.byteLength} bytes)`);

    return tempPath;
  }

  /**
   * Extrair áudio de vídeo usando ffmpeg
   */
  private async extractAudioFromVideo(videoPath: string): Promise<string> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const audioPath = videoPath.replace(/\.[^.]+$/, '.mp3');

    console.log(`[Transcription] Extracting audio from ${videoPath} to ${audioPath}`);

    // Primeiro verificar se ffmpeg está disponível
    try {
      await execAsync('ffmpeg -version');
    } catch {
      throw new Error(
        'ffmpeg não está instalado ou não está no PATH. ' +
        'Instale ffmpeg: https://ffmpeg.org/download.html ou use: apt install ffmpeg (Linux) / brew install ffmpeg (Mac)'
      );
    }

    // Comando ffmpeg: -i video.mp4 -vn -acodec libmp3lame audio.mp3
    const command = `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame "${audioPath}"`;

    try {
      await execAsync(command);
      console.log(`[Transcription] Audio extracted successfully`);
      return audioPath;
    } catch (error: any) {
      const errorMessage = error?.message || error?.stderr || 'Erro desconhecido ao extrair áudio';
      console.error('[Transcription] ffmpeg error:', error);
      throw new Error(`Falha ao extrair áudio do vídeo: ${errorMessage}`);
    }
  }

  /**
   * Extrair texto de PDF
   */
  private async extractPDF(pdfPath: string): Promise<TranscriptionResult> {
    // TODO: Implementar com pdf-parse ou pdfjs-dist
    // Por enquanto, retornar placeholder
    console.warn('[Transcription] PDF extraction not yet implemented');

    return {
      text: '[PDF] Extração de PDF não implementada ainda. Instale: npm install pdf-parse',
      language: 'pt',
      confidence: 0,
    };

    // Implementação futura:
    // const pdfParse = require('pdf-parse');
    // const dataBuffer = await fs.readFile(pdfPath);
    // const data = await pdfParse(dataBuffer);
    // return {
    //   text: data.text,
    //   language: 'pt',
    //   confidence: 0.9,
    // };
  }

  /**
   * Extrair texto de DOCX
   */
  private async extractDOCX(docxPath: string): Promise<TranscriptionResult> {
    // TODO: Implementar com mammoth
    console.warn('[Transcription] DOCX extraction not yet implemented');

    return {
      text: '[DOCX] Extração de DOCX não implementada ainda. Instale: npm install mammoth',
      language: 'pt',
      confidence: 0,
    };

    // Implementação futura:
    // const mammoth = require('mammoth');
    // const result = await mammoth.extractRawText({ path: docxPath });
    // return {
    //   text: result.value,
    //   language: 'pt',
    //   confidence: 0.9,
    // };
  }

  /**
   * Extrair texto plano
   */
  private async extractPlainText(textPath: string): Promise<TranscriptionResult> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(textPath, 'utf-8');

    return {
      text: content,
      language: 'pt',
      confidence: 1.0,
    };
  }

  /**
   * Realizar OCR em imagem (fallback para documentos desconhecidos)
   */
  private async performOCR(imagePath: string): Promise<TranscriptionResult> {
    // TODO: Implementar com Tesseract.js ou Google Vision API
    console.warn('[Transcription] OCR not yet implemented');

    return {
      text: '[OCR] Reconhecimento de texto não implementado ainda. Instale: npm install tesseract.js',
      language: 'pt',
      confidence: 0,
    };

    // Implementação futura com Tesseract:
    // const Tesseract = require('tesseract.js');
    // const { data: { text } } = await Tesseract.recognize(imagePath, 'por');
    // return {
    //   text,
    //   language: 'pt',
    //   confidence: 0.8,
    // };
  }

  /**
   * Limpar arquivo temporário
   */
  private async cleanupFile(filePath: string): Promise<void> {
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
        console.log(`[Transcription] Cleaned up temp file: ${filePath}`);
      }
    } catch (error: any) {
      console.error(`[Transcription] Failed to cleanup file ${filePath}:`, error.message);
    }
  }
}

// Singleton
export const transcriptionEngine = new TranscriptionEngine();
