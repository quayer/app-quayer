# Analise Profunda: Provedores & Integracoes

## Indice
1. [Arquitetura Atual](#1-arquitetura-atual)
2. [Problemas Identificados](#2-problemas-identificados)
3. [Proposta de Nova Arquitetura](#3-proposta-de-nova-arquitetura)
4. [Integrações a Remover/Reposicionar](#4-integracoes-a-removerreposicionar)
5. [Schema de Banco Proposto](#5-schema-de-banco-proposto)
6. [Fluxo de Uso das Credenciais](#6-fluxo-de-uso-das-credenciais)
7. [Implementacao](#7-implementacao)

---

## 1. Arquitetura Atual

### 1.1 Como as Credenciais Estao Armazenadas Hoje

| Provedor | Armazenamento | Multi-tenant | Multiplas Credenciais |
|----------|---------------|--------------|----------------------|
| OpenAI | `OPENAI_API_KEY` (env) | Nao | Nao |
| Redis | `REDIS_URL` (env) | Nao | Nao |
| PostgreSQL | `DATABASE_URL` (env) | Nao | Nao |
| UAZapi | `Connection.uazapiToken` (DB) | Sim | Sim (por conexao) |
| Whisper | Usa OpenAI acima | Nao | Nao |
| ElevenLabs | Hardcoded "Managed" | Nao | Nao |

### 1.2 Arquivos Principais

```
src/lib/media-processor/openai-media-processor.service.ts
  └── Linha 50: new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

src/services/redis.ts
  └── Linha 11: new Redis(process.env.REDIS_URL)

src/services/database.ts
  └── Usa DATABASE_URL do Prisma

prisma/schema.prisma
  └── IntegrationConfig (existe mas NAO usado pela UI)
  └── ConnectionSettings (overrides por instancia)
```

### 1.3 Modelo IntegrationConfig (Existente mas Nao Usado)

```prisma
model IntegrationConfig {
  id              String   @id @default(uuid())
  organizationId  String
  type            String   // OPENAI, ANTHROPIC, REDIS, SUPABASE, etc
  name            String
  isActive        Boolean  @default(true)
  apiKey          String?  // Encriptado
  apiSecret       String?
  apiUrl          String?
  webhookUrl      String?
  settings        Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

## 2. Problemas Identificados

### 2.1 Credenciais Fixas em Environment

**Problema:** OpenAI, Redis e PostgreSQL estao hardcoded em variaveis de ambiente.
- Todos os clientes usam a mesma API key do Quayer
- Nao ha isolamento de uso/billing entre organizacoes
- Se a key do Quayer atingir rate limit, afeta TODOS os clientes

**Impacto:**
- Cliente que quer usar sua propria chave OpenAI nao consegue
- Nao ha billing segregado por organizacao
- Single point of failure

### 2.2 Falta de Suporte a Multiplas Credenciais

**Problema:** Nao ha mecanismo para:
- Adicionar credencial de fallback (ex: se OpenAI falhar, usar Anthropic)
- Load balancing entre multiplas API keys
- Rotacao de credenciais sem downtime

### 2.3 Integrações Deslocadas na UI

**Problema:** A categoria "Tool Providers" contem:
- Google Calendar
- Google Sheets
- Google Docs

**Analise:** Estas NAO sao integrações de infraestrutura/provedor. Sao **MCP Tools** (Model Context Protocol) que o agente de IA pode usar. Devem estar em outra secao ou serem removidas desta pagina.

### 2.4 UI Nao Conectada ao Backend

**Problema:** A pagina de integracoes exibe provedores com status hardcoded:
```typescript
{ id: 'openai', connected: true, managedByQuayer: true }
```

Nao ha:
- CRUD real para configurar credenciais
- Validacao de API keys
- Teste de conexao

---

## 3. Proposta de Nova Arquitetura

### 3.1 Conceito BYOC (Bring Your Own Credentials)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    HIERARQUIA DE CREDENCIAIS                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Prioridade de Uso:                                                     │
│                                                                          │
│   1. ConnectionSettings (override por instancia WhatsApp)                │
│      └── Ex: Instancia "Vendas" usa modelo gpt-4o-mini                  │
│                                                                          │
│   2. OrganizationProvider (credencial da organizacao)                    │
│      └── Ex: Organizacao "ACME Corp" tem sua propria key OpenAI         │
│                                                                          │
│   3. SystemDefault (credencial do Quayer)                                │
│      └── Ex: Se organizacao nao configurou, usa key do Quayer           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Categorias de Provedores (Nova Organizacao)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🧠 AI/LLM PROVIDERS                                                     │
│  ├── OpenAI          [Configurar] [+ Adicionar Fallback]                │
│  ├── Anthropic       [Configurar]                                        │
│  ├── Google AI       [Configurar]                                        │
│  └── OpenRouter      [Configurar]                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  🎤 TRANSCRICAO (STT)                                                    │
│  ├── Whisper         [Usa OpenAI acima] ou [Configurar proprio]         │
│  ├── Deepgram        [Configurar]                                        │
│  └── AssemblyAI      [Configurar]                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  🔊 VOZ (TTS)                                                            │
│  ├── ElevenLabs      [Configurar]                                        │
│  ├── OpenAI TTS      [Usa OpenAI acima]                                 │
│  └── Google TTS      [Usa Google acima]                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  🗄️ INFRAESTRUTURA (BYOC)                                               │
│  ├── Redis                                                               │
│  │   ├── (○) Usar Quayer Redis (padrao, sem custos extras)              │
│  │   └── (●) Usar proprio Redis                                         │
│  │       ├── URL: redis://user:pass@host:port                           │
│  │       └── [Testar Conexao]                                           │
│  │                                                                       │
│  ├── Banco de Dados                                                      │
│  │   ├── (○) Usar Quayer Database (padrao)                              │
│  │   └── (●) Usar proprio PostgreSQL/Supabase                           │
│  │       ├── Connection String: postgresql://...                        │
│  │       ├── [x] Sincronizar schema automaticamente                     │
│  │       └── [Testar Conexao] [Migrar Dados]                            │
│  │                                                                       │
│  └── Storage (Arquivos/Midia)                                           │
│      ├── (○) Usar Quayer Storage (padrao)                               │
│      └── (●) Usar proprio S3/Supabase Storage                           │
│          ├── Provider: [AWS S3 | Supabase | Cloudflare R2]              │
│          ├── Bucket: ...                                                 │
│          └── [Testar Conexao]                                           │
├─────────────────────────────────────────────────────────────────────────┤
│  📍 SERVICOS AUXILIARES                                                  │
│  ├── Google Maps     [Configurar] (Geocoding)                           │
│  └── Email           [Configurar] (SendGrid/Resend/SMTP)                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Integracoes a Remover/Reposicionar

### 4.1 REMOVER da Pagina de Provedores

| Integracao | Motivo | Novo Local |
|------------|--------|------------|
| Google Calendar | E uma Tool para Agente IA | MCP Tools / Agente Config |
| Google Sheets | E uma Tool para Agente IA | MCP Tools / Agente Config |
| Google Docs | E uma Tool para Agente IA | MCP Tools / Agente Config |

### 4.2 Conceito Correto

```
Provedores de Infraestrutura       vs       Tools de Agente
─────────────────────────────              ─────────────────
OpenAI (LLM)                               Google Calendar
Redis (Cache)                              Google Sheets
PostgreSQL (Database)                      Notion
Supabase (BaaS)                            Slack
S3 (Storage)                               Trello
                                           CRM integrations

Onde se configura:                         Onde se configura:
/settings/organization/integrations        /agentes/[id]/tools
                                           ou
                                           /configuracoes/mcp-tools
```

---

## 5. Schema de Banco Proposto

### 5.1 Novo Modelo: OrganizationProvider

```prisma
// Substitui/Expande IntegrationConfig
model OrganizationProvider {
  id             String   @id @default(uuid())
  organizationId String

  // Tipo do provedor
  category       ProviderCategory  // AI, TRANSCRIPTION, TTS, INFRASTRUCTURE, AUXILIARY
  provider       String            // openai, anthropic, redis, supabase, etc

  // Configuracao
  isActive       Boolean  @default(true)
  isPrimary      Boolean  @default(false)  // Provedor principal da categoria
  priority       Int      @default(0)       // Para fallback ordering

  // Credenciais (encriptadas)
  credentials    Json     // { apiKey, apiSecret, apiUrl, etc }

  // Configuracoes especificas
  settings       Json?    // { model: "gpt-4o", maxTokens: 4096, etc }

  // Metadados
  lastTestedAt   DateTime?
  lastTestStatus String?   // success, failed, pending
  usageThisMonth Int       @default(0)  // Para tracking

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, category, provider, priority])
  @@index([organizationId, category])
  @@index([organizationId, isActive])
}

enum ProviderCategory {
  AI              // LLMs: openai, anthropic, google, openrouter
  TRANSCRIPTION   // STT: whisper, deepgram, assemblyai
  TTS             // Text-to-Speech: elevenlabs, openai-tts
  INFRASTRUCTURE  // redis, postgresql, supabase, s3
  AUXILIARY       // google-maps, email
}
```

### 5.2 Configuracao de Infraestrutura Propria

```prisma
// Expandir Organization com flags de infraestrutura
model Organization {
  // ... campos existentes ...

  // BYOC Flags
  useOwnRedis      Boolean @default(false)
  useOwnDatabase   Boolean @default(false)
  useOwnStorage    Boolean @default(false)

  // Providers configurados
  providers        OrganizationProvider[]
}
```

---

## 6. Fluxo de Uso das Credenciais

### 6.1 Service de Resolucao de Credenciais

```typescript
// src/lib/providers/credential-resolver.service.ts

class CredentialResolver {

  /**
   * Resolve a credencial a ser usada seguindo hierarquia:
   * 1. ConnectionSettings (override por instancia)
   * 2. OrganizationProvider (credencial da org)
   * 3. System Default (env vars do Quayer)
   */
  async resolve(
    category: ProviderCategory,
    provider: string,
    context: { organizationId: string; connectionId?: string }
  ): Promise<Credentials | null> {

    // 1. Verificar override por instancia
    if (context.connectionId) {
      const connectionSettings = await this.getConnectionSettings(context.connectionId);
      if (connectionSettings?.hasOverrideFor(provider)) {
        return connectionSettings.getCredentials(provider);
      }
    }

    // 2. Buscar provedor da organizacao
    const orgProvider = await this.db.organizationProvider.findFirst({
      where: {
        organizationId: context.organizationId,
        category,
        provider,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
    });

    if (orgProvider) {
      return this.decrypt(orgProvider.credentials);
    }

    // 3. Fallback para default do sistema
    return this.getSystemDefault(category, provider);
  }

  /**
   * Resolve com fallback automatico
   * Se o provedor primario falhar, tenta os alternativos
   */
  async resolveWithFallback(
    category: ProviderCategory,
    context: { organizationId: string }
  ): Promise<Credentials[]> {

    const providers = await this.db.organizationProvider.findMany({
      where: {
        organizationId: context.organizationId,
        category,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
    });

    if (providers.length === 0) {
      // Usar defaults do sistema
      return this.getSystemDefaults(category);
    }

    return providers.map(p => this.decrypt(p.credentials));
  }
}
```

### 6.2 Uso no OpenAI Media Processor

```typescript
// ANTES (hardcoded)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// DEPOIS (dinamico)
class OpenAIMediaProcessor {
  constructor(private credentialResolver: CredentialResolver) {}

  async transcribe(audio: Buffer, context: ProcessingContext) {
    const credentials = await this.credentialResolver.resolve(
      'AI',
      'openai',
      { organizationId: context.organizationId, connectionId: context.connectionId }
    );

    const openai = new OpenAI({ apiKey: credentials.apiKey });

    return openai.audio.transcriptions.create({
      file: audio,
      model: credentials.settings?.transcriptionModel || 'whisper-1',
    });
  }
}
```

### 6.3 Uso do Redis Proprio

```typescript
// src/services/redis.ts

class RedisService {
  private defaultClient: Redis;
  private orgClients: Map<string, Redis> = new Map();

  constructor(private db: PrismaClient) {
    this.defaultClient = new Redis(process.env.REDIS_URL);
  }

  async getClient(organizationId: string): Promise<Redis> {
    // Verificar se org usa Redis proprio
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
      include: {
        providers: {
          where: { category: 'INFRASTRUCTURE', provider: 'redis', isActive: true }
        }
      }
    });

    if (!org?.useOwnRedis || !org.providers[0]) {
      return this.defaultClient;
    }

    // Retornar cliente cacheado ou criar novo
    if (!this.orgClients.has(organizationId)) {
      const credentials = decrypt(org.providers[0].credentials);
      const client = new Redis(credentials.url);
      this.orgClients.set(organizationId, client);
    }

    return this.orgClients.get(organizationId)!;
  }
}
```

---

## 7. Implementacao

### 7.1 Fases

```
FASE 1 - Fundacao (Sprint 1)
├── [ ] Criar modelo OrganizationProvider no Prisma
├── [ ] Criar CredentialResolver service
├── [ ] Migrar IntegrationConfig existentes
└── [ ] Criar API CRUD para OrganizationProvider

FASE 2 - AI Providers (Sprint 2)
├── [ ] Implementar config OpenAI com multiplas keys
├── [ ] Implementar fallback OpenAI -> Anthropic
├── [ ] Refatorar OpenAIMediaProcessor para usar resolver
└── [ ] UI para configurar AI providers

FASE 3 - BYOC Infrastructure (Sprint 3)
├── [ ] Implementar Redis proprio por organizacao
├── [ ] Implementar PostgreSQL/Supabase proprio
├── [ ] Implementar Storage proprio (S3/Supabase)
└── [ ] UI para configurar infraestrutura BYOC

FASE 4 - Polish (Sprint 4)
├── [ ] Teste de conexao em tempo real na UI
├── [ ] Metricas de uso por provedor
├── [ ] Alertas de rate limit / falha
└── [ ] Migracao de dados entre provedores
```

### 7.2 Arquivos a Criar/Modificar

```
CRIAR:
src/lib/providers/credential-resolver.service.ts
src/features/organization-providers/
  ├── controllers/organization-providers.controller.ts
  ├── repositories/organization-providers.repository.ts
  └── index.ts
src/app/integracoes/settings/organization/integrations/
  ├── [provider]/page.tsx  (config individual)
  └── components/
      ├── ProviderConfigDialog.tsx
      ├── ConnectionTestButton.tsx
      └── FallbackOrderList.tsx

MODIFICAR:
prisma/schema.prisma (adicionar OrganizationProvider)
src/lib/media-processor/openai-media-processor.service.ts
src/services/redis.ts
src/services/database.ts (para suporte multi-tenant)
src/app/integracoes/settings/organization/integrations/page.tsx
```

---

## 8. Beneficios da Nova Arquitetura

| Beneficio | Descricao |
|-----------|-----------|
| **Isolamento de Billing** | Cada org usa sua propria API key, billing separado |
| **Resiliencia** | Fallback automatico entre provedores |
| **Flexibilidade** | Cliente escolhe qual provedor usar |
| **Compliance** | Dados podem ficar no banco do cliente (LGPD/GDPR) |
| **Performance** | Redis do cliente pode estar mais proximo |
| **Custos** | Cliente pode usar tier gratuito do proprio provedor |

---

## 9. UI Proposta

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Provedores & Integracoes                                        [?]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─ AI/LLM ────────────────────────────────────────────────────────┐    │
│  │                                                                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │    │
│  │  │   OpenAI    │  │  Anthropic  │  │  Google AI  │              │    │
│  │  │     ✓       │  │             │  │             │              │    │
│  │  │ [Gerenciar] │  │ [Conectar]  │  │ [Conectar]  │              │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │    │
│  │                                                                  │    │
│  │  [+ Adicionar provedor de fallback]                             │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─ Infraestrutura ────────────────────────────────────────────────┐    │
│  │                                                                  │    │
│  │  Redis                                                           │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │  (○) Usar Quayer Redis (recomendado)                     │   │    │
│  │  │      Gerenciado, sem configuracao necessaria             │   │    │
│  │  │                                                          │   │    │
│  │  │  (●) Usar meu proprio Redis                              │   │    │
│  │  │      ┌────────────────────────────────────────────────┐  │   │    │
│  │  │      │ redis://user:****@redis.exemplo.com:6379      │  │   │    │
│  │  │      └────────────────────────────────────────────────┘  │   │    │
│  │  │      [Testar Conexao ✓]                                  │   │    │
│  │  └──────────────────────────────────────────────────────────┘   │    │
│  │                                                                  │    │
│  │  Banco de Dados                                                  │    │
│  │  ┌──────────────────────────────────────────────────────────┐   │    │
│  │  │  (●) Usar Quayer Database                                │   │    │
│  │  │  (○) Usar meu Supabase/PostgreSQL                        │   │    │
│  │  └──────────────────────────────────────────────────────────┘   │    │
│  │                                                                  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Conclusao

A arquitetura proposta transforma o Quayer de um sistema com credenciais fixas para uma plataforma **BYOC (Bring Your Own Credentials)** onde:

1. **Organizacoes podem usar suas proprias credenciais** de AI, infraestrutura e servicos
2. **Fallback automatico** entre provedores para resiliencia
3. **Isolamento completo** de billing e dados
4. **Flexibilidade total** para compliance (LGPD, dados no Brasil, etc)

Isso posiciona o Quayer como uma plataforma enterprise-ready onde clientes tem controle total sobre seus recursos.
