# Oportunidades de Melhoria - Webhooks & Sessões

## Sumário
1. [Geocoding para Mensagens de Localização](#1-geocoding-para-mensagens-de-localização)
2. [Configurações Avançadas por Instância](#2-configurações-avançadas-por-instância)
3. [Melhorias na Página de Sessões](#3-melhorias-na-página-de-sessões)
4. [Configuração de Concatenação Avançada](#4-configuração-de-concatenação-avançada)

---

## 1. Geocoding para Mensagens de Localização

### Problema Atual
Quando cliente envia localização via WhatsApp, o sistema recebe apenas latitude/longitude. O usuário precisa manualmente buscar o endereço.

### Solução Proposta
Integrar Google Geocoding API para automaticamente resolver endereços quando receber mensagens de localização.

### Arquitetura

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│   Webhook    │───▶│ Normalizer   │───▶│ Geocoding Service│
│ (location)   │    │              │    │ (Google Maps API)│
└──────────────┘    └──────────────┘    └──────────────────┘
                                               │
                                               ▼
                              ┌────────────────────────────┐
                              │ NormalizedWebhook.data     │
                              │ ├─ latitude: -23.5505      │
                              │ ├─ longitude: -46.6333     │
                              │ ├─ address: "Av. Paulista" │
                              │ ├─ city: "São Paulo"       │
                              │ ├─ state: "SP"             │
                              │ └─ country: "Brasil"       │
                              └────────────────────────────┘
```

### Implementação

#### 1.1 Novo Serviço de Geocoding

**Arquivo:** `src/lib/geocoding/geocoding.service.ts`

```typescript
/**
 * Geocoding Service
 *
 * Integração com Google Maps Geocoding API
 * Resolve latitude/longitude para endereço completo
 */

export interface GeocodedAddress {
  formattedAddress: string;
  streetNumber?: string;
  route?: string;         // Nome da rua
  neighborhood?: string;  // Bairro
  city?: string;
  state?: string;
  stateCode?: string;     // SP, RJ, etc.
  country?: string;
  countryCode?: string;   // BR, US, etc.
  postalCode?: string;
  latitude: number;
  longitude: number;
}

export interface GeocodingConfig {
  enabled: boolean;
  apiKey: string;
  language?: string;      // 'pt-BR'
  timeout?: number;       // ms
  cacheEnabled?: boolean;
  cacheTTL?: number;      // segundos
}

class GeocodingService {
  private cache: Map<string, { address: GeocodedAddress; expiresAt: number }>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Resolver latitude/longitude para endereço
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
    config?: Partial<GeocodingConfig>
  ): Promise<GeocodedAddress | null> {
    const apiKey = config?.apiKey || process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.warn('[Geocoding] API key not configured');
      return null;
    }

    // Check cache
    const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log('[Geocoding] Cache hit for', cacheKey);
      return cached.address;
    }

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('latlng', `${latitude},${longitude}`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('language', config?.language || 'pt-BR');

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(config?.timeout || 5000),
      });

      const data = await response.json();

      if (data.status !== 'OK' || !data.results?.[0]) {
        console.warn('[Geocoding] No results for', cacheKey, data.status);
        return null;
      }

      const result = data.results[0];
      const address = this.parseGoogleResult(result, latitude, longitude);

      // Cache result
      const cacheTTL = config?.cacheTTL || 3600; // 1 hour default
      this.cache.set(cacheKey, {
        address,
        expiresAt: Date.now() + cacheTTL * 1000,
      });

      console.log('[Geocoding] Resolved:', address.formattedAddress);
      return address;

    } catch (error) {
      console.error('[Geocoding] Error:', error);
      return null;
    }
  }

  private parseGoogleResult(result: any, lat: number, lng: number): GeocodedAddress {
    const components = result.address_components || [];

    const getComponent = (type: string) => {
      const comp = components.find((c: any) => c.types.includes(type));
      return comp?.long_name;
    };

    const getShortComponent = (type: string) => {
      const comp = components.find((c: any) => c.types.includes(type));
      return comp?.short_name;
    };

    return {
      formattedAddress: result.formatted_address,
      streetNumber: getComponent('street_number'),
      route: getComponent('route'),
      neighborhood: getComponent('sublocality_level_1') || getComponent('neighborhood'),
      city: getComponent('administrative_area_level_2') || getComponent('locality'),
      state: getComponent('administrative_area_level_1'),
      stateCode: getShortComponent('administrative_area_level_1'),
      country: getComponent('country'),
      countryCode: getShortComponent('country'),
      postalCode: getComponent('postal_code'),
      latitude: lat,
      longitude: lng,
    };
  }

  /**
   * Limpar cache expirado
   */
  cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }
}

