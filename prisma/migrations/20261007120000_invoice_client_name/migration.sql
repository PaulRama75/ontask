-- Each invoice keeps its own client name, so naming one invoice (e.g. adding
-- a week-ending date) no longer renames every invoice for that client/site.
-- Written to be safe to run more than once.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "clientName" TEXT;

UPDATE "Invoice" i
SET "clientName" = c."name"
FROM "Client" c
WHERE i."clientId" = c."id" AND i."clientName" IS NULL;
