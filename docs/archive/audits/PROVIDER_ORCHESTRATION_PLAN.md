# 🔄 Plano de Refatoração: Arquitetura de Orquestração de Providers

**Data:** 11 de Outubro de 2025
**Status:** 📋 PLANEJAMENTO
**Prioridade:** 🔴 CRÍTICA

---

## 🎯 Objetivo

Criar uma **camada de abstração/orquestração** para providers de WhatsApp, desacoplando a plataforma do UAZapi e preparando para suportar múltiplos providers (Evolution API, Baileys, WPPConnect, etc.) sem impacto nas APIs existentes.

---

## ❌ Problema Atual

### Acoplamento Direto
```typescript
// ❌ PROBLEMA: Acoplamento direto com UAZapi
import { uazapiService } from '@/lib/api/uazapi.service'

const qrCode = await uazapiService.generateQRCode(instanceId)
```

### Impactos do Acoplamento
1. **Troca de Provider:** Requer alteração em TODAS as APIs
2. **Múltiplos Providers:** Impossível ter UAZapi + Evolution API simultaneamente
3. **Testes:** Difícil mockar sem acoplamento
4. **Manutenção:** Mudanças no UAZapi quebram toda aplicação
5. **Webhooks:** Cada provider tem formato diferente

### Arquivos com Acoplamento Identificado
- `src/lib/api/uazapi.service.ts` - Serviço direto UAZapi
- `src/lib/uaz/uaz.client.ts` - Cliente HTTP UAZapi
- `src/features/instances/controllers/instances.controller.ts` - Usa uazapiService
- `src/features/messages/controllers/messages.controller.ts` - Usa uazapiService
- `src/features/share/controllers/share.controller.ts` - Usa uazapiService

---

## ✅ Solução: Arquitetura de Orquestração

### Arquitetura Proposta

```
┌─────────────────────────────────────────────────────────────┐
│                    API REST (Igniter.js)                    │
│     /instances, /messages, /webhooks, etc.                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              ORQUESTRADOR (Orchestrator)                    │
│  - Seleciona provider com base em instance.brokerType       │
│  - Traduz requests/responses                                │
│  - Normaliza webhooks                                       │
│  - Cache e retry logic                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   ADAPTER    │ │   ADAPTER    │ │   ADAPTER    │
│   UAZapi     │ │  Evolution   │ │   Baileys    │
│              │ │     API      │ │              │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  UAZ API     │ │ Evolution    │ │   Baileys    │
│  External    │ │  External    │ │   Library    │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## 📦 Estrutura de Arquivos

### Nova Estrutura
```
src/lib/providers/
├── core/
│   ├── provider.interface.ts           # Interface base
│   ├── orchestrator.ts                 # Orquestrador principal
│   ├── provider.factory.ts             # Factory de providers
│   └── provider.types.ts               # Types compartilhados
│
├── adapters/
│   ├── uazapi/
│   │   ├── uazapi.adapter.ts           # Implementação UAZapi
│   │   ├── uazapi.client.ts            # Cliente HTTP UAZapi
│   │   ├── uazapi.mapper.ts            # Mapeamento de dados
│   │   └── uazapi.webhook.ts           # Normalização webhook
│   │
│   ├── evolution/
│   │   ├── evolution.adapter.ts        # Implementação Evolution
│   │   ├── evolution.client.ts
│   │   ├── evolution.mapper.ts
│   │   └── evolution.webhook.ts
│   │
│   └── baileys/
│       ├── baileys.adapter.ts          # Implementação Baileys
│       └── baileys.wrapper.ts
│
├── webhooks/
│   ├── webhook.normalizer.ts           # Normaliza todos webhooks
│   ├── webhook.router.ts               # Roteamento por provider
│   └── webhook.types.ts
│
└── index.ts                            # Exportações públicas
```

---

## 🔌 Interface Base de Provider

```typescript
/**
 * Interface base que TODOS os providers devem implementar
 */
