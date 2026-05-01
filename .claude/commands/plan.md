---
description: Cria o plano técnico (stack, arquitetura, migrations) a partir de uma spec — baseado em spec-kit
argument-hint: "<slug da feature ou caminho da spec>"
---

# /plan — Plano técnico de implementação

Você é o **Technical Architect**. Sua tarefa é transformar a spec em um plano técnico concreto para o projeto **Quayer** (Next.js + Igniter.js + Prisma + Postgres/Supabase).

## Entrada do usuário
$ARGUMENTS

## Contexto obrigatório a carregar
1. Leia `CLAUDE.md` — **ordem de implementação obrigatória**: `schema Prisma → migration → Zod schema → interfaces → repository → controller → router → frontend`
2. Leia a spec em `specs/<slug>/spec.md` — **se não existir, pare e peça para rodar `/spec` primeiro**
3. Leia `prisma/schema.prisma` para entender modelos existentes
4. Leia `src/igniter.router.ts` para entender controllers já registrados
5. Carregue a skill do módulo afetado em `.claude/skills/`

## Saída esperada
Crie/atualize `specs/<slug-da-feature>/plan.md` com:

### 1. Stack & dependências
- Libs já no projeto que serão usadas
- **Novas libs** necessárias (justifique cada uma) — se houver, listar em "Aprovação necessária"

### 2. Modelo de dados
- Novos modelos Prisma (nome, campos, relações, índices)
- Migrations necessárias (não executar, só descrever)
- Impacto multi-tenant: como `organizationId` será aplicado

### 3. API (Igniter.js)
- Módulo alvo (`src/server/<modulo>/features/<feature>/`)
- Controllers e actions (`query` / `mutation`)
- Zod schemas de entrada
- Procedures necessárias (`authProcedure`, `turnstileProcedure`, etc.)

### 4. Frontend
- Rotas Next.js afetadas (`src/app/...`)
- Componentes a criar/modificar (`src/client/components/...`)
- Server Components vs Client Components
- Estados de loading/erro/empty

### 5. Segurança
- Autenticação obrigatória? (`authProcedure({ required: true })`)
- Permissões/roles envolvidos
- Validação de input (Zod)
- Rate limiting / CSRF / Turnstile

### 6. Observabilidade
- Logs estruturados
- Auditoria (tabela `audit_logs`?)
- Métricas/eventos

### 7. Testes
- Unit (Vitest) — quais funções
- E2E (Playwright) — quais fluxos
- Fixtures necessárias

### 8. Riscos & alternativas
- Decisões técnicas com trade-offs
- Alternativas consideradas e rejeitadas

### 9. Aprovação necessária
Lista itens que o CLAUDE.md exige aprovação antes de executar:
- [ ] Mudanças em `prisma/schema.prisma`
- [ ] Mudanças em `src/middleware.ts`
- [ ] Novas dependências npm
- [ ] Deleção de arquivos

## Regras
- **Não** escreva código ainda — só o plano
- **Não** rode `prisma migrate` nem `npm install`
- Se a spec tiver "perguntas em aberto" não resolvidas, **pare** e peça clarificação
- Ao terminar, sugira o próximo passo: `/break`
