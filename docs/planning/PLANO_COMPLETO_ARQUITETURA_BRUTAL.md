# 🔥 PLANO BRUTAL COMPLETO - Arquitetura de Produção Quayer

**Data:** 16 de Outubro de 2025
**Status:** 📋 PLANEJAMENTO EXECUTIVO
**Prioridade:** 🔴 CRÍTICA MÁXIMA
**Objetivo:** TUDO DEVE FUNCIONAR EM PRODUÇÃO - ZERO MOCKS

---

## 🎯 VISÃO GERAL

Sistema completo de WhatsApp com:
1. **Orquestrador de Providers** (UAZapi + Evolution API + futuros)
2. **Sistema de Sessões** (inspirado em falecomigo.ai)
3. **Transcrição Completa** (áudio, vídeo, imagem, documento)
4. **Webhooks Normalizados** (todos providers em formato único)
5. **Bloqueio de IA** (quando humano responde)
6. **Concatenação de Mensagens** (Redis-based)

---

## 📊 ANÁLISE DA API UAZAPI

### Endpoints Disponíveis (88 catalogados)

#### **Mídia e Transcrição**
```yaml
/send/media:
  - Tipos: image, video, audio, myaudio (voz), document
  - Formatos:
    * image: JPG (preferencial), PNG
    * video: MP4 apenas
    * audio: MP3, OGG
    * document: PDF, DOCX, XLSX, etc
```

#### **Webhooks Events**
```yaml
events:
  - connection      # Status da conexão
  - history         # Histórico sync
  - messages        # Mensagens recebidas ⚠️ AQUI VEM MÍDIA
  - messages_update # Atualização de status
  - call            # Chamadas
  - contacts        # Contatos
  - presence        # Online/offline
  - groups          # Grupos
  - labels          # Etiquetas
  - chats           # Conversas
  - chat_labels     # Etiquetas de chats
  - blocks          # Bloqueios
  - leads           # Leads
```

#### **Chatbot Integrado (UAZapi tem OpenAI nativo!)**
```yaml
Instance.properties:
  openai_apikey: string              # ⚠️ JÁ TEM INTEGRAÇÃO OPENAI
  chatbot_enabled: boolean
  chatbot_ignoreGroups: boolean
  chatbot_stopConversation: string   # Palavra-chave para parar
  chatbot_stopMinutes: integer       # Tempo pausado após "stop"
  chatbot_stopWhenYouSendMsg: integer # ⚠️ EXATAMENTE O QUE PRECISAMOS!
```

**DESCOBERTA CRÍTICA:** UAZapi **JÁ TEM** sistema de bloqueio de IA quando você envia mensagem manualmente! (`chatbot_stopWhenYouSendMsg`)

---

## 📋 ARQUITETURA COMPLETA

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CAMADA DE API (Igniter.js)                      │
│  /sessions, /messages, /webhooks, /instances, /transcriptions       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ORQUESTRADOR PRINCIPAL                           │
│  - Roteamento de Providers (UAZapi, Evolution, etc)                 │
│  - Gestão de Sessões (Sessions Manager)                             │
│  - Fila de Transcrição (BullMQ)                                     │
│  - Concatenação de Mensagens (Redis)                                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  PROVIDER        │  │  SESSIONS        │  │  TRANSCRIPTION   │
│  ADAPTERS        │  │  MANAGER         │  │  ENGINE          │
│                  │  │                  │  │                  │
│ - UAZapi         │  │ - Create         │  │ - OpenAI Whisper │
│ - Evolution      │  │ - Update         │  │ - OpenAI Vision  │
│ - Baileys        │  │ - Block AI       │  │ - PDF Parser     │
└──────┬───────────┘  │ - Unblock AI     │  │ - Document OCR   │
       │              │ - Concatenate    │  └──────────────────┘
       ▼              └──────────────────┘
