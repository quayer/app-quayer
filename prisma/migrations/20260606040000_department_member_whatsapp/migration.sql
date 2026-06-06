-- M1 — Materialização do team/roleta: DepartmentMember aceita membro "nome + WhatsApp"
-- (não-usuário da plataforma) e a roleta roteia a notificação por WhatsApp.
-- Colunas aditivas; userId passa a NULLABLE + FK ON DELETE SET NULL — sem data-loss
-- (linhas existentes têm userId preenchido e seguem válidas).

ALTER TABLE "department_members" ADD COLUMN "name" TEXT;
ALTER TABLE "department_members" ADD COLUMN "whatsapp" TEXT;

-- userId nullable + FK SET NULL (membro sem conta de usuário pode existir).
-- O @@unique([departmentId, userId]) permanece: Postgres trata NULLs como distintos,
-- então vários membros não-usuário (userId NULL) coexistem no mesmo departamento.
ALTER TABLE "department_members" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "department_members" DROP CONSTRAINT "department_members_userId_fkey";
ALTER TABLE "department_members"
  ADD CONSTRAINT "department_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

-- Roleta (M1): o cursor passa a ser por DepartmentMember.id (não User.id), porque o
-- membro pode ser não-usuário (userId NULL). Coluna NOVA e SEM FK — a antiga
-- "Department"."lastAssignedUserId" tem FK física p/ User(id) e gravar um memberId nela
-- violaria a constraint. "lastAssignedUserId" fica vestigial.
ALTER TABLE "Department" ADD COLUMN "lastAssignedMemberId" TEXT;
