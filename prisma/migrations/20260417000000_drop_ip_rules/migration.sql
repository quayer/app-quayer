-- Drop IP Rules feature (removed with Builder IA pivot — no longer used)

-- DropForeignKey
ALTER TABLE "ip_rules" DROP CONSTRAINT IF EXISTS "ip_rules_organizationId_fkey";
ALTER TABLE "ip_rules" DROP CONSTRAINT IF EXISTS "ip_rules_createdById_fkey";

-- DropTable
DROP TABLE IF EXISTS "ip_rules";

-- DropEnum
DROP TYPE IF EXISTS "IpRuleType";