┌──────────────────┐
│  WEBHOOK         │
│  NORMALIZER      │
│                  │
│ - Parse Raw      │
│ - Normalize      │
│ - Route Events   │
│ - Trigger Jobs   │
└──────────────────┘
```

---

## 🔄 FASE 1: ORQUESTRADOR DE PROVIDERS (8-10 horas)

### Estrutura de Arquivos
```
src/lib/providers/
├── core/
│   ├── provider.interface.ts      # Interface IWhatsAppProvider
│   ├── orchestrator.ts            # Orquestrador principal
│   ├── provider.factory.ts        # Factory de providers
│   └── provider.types.ts          # Types normalizados
│
├── adapters/
│   ├── uazapi/
│   │   ├── uazapi.adapter.ts      # Implementação UAZapi
│   │   ├── uazapi.client.ts       # Cliente HTTP
│   │   ├── uazapi.mapper.ts       # Mapeamento UAZ → Normalizado
│   │   └── uazapi.webhook.ts      # Parser de webhooks UAZ
│   │
│   └── evolution/
│       ├── evolution.adapter.ts    # Implementação Evolution API
│       ├── evolution.client.ts
│       ├── evolution.mapper.ts
│       └── evolution.webhook.ts
│
└── index.ts                        # Exportações públicas
```

### Interface Base
```typescript
export interface IWhatsAppProvider {
  // Identificação
  readonly name: string;
  readonly version: string;

  // Instância
  createInstance(data: CreateInstanceInput): Promise<InstanceResult>;
  deleteInstance(instanceId: string): Promise<void>;
  getInstanceStatus(instanceId: string): Promise<InstanceStatus>;

  // QR Code
  generateQRCode(instanceId: string): Promise<QRCodeResult>;
  getPairingCode(instanceId: string): Promise<PairingCodeResult>;

  // Mensagens
  sendText(instanceId: string, data: SendTextInput): Promise<MessageResult>;
  sendMedia(instanceId: string, data: SendMediaInput): Promise<MessageResult>;

  // Webhooks
  configureWebhook(instanceId: string, config: WebhookConfig): Promise<void>;
  normalizeWebhook(rawWebhook: any): NormalizedWebhook;

  // Health
  healthCheck(): Promise<boolean>;
}
```

### Tipos Normalizados
```typescript
// ===== MENSAGENS MÍDIA =====
export interface SendMediaInput {
  to: string;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'voice';
  mediaUrl?: string;        // URL ou base64
  caption?: string;
  fileName?: string;
  mimeType?: string;
}

export interface MediaMessage {
  id: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'voice';
  mediaUrl: string;         // URL para download
  caption?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;            // Bytes
  duration?: number;        // Segundos (áudio/vídeo)

  // Transcrição (será preenchido pelo sistema)
  transcription?: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    text?: string;
    language?: string;
    confidence?: number;
    processedAt?: Date;
  };
}

// ===== WEBHOOK NORMALIZADO =====
export interface NormalizedWebhook {
  event: WebhookEvent;
  instanceId: string;
  timestamp: Date;
  data: WebhookData;
  rawPayload?: any;         // Debug
}

export type WebhookEvent =
  | 'message.received'       // ⚠️ Principal para transcrição
  | 'message.sent'
  | 'message.updated'
  | 'instance.connected'
  | 'instance.disconnected'
  | 'instance.qr'
  | 'chat.created'
  | 'contact.updated';

export interface WebhookData {
  chatId?: string;
  from?: string;
  to?: string;
  message?: {
    id: string;
    type: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document';
    content: string;
    media?: MediaMessage;
    timestamp: Date;
  };
  status?: InstanceStatus;
}
```

---

## 🎤 FASE 2: SISTEMA DE TRANSCRIÇÃO COMPLETO (10-12 horas)

### Fluxo de Transcrição
```
Webhook: message.received (com mídia)
          ↓
┌─────────────────────────┐
│ 1. WEBHOOK NORMALIZER   │
│ - Detectar mídia        │
│ - Baixar arquivo        │
│ - Salvar no storage     │
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ 2. ENFILEIRAR JOB       │
│ Queue: transcription    │
│ Job: {                  │
│   messageId,            │
│   mediaType,            │
│   mediaUrl,             │
│   instanceId            │
│ }                       │
└──────────┬──────────────┘
           ▼
┌─────────────────────────────────────────┐
│ 3. WORKER: TRANSCRIÇÃO                  │
│                                         │
│ switch(mediaType):                      │
│   case 'audio':                         │
│     → OpenAI Whisper API                │
│   case 'voice':                         │
│     → OpenAI Whisper API                │
│   case 'video':                         │
│     → Extrair áudio → Whisper           │
│   case 'image':                         │
│     → OpenAI Vision GPT-4               │
│   case 'document':                      │
│     → PDF Parser / OCR                  │
└──────────┬──────────────────────────────┘
           ▼
