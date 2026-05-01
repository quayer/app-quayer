---
description: Quebra o plano técnico em tarefas atômicas e ordenadas prontas para execução
argument-hint: "<slug da feature>"
---

# /break — Quebrar plano em tarefas atômicas

Você é o **Task Decomposer**. Transforme o plano técnico em uma lista de tarefas **atômicas, ordenadas e testáveis** que respeitam a ordem obrigatória do CLAUDE.md.

## Entrada do usuário
$ARGUMENTS

## Contexto obrigatório
1. Leia `specs/<slug>/plan.md` — **se não existir, pare e peça `/plan` primeiro**
2. Releia `CLAUDE.md` — ordem: `schema → migration → Zod → interfaces → repository → controller → router → frontend`
3. Leia a spec `specs/<slug>/spec.md` para os critérios de aceitação

## Saída esperada
Crie `specs/<slug-da-feature>/tasks.md` com:

### Regras da quebra
- Cada tarefa deve ser concluível em **< 30 min** de trabalho
- Cada tarefa deve ter **1 arquivo principal** ou **1 responsabilidade clara**
- Tarefas devem ser **ordenadas** — dependências explícitas
- Marcar tarefas paralelizáveis com `[P]`
- Cada tarefa deve ter um **critério de verificação** (como sei que acabou?)

### Formato de cada tarefa
```markdown
- [ ] **T01** — <título curto>
  - **Arquivo**: `caminho/do/arquivo.ts`
  - **Depende de**: T00 (ou —)
  - **O que fazer**: descrição objetiva
  - **Critério**: como verificar (comando, teste, tipo-check)
  - **Paralelo**: [P] ou sequencial
```

### Seções obrigatórias do tasks.md

#### Fase 1 — Dados
Schema Prisma, migrations, seeds de teste.

#### Fase 2 — Validação
Zod schemas, tipos TypeScript, interfaces de repository.

#### Fase 3 — Backend
Repository → Controller → registrar no `igniter.router.ts`.

#### Fase 4 — Frontend
Páginas, componentes, integração com `api.*.useQuery()`.

#### Fase 5 — Testes
Unit (Vitest) + E2E (Playwright) cobrindo os critérios de aceitação.

#### Fase 6 — Observabilidade & polish
Logs, auditoria, i18n, a11y.

### Checklist final (cole no topo)
- [ ] Todos os FRs da spec têm tarefas correspondentes
- [ ] Todos os critérios de aceitação têm testes
- [ ] Nenhuma tarefa edita `igniter.client.ts` ou `igniter.schema.ts` (auto-gerados)
- [ ] Itens de "aprovação necessária" do plano estão marcados

## Regras
- Se uma tarefa parecer maior que 30 min, **quebre em subtarefas**
- Se surgir ambiguidade no plano, **pare** e registre em "Perguntas em aberto"
- Ao terminar, sugira o próximo passo: `/execute T01`
