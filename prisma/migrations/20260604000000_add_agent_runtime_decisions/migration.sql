-- Agent Runtime Decisions (observabilidade por turno)
-- Tabela de log: sem FK (alta escrita, desacoplada). Limpeza por retenção/job.

CREATE TABLE "agent_runtime_decisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentConfigId" TEXT NOT NULL,
    "promptVersionId" TEXT,
    "executionMode" TEXT NOT NULL,
    "modelPrimary" TEXT NOT NULL,
    "providerPrimary" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "providerUsed" TEXT NOT NULL,
    "fallbackTriggered" BOOLEAN NOT NULL DEFAULT false,
    "fallbackReason" TEXT,
    "memoryWindowSize" INTEGER,
    "dynamicWindowSize" INTEGER,
    "messagesDropped" INTEGER NOT NULL DEFAULT 0,
    "previousSessionSummaryUsed" BOOLEAN NOT NULL DEFAULT false,
    "ragEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ragQueried" BOOLEAN NOT NULL DEFAULT false,
    "ragCollectionId" TEXT,
    "ragChunksRetrieved" INTEGER NOT NULL DEFAULT 0,
    "skillsActivated" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabledTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "toolsCalled" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "toolIterations" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runtime_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_runtime_decisions_organizationId_createdAt_idx" ON "agent_runtime_decisions"("organizationId", "createdAt");
CREATE INDEX "agent_runtime_decisions_sessionId_idx" ON "agent_runtime_decisions"("sessionId");
CREATE INDEX "agent_runtime_decisions_agentConfigId_createdAt_idx" ON "agent_runtime_decisions"("agentConfigId", "createdAt");
