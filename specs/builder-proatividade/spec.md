---
Criado: 2026-06-13
Atualizado: 2026-06-13
Revisar em: ao iniciar o /plan deste épico, ou mudança no caminho de outbound (sendAgentResponse / FSM-outbound-durável)
Relacionados:
  - specs/jornada-builder-v2/mission-first-v3.md
  - specs/jornada-builder-v2/backlog-simples.md
  - src/server/communication/services/outbound.service.ts
  - src/server/services/jobs/index.ts
  - .claude/projects/.../memory/fsm-outbound-durable-proposal.md
---

# Spec (épico) — Mensagens Proativas / Automações Programadas (RUNTIME)

> **Por que um épico próprio (NFR-14):** o envio proativo é **runtime** e EXPANDE o que a jornada v2
> (`specs/jornada-builder-v2/spec.md §7`) exclui explicitamente (tools de execução, FSM de outbound). Só a **F1**
> (recomenda + persiste, design-time — FR-PRO-01 em `mission-first-v3.md`) é in-scope da v3. **F2-F4 + compliance
> WhatsApp vivem AQUI.** Validado por workflow multi-agente com verificação adversarial (correções de âncora aplicadas).

## 1. Resumo

Hoje os agentes são **reativos** (só respondem a inbound). SDR/closer/secretária/cobrança/pós-venda precisam de
**proatividade**: retomar lead parado, lembrar de visita/consulta, agir em datas. Em vez de uma ferramenta por
caso, criar **um motor genérico** `ScheduledAutomation` + a tool de runtime `create_followup`, reusando a infra de
outbound já existente (BullMQ, `sendAgentResponse`), com **compliance por construção** (janela 24h, template, opt-in,
opt-out, anti-spam, gates de supressão, auditoria).

## 2. Faseamento

- **F1 — Recomenda + persiste (design-time, in-scope v3):** ver FR-PRO-01 em `mission-first-v3.md`. Aqui só como
  pré-requisito (a metadata da automação já existe no `builderState`).
- **F2 — Follow-up simples (runtime):** `lead_idle`. Motor + `create_followup` real + job atrasado + disparo +
  cancel-on-inbound + compliance básica.