export interface IWhatsAppProvider {
  // Identificação
  readonly name: string;
  readonly version: string;

  // Gerenciamento de Instância
  createInstance(data: CreateInstanceInput): Promise<InstanceResult>;
  deleteInstance(instanceId: string): Promise<void>;
  getInstanceStatus(instanceId: string): Promise<InstanceStatus>;

  // QR Code e Conexão
  generateQRCode(instanceId: string): Promise<QRCodeResult>;
  getPairingCode(instanceId: string): Promise<PairingCodeResult>;
  disconnect(instanceId: string): Promise<void>;
  restart(instanceId: string): Promise<void>;

  // Mensagens
  sendText(instanceId: string, data: SendTextInput): Promise<MessageResult>;
  sendImage(instanceId: string, data: SendImageInput): Promise<MessageResult>;
  sendVideo(instanceId: string, data: SendVideoInput): Promise<MessageResult>;
  sendAudio(instanceId: string, data: SendAudioInput): Promise<MessageResult>;
  sendDocument(instanceId: string, data: SendDocumentInput): Promise<MessageResult>;
  sendLocation(instanceId: string, data: SendLocationInput): Promise<MessageResult>;
  sendContact(instanceId: string, data: SendContactInput): Promise<MessageResult>;
  sendButtons(instanceId: string, data: SendButtonsInput): Promise<MessageResult>;
  sendList(instanceId: string, data: SendListInput): Promise<MessageResult>;

  // Mensagens Avançadas
  sendCarousel(instanceId: string, data: SendCarouselInput): Promise<MessageResult>;
  sendPoll(instanceId: string, data: SendPollInput): Promise<MessageResult>;

  // Chats e Contatos
  getChats(instanceId: string, filters?: ChatFilters): Promise<Chat[]>;
  getMessages(instanceId: string, chatId: string, filters?: MessageFilters): Promise<Message[]>;
  getContacts(instanceId: string): Promise<Contact[]>;

  // Webhooks
  configureWebhook(instanceId: string, url: string, events: string[]): Promise<void>;
  normalizeWebhook(rawWebhook: any): NormalizedWebhook;

  // Profile
  getProfilePicture(instanceId: string, number: string): Promise<string | null>;
  updateProfilePicture(instanceId: string, imageUrl: string): Promise<void>;

  // Health
  healthCheck(): Promise<boolean>;
}
```

---

## 🎨 Tipos Normalizados

```typescript
// ===== INSTÂNCIA =====
export interface CreateInstanceInput {
  name: string;
  phoneNumber?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
}

export interface InstanceResult {
  instanceId: string;
  token: string;
  status: InstanceStatus;
  qrCode?: string;
  pairingCode?: string;
}

export type InstanceStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'pairing'
  | 'connected'
  | 'error';

// ===== MENSAGENS =====
export interface SendTextInput {
  to: string;              // Formato: 5511999887766
  text: string;
  quotedMessageId?: string;
  delay?: number;
}

export interface SendImageInput {
  to: string;
  imageUrl: string;
  caption?: string;
  quotedMessageId?: string;
}

export interface SendCarouselInput {
  to: string;
  cards: CarouselCard[];
}

export interface CarouselCard {
  title: string;
  description?: string;
  imageUrl?: string;
  buttons?: CardButton[];
}

export interface MessageResult {
  messageId: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
}

// ===== WEBHOOKS =====
export interface NormalizedWebhook {
  event: WebhookEvent;
  instanceId: string;
  timestamp: Date;
  data: WebhookData;
}

export type WebhookEvent =
  | 'message.received'
  | 'message.sent'
  | 'message.updated'
  | 'instance.connected'
  | 'instance.disconnected'
  | 'instance.qr'
  | 'chat.created'
  | 'contact.updated';

