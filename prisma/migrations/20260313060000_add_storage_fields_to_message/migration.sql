-- AlterTable: Add storage fields to Message for Supabase Storage integration
ALTER TABLE "Message" ADD COLUMN "storagePath" TEXT;
ALTER TABLE "Message" ADD COLUMN "storageProvider" TEXT;