┌─────────────────────────┐
│ 4. SALVAR RESULTADO     │
│ - Atualizar Message     │
│ - Armazenar transcrição │
│ - Publicar no Redis     │
│ - Webhook notification  │
└─────────────────────────┘
```

### Estrutura de Arquivos
```
src/lib/transcription/
├── transcription.engine.ts         # Engine principal
├── transcription.worker.ts         # BullMQ Worker
├── transcription.queue.ts          # Queue manager
├── transcription.types.ts          # Types
│
├── providers/
│   ├── openai-whisper.ts          # Audio → Text
│   ├── openai-vision.ts           # Image → Text
│   ├── pdf-parser.ts              # PDF → Text
│   └── document-ocr.ts            # DOCX/outros → Text
│
└── utils/
    ├── media-downloader.ts        # Download de mídia
    ├── audio-extractor.ts         # Extrair áudio de vídeo
    └── format-converter.ts        # Conversão de formatos
```

### Implementação - Transcrição Engine
```typescript
import OpenAI from 'openai';
import { createReadStream } from 'fs';
import { download } from './utils/media-downloader';

export class TranscriptionEngine {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }

  /**
   * Transcrever áudio usando Whisper
   */
  async transcribeAudio(audioUrl: string): Promise<TranscriptionResult> {
    // 1. Baixar áudio
    const filePath = await download(audioUrl);

    // 2. Enviar para Whisper
    const transcription = await this.openai.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: 'whisper-1',
      language: 'pt', // Portuguese
      response_format: 'verbose_json',
    });

    return {
      text: transcription.text,
      language: transcription.language,
      duration: transcription.duration,
      segments: transcription.segments,
    };
  }

  /**
   * Transcrever vídeo (extrai áudio primeiro)
   */
  async transcribeVideo(videoUrl: string): Promise<TranscriptionResult> {
    // 1. Baixar vídeo
    const videoPath = await download(videoUrl);

    // 2. Extrair áudio usando ffmpeg
    const audioPath = await this.extractAudio(videoPath);

    // 3. Transcrever áudio
    return this.transcribeAudio(audioPath);
  }

  /**
   * Descrever imagem usando GPT-4 Vision
   */
  async describeImage(imageUrl: string): Promise<TranscriptionResult> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Descreva detalhadamente o que você vê nesta imagem em português.',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    return {
      text: response.choices[0].message.content!,
      language: 'pt',
      confidence: 0.95, // Vision tem alta confiança
    };
  }

  /**
   * Extrair texto de documento (PDF, DOCX, etc)
   */
  async extractDocumentText(documentUrl: string, mimeType: string): Promise<TranscriptionResult> {
    const filePath = await download(documentUrl);

    if (mimeType === 'application/pdf') {
      return this.extractPDF(filePath);
    } else if (mimeType.includes('word') || mimeType.includes('document')) {
      return this.extractDOCX(filePath);
    } else {
      // OCR para outros formatos
      return this.performOCR(filePath);
    }
  }

  private async extractAudio(videoPath: string): Promise<string> {
    // Implementação com ffmpeg
    // ffmpeg -i video.mp4 -vn -acodec libmp3lame audio.mp3
  }

  private async extractPDF(pdfPath: string): Promise<TranscriptionResult> {
    // Usar biblioteca pdf-parse ou similar
  }

  private async extractDOCX(docxPath: string): Promise<TranscriptionResult> {
    // Usar biblioteca mammoth ou similar
  }

  private async performOCR(imagePath: string): Promise<TranscriptionResult> {
    // Usar Tesseract.js ou Google Vision API
  }
}

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
```

### Worker de Transcrição (BullMQ)
```typescript
import { Worker, Job } from 'bullmq';
import { TranscriptionEngine } from './transcription.engine';
import { database } from '@/services/database';
import { redis } from '@/services/redis';

interface TranscriptionJob {
  messageId: string;
  instanceId: string;
  mediaType: 'audio' | 'video' | 'image' | 'document' | 'voice';
  mediaUrl: string;
  mimeType?: string;
}

const engine = new TranscriptionEngine();

