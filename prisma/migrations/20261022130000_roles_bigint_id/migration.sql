-- Change roles.id from TEXT to BIGINT auto-increment (nextval('roles_id_seq')).
-- Rebuilds the table so "id" stays the first column; existing rows are kept.

ALTER TABLE "roles" RENAME TO "roles_old";
ALTER TABLE "roles_old" RENAME CONSTRAINT "roles_pkey" TO "roles_old_pkey";
ALTER INDEX "roles_key_key" RENAME TO "roles_old_key_key";

-- CreateTable
CREATE TABLE "roles" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- Copy rows: built-in roles first (in their usual order), then added roles by date.
INSERT INTO "roles" ("key", "role_name", "status", "createdAt")
SELECT "key", "role_name", "status", "createdAt"
FROM "roles_old"
ORDER BY
    CASE "key"
        WHEN 'EMPLOYEE' THEN 1
        WHEN 'TRACKS' THEN 2
        WHEN 'HR' THEN 3
        WHEN 'ACCOUNT_MANAGER' THEN 4
        WHEN 'PROJECT_LEAD' THEN 5
        WHEN 'PROJECT_MANAGER' THEN 6
        WHEN 'SAFETY' THEN 7
        WHEN 'ADMIN' THEN 8
        WHEN 'SUPER_ADMIN' THEN 9
        ELSE 100
    END,
    "createdAt";

DROP TABLE "roles_old";
