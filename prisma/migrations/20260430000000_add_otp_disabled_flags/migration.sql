-- AlterTable
ALTER TABLE "UserPreferences"
  ADD COLUMN "otpEmailDisabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "otpPhoneDisabled" BOOLEAN NOT NULL DEFAULT false;
