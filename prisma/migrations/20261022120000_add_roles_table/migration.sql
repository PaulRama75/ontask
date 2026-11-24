-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- Seed the 9 built-in roles (same keys/labels as src/lib/rbac.ts)
INSERT INTO "roles" ("id", "key", "role_name", "status") VALUES
    ('role_employee', 'EMPLOYEE', 'Employee', 'ACTIVE'),
    ('role_tracks', 'TRACKS', 'Tracks', 'ACTIVE'),
    ('role_hr', 'HR', 'HR', 'ACTIVE'),
    ('role_account_manager', 'ACCOUNT_MANAGER', 'Account Manager', 'ACTIVE'),
    ('role_project_lead', 'PROJECT_LEAD', 'Project Lead', 'ACTIVE'),
    ('role_project_manager', 'PROJECT_MANAGER', 'Project Manager', 'ACTIVE'),
    ('role_safety', 'SAFETY', 'Safety', 'ACTIVE'),
    ('role_admin', 'ADMIN', 'Admin', 'ACTIVE'),
    ('role_super_admin', 'SUPER_ADMIN', 'Super Admin', 'ACTIVE')
ON CONFLICT ("key") DO NOTHING;
