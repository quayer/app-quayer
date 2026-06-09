-- F0 do épico QR/warm-transfer: o membro do departamento pode ter uma instância
-- WhatsApp PRÓPRIA (pareada por QR). Quando setada, o handoff faz "warm transfer"
-- (a conexão do membro manda a 1ª mensagem ao cliente; o humano atende no app dele).
-- Scalar SEM FK (espelha "Department"."lastAssignedMemberId") — resolvido por
-- findUnique no runtime, fail-open. Aditivo, nullable, sem data-loss.

ALTER TABLE "department_members" ADD COLUMN "connectionId" TEXT;
