-- Gender on the employee record, saved from the Travel Request form and used
-- to pre-fill the next request (like dateOfBirth / knownTravelerNumber).
-- Additive only; no data changes.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "gender" TEXT;
