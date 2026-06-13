---
Criado: 2026-06-13
Atualizado: 2026-06-13
Revisar em: ao executar o épico, ou mudança no caminho de outbound
Relacionados:
  - specs/builder-proatividade/spec.md
  - specs/builder-proatividade/plan.md
---

# Tasks — Mensagens Proativas / Automações Programadas (RUNTIME)

> Faseado F2→F3→F4 (a F1 design-time já está pronta na jornada mission-first). **TPRO-01 (migration) é
> APROVAÇÃO OBRIGATÓRIA** (CLAUDE.md) — nada de runtime começa antes dela. Gate entre fases:
> `lint && tsc --noEmit && test:unit` verdes + E2E da fase.

## Fase 0 — Gate de schema

- [ ] **TPRO-00** — ⚠️ DECISÕES DE SCHEMA + APROVAÇÃO. Confirmar com o founder: (a) opt-out como tabela `ContactOptOut`
  (recomendado) vs flag em `ChatSession`; (b) `ScheduledMessage.automationId` FK relacional (Cascade) vs id lógico;
  (c) proveniência da data p/ F4 (contato/CRM/coletado). Sem isto, não desenhar a migration final.
- [ ] **TPRO-01** [F2] — ⚠️ APROVAÇÃO (migration) — `prisma/schema.prisma`: adicionar `ScheduledAutomation`,
  `ScheduledMessage`, `ContactOptOut` (plan.md "Migration desenhada"). Aplicar via `node prisma/migrate.js` (NÃO `migrate dev`).
  Atualizar `docs/ERD.md` + tabela Prisma no CLAUDE.md (regra crítica). **Critério:** migrate aplicado em homol; `prisma generate` ok.

## Fase F2 — Follow-up simples (`lead_idle`)

- [ ] **TPRO-10** [F2] — `create_followup` real em `ai-agents/tools/builtin-tools.ts` (hoje só metadata no catálogo):
  `tool({ description, inputSchema:z({contactId/phone, reason, scheduledAt, messageGoal, maxAttempts, cancelIfCustomerReplies}), execute })`
  → cria `ScheduledMessage` + enfileira job atrasado. `ctx` já carrega agentConfigId/contactId/sessionId. **Critério:** unit.
- [ ] **TPRO-11** [F2] — fila + worker BullMQ (copiar `outbound-retry.queue.ts`): producer `enqueueScheduledMessage` (delay =
  scheduledAt-now, dev SYNC fallback) + worker registrado em `jobs/index.ts` + `scripts/start-workers.ts` (nome com `-`). **Critério:** unit do producer.
- [ ] **TPRO-12** [F2] — disparo: ao vencer, montar `OutboundRequest` e chamar `sendAgentResponse` (FR-PRO-04). Alinhar à
  proposta FSM-outbound-durável (checkpoint por bloco) p/ não duplicar em crash. **Critério:** integração com sender mockado.
- [ ] **TPRO-13** [F2] — gates de supressão: EXTRAIR o predicado de `canDispatchAgent` (`webhook/processor.ts`) p/ módulo puro
  compartilhado (`aiEnabled && !aiBlockedUntil && status!=CLOSED && !humanAssumed`) e checar ANTES de cada envio. **Critério:** unit dos gates.
- [ ] **TPRO-14** [F2] — cancel-on-inbound: hook em `webhooks/uazapi/process-inbound.ts` — resposta do contato cancela
  `ScheduledMessage` pendentes com `cancelIfCustomerReplies`. **Critério:** unit (inbound cancela; sem flag não cancela).
- [ ] **TPRO-15** [F2] — opt-out + anti-spam: detectar palavra-chave inbound ("parar/não quero/remover") → `ContactOptOut`;
  contador reply-aware (máx N envios sem resposta) reusando padrão Redis. Bloquear envio se opt-out/limite. **Critério:** unit.
- [ ] **TPRO-16** [F2] — opt-in + auditoria: nenhum envio sem opt-in explícito; registrar motivo de cada envio (campo/registro)
  + superfície de leitura (amarrar a `BuilderJourneyEvent`/`AgentRuntimeDecision`). **Critério:** unit + leitura visível.
- [ ] **TPRO-17** [F2] — materializar a F1: `materialize_proactive` na saga de deploy lê `builderState.proactive` → cria/atualiza
  `ScheduledAutomation`. **Critério:** deploy com proactive on cria a regra.
- [ ] **TPRO-18** [F2] — E2E (homol): lead para de responder → follow-up dispara; responde → cancela; opt-out bloqueia.

## Fase F3 — Lembretes de agenda (`appointment_before/after`)

- [ ] **TPRO-30** [F3] — worker cron-scan (varre agendamentos futuros) em `start-workers.ts`; cria `ScheduledMessage` por evento.
- [ ] **TPRO-31** [F3] — reconfirmação condicional (#16): "se não confirmou até X → ação secundária (reconfirmar/reagendar/escalar)".
- [ ] **TPRO-32** [F3] — E2E: visita marcada → lembrete 2h antes; consulta → confirmar 24h antes; sem confirmação → reação.

## Fase F4 — Datas importantes (`birthday/renewal_due/custom_date`)

- [ ] **TPRO-40** [F4] — ⚠️ depende de TPRO-00(c): storage da data. Triggers de data + gate "não agendar sem data confiável" (FR-PRO-08).
- [ ] **TPRO-41** [F4] — E2E: aniversário às 09h; renovação/vencimento.

## Compliance WhatsApp (viaja com F2+)

- [ ] **TPRO-50** — janela 24h: LER `ChatSession.whatsappWindowExpiresAt` antes do envio (FR-PRO-06); fora da janela → exigir template.
- [ ] **TPRO-51** — `sendTemplate`/HSM no `uazapi-sender.service.ts` (net-new) + awareness de catálogo de templates ("avisar quando não existe").

## Mapa de execução

TPRO-00 → TPRO-01 (gate migration) → F2 (TPRO-10→18, com TPRO-50/51 no caminho de envio) → F3 (TPRO-30→32) → F4 (TPRO-40→41).
Pré-requisito transversal: alinhar/implementar o **FSM-outbound-durável** antes de TPRO-12.
