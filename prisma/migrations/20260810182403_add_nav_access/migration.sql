-- CreateTable
CREATE TABLE "NavAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE UNIQUE INDEX "NavAccess_role_navKey_key" ON "NavAccess"("role", "navKey");
