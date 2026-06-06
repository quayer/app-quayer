-- Vínculo ESTRUTURADO agente↔departamento da roleta. O dispatch_to_agent usa
-- AIAgentConfig.departmentId como FALLBACK quando o LLM não passa um departmentId
-- válido — robusto a qual tabela de prompt vence (o bloco no systemPrompt escrito
-- pelo materialize_team pode ser sombreado por um AgentPromptVersion ACTIVE).
-- Aditivo, nullable, sem FK (o dispatch já degrada em departamento inexistente).

ALTER TABLE "AIAgentConfig" ADD COLUMN "departmentId" TEXT;
