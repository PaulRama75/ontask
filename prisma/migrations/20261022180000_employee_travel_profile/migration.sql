-- Travel profile on the employee record, saved from the Travel Request form
-- and used to pre-fill the next request. Additive only; no data changes.
-- knownTravelerNumber is stored encrypted ("enc:v1:" prefix, see src/lib/crypto.ts).
ALTER TABLE "Employee" ADD COLUMN "dateOfBirth" TIMESTAMP(3),
ADD COLUMN "knownTravelerNumber" TEXT;