export const transcriptionWorker = new Worker<TranscriptionJob>(
  'transcription',
  async (job: Job<TranscriptionJob>) => {
    const { messageId, mediaType, mediaUrl, mimeType } = job.data;

    console.log(`[Transcription Worker] Processing ${mediaType} for message ${messageId}`);

    let result: TranscriptionResult;

    try {
      // Selecionar método de transcrição
      switch (mediaType) {
        case 'audio':
        case 'voice':
          result = await engine.transcribeAudio(mediaUrl);
          break;

        case 'video':
          result = await engine.transcribeVideo(mediaUrl);
          break;

        case 'image':
          result = await engine.describeImage(mediaUrl);
          break;

        case 'document':
          result = await engine.extractDocumentText(mediaUrl, mimeType!);
          break;

        default:
          throw new Error(`Unsupported media type: ${mediaType}`);
      }

      // Salvar transcrição no banco
      await database.message.update({
        where: { id: messageId },
        data: {
          transcription: result.text,
          transcriptionLanguage: result.language,
          transcriptionConfidence: result.confidence,
          transcriptionProcessedAt: new Date(),
        },
      });

      // Publicar evento no Redis (para websockets)
      await redis.publish('transcription:completed', JSON.stringify({
        messageId,
        text: result.text,
      }));

      console.log(`[Transcription Worker] ✅ Completed for message ${messageId}`);

      return result;
    } catch (error) {
      console.error(`[Transcription Worker] ❌ Failed for message ${messageId}:`, error);

      // Marcar como falha
      await database.message.update({
        where: { id: messageId },
        data: {
          transcriptionStatus: 'failed',
          transcriptionError: error.message,
        },
      });

      throw error; // BullMQ vai fazer retry
    }
  },
  {
    connection: redis,
    concurrency: 5, // 5 transcrições simultâneas
    limiter: {
      max: 10,      // 10 jobs por minuto (limites OpenAI)
      duration: 60000,
    },
  }
);
```

---

## 💬 FASE 3: SISTEMA DE SESSÕES (6-8 horas)

### Modelo de Sessão (inspirado em falecomigo.ai)
```typescript
// Prisma Schema
model Session {
  id             String   @id @default(uuid())
  contactId      String
  instanceId     String
  organizationId String

  // Status
  status         SessionStatus @default(QUEUED)

  // IA Control
  aiEnabled      Boolean  @default(true)
  aiBlockedUntil DateTime? // Null = não bloqueado
  aiBlockReason  String?   // 'manual_response' | 'stop_keyword' | 'agent_takeover'

  // Concatenação
  lastMessageAt  DateTime
  isConcat       Boolean  @default(false)
  concatTimeout  Int      @default(30) // Segundos

  // Metadata
  tags           String[]
  customFields   Json?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  closedAt       DateTime?

  // Relacionamentos
  contact        Contact  @relation(fields: [contactId], references: [id])
  instance       Instance @relation(fields: [instanceId], references: [id])
  organization   Organization @relation(fields: [organizationId], references: [id])
  messages       Message[]

  @@index([contactId])
  @@index([instanceId])
  @@index([status])
  @@index([aiBlockedUntil])
}

enum SessionStatus {
  QUEUED     // Aguardando atendimento
  ACTIVE     // Em atendimento
  PAUSED     // Pausada (aguardando resposta)
  CLOSED     // Encerrada
}

model Contact {
  id             String   @id @default(uuid())
  phoneNumber    String   @unique
  name           String?
  profilePicUrl  String?

  // WhatsApp Info
  isBusinesss    Boolean  @default(false)
  verifiedName   String?

  // Metadata
  tags           String[]
  customFields   Json?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  sessions       Session[]
  messages       Message[]
}

model Message {
  id             String   @id @default(uuid())
  sessionId      String
  contactId      String
  instanceId     String

  // Mensagem
  waMessageId    String   @unique // ID do WhatsApp
  direction      MessageDirection
  type           MessageType
  content        String   @db.Text

  // Mídia
  mediaUrl       String?
  mediaType      String?
  mimeType       String?
  fileName       String?

  // Transcrição
  transcription            String?  @db.Text
  transcriptionLanguage    String?
  transcriptionConfidence  Float?
  transcriptionStatus      TranscriptionStatus @default(pending)
  transcriptionProcessedAt DateTime?
  transcriptionError       String?

  // Status
  status         MessageStatus @default(pending)
  sentAt         DateTime?
  deliveredAt    DateTime?
  readAt         DateTime?

  // Concatenação
  isConcatenated Boolean  @default(false)
  concatGroupId  String?  // Agrupa mensagens concatenadas

  createdAt      DateTime @default(now())

  session        Session  @relation(fields: [sessionId], references: [id])
  contact        Contact  @relation(fields: [contactId], references: [id])
  instance       Instance @relation(fields: [instanceId], references: [id])

  @@index([sessionId])
  @@index([contactId])
  @@index([waMessageId])
  @@index([concatGroupId])
}

