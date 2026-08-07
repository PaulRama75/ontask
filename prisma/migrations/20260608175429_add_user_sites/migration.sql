-- CreateTable
CREATE TABLE "UserSite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    CONSTRAINT "UserSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSite_userId_site_key" ON "UserSite"("userId", "site");
