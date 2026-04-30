-- CreateTable
CREATE TABLE "custom_roles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- AddColumn customRoleId to UserOrganization
ALTER TABLE "UserOrganization" ADD COLUMN "customRoleId" TEXT;

-- CreateIndex
CREATE INDEX "custom_roles_organizationId_idx" ON "custom_roles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_organizationId_slug_key" ON "custom_roles"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "UserOrganization_customRoleId_idx" ON "UserOrganization"("customRoleId");

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data Migration: Create 3 system CustomRoles per existing organization
-- Master role (priority=3)
INSERT INTO "custom_roles" ("id", "organizationId", "name", "slug", "description", "permissions", "isSystem", "priority", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    o."id",
    'Master',
    'master',
    'Proprietário da organização, acesso total',
    '{"organization":["read","update","delete"],"organization_settings":["read","update"],"organization_billing":["read","update","manage"],"user":["create","read","update","delete","list"],"invitation":["create","read","delete","list"],"user_organization":["create","read","update","delete","list"],"instance":["create","read","update","delete","list"],"instance_qr":["read"],"instance_messages":["create","read","list"],"project":["create","read","update","delete","list"],"webhook":["create","read","update","delete","list"],"share_token":["create","read","update","delete","list"],"audit_log":["read","list"],"access_level":["create","read","update","delete","list"]}'::jsonb,
    true,
    3,
    NOW(),
    NOW()
FROM "Organization" o;

-- Manager role (priority=2)
INSERT INTO "custom_roles" ("id", "organizationId", "name", "slug", "description", "permissions", "isSystem", "priority", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    o."id",
    'Manager',
    'manager',
    'Gerente, pode gerenciar instâncias e usuários',
    '{"organization":["read"],"organization_settings":["read"],"user":["read","list"],"invitation":["create","read","delete","list"],"user_organization":["read","list"],"instance":["create","read","update","delete","list"],"instance_qr":["read"],"instance_messages":["create","read","list"],"project":["create","read","update","list"],"webhook":["create","read","update","delete","list"],"share_token":["create","read","delete","list"],"audit_log":["read","list"]}'::jsonb,
    true,
    2,
    NOW(),
    NOW()
FROM "Organization" o;

-- User role (priority=1)
INSERT INTO "custom_roles" ("id", "organizationId", "name", "slug", "description", "permissions", "isSystem", "priority", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    o."id",
    'User',
    'user',
    'Usuário comum, acesso às próprias instâncias',
    '{"organization":["read"],"user":["read"],"instance":["read","list"],"instance_qr":["read"],"instance_messages":["create","read","list"],"project":["read","list"],"webhook":["read","list"],"share_token":["create","read","delete","list"]}'::jsonb,
    true,
    1,
    NOW(),
    NOW()
FROM "Organization" o;

-- Link existing UserOrganization records to their corresponding CustomRole
UPDATE "UserOrganization" uo
SET "customRoleId" = cr."id"
FROM "custom_roles" cr
WHERE cr."organizationId" = uo."organizationId"
  AND cr."slug" = uo."role"
  AND cr."isSystem" = true;