export const geocodingService = new GeocodingService();
```

#### 1.2 Integração no Webhook Handler

**Modificar:** `src/app/api/v1/webhooks/[provider]/route.ts`

```typescript
import { geocodingService } from '@/lib/geocoding/geocoding.service';

async function processIncomingMessage(webhook: NormalizedWebhook, provider: BrokerType): Promise<void> {
  // ... código existente ...

  // 🗺️ GEOCODING - Resolver endereço para mensagens de localização
  if (message.type === 'location' && message.latitude && message.longitude) {
    console.log(`[Webhook] Location message received - resolving address`);

    try {
      const address = await geocodingService.reverseGeocode(
        message.latitude,
        message.longitude
      );

      if (address) {
        // Enriquecer mensagem com dados de endereço
        message.address = address.formattedAddress;
        message.city = address.city;
        message.state = address.state;
        message.neighborhood = address.neighborhood;
        message.postalCode = address.postalCode;

        console.log(`[Webhook] Address resolved: ${address.formattedAddress}`);
      }
    } catch (geoError) {
      console.error('[Webhook] Geocoding failed (non-blocking):', geoError);
    }
  }

  // ... resto do código ...
}
```

#### 1.3 Schema Prisma - Novos Campos

```prisma
model Message {
  // ... campos existentes ...

  // Location Data (quando type = 'location')
  latitude       Float?
  longitude      Float?
  locationName   String?      // Nome do local enviado pelo usuário

  // Geocoded Address (preenchido automaticamente)
  geoAddress       String?    // Endereço completo formatado
  geoNeighborhood  String?    // Bairro
  geoCity          String?    // Cidade
  geoState         String?    // Estado
  geoPostalCode    String?    // CEP
  geoCountry       String?    // País
}
```

#### 1.4 Variáveis de Ambiente

```env
# Google Maps Geocoding API
GOOGLE_MAPS_API_KEY=AIzaSy...
GEOCODING_ENABLED=true
GEOCODING_CACHE_TTL=3600
```

---

## 2. Configurações Avançadas por Instância

### Problema Atual
Configurações de transcrição, descrição de imagens e concatenação são globais ou fixas por organização. Master não consegue configurar por instância.

### Solução Proposta
Criar sistema de configurações hierárquico:
```
Sistema (Default) → Organização → Instância
```

### Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│ HIERARQUIA DE CONFIGURAÇÕES                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  System Defaults (env vars)                                 │
│       ↓ override                                            │
│  Organization Settings                                      │
│       ↓ override                                            │
│  Instance Settings (mais específico)                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Schema Prisma - Instance Settings

```prisma
model Instance {
  // ... campos existentes ...

  // ===== CONFIGURAÇÕES AVANÇADAS =====
  settings  InstanceSettings?
}

