-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "additionalEquipmentNeeds" TEXT;
ALTER TABLE "Employee" ADD COLUMN "additionalTrainingsNeeded" TEXT;
ALTER TABLE "Employee" ADD COLUMN "billingRateAmount" REAL;
ALTER TABLE "Employee" ADD COLUMN "directSupervisor" TEXT;
ALTER TABLE "Employee" ADD COLUMN "drivingRecordRequired" BOOLEAN;
ALTER TABLE "Employee" ADD COLUMN "employmentType" TEXT;
ALTER TABLE "Employee" ADD COLUMN "fitTestNeeded" BOOLEAN;
ALTER TABLE "Employee" ADD COLUMN "jobNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN "jobSite" TEXT;
ALTER TABLE "Employee" ADD COLUMN "liftOperatorCertifications" TEXT;
ALTER TABLE "Employee" ADD COLUMN "positionType" TEXT;
ALTER TABLE "Employee" ADD COLUMN "safetyEquipmentNeeded" TEXT;
ALTER TABLE "Employee" ADD COLUMN "siteSpecificsNeeded" BOOLEAN;
ALTER TABLE "Employee" ADD COLUMN "urgency" TEXT;
