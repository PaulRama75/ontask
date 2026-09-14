-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "hrReviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hrReviewedAt" TIMESTAMP(3),
ADD COLUMN     "ratesAssignedAt" TIMESTAMP(3);
