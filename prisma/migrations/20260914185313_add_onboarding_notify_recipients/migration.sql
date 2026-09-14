-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "projectManagerEmail" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "receivesOnboardingHrEmails" BOOLEAN NOT NULL DEFAULT false;
