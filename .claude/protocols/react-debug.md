# Protocolo ReAct — Investigação e Debug

## O que é este protocolo
Ciclo estruturado de Raciocínio + Ação para resolver bugs e implementar features sem erros.
Inspirado no padrão ReAct (Reasoning + Acting) do SandeClaw, adaptado para Claude Code.

---

## Ciclo ReAct

```
THOUGHT → ACTION → OBSERVATION → THOUGHT → ...→ FINAL ANSWER
```

**Nunca pular direto para ACTION sem THOUGHT.**
**Nunca fazer mais de 1 ACTION por ciclo.**

---

## Protocolo: Bug Fix

### Fase 1 — THOUGHT: Entender o Problema
Antes de tocar em qualquer arquivo:

1. **Qual é o erro exato?** (mensagem, stack trace, comportamento)
2. **Onde acontece?** (rota, componente, endpoint, função)
3. **Qual skill carregar?** (`auth.md`, `conversations.md`, `integrations.md`, `admin.md`, `igniter.md`)
4. **Hipótese inicial:** o que provavelmente está errado?

### Fase 2 — ACTION: Investigar (não editar ainda)
Ler arquivos relevantes na ordem:

```
1. Ler o arquivo onde o erro acontece
2. Ler imports/dependências suspeitas
3. Ler a skill do domínio (.claude/skills/)
4. Ler schema Prisma se for problema de dados
5. Checar middleware se for problema de auth/redirect
```

**Máximo 3-4 arquivos por ciclo. Se não encontrou, reformular THOUGHT.**

### Fase 3 — OBSERVATION: O que encontrei?
Documentar o achado:
- Qual é a causa raiz?
- É um bug de lógica, tipagem, integração ou dados?
- A fix está contida num arquivo ou afeta múltiplos?

### Fase 4 — ACTION: Aplicar Fix
Só agora editar. Seguindo a ordem:

```
1. Fix no arquivo principal
2. Atualizar tipos se necessário
3. Atualizar schema Zod se necessário
```

### Fase 5 — OBSERVATION: Verificar
- A fix compila sem erros TypeScript?
- A lógica está correta para todos os casos?
- Quebrou algum outro fluxo?

---

## Protocolo: Nova Feature

### Fase 1 — THOUGHT: Planejar
1. Carregar skill do domínio relevante
2. Mapear arquivos que serão criados/modificados
3. Identificar dependências (outros controllers, schemas, models)
4. Ordem de implementação (sempre: schema → model → repository → controller → frontend)

### Fase 2 — ACTION: Implementar na Ordem Correta

```
1. prisma/schema.prisma     → novo model (se necessário)
2. npx prisma migrate dev   → gerar migration
3. [feature].schemas.ts     → Zod schemas
4. [feature].interfaces.ts  → TypeScript types
5. [feature].repository.ts  → data access
6. [feature].controller.ts  → Igniter.js controller
7. src/igniter.router.ts    → registrar controller
8. Frontend components      → UI
9. Hooks                    → client-side state
```

**Nunca pular etapas. Cada etapa valida a anterior.**

### Fase 3 — OBSERVATION: Testar Cada Etapa
- Schema Prisma: `npx prisma validate`
- TypeScript: verificar erros no arquivo
- Controller: verificar que aparece no `igniter.schema.ts` após rebuild
- Frontend: verificar que tipos do client estão corretos

---

## Checklist Anti-Erros Comuns

### Auth & Autorização
- [ ] `authProcedure({ required: true })` no `use[]`
- [ ] Verificar `context.auth?.session?.user` antes de usar
- [ ] Multi-tenant: filtrar por `organizationId` em todas as queries

### Igniter.js
- [ ] Nunca editar `igniter.client.ts` ou `igniter.schema.ts` manualmente
- [ ] Registrar novo controller em `igniter.router.ts`
- [ ] `igniter.query` para GET, `igniter.mutation` para POST/PATCH/DELETE
- [ ] Zod schema no `body:` para mutations

### Prisma
- [ ] Sempre usar migration (`prisma migrate dev`) — nunca `db push` em produção
- [ ] Verificar `@@index` para campos filtrados frequentemente
- [ ] Relações: verificar `onDelete` cascade

### Frontend
- [ ] Server Component: `await api.*.query()` (direto)
- [ ] Client Component: `api.*.useQuery()` (hook)
- [ ] Nunca chamar hooks em Server Components

---

## Investigação de Bugs de Auth (401)

```
1. Verificar se token está sendo enviado (cookie ou header Authorization)
2. Verificar middleware — está interceptando a rota?
3. Verificar authProcedure — required: true?
4. Verificar JWT expiration — token expirado?
5. Verificar CORS — headers corretos?
```

---

## Investigação de Bugs de Integração UAZAPI

```
1. Verificar se instância existe no DB (instance.uazToken não nulo)
2. Verificar se UAZAPI_URL está configurado no .env
3. Testar endpoint UAZAPI diretamente (scripts/test-uzapi-routes.js)
4. Verificar status da instância (connected?)
5. Verificar formato do JID (5511999999999@c.us)
```

---

## Regras de Ouro

1. **Ler antes de editar** — sempre
2. **Uma mudança por vez** — não modificar 5 arquivos de uma vez sem validar
3. **Carregar skill do domínio** — economiza 70% do tempo de investigação
4. **Erro TypeScript = parar** — não ignorar, resolver antes de continuar
5. **Não assumir** — ler o código real, não imaginar como funciona
