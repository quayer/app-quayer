-- CreateEnum
CREATE TYPE "AutoPauseBehavior" AS ENUM ('CLOSE_SESSION', 'WAIT_CUSTOMER');

-- CreateEnum
CREATE TYPE "GroupMode" AS ENUM ('DISABLED', 'MONITOR_ONLY', 'ACTIVE');

-- CreateEnum
CREATE TYPE "GroupAIResponseMode" AS ENUM ('IN_GROUP', 'PRIVATE', 'HYBRID');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoPauseBehavior" "AutoPauseBehavior" NOT NULL DEFAULT 'WAIT_CUSTOMER',
ADD COLUMN     "autoPauseDurationMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "autoPauseWaitMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "groupAiResponseMode" "GroupAIResponseMode" NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN     "groupDefaultMode" "GroupMode" NOT NULL DEFAULT 'DISABLED';