enum MessageDirection {
  INBOUND   // Recebida
  OUTBOUND  // Enviada
}

enum MessageType {
  text
  image
  video
  audio
  voice
  document
  location
  contact
  sticker
}

enum MessageStatus {
  pending
  sent
  delivered
  read
  failed
}

enum TranscriptionStatus {
  pending
  processing
  completed
  failed
  skipped
}
```

### Sessions Manager
```typescript
export class SessionsManager {
  /**
   * Criar ou recuperar sessão ativa
   */
  async getOrCreateSession(
    contactId: string,
    instanceId: string,
    organizationId: string
  ): Promise<Session> {
    // Buscar sessão ativa
    let session = await database.session.findFirst({
      where: {
        contactId,
        instanceId,
        status: { in: ['QUEUED', 'ACTIVE'] },
      },
    });

    // Criar nova se não existir
    if (!session) {
      session = await database.session.create({
        data: {
          contactId,
          instanceId,
          organizationId,
          status: 'QUEUED',
          lastMessageAt: new Date(),
        },
      });
    }

    return session;
  }

  /**
   * Bloquear IA quando humano responde
   */
  async blockAI(sessionId: string, durationMinutes: number, reason: string): Promise<void> {
    const blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);

    await database.session.update({
      where: { id: sessionId },
      data: {
        aiEnabled: false,
        aiBlockedUntil: blockedUntil,
        aiBlockReason: reason,
      },
    });

