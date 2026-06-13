---
Criado: 2026-06-13
Atualizado: 2026-06-13
Revisar em: ao iniciar o /break/execute deste épico, ou mudança no caminho de outbound (sendAgentResponse / FSM-outbound-durável)
Relacionados:
  - specs/builder-proatividade/spec.md
  - src/server/communication/services/outbound.service.ts
  - src/server/services/jobs/index.ts
  - .claude/projects/.../memory/fsm-outbound-durable-proposal.md
---

# Plano — Mensagens Proativas / Automações Programadas (RUNTIME)

> Implementação do épico de `spec.md`. **Runtime** → expande o escopo que a v2 exclui (NFR-14). A **F1**
> (recomenda+persiste, design-time) já está pronta na jornada mission-first. Este plano cobre **F2→F4 + compliance**.
> ⚠️ **Gate:** a migration Prisma abaixo é **aprovação obrigatória** (CLAUDE.md) — desenhada aqui, **não aplicada**.

## Princípio de execução

Reusar o caminho de saída ÚNICO (`sendAgentResponse`) e a infra de fila BullMQ já provada; **net-new** só o que não existe
(modelo de automação, opt-out, enforcement de janela, template send). Faseado: **F2 follow-up** (o mais pedido) → **F3 lembretes
de agenda** → **F4 datas importantes**. Cada fase fecha verde antes da próxima.

## Migration Prisma (DESENHADA — aplicar só após aprovação) ⚠️

Três modelos novos (nomes camelCase sem `@map` de campo seguem o padrão do Builder; tabelas snake via `@@map`):

```prisma
// A REGRA (config da automação, por projeto/org). Materializada da F1 (builderState.proactive).
model ScheduledAutomation {
  id              String   @id @default(uuid())
  organizationId  String
  projectId       String   // BuilderProject (sem FK relacional, igual BuilderJourneyEvent)
  trigger         String   // lead_idle | appointment_before | appointment_after | birthday | renewal_due | custom_date
  audience        String   // contact | lead | customer
  timing          Json     // shape por trigger (ex.: { hoursBefore: 2 } | { at: "09:00" })
  messageTemplate String
  cancelRules     String[] // [customer_replied, opted_out, human_took_over, session_closed]
  maxAttempts     Int      @default(1)
  status          String   @default("active") // active | paused
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([organizationId, projectId])
  @@map("scheduled_automations")
}

// A INSTÂNCIA (um envio agendado concreto por contato — também usada pelo create_followup ad-hoc).
model ScheduledMessage {
  id                      String    @id @default(uuid())
  organizationId          String
  automationId            String?   // FK lógica p/ ScheduledAutomation (nullable p/ follow-up ad-hoc)
  connectionId            String
  contactPhone            String    // E.164-BR normalizado (chave do contato — não há modelo Contact)
  sessionId               String?
  scheduledAt             DateTime
  reason                  String
  messageGoal             String?
  attemptsSoFar           Int       @default(0)
  maxAttempts             Int       @default(1)
  cancelIfCustomerReplies Boolean   @default(true)
  status                  String    @default("pending") // pending | sent | cancelled | failed
  sentAt                  DateTime?
  cancelledReason         String?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  @@index([status, scheduledAt])           // o worker varre pendentes por horário
  @@index([organizationId, contactPhone])  // cancel-on-inbound por contato
  @@map("scheduled_messages")
}

// OPT-OUT (não existe modelo Contact hoje — decisão: tabela dedicada, desacoplada da sessão).
model ContactOptOut {
  id             String   @id @default(uuid())
  organizationId String
  phone          String   // E.164-BR
  reason         String?  // palavra-chave que disparou ("parar"/"não quero"/"remover")
  optedOutAt     DateTime @default(now())
  @@unique([organizationId, phone])
  @@map("contact_opt_outs")
}
```

**Pergunta de schema em aberto p/ você:** opt-out como tabela `ContactOptOut` (recomendado — desacoplado, durável) **ou**
flag em `ChatSession`? E o `automationId` como FK relacional (Cascade) ou id lógico (padrão do módulo)? Decidir antes de aplicar.

> Aplicação: via `node prisma/migrate.js` (pg direto), NUNCA `migrate dev` (shadow DB quebra — memória `onedrive-prisma-dehydration`).

## Arquitetura — reusar vs. net-new

**Reusar:** `sendAgentResponse`/`OutboundRequest` (`outbound.service.ts:233`) · padrão de fila atrasada BullMQ
(`outbound-retry.queue.ts` / `source-enrich.queue.ts`) · registro em `jobs/index.ts` + `scripts/start-workers.ts` (nomes com `-`) ·
`outbound-deadletter.ts` (retry+dead-letter) · padrão Redis do `outbound-rate-limit.ts` · janela 24h já em `ChatSession`
(`lastCustomerMessageAt`/`whatsappWindowExpiresAt`) · `canDispatchAgent` (extrair predicado p/ módulo puro compartilhado) ·
`builtin-tools.ts` factory + `ToolExecutionContext` (prewired) · `official-tools.ts`.

**Net-new:** os 3 modelos acima + `create_followup` real (`builtin-tools.ts`) · worker de disparo + cron-scan · cancel-on-inbound
em `process-inbound.ts` · anti-spam reply-aware (contador por contato) · enforcement da janela 24h + `sendTemplate`/HSM no
`uazapi-sender.service.ts` + awareness de catálogo de templates · gate de opt-in.

## Fases

- **F2 — Follow-up simples (`lead_idle`):** migration (acima) → `create_followup` real → job BullMQ atrasado → disparo via
  `sendAgentResponse` (alinhado ao FSM-outbound-durável, FR-PRO-04) → cancel-on-inbound (`process-inbound.ts`) → gates de
  supressão (predicado extraído de `canDispatchAgent`) + opt-out + anti-spam + auditoria. Gate de opt-in.
- **F3 — Lembretes de agenda (`appointment_before/after`):** worker cron-scan + a reação condicional de **reconfirmação**
  ("se não confirmou até X, disparar ação secundária").
- **F4 — Datas importantes (`birthday/renewal_due/custom_date`):** depende da **proveniência da data** (FR-PRO-08) — exige
  decidir o storage do contato/data (liga com a decisão de schema do opt-out).
- **Compliance (viaja com F2+):** janela 24h (FR-PRO-06) + `sendTemplate`/HSM + opt-out/anti-spam/auditoria (FR-PRO-07).

## Verificação

- **Unit:** pureza do scheduler/elegibilidade (gates de supressão, opt-out, anti-spam reply-aware, janela 24h) com fakes;
  `create_followup` agenda corretamente; cancel-on-inbound cancela pendentes do contato.
- **Integração:** job dispara no `scheduledAt`, chama `sendAgentResponse` (mock do sender), respeita gates; dedup/idempotência.
- **E2E (homol):** follow-up de lead parado dispara e cancela ao responder; opt-out por palavra-chave bloqueia.
- **Compliance:** fora da janela → exige template; sem template → não envia + avisa.

## Pré-condições / dependências

- Alinhar com a **proposta de FSM-outbound-durável** (OutboundDispatch com checkpoint por bloco) — implementar antes do F2 ou
  co-evoluir (FR-PRO-04). `sendAgentResponse` mantém estado de bloco em memória (risco de duplicação em crash de envio proativo).
- Decisões de schema acima resolvidas + **migration aprovada**.