export interface WebhookData {
  // Estrutura normalizada para todos providers
  chatId?: string;
  from?: string;
  to?: string;
  message?: {
    id: string;
    type: 'text' | 'image' | 'video' | 'audio' | 'document';
    content: string;
    mediaUrl?: string;
    timestamp: Date;
  };
  status?: InstanceStatus;
  qrCode?: string;
}
```

---

## 🔨 Implementação do Orquestrador

```typescript
/**
 * Orquestrador principal
 * Seleciona o provider correto e delega operações
 */
export class WhatsAppOrchestrator {
  private providers: Map<BrokerType, IWhatsAppProvider>;
  private cache: CacheService;

  constructor() {
    this.providers = new Map();
    this.registerProviders();
  }

  private registerProviders() {
    // Registrar providers disponíveis
    this.providers.set('uazapi', new UAZapiAdapter());
    this.providers.set('evolution', new EvolutionAdapter());
    // this.providers.set('baileys', new BaileysAdapter());
  }

  private getProvider(brokerType: BrokerType): IWhatsAppProvider {
    const provider = this.providers.get(brokerType);
    if (!provider) {
      throw new Error(`Provider ${brokerType} não está disponível`);
    }
    return provider;
  }

  // ===== INSTÂNCIAS =====
  async createInstance(
    brokerType: BrokerType,
    data: CreateInstanceInput
  ): Promise<InstanceResult> {
    const provider = this.getProvider(brokerType);
    return provider.createInstance(data);
  }

  async generateQRCode(
    instanceId: string,
    brokerType: BrokerType
  ): Promise<QRCodeResult> {
    const provider = this.getProvider(brokerType);

    // Cache de QR Code (válido por 2 minutos)
    const cacheKey = `qr:${instanceId}`;
    const cached = await this.cache.get<QRCodeResult>(cacheKey);
    if (cached) return cached;

    const result = await provider.generateQRCode(instanceId);
    await this.cache.set(cacheKey, result, 120); // 2 minutos

    return result;
  }

  // ===== MENSAGENS =====
  async sendText(
    instanceId: string,
    brokerType: BrokerType,
    data: SendTextInput
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);

    // Validação de número
    const validNumber = this.validatePhoneNumber(data.to);
    if (!validNumber) {
      throw new Error('Número de telefone inválido');
    }

    // Delay se configurado
    if (data.delay) {
      await this.sleep(data.delay);
    }