    // Publicar evento
    await redis.publish('session:ai_blocked', JSON.stringify({
      sessionId,
      blockedUntil,
      reason,
    }));
  }

  /**
   * Desbloquear IA (manual ou automático)
   */
  async unblockAI(sessionId: string): Promise<void> {
    await database.session.update({
      where: { id: sessionId },
      data: {
        aiEnabled: true,
        aiBlockedUntil: null,
        aiBlockReason: null,
      },
    });

    await redis.publish('session:ai_unblocked', JSON.stringify({ sessionId }));
  }

  /**
   * Verificar se IA está bloqueada
   */
  async isAIBlocked(sessionId: string): Promise<boolean> {
    const session = await database.session.findUnique({
      where: { id: sessionId },
      select: { aiEnabled: true, aiBlockedUntil: true },
    });

    if (!session) return false;

    // Se AI desabilitada, está bloqueada
    if (!session.aiEnabled) {
      // Verificar se expirou o bloqueio
      if (session.aiBlockedUntil && new Date() > session.aiBlockedUntil) {
        // Desbloquear automaticamente
        await this.unblockAI(sessionId);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Listar sessões (endpoint da API)
   */
  async listSessions(filters: {
    organizationId?: string;
    instanceId?: string;
    status?: SessionStatus;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.instanceId) where.instanceId = filters.instanceId;
    if (filters.status) where.status = filters.status;

    const [sessions, total] = await Promise.all([
      database.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          contact: true,
          instance: true,
          _count: {
            select: { messages: true },
          },
        },
      }),
      database.session.count({ where }),
    ]);

    return {
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const sessionsManager = new SessionsManager();
```

---

## 📦 FASE 4: CONCATENAÇÃO DE MENSAGENS (4-5 horas)

### Lógica de Concatenação
```typescript
/**
 * Sistema de concatenação de mensagens
 *
 * Quando usuário envia múltiplas mensagens rápidas,
 * aguardar X segundos e concatenar tudo em uma única mensagem
 * antes de processar.
 */

export class MessageConcatenator {
  private readonly CONCAT_TIMEOUT = 30; // 30 segundos (configurável)
  private readonly REDIS_PREFIX = 'concat:';

  /**
   * Adicionar mensagem ao grupo de concatenação
   */
  async addMessage(
    sessionId: string,
    contactId: string,
    message: IncomingMessage
  ): Promise<void> {
    const key = `${this.REDIS_PREFIX}${sessionId}:${contactId}`;

    // Verificar se já existe grupo de concatenação ativo
    const existing = await redis.get(key);

    if (existing) {
      // Adicionar à lista existente
      const messages: IncomingMessage[] = JSON.parse(existing);
      messages.push(message);

      // Resetar timeout (mais 30 segundos)
      await redis.setex(key, this.CONCAT_TIMEOUT, JSON.stringify(messages));
    } else {
      // Iniciar novo grupo
      await redis.setex(key, this.CONCAT_TIMEOUT, JSON.stringify([message]));

      // Agendar processamento
      await this.scheduleProcessing(sessionId, contactId);
    }
  }

  /**
   * Agendar processamento após timeout
   */
  private async scheduleProcessing(sessionId: string, contactId: string): Promise<void> {
    const job = await concatenationQueue.add(
      'process-concatenation',
      { sessionId, contactId },
      {
        delay: this.CONCAT_TIMEOUT * 1000, // Delay de 30 segundos
      }
    );
  }

  /**
   * Processar grupo de mensagens concatenadas
   */
  async processConcatenatedMessages(
    sessionId: string,
    contactId: string
  ): Promise<void> {
    const key = `${this.REDIS_PREFIX}${sessionId}:${contactId}`;
    const data = await redis.get(key);

    if (!data) {
      console.log('[Concat] Nenhuma mensagem para processar');
      return;
    }

    const messages: IncomingMessage[] = JSON.parse(data);

    // Deletar do Redis
    await redis.del(key);

    // Concatenar textos
    const concatenatedText = messages
      .filter(m => m.type === 'text')
      .map(m => m.content)
      .join('\n');

    // Coletar mídias separadas
    const mediaMessages = messages.filter(m => m.type !== 'text');

    // Criar grupo de concatenação no banco
    const concatGroupId = `concat_${Date.now()}`;

    // Salvar mensagem concatenada
    const finalMessage = await database.message.create({
      data: {
        sessionId,
        contactId,
        instanceId: messages[0].instanceId,
        waMessageId: `concat_${concatGroupId}`,
        direction: 'INBOUND',
        type: 'text',
        content: concatenatedText,
        isConcatenated: true,
        concatGroupId,
        status: 'delivered',
      },
    });

    // Salvar mensagens individuais (para histórico)
    await Promise.all(
      messages.map(msg =>
        database.message.create({
          data: {
            ...msg,
            concatGroupId,
            isConcatenated: false,
          },
        })
      )
    );

    // Processar mensagem final (IA, etc)
    await this.processMessage(finalMessage);
  }

  private async processMessage(message: Message): Promise<void> {
    // Verificar se IA está bloqueada
    const blocked = await sessionsManager.isAIBlocked(message.sessionId);
    if (blocked) {
      console.log('[AI] Bloqueada para sessão', message.sessionId);
      return;
    }

    // Enfileirar para IA processar
    await aiQueue.add('process-message', {
      messageId: message.id,
      sessionId: message.sessionId,
      content: message.content,
    });
  }
}

export const messageConcatenator = new MessageConcatenator();
```

### Worker de Concatenação
```typescript
import { Worker, Job } from 'bullmq';

interface ConcatenationJob {
  sessionId: string;
  contactId: string;
}

export const concatenationWorker = new Worker<ConcatenationJob>(
  'concatenation',
  async (job: Job<ConcatenationJob>) => {
    const { sessionId, contactId } = job.data;

    console.log(`[Concat Worker] Processing ${sessionId} / ${contactId}`);

    await messageConcatenator.processConcatenatedMessages(sessionId, contactId);
  },
  {
    connection: redis,
    concurrency: 10,
  }
);
```

---

## 🚦 FASE 5: WEBHOOK PROCESSOR (6-7 horas)

### Endpoint Unificado de Webhooks
```typescript
// src/app/api/v1/webhooks/[provider]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/providers/core/orchestrator';
import { sessionsManager } from '@/lib/sessions/sessions.manager';
import { messageConcatenator } from '@/lib/concatenation/message-concatenator';
import { transcriptionQueue } from '@/lib/transcription/transcription.queue';

/**
 * Endpoint unificado de webhooks
 *
 * POST /api/v1/webhooks/uazapi
 * POST /api/v1/webhooks/evolution
 * POST /api/v1/webhooks/baileys
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider; // 'uazapi' | 'evolution' | 'baileys'
  const rawBody = await request.json();

  console.log(`[Webhook] Received from ${provider}:`, rawBody);

  try {
    // 1. NORMALIZAR WEBHOOK
    const normalized = await orchestrator.normalizeWebhook(provider, rawBody);

    console.log('[Webhook] Normalized:', normalized);

    // 2. PROCESSAR POR TIPO DE EVENTO
    switch (normalized.event) {
      case 'message.received':
        await processIncomingMessage(normalized);
        break;

      case 'instance.connected':
        await updateInstanceStatus(normalized.instanceId, 'connected');
        break;

      case 'instance.disconnected':
        await updateInstanceStatus(normalized.instanceId, 'disconnected');
        break;

      case 'instance.qr':
        await updateInstanceQRCode(normalized.instanceId, normalized.data.qrCode!);
        break;

      default:
        console.log(`[Webhook] Unhandled event: ${normalized.event}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Processar mensagem recebida
 */
async function processIncomingMessage(webhook: NormalizedWebhook) {
  const { instanceId, data } = webhook;
  const { from, message } = data;

  if (!from || !message) {
    console.log('[Webhook] Missing from or message data');
    return;
  }

  // 1. Buscar ou criar contato
  let contact = await database.contact.findUnique({
    where: { phoneNumber: from },
  });

  if (!contact) {
    contact = await database.contact.create({
      data: { phoneNumber: from },
    });
  }

  // 2. Buscar ou criar sessão
  const instance = await database.instance.findUnique({
    where: { id: instanceId },
    select: { organizationId: true },
  });

  const session = await sessionsManager.getOrCreateSession(
    contact.id,
    instanceId,
    instance!.organizationId!
  );

  // 3. CONCATENAÇÃO DE MENSAGENS
  if (message.type === 'text') {
    // Adicionar ao grupo de concatenação
    await messageConcatenator.addMessage(session.id, contact.id, {
      instanceId,
      waMessageId: message.id,
      type: message.type,
      content: message.content,
      direction: 'INBOUND',
    });

    // ⚠️ NÃO processar imediatamente, aguardar concatenação
    return;
  }

  // 4. MÍDIA - ENFILEIRAR TRANSCRIÇÃO
  if (message.media) {
    // Salvar mensagem
    const savedMessage = await database.message.create({
      data: {
        sessionId: session.id,
        contactId: contact.id,
        instanceId,
        waMessageId: message.id,
        direction: 'INBOUND',
        type: message.type,
        content: message.content || '',
        mediaUrl: message.media.mediaUrl,
        mediaType: message.media.type,
        mimeType: message.media.mimeType,
        fileName: message.media.fileName,
        transcriptionStatus: 'pending',
      },
    });

    // Enfileirar transcrição
    await transcriptionQueue.add('transcribe-media', {
      messageId: savedMessage.id,
      instanceId,
      mediaType: message.media.type,
      mediaUrl: message.media.mediaUrl,
      mimeType: message.media.mimeType,
    });

    console.log(`[Webhook] Media message queued for transcription: ${savedMessage.id}`);
  }

  // 5. BLOQUEAR IA SE HUMANO RESPONDER
  // ⚠️ Esta lógica pode ser feita no frontend também
  // Quando agente envia mensagem manualmente, chamar API para bloquear IA
}

/**
 * Atualizar status da instância
 */
async function updateInstanceStatus(instanceId: string, status: string) {
  await database.instance.update({
    where: { id: instanceId },
    data: { status },
  });

  console.log(`[Webhook] Instance ${instanceId} status updated to ${status}`);
}

/**
 * Atualizar QR Code da instância
 */
async function updateInstanceQRCode(instanceId: string, qrCode: string) {
  await database.instance.update({
    where: { id: instanceId },
    data: { qrCode },
  });

  // Publicar no Redis para frontend receber (WebSocket)
  await redis.publish('instance:qr', JSON.stringify({
    instanceId,
    qrCode,
  }));
}
```

---

## 📚 FASE 6: CONTROLLERS DA API (5-6 horas)

### Sessions Controller
```typescript
// src/features/sessions/controllers/sessions.controller.ts

import { igniter } from '@/igniter';
import { sessionsManager } from '@/lib/sessions/sessions.manager';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { z } from 'zod';

export const sessionsController = igniter.controller({
  name: 'sessions',
  path: '/sessions',
  description: 'Gerenciamento de sessões de atendimento',
  actions: {
    /**
     * GET /sessions
     * Listar sessões com filtros
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        organizationId: z.string().optional(),
        instanceId: z.string().optional(),
        status: z.enum(['QUEUED', 'ACTIVE', 'PAUSED', 'CLOSED']).optional(),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        // Se não for admin, filtrar por organização do usuário
        const organizationId = user?.role === 'admin'
          ? request.query.organizationId
          : user?.currentOrgId;

        const result = await sessionsManager.listSessions({
          organizationId,
          instanceId: request.query.instanceId,
          status: request.query.status,
          page: request.query.page,
          limit: request.query.limit,
        });

        return response.success(result);
      },
    }),

    /**
     * GET /sessions/:id
     * Buscar sessão por ID
     */
    get: igniter.query({
      path: '/:id',
      params: z.object({ id: z.string() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const session = await database.session.findUnique({
          where: { id: request.params.id },
          include: {
            contact: true,
            instance: true,
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 100, // Últimas 100 mensagens
            },
          },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        return response.success(session);
      },
    }),

    /**
     * POST /sessions/:id/block-ai
     * Bloquear IA quando humano assume
     */
    blockAI: igniter.mutation({
      path: '/:id/block-ai',
      params: z.object({ id: z.string() }),
      body: z.object({
        durationMinutes: z.number().min(1).max(1440).default(15),
        reason: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const { id } = request.params;
        const { durationMinutes, reason } = request.body;

        await sessionsManager.blockAI(
          id,
          durationMinutes,
          reason || 'manual_response'
        );

        return response.success({
          message: `IA bloqueada por ${durationMinutes} minutos`,
        });
      },
    }),

    /**
     * POST /sessions/:id/unblock-ai
     * Desbloquear IA manualmente
     */
    unblockAI: igniter.mutation({
      path: '/:id/unblock-ai',
      params: z.object({ id: z.string() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        await sessionsManager.unblockAI(request.params.id);

        return response.success({ message: 'IA desbloqueada' });
      },
    }),

    /**
     * POST /sessions/:id/close
     * Encerrar sessão
     */
    close: igniter.mutation({
      path: '/:id/close',
      params: z.object({ id: z.string() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const session = await database.session.update({
          where: { id: request.params.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
          },
        });

        return response.success({ message: 'Sessão encerrada', session });
      },
    }),
  },
});
```

---

## ⏱️ CRONOGRAMA DE IMPLEMENTAÇÃO

| Fase | Descrição | Horas | Status |
|------|-----------|-------|--------|
| **1** | Orquestrador de Providers | 8-10h | 📋 Pendente |
| **2** | Sistema de Transcrição Completo | 10-12h | 📋 Pendente |
| **3** | Sistema de Sessões | 6-8h | 📋 Pendente |
| **4** | Concatenação de Mensagens | 4-5h | 📋 Pendente |
| **5** | Webhook Processor | 6-7h | 📋 Pendente |
| **6** | Controllers da API | 5-6h | 📋 Pendente |
| **7** | Testes E2E | 8-10h | 📋 Pendente |
| **8** | Documentação | 3-4h | 📋 Pendente |

**TOTAL ESTIMADO:** 50-62 horas (~1.5-2 semanas)

---

## 🎯 PRIORIDADES IMEDIATAS

1. **FASE 1 + FASE 5** (Orquestrador + Webhooks) → Base para tudo funcionar
2. **FASE 3** (Sessões) → Estrutura de dados principal
3. **FASE 2** (Transcrição) → Feature principal do produto
4. **FASE 4** (Concatenação) → UX crítica
5. **FASE 6** (Controllers) → API pública

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ Aprovar este plano
2. 📋 Criar Prisma migrations (Session, Contact, Message)
3. 🔨 Implementar Fase 1 (Orquestrador)
4. 🔨 Implementar Fase 5 (Webhook Processor)
5. 🧪 Testar fluxo completo

---

**Status:** 📋 AGUARDANDO APROVAÇÃO PARA EXECUÇÃO BRUTAL

**Próxima Ação:** Implementar orquestrador de providers + webhook processor
