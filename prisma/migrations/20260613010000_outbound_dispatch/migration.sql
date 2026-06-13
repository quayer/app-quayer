-- Épico FSM outbound durável (pré-requisito do F2b proatividade) — checkpoint POR BLOCO.
-- 1 tabela: outbound_dispatches. Resolve reenvio de blocos duplicados quando o processo
-- crasha no meio do loop de envio de blocos (sendAgentResponse). dispatchKey =
-- sha256(sessionId:inboundMessageId) único → idempotência; o resume pula blocos já
-- checkpointados (providerMessageId persistido por bloco ANTES do próximo). FAIL-OPEN:
-- ausência do registro/dep cai p/ envio sem checkpoint, nunca bloqueia a mensagem.
-- Sem FK relacional (padrão do módulo, igual scheduled_automations/builder_journey_events).
-- org-scoped (NFR-01).

-- CreateTable: outbound_dispatches (checkpoint por bloco do outbound)
CREATE TABLE "outbound_dispatches" (
    "id" TEXT NOT NULL,
    "dispatchKey" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "agentText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "blocks" JSONB NOT NULL,
    "totalBlocks" INTEGER NOT NULL DEFAULT 0,
    "sentBlocks" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_dispatches_dispatchKey_key" ON "outbound_dispatches"("dispatchKey");

CREATE INDEX "outbound_dispatches_status_updatedAt_idx" ON "outbound_dispatches"("status", "updatedAt");
