# Skill: Igniter.js — Padrões do Projeto

## Quando carregar esta skill
Ao trabalhar em qualquer feature backend, criar controllers, procedures, schemas ou integrar o client.

---

## Stack Central

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 + Igniter.js |
| API Layer | Igniter.js controllers (feature-based) |
| Database | Prisma + PostgreSQL |
| Cache/Pub-sub | Redis (`@igniter-js/adapter-redis`) |
| Background Jobs | BullMQ (`@igniter-js/adapter-bullmq`) |
| Validação | Zod |
| Client | Auto-gerado em `src/igniter.client.ts` |

---

## Estrutura Obrigatória de Feature

```
src/features/[feature]/
├── controllers/
│   └── [feature].controller.ts    # igniter.controller({})
├── procedures/
│   └── [feature].procedure.ts     # igniter.procedure({})
├── repositories/
│   └── [feature].repository.ts    # class com PrismaClient
├── [feature].schemas.ts            # Zod schemas
├── [feature].interfaces.ts         # TypeScript types
└── index.ts                        # exports públicos
```

---

## Padrão: Controller

```typescript
export const featureController = igniter.controller({
  name: 'feature',
  path: '/feature',
  actions: {
    list: igniter.query({
      path: '/',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user
        if (!user) return response.unauthorized()
        return response.success({ data: [] })
      }
    }),
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: createFeatureSchema,
      handler: async ({ request, response, context }) => {
        return response.success(result)
      }
    }),
  }
})
```

**Regras:**
- `igniter.query` = GET (leitura)
- `igniter.mutation` = POST/PATCH/DELETE (escrita)
- `use: [authProcedure({ required: true })]` em todas as rotas protegidas
- `context.auth?.session?.user` para acessar usuário autenticado

---

## Padrão: Procedure (Middleware de Contexto)

```typescript
export const featureProcedure = igniter.procedure({
  name: 'FeatureProcedure',
  handler: async (options, ctx): Promise<ExtendedCtx | Response> => {
    const { request, response, context } = ctx
    // Valida, autoriza, busca dados
    return { feature: { data: value } }  // merge no context
  }
})
```

**Como funciona:** o retorno do procedure é merged no `context` do handler seguinte.

---

## Padrão: Repository

```typescript
export class FeatureRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.feature.findUnique({ where: { id } })
  }
  async create(data: CreateInput) {
    return this.prisma.feature.create({ data })
  }
}
```

**Instanciar no handler:** `const repo = new FeatureRepository(context.db)`

---

## Auth Procedure — Contexto Disponível

Sempre que `authProcedure` está no `use[]`, o contexto expõe:

```typescript
context.auth.session.user      // User completo do DB
context.auth.session.user.id   // ID do usuário
context.auth.session.user.role // 'admin' | 'user'
context.auth.repository        // AuthRepository instance
context.db                     // PrismaClient (sempre disponível)
```

**organizationId:** obtido via `context.auth?.session?.user?.currentOrgId` ou header `x-current-org-id`.

---

## Client — Como Usar

```typescript
// Server Component (RSC)
const data = await api.feature.list.query()

// Client Component
const { data, isLoading } = api.feature.list.useQuery()
const { mutate, isPending } = api.feature.create.useMutation()
```

**Arquivo gerado automaticamente:** `src/igniter.client.ts` — NUNCA editar manualmente.
**Schema gerado:** `src/igniter.schema.ts` — NUNCA editar manualmente.

---

## Registrar Controller no Router

Arquivo: `src/igniter.router.ts`

```typescript
export const AppRouter = igniter.router({
  controllers: {
    auth: authController,
    instances: instancesController,
    chats: chatsController,
    messages: messagesController,
    // ... novo controller aqui
    feature: featureController,
  }
})
```

---

## Response Helpers

```typescript
response.success(data)           // 200
response.created(data)           // 201
response.badRequest(message)     // 400
response.unauthorized(message)   // 401
response.forbidden(message)      // 403
response.notFound(message)       // 404
response.serverError(message)    // 500
```

---

## Zod Schemas — Convenções

```typescript
// Sempre em [feature].schemas.ts
export const createFeatureSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  organizationId: z.string().uuid(),
})
export type CreateFeatureInput = z.infer<typeof createFeatureSchema>
```

---

## Serviços Core (não modificar)

| Arquivo | Export | Uso |
|---|---|---|
| `src/services/database.ts` | `database` | Prisma singleton (Proxy lazy) |
| `src/services/store.ts` | `store` | Redis adapter |
| `src/services/jobs.ts` | `REGISTERED_JOBS` | BullMQ adapter |
| `src/services/logger.ts` | `logger` | Logging |
| `src/igniter.ts` | `igniter` | Instância central do framework |

---

## Multi-tenancy — Regra de Ouro

**Sempre** filtrar por `organizationId` em queries de dados de negócio:

```typescript
await context.db.instance.findMany({
  where: { organizationId: user.currentOrgId }
})
```

Verificar que o usuário pertence à organização antes de operar.

---

## Bugs Conhecidos / Gotchas

- `connections/` feature está **desabilitada** (comentada em index.ts) — precisa migrar para `igniter.controller()`
- `igniter.client.ts` e `igniter.schema.ts` são auto-gerados — editar o router e regenerar
- `context.db` e `context.services.database` apontam para o mesmo Prisma singleton
