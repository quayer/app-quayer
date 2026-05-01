# Skill: Integrações (UAZAPI, Instâncias, Webhooks)

## Quando carregar esta skill
Ao trabalhar com instâncias WhatsApp, conexões UAZAPI, webhooks, ou a página de integrações.

---

## Arquitetura Geral

```
UAZAPI (broker externo)
    ↕ HTTP (REST API)
instances.controller.ts     → CRUD de instâncias
    ↕ Prisma
Instance model (DB)
    ↕ Webhooks
webhooks.controller.ts      → Recebe eventos do UAZAPI
    ↕ Redis pub/sub
SSE → Frontend (real-time)
```

---

## Feature: instances/

```
src/features/instances/
├── controllers/
│   └── instances.controller.ts   # CRUD instâncias + UAZAPI
├── instances.repository.ts
├── instances.service.ts          # Lógica de negócio UAZAPI
└── index.ts
```

**Rota API:** `/api/v1/instances`

### Endpoints

| Método | Path | Ação |
|---|---|---|
| POST | `/api/v1/instances` | Criar instância |
| GET | `/api/v1/instances` | Listar instâncias da org |
| GET | `/api/v1/instances/:id` | Detalhe da instância |
| PATCH | `/api/v1/instances/:id` | Atualizar |
| DELETE | `/api/v1/instances/:id` | Deletar |
| POST | `/api/v1/instances/:id/connect` | Conectar (gerar QR) |
| POST | `/api/v1/instances/:id/disconnect` | Desconectar |

---

## Modelo Instance (Prisma)

```prisma
model Instance {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  phoneNumber    String?  // E.164 format: +5511999999999
  uazToken       String   // Token UAZAPI da instância
  uazInstanceId  String?  // ID no UAZAPI
  status         String   @default("disconnected") // connected|disconnected|connecting
  brokerType     String   @default("uazapi")
  webhookUrl     String?
  profilePicture String?
  profileName    String?
  maxInstances   Int      @default(1)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(...)
  chats          Chat[]
}
```

---

## UAZAPI — Configuração

```env
UAZAPI_URL=https://quayer.uazapi.com
UAZAPI_GLOBAL_TOKEN=cb10c0f4-4823-433b-8a9d-567f848b23e7  # Admin token
```

**Token por instância:** cada instância tem seu próprio `uazToken` armazenado no DB.

**Biblioteca de integração:** `src/lib/uaz/` — funções helper para chamadas UAZAPI.

---

## Limite de Instâncias por Org

```typescript
// Verificação no controller antes de criar
if (organization.instances.length >= organization.maxInstances) {
  return response.badRequest(
    `Limite atingido. Máximo: ${organization.maxInstances}`
  )
}
```

**Padrão:** `organization.maxInstances = 1` (free tier)
**Alterar via admin:** painel admin → organização → editar maxInstances

---

## Validação de Número de Telefone

```typescript
// Sempre validar antes de criar/conectar instância
const phoneValidation = validatePhoneNumber(phoneNumber)
// E.164: +5511999999999
// Função em: src/lib/validators/ ou src/features/instances/
```

---

## Feature: webhooks/

```
src/features/webhooks/
├── controllers/
│   └── webhooks.controller.ts
├── webhooks.repository.ts
├── webhooks.service.ts
└── index.ts
```

**Webhook UAZAPI → Sistema:**
- UAZAPI envia POST para URL configurada na instância
- Handler em `POST /api/v1/webhooks/[instanceId]` ou similar
- Processa evento → publica no Redis → SSE notifica cliente

**Webhook Sistema → Externo:**
- Org pode configurar webhooks próprios para receber eventos
- Gerenciado via admin panel → tab Webhooks na OrgSheet

---

## Frontend — Página de Integrações

```
src/app/integracoes/           # Hub principal
src/app/admin/integracoes/     # Visão admin (todas as orgs)
src/components/integrations/   # Componentes reutilizáveis
src/components/whatsapp/       # Componentes WhatsApp
```

**Estrutura da página:**
- Lista de instâncias com badges de status
- Filtros: all / connected / disconnected
- Modal criar instância
- OrgSheet com tabs: Detalhes, Instâncias, Webhooks
- Admin view: visão global de todas as orgs/instâncias

---

## organization-providers/

Feature que mapeia provedores por organização (ex: qual UAZAPI token usar).

```
src/features/organization-providers/
```

---

## Hooks Frontend

```typescript
// src/hooks/useInstance.ts
const { instance, isLoading } = useInstance(instanceId)

// src/hooks/useInstanceSSE.ts
useInstanceSSE(instanceId)  // SSE para status em tempo real

// src/hooks/useUazapiSSE.ts
useUazapiSSE()  // SSE para eventos UAZAPI
```

---

## Scripts de Debug

```bash
# Encontrar instância
node scripts/find-uzapi-instance.js

# Testar rotas UAZAPI
node scripts/test-uzapi-routes.js

# Testar envio de mensagem
npx ts-node scripts/debug-send-message.ts

# Verificar webhook ativo
npx ts-node scripts/enable-webhook.ts
```

---

## Bugs Conhecidos

- `connections/` feature desabilitada — era o sistema multi-canal legado
- Status da instância pode ficar desatualizado sem SSE ativo (Redis necessário)
- Token UAZAPI global vs token por instância: usar `instance.uazToken` nas chamadas, não o global