model InstanceSettings {
  id          String   @id @default(uuid())
  instanceId  String   @unique

  // Concatenação de Mensagens
  concatEnabled       Boolean  @default(true)
  concatTimeoutMs     Int      @default(8000)    // 8 segundos
  concatMaxMessages   Int      @default(10)
  concatSameType      Boolean  @default(false)   // false = concat tudo junto
  concatSameSender    Boolean  @default(true)    // apenas mesmo remetente

  // Transcrição & IA
  transcriptionEnabled    Boolean  @default(true)
  imageDescriptionEnabled Boolean  @default(true)
  documentAnalysisEnabled Boolean  @default(true)
  videoTranscriptionEnabled Boolean @default(true)

  // Geocoding
  geocodingEnabled    Boolean  @default(true)
  geocodingApiKey     String?  // Se vazio, usa da organização ou sistema

  // AI Models (override)
  transcriptionModel  String?  // whisper-1
  visionModel         String?  // gpt-4o
  analysisModel       String?  // gpt-4o

  // AI Prompts (override)
  imagePrompt         String?  @db.Text
  audioPrompt         String?  @db.Text
  documentPrompt      String?  @db.Text
  videoPrompt         String?  @db.Text

  // WhatsApp 24h Window
  enforceWhatsAppWindow  Boolean  @default(true)
  templateFallbackEnabled Boolean @default(false)

  // Bot Echo Detection
  botEchoEnabled      Boolean  @default(true)
  botSignature        String?  // Custom signature (default: \u200B\u200C\u200D)

  // Auto-Pause
  autoPauseOnHumanReply Boolean @default(true)
  autoPauseDurationHours Int    @default(24)

  // Comandos via Chat
  commandsEnabled     Boolean  @default(true)
  commandPrefix       String   @default("@")     // @fechar, @pausar

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  instance  Instance @relation(fields: [instanceId], references: [id], onDelete: Cascade)

  @@index([instanceId])
}
```

### UI para Configurações

**Página:** `/admin/instancias/[id]/configuracoes`

```
┌─────────────────────────────────────────────────────────────┐
│ Configurações Avançadas - [Nome da Instância]               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 📝 CONCATENAÇÃO DE MENSAGENS                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✓ Ativar concatenação                                   │ │
│ │                                                         │ │
│ │ Timeout: [====8s====] 5-15s                            │ │
│ │ Máximo de mensagens: [10] por bloco                    │ │
│ │                                                         │ │
│ │ ○ Concatenar apenas mesmo tipo                         │ │
│ │ ● Concatenar TUDO junto (recomendado para IA)          │ │
│ │                                                         │ │
│ │ ✓ Apenas mesmo remetente                               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 🤖 TRANSCRIÇÃO & IA                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✓ Descrição de Imagens      Modelo: [gpt-4o     ▼]     │ │
│ │ ✓ Transcrição de Áudio      Modelo: [whisper-1 ▼]      │ │
│ │ ✓ Análise de Documentos     Modelo: [gpt-4o     ▼]     │ │
│ │ ✓ Transcrição de Vídeo      Modelo: [whisper-1 ▼]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 🗺️ GEOCODING (Localização)                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✓ Resolver endereço automaticamente                    │ │
│ │                                                         │ │
│ │ API Key: [••••••••••••••••] (ou usar da organização)   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ⏸️ AUTO-PAUSE                                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✓ Pausar IA quando humano responder                    │ │
│ │                                                         │
│ │ Duração do pause: [24] horas                           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 💬 COMANDOS VIA CHAT                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✓ Habilitar comandos                                   │ │
│ │                                                         │ │
│ │ Prefixo: [@]                                           │ │
│ │                                                         │ │
│ │ Comandos disponíveis:                                  │ │
│ │ • @fechar - Fecha a sessão                            │ │
│ │ • @pausar [h] - Pausa IA por X horas                  │ │
│ │ • @reabrir - Reativa a IA                             │ │
│ │ • @blacklist - Bypass permanente                       │ │
│ │ • @whitelist - Remove bypass                           │ │
│ │ • @transferir [id] - Transfere sessão                 │ │
│ │ • @status - Mostra status                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                            [Restaurar Padrões] [Salvar]     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Melhorias na Página de Sessões

### Estado Atual
A página mostra: ID, Contato, Telefone, Organização, Integração, Status, Iniciada por, Criada em, Mensagens

### Melhorias Propostas

#### 3.1 Novos Campos Visíveis