    return provider.sendText(instanceId, {
      ...data,
      to: validNumber,
    });
  }

  async sendCarousel(
    instanceId: string,
    brokerType: BrokerType,
    data: SendCarouselInput
  ): Promise<MessageResult> {
    const provider = this.getProvider(brokerType);

    // Validar provider suporta carousel
    if (!this.supportsFeature(brokerType, 'carousel')) {
      throw new Error(`Provider ${brokerType} não suporta carousel`);
    }

    return provider.sendCarousel(instanceId, data);
  }

  // ===== WEBHOOKS =====
  async normalizeWebhook(
    brokerType: BrokerType,
    rawWebhook: any
  ): Promise<NormalizedWebhook> {
    const provider = this.getProvider(brokerType);
    return provider.normalizeWebhook(rawWebhook);
  }

  // ===== HELPERS =====
  private supportsFeature(
    brokerType: BrokerType,
    feature: string
  ): boolean {
    const features: Record<BrokerType, string[]> = {
      uazapi: ['carousel', 'poll', 'list', 'buttons'],
      evolution: ['carousel', 'poll', 'buttons'],
      baileys: ['text', 'image', 'video'],
    };

    return features[brokerType]?.includes(feature) ?? false;
  }

  private validatePhoneNumber(number: string): string | null {
    // Validação e formatação de número
    const cleaned = number.replace(/\D/g, '');
    if (cleaned.length < 10) return null;
    return cleaned;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
export const orchestrator = new WhatsAppOrchestrator();
```

---

## 🔌 Adapter UAZapi (Exemplo)

```typescript
/**
 * Adapter para UAZapi
 * Implementa IWhatsAppProvider traduzindo para UAZ API
 */
export class UAZapiAdapter implements IWhatsAppProvider {
  readonly name = 'UAZapi';
  readonly version = '1.0';

  private client: UAZClient;

  constructor() {
    this.client = new UAZClient({
      baseUrl: process.env.UAZAPI_BASE_URL!,
      adminToken: process.env.UAZAPI_ADMIN_TOKEN!,
    });
  }

  async createInstance(data: CreateInstanceInput): Promise<InstanceResult> {
    const response = await this.client.createInstance({
      instanceName: data.name,
      webhook: data.webhookUrl,
      webhookEvents: data.webhookEvents,
    });

    return {
      instanceId: response.data.instanceId,
      token: response.data.token,
      status: this.mapStatus(response.data.status),
      qrCode: response.data.qrCode,
    };
  }

  async sendText(instanceId: string, data: SendTextInput): Promise<MessageResult> {
    const response = await this.client.sendMessage(instanceId, {
      number: data.to,
      text: data.text,
      delay: data.delay,
    });

    return {
      messageId: response.data.messageId,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  async sendCarousel(instanceId: string, data: SendCarouselInput): Promise<MessageResult> {
    // UAZapi não tem endpoint direto de carousel
    // Simular com múltiplas mensagens + lista

    const response = await this.client.sendList(instanceId, {
      number: data.to,
      title: 'Selecione uma opção',
      sections: data.cards.map(card => ({
        title: card.title,
        rows: card.buttons?.map(btn => ({
          title: btn.text,
          description: card.description,
        })) || [],
      })),
    });

    return {
      messageId: response.data.messageId,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  normalizeWebhook(rawWebhook: any): NormalizedWebhook {
    // UAZapi format:
    // { event: 'message', instanceId: 'xxx', data: {...} }

    return {
      event: this.mapEvent(rawWebhook.event),
      instanceId: rawWebhook.instanceId,
      timestamp: new Date(rawWebhook.timestamp),
      data: {
        chatId: rawWebhook.data.chatId,
        from: rawWebhook.data.from,
        message: rawWebhook.data.message ? {
          id: rawWebhook.data.message.id,
          type: rawWebhook.data.message.type,
          content: rawWebhook.data.message.body || rawWebhook.data.message.caption,
          mediaUrl: rawWebhook.data.message.mediaUrl,
          timestamp: new Date(rawWebhook.data.message.timestamp),
        } : undefined,
      },
    };
  }

  private mapStatus(uazStatus: string): InstanceStatus {
    const mapping: Record<string, InstanceStatus> = {
      'open': 'connected',
      'close': 'disconnected',
      'connecting': 'connecting',
      'qrReadSuccess': 'connected',
      'qrReadError': 'error',
    };
    return mapping[uazStatus] || 'disconnected';
  }

  private mapEvent(uazEvent: string): WebhookEvent {
    const mapping: Record<string, WebhookEvent> = {
      'message': 'message.received',
      'message.send': 'message.sent',
      'connection.update': 'instance.connected',
      'qr': 'instance.qr',
    };
    return mapping[uazEvent] || 'message.received';
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}
```

---

## 🔄 Refatoração dos Controllers

### ANTES (Acoplado):
```typescript
// ❌ Acoplado com UAZapi
import { uazapiService } from '@/lib/api/uazapi.service';

export const instancesController = igniter.controller({
  actions: {
    generateQR: igniter.mutation({
      handler: async ({ request, response }) => {
        const qrCode = await uazapiService.generateQRCode(instanceId);
        return response.success({ qrCode });
      },
    }),
  },
});
```

### DEPOIS (Desacoplado):
```typescript
// ✅ Desacoplado com Orquestrador
import { orchestrator } from '@/lib/providers/core/orchestrator';

export const instancesController = igniter.controller({
  actions: {
    generateQR: igniter.mutation({
      handler: async ({ request, response, context }) => {
        const instance = await db.instance.findUnique({
          where: { id: instanceId },
        });

        const result = await orchestrator.generateQRCode(
          instance.id,
          instance.brokerType // 'uazapi' | 'evolution' | 'baileys'
        );

        return response.success({ qrCode: result.qrCode });
      },
    }),
  },
});
```

---

## 📋 Checklist de Refatoração

### Fase 1: Estrutura Base (2-3 horas)
- [ ] Criar `src/lib/providers/core/provider.interface.ts`
- [ ] Criar `src/lib/providers/core/provider.types.ts`
- [ ] Criar `src/lib/providers/core/orchestrator.ts`
- [ ] Criar `src/lib/providers/core/provider.factory.ts`

### Fase 2: Adapter UAZapi (3-4 horas)
- [ ] Criar `src/lib/providers/adapters/uazapi/uazapi.adapter.ts`
- [ ] Criar `src/lib/providers/adapters/uazapi/uazapi.mapper.ts`
- [ ] Criar `src/lib/providers/adapters/uazapi/uazapi.webhook.ts`
- [ ] Migrar lógica de `src/lib/api/uazapi.service.ts` para adapter

### Fase 3: Sistema de Webhooks (2-3 horas)
- [ ] Criar `src/lib/providers/webhooks/webhook.normalizer.ts`
- [ ] Criar `src/lib/providers/webhooks/webhook.router.ts`
- [ ] Criar endpoint unificado `POST /api/v1/webhooks/:provider`
- [ ] Implementar normalização de webhooks

### Fase 4: Refatoração dos Controllers (4-5 horas)
- [ ] Refatorar `src/features/instances/controllers/instances.controller.ts`
- [ ] Refatorar `src/features/messages/controllers/messages.controller.ts`
- [ ] Refatorar `src/features/share/controllers/share.controller.ts`
- [ ] Atualizar todos imports e usos

### Fase 5: Testes (3-4 horas)
- [ ] Testes unitários do Orchestrator
- [ ] Testes unitários do UAZapi Adapter
- [ ] Testes de integração das APIs
- [ ] Testes E2E do fluxo completo

### Fase 6: Documentação (1-2 horas)
- [ ] Documentar arquitetura de providers
- [ ] Documentar como adicionar novo provider
- [ ] Atualizar UX Audit
- [ ] Criar guia de migração

**TOTAL ESTIMADO: 15-21 horas**

---

## 🎯 Benefícios da Refatoração

### 1. Escalabilidade
- ✅ Adicionar novo provider em 2-3 horas
- ✅ Múltiplos providers simultâneos
- ✅ A/B testing de providers

### 2. Manutenção
- ✅ Mudanças no UAZapi não quebram a aplicação
- ✅ Código isolado por provider
- ✅ Fácil debug e logging

### 3. Testes
- ✅ Mock de providers simplificado
- ✅ Testes independentes
- ✅ CI/CD robusto

### 4. Negócio
- ✅ Não depender de um único fornecedor
- ✅ Migração gradual entre providers
- ✅ Fallback automático

---

## 🚀 Próximos Passos

1. **Aprovação do Plano** ✅ (aguardando)
2. **Fase 1:** Criar estrutura base
3. **Fase 2:** Implementar UAZapi Adapter
4. **Fase 3:** Sistema de webhooks
5. **Fase 4:** Refatorar controllers
6. **Fase 5:** Testes completos
7. **Fase 6:** Documentação

---

## 📊 ROI da Refatoração

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Tempo para trocar provider | 40+ horas | 2-3 horas |
| Tempo para adicionar provider | N/A | 2-3 horas |
| Impacto de mudanças no provider | ALTO (toda app) | BAIXO (só adapter) |
| Testabilidade | Difícil | Fácil |
| Risco de vendor lock-in | ALTO | ZERO |

**INVESTIMENTO:** 15-21 horas
**RETORNO:** Economiza 40+ horas na primeira troca de provider

---

**Status:** 📋 Aguardando aprovação para iniciar implementação

**Próximo Passo:** Criar estrutura base e UAZapi Adapter
