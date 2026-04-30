-- AlterTable: make User.password nullable for passwordless auth flows
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