- **F3 — Lembretes de agenda (runtime):** `appointment_before`/`appointment_after` + worker cron-scan + a regra
  condicional de **reconfirmação** (#16).
- **F4 — Datas importantes (runtime):** `birthday`/`renewal_due`/`custom_date` + **proveniência da data** (#17).

## 3. Requisitos Funcionais

- **FR-PRO-02 (Motor genérico `ScheduledAutomation`):** novo modelo Prisma (não reusar `Campaign`/`CampaignRecipient`
  — são **broadcast dormente**, shape errado). Forma:
  `ScheduledAutomation { trigger: lead_idle | appointment_before | appointment_after | birthday | renewal_due | custom_date,
  audience, timing, messageTemplate, cancelRules[], maxAttempts, status }`. Além da **regra** (a automação), persistir
  a **instância** agendada por contato (`contactId/sessionId/scheduledAt/reason/messageGoal/attemptsSoFar/
  cancelIfCustomerReplies/status`). **F3 acrescenta** a reação condicional do #16: *"se não houve confirmação até X,
  disparar ação secundária"* (reconfirmar/reagendar/escalar) — um trigger **dependente de resposta**, não só temporal.
- **FR-PRO-03 (Tool runtime `create_followup` — implementar de fato):** hoje é **fantasma** — existe APENAS como
  metadata em `catalog/official-tools.ts` + um comentário em `ToolExecutionContext.agentConfigId`; **zero registro de
  runtime** (não está em `createBuiltinTools()` nem em `BUILTIN_TOOL_NAMES`). Implementar do zero em
  `ai-agents/tools/builtin-tools.ts` no padrão `tool({description, inputSchema:z, execute})`:
  `create_followup({ contactId, reason, scheduledAt, messageGoal, maxAttempts, cancelIfCustomerReplies })`. Agenda um
  job BullMQ atrasado (`delay = scheduledAt - now`). `ctx` já carrega `agentConfigId/contactId/sessionId` (prewired).
- **FR-PRO-04 (Reusar o caminho único de saída + durabilidade):** ao vencer `scheduledAt`, construir um
  `OutboundRequest` e chamar `sendAgentResponse` (`outbound.service.ts:233`) — **NUNCA** um sender paralelo. A
  durabilidade deve **alinhar-se à proposta aprovada de FSM-outbound-durável** (`OutboundDispatch` com checkpoint por
  bloco): `sendAgentResponse` mantém estado de bloco em memória (risco de duplicação em crash). O épico co-evolui com /
  depende dela. O agendamento atrasado em si já está resolvido por BullMQ delay (provado em `outbound-retry.queue.ts`).
- **FR-PRO-05 (Cancelamento por resposta inbound):** quando o contato responder, follow-ups pendentes daquele contato
  com `cancelIfCustomerReplies` são cancelados. Hook novo em **`webhooks/uazapi/process-inbound.ts`** (onde o conteúdo
  da mensagem inbound já está resolvido — NÃO em `resolve-connection.ts`, que só resolve qual conexão/sessão). Não há
  gancho de cancelamento hoje.
- **FR-PRO-06 (Janela de 24h + template aprovado):** antes de qualquer envio proativo, ler a janela já modelada em
  `ChatSession` (`lastCustomerMessageAt`, `whatsappWindowExpiresAt`, `whatsappWindowType` — escrita pelo webhook, mas
  **lida em lugar nenhum** hoje). Fora da janela → usar **template aprovado**; se não existir, **avisar** (no runtime e,
  preventivamente, em design-time — FR-PRO-01). **Net-new:** enforcement no caminho de saída + método `sendTemplate`/HSM
  no transporte (`uazapi-sender.service.ts` não tem) + camada de awareness do catálogo de templates
  (`uazapi.service.ts` não gerencia templates).
- **FR-PRO-07 (Opt-out, anti-spam, gates de supressão, auditoria, opt-in):**
  - **opt-out** por palavra-chave inbound ("parar"/"não quero"/"remover") detectada em `process-inbound.ts`, com
    armazenamento de bloqueio por contato — **não há modelo `Contact`/blocklist hoje** (só `ContactMemory`): net-new.
  - **anti-spam reply-aware** = máximo N envios proativos consecutivos **sem resposta inbound** (contador por contato;
    o `outbound-rate-limit` atual é só volume, não reply-aware). Reusar o padrão Redis INCR+EXPIRE fail-open.
  - **gates de supressão** (humano assumiu / sessão `CLOSED` / IA pausada): **extrair** o predicado de
    `canDispatchAgent` (hoje só em `webhook/processor.ts`, caminho inbound) para um **módulo puro compartilhado**
    (`aiEnabled && !aiBlockedUntil && status != CLOSED && !humanAssumed`) — **não** importar `webhook/processor` num
    worker de scheduler.
  - **auditoria do motivo** de cada envio (`Message`/`BuilderToolCall` não capturam) + **superfície de leitura** (#20):
    o usuário precisa VER o histórico de envios proativos — amarrar a `BuilderJourneyEvent`/`AgentRuntimeDecision` ou a
    uma view de runtime decisions (auditar sem leitura fica meio-feito).
  - **opt-in obrigatório:** nenhum envio proativo sem flag explícita de opt-in por contato/automação.
- **FR-PRO-08 (Proveniência da data — #17, F4):** automações de data (`birthday`/`renewal_due`/`custom_date`) exigem
  **fonte confiável da data** (campo do contato / CRM / integração / coletada na conversa). Como não há modelo
  `Contact` hoje, F4 é **inviável sem decidir o storage da data** — gate duro: **não agendar automação de data sem
  proveniência confiável**. Decidir o storage (novo `Contact` vs. campo em sessão/memória) é pré-condição de F4.

## 4. Requisitos Não-Funcionais

- **NFR-PRO-1 (Reuso, não reconstrução):** reusar `sendAgentResponse`/`OutboundRequest`; o padrão de fila atrasada
  BullMQ (`outbound-retry.queue.ts`/`source-enrich.queue.ts`: produtor + worker lazy-import + fallback SYNC dev +
  traceId); `sendWithRetry`/`pushDeadLetter`/`inspectDeadLetter`; o padrão Redis do rate-limit; a janela 24h já modelada
  em `ChatSession`; o catálogo `official-tools.ts`. Registro em `jobs/index.ts` + `scripts/start-workers.ts` (nomes de
  fila com `-`, nunca `:`).
- **NFR-PRO-2 (Compliance fail-safe — = NFR-15):** opt-in obrigatório; opt-out irreversível; gates verificados antes de
  cada envio; motivo auditável; falha de gate = não-envio. Telefones mascarados (NFR-02).
- **NFR-PRO-3 (Durabilidade):** alinhar ao `OutboundDispatch` (FSM-outbound-durável) para não duplicar blocos em crash.

## 5. Infra — reusar vs. net-new (do workflow)

**Reusar:** `sendAgentResponse` (`outbound.service.ts:233`) · BullMQ delayed pattern (`outbound-retry.queue.ts`) ·
`jobs/index.ts` + `start-workers.ts` · `outbound-deadletter.ts` · padrão Redis do `outbound-rate-limit.ts` · janela 24h
em `ChatSession` (`schema.prisma:965-999`) · `canDispatchAgent`/`ChatSession.aiEnabled/aiBlockedUntil/status` ·
`builtin-tools.ts` factory + `ToolExecutionContext` (prewired) · `official-tools.ts`.

**Net-new:** impl real de `create_followup` · modelo `ScheduledAutomation` + instância de follow-up · worker de disparo
+ cron-scan · cancel-on-inbound (`process-inbound.ts`) · anti-spam reply-aware · modelo de opt-out/`Contact` ·
enforcement da janela 24h · `sendTemplate`/HSM + awareness de catálogo de templates · campo+leitura de motivo do envio ·
gate de opt-in · proveniência da data (F4).

## 6. Perguntas em aberto

- Implementar `OutboundDispatch` (FSM-outbound-durável, aprovado mas não codado) **antes** do F2, ou co-evoluir?
- Storage do opt-out e da data: novo modelo `Contact` (não existe) vs. flag em `ChatSession`/memória?
- Consolidar este épico com `specs/quayer-runtime-evolution` ou manter pasta própria?
