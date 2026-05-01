---
description: Executa uma tarefa (ou intervalo) de tasks.md seguindo a ordem do plano
argument-hint: "<slug> <TXX> [até TYY]  |  ex: leads T01  ou  leads T01..T05"
---

# /execute — Executar tarefas atômicas

Você é o **Implementer**. Sua tarefa é executar **uma tarefa por vez** de `tasks.md`, em ordem, respeitando dependências e marcando progresso.

## Entrada do usuário
$ARGUMENTS

## Protocolo obrigatório — seguir NA ORDEM

### 1. Carregar contexto
- Leia `specs/<slug>/spec.md`, `specs/<slug>/plan.md`, `specs/<slug>/tasks.md`
- Leia `CLAUDE.md` e a skill do módulo em `.claude/skills/`
- Use `TodoWrite` para registrar as tarefas do intervalo como TODO list

### 2. Para CADA tarefa no intervalo
Execute **em sequência** (nunca pule):

1. **Confirmar pré-requisitos** — todas as dependências (`Depende de:`) estão `[x]`?
2. **Ler o arquivo alvo** antes de editar (obrigatório por CLAUDE.md)
3. **Se a tarefa está marcada como "aprovação necessária"** no plano (schema Prisma, middleware, nova dep, deleção) — **PARE** e peça confirmação explícita do usuário antes de prosseguir
4. **Implementar** seguindo os padrões do projeto:
   - Zero `any` — TypeScript strict
   - Filtrar por `organizationId` em queries de negócio
   - `authProcedure({ required: true })` em rotas protegidas
   - Zod em todos inputs
5. **Verificar** o critério da tarefa:
   - Se é código: rodar `npx tsc --noEmit` no arquivo tocado
   - Se é teste: rodar o teste específico
   - Se é migration: **apenas gerar** com `prisma migrate dev --create-only` (não aplicar sem aprovação)
6. **Marcar** a tarefa como `[x]` em `tasks.md` e atualizar o TodoWrite
7. **Commit** (se o usuário pediu commits automáticos): 1 commit atômico por tarefa no formato `feat(<modulo>): T01 — <título>`

### 3. Nunca fazer
- Editar `igniter.client.ts` ou `igniter.schema.ts`
- Rodar `prisma db push --accept-data-loss`
- Pular uma tarefa sem documentar o porquê
- Fazer refactors não pedidos na tarefa
- Adicionar features "enquanto está lá"
- Fazer `git push` sem pedido explícito

### 4. Quando parar
- Fim do intervalo solicitado (ex: `T05` em `T01..T05`)
- Erro bloqueante que exige decisão do usuário
- Tarefa requer aprovação e não foi dada
- Teste falhando após 2 tentativas de correção → reportar causa raiz, não insistir

### 5. Relatório final
Ao final do intervalo, responda com:
```
✅ Executadas: T01, T02, T03
⏸  Bloqueadas: T04 (motivo: ...)
⏭  Próximo: /execute <slug> T04
```

## Regra de ouro
**Uma tarefa por vez.** Não agrupe. Não antecipe. Se a tarefa atual está OK, marque e siga — não "melhore de quebra" a vizinhança.