| Campo | Descrição | Valor |
|-------|-----------|-------|
| **Última Mensagem** | Timestamp da última mensagem | "há 5 min" |
| **Duração** | Tempo desde criação | "2h 30m" |
| **Janela WhatsApp** | Status da janela 24h | 🟢 Ativa (22h restantes) |
| **IA Status** | Status da IA | 🤖 Ativa / ⏸️ Pausada |
| **Tags** | Tabulações/tags aplicadas | Badge colorido |
| **Atendente** | Quem está atendendo | Avatar + nome |

#### 3.2 Filtros Avançados

```
┌─────────────────────────────────────────────────────────────┐
│ FILTROS AVANÇADOS                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Status         [x] OPEN [x] WAITING [ ] CLOSED [ ] EXPIRED │
│                                                             │
│ Janela 24h     [x] Ativa [ ] Expirada [ ] Sem janela       │
│                                                             │
│ IA             [ ] Ativa [x] Pausada [ ] Bloqueada         │
│                                                             │
│ Atendente      [ Todos ▼ ]                                  │
│                                                             │
│ Tags           [ Selecionar... ▼ ]                          │
│                                                             │
│ Período        [Últimas 24h ▼]                              │
│                                                             │
│ Ordenar por    [Última mensagem ▼] [ ] Decrescente         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3 Ações em Lote

```
┌─────────────────────────────────────────────────────────────┐
│ ☑ 15 sessões selecionadas                                   │
│                                                             │
│ [Fechar Todas] [Pausar IA] [Atribuir para...] [Exportar]   │
└─────────────────────────────────────────────────────────────┘
```

#### 3.4 Vista Alternativa - Kanban

```
┌─────────────────────────────────────────────────────────────┐
│ ABERTAS (12)    │ AGUARDANDO (5)  │ EM ATENDIMENTO (8)     │
├─────────────────┼─────────────────┼────────────────────────┤
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────────────┐│
│ │ João Silva  │ │ │ Maria Costa│ │ │ Pedro Santos        ││
│ │ (19) 99212..│ │ │ "Aguardando│ │ │ 🤖 IA respondendo   ││
│ │ há 2 min    │ │ │ retorno"   │ │ │ 3 mensagens         ││
│ │ 💬 1 msg    │ │ │ há 15 min  │ │ │ há 30 seg           ││
│ └─────────────┘ │ └─────────────┘ │ └─────────────────────┘│
│ ┌─────────────┐ │                 │                        │
│ │ Ana Oliveira│ │                 │                        │
│ │ ...         │ │                 │                        │
│ └─────────────┘ │                 │                        │
└─────────────────┴─────────────────┴────────────────────────┘
```

#### 3.5 Indicadores Visuais

| Indicador | Ícone | Significado |
|-----------|-------|-------------|
| Janela 24h Ativa | 🟢 | Pode enviar mensagens livres |
| Janela 24h Expirando | 🟡 | Menos de 2h restantes |
| Janela 24h Expirada | 🔴 | Precisa de template |
| IA Ativa | 🤖 | Bot respondendo |
| IA Pausada | ⏸️ | Humano atendendo |
| IA Bloqueada | 🚫 | Bypass ativo |
| Nova Mensagem | 💬 | Mensagem não lida |
| Mídia | 📎 | Última msg é mídia |
| Localização | 📍 | Última msg é localização |

#### 3.6 Preview da Última Mensagem

```
┌─────────────────────────────────────────────────────────────┐
│ ID: 0918f0cc...                                             │
│                                                             │
│ 👤 João Silva                                               │
│ 📱 (19) 99212-4268                                          │
│                                                             │
│ Última mensagem: "Olá, gostaria de saber sobre..."         │
│ há 2 minutos                                                │
│                                                             │
│ 🟢 Janela: 22h restantes | 🤖 IA: Ativa | 💬 5 msgs         │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Configuração de Concatenação Avançada

### Estado Atual
Configuração via variáveis de ambiente globais.

### Melhorias Propostas

Mover para configuração por Instância/Organização com UI intuitiva:

```typescript
// Configuração completa de concatenação
interface ConcatConfig {
  enabled: boolean;

  // Timing
  timeoutMs: number;        // 5000-15000ms recomendado

  // Limites
  maxMessages: number;      // 10-20 recomendado
  maxTotalLength: number;   // Caracteres máximos do bloco

  // Comportamento
  sameTypeOnly: boolean;    // true = texto com texto, mídia com mídia
  sameSenderOnly: boolean;  // true = apenas mesmo contato (sempre recomendado)

  // Formatação
  formatTimestamps: boolean; // [14:30] Mensagem 1
  separator: string;         // "\n" ou " | " ou customizado

  // Triggers de finalização
  triggerOnMedia: boolean;  // Finaliza bloco quando recebe mídia
  triggerOnLocation: boolean; // Finaliza quando recebe localização
  triggerKeywords: string[]; // ["urgente", "ajuda"] finaliza imediatamente
}
```

### UI de Configuração

```
┌─────────────────────────────────────────────────────────────┐
│ CONCATENAÇÃO DE MENSAGENS                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 📝 Como funciona:                                           │
│ Quando um contato envia várias mensagens em sequência       │
│ rápida, o sistema aguarda um tempo antes de processar,      │
│ agrupando todas em uma única mensagem concatenada.          │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ ⏱️ TIMING                                                    │
│                                                             │
│ Timeout de espera:                                          │
│ [====●====] 8 segundos                                      │
│ 5s                               15s                        │
│ └─ Rápido (mais responsivo)      └─ Lento (mais agrupamento)│
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 📊 LIMITES                                                   │
│                                                             │
│ Máximo de mensagens por bloco: [10]                         │
│ Máximo de caracteres: [5000]                                │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 🔧 COMPORTAMENTO                                             │
│                                                             │
│ Modo de concatenação:                                       │
│ ○ Apenas mesmo tipo (texto+texto, mídia+mídia)              │
│ ● Concatenar TUDO junto ✨ Recomendado para IA              │
│   Todo conteúdo é concatenado em um único contexto          │
│                                                             │
│ ✓ Apenas mesmo remetente (sempre recomendado)               │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 🎯 TRIGGERS DE FINALIZAÇÃO                                   │
│                                                             │
│ Finalizar bloco imediatamente quando receber:               │
│ ✓ Mídia (imagem, áudio, vídeo, documento)                   │
│ ✓ Localização                                               │
│ ○ Palavras-chave: [urgente, ajuda, socorro]                 │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 📋 FORMATAÇÃO                                                │
│                                                             │
│ ✓ Incluir timestamps                                        │
│   Exemplo: [14:30] Olá, tudo bem?                           │
│            [14:30] Preciso de ajuda                         │
│            [14:31] É urgente!                               │
│                                                             │
│ Separador entre mensagens:                                  │
│ ● Quebra de linha (\n)                                      │
│ ○ Pipe (|)                                                  │
│ ○ Customizado: [___________]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Priorização Sugerida

| Melhoria | Impacto | Esforço | Prioridade |
|----------|---------|---------|------------|
| Geocoding | Alto (UX) | Médio | 🔴 P1 |
| Filtros Sessões | Alto (Produtividade) | Baixo | 🔴 P1 |
| Configurações por Instância | Alto (Flexibilidade) | Alto | 🟡 P2 |
| Kanban View | Médio (UX) | Médio | 🟡 P2 |
| Ações em Lote | Médio (Produtividade) | Baixo | 🟡 P2 |
| Config Concatenação UI | Baixo | Médio | 🟢 P3 |

---

## Estimativa de Implementação

| Feature | Horas Estimadas |
|---------|-----------------|
| Geocoding Service + Integration | 4h |
| Instance Settings Schema + CRUD | 6h |
| UI Configurações Avançadas | 8h |
| Melhorias Página Sessões | 6h |
| Filtros Avançados | 4h |
| Ações em Lote | 4h |
| Kanban View | 8h |
| **TOTAL** | **~40h** |

---

*Documento gerado em: 21/12/2025*
*Autor: Claude Code Agent*
