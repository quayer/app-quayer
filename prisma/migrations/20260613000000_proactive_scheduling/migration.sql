-- Épico builder-proatividade (runtime) — Mensagens Proativas / Automações Programadas.
-- 3 tabelas: a REGRA (scheduled_automations), a INSTÂNCIA por contato (scheduled_messages)
-- e o opt-out por telefone (contact_opt_outs). Sem FK relacional (padrão do módulo,
-- igual builder_journey_events). org-scoped (NFR-01).

-- CreateTable: scheduled_automations (a regra da automação, materializada da F1)
CREATE TABLE "scheduled_automations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "timing" JSONB NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "cancelRules" TEXT[],
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_automations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduled_automations_organizationId_projectId_idx" ON "scheduled_automations"("organizationId", "projectId");

-- CreateTable: scheduled_messages (instância de envio agendado por contato; também ad-hoc via create_followup)
CREATE TABLE "scheduled_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "automationId" TEXT,
    "connectionId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "sessionId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "messageGoal" TEXT,
    "attemptsSoFar" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "cancelIfCustomerReplies" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduled_messages_status_scheduledAt_idx" ON "scheduled_messages"("status", "scheduledAt");

CREATE INDEX "scheduled_messages_organizationId_contactPhone_idx" ON "scheduled_messages"("organizationId", "contactPhone");

-- CreateTable: contact_opt_outs (opt-out por telefone — não há modelo Contact)
CREATE TABLE "contact_opt_outs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_opt_outs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_opt_outs_organizationId_phone_key" ON "contact_opt_outs"("organizationId", "phone");
