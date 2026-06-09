-- B1b do épico QR/warm-transfer: a mensagem de abertura do handoff é EDITÁVEL no
-- card handoff_pairing (builderState.team.openingMessage). Esta coluna a materializa
-- no Department para o runtime: o warm transfer interpola {nome} e a envia ao cliente
-- pela conexão do membro. NULL = usa o texto default de warm-transfer.ts.
-- Aditivo, nullable, sem data-loss. Tabela "Department" é PascalCase (sem @@map).

ALTER TABLE "Department" ADD COLUMN "warmTransferOpeningMessage" TEXT;
