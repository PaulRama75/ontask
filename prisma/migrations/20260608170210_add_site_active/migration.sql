-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "ssn" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "driversLicenseNumber" TEXT,
    "safetyCouncilId" TEXT,
    "safetyCouncilExpiry" DATETIME,
    "twicNumber" TEXT,
    "twicExpiry" DATETIME,
    "site" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "payRate" REAL,
    "billRate" REAL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'LINK',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" DATETIME
);
INSERT INTO "new_Employee" ("addressLine1", "addressLine2", "approved", "approvedAt", "billRate", "city", "createdAt", "driversLicenseNumber", "email", "firstName", "id", "lastName", "payRate", "phone", "safetyCouncilExpiry", "safetyCouncilId", "source", "ssn", "state", "status", "twicExpiry", "twicNumber", "updatedAt", "zip") SELECT "addressLine1", "addressLine2", "approved", "approvedAt", "billRate", "city", "createdAt", "driversLicenseNumber", "email", "firstName", "id", "lastName", "payRate", "phone", "safetyCouncilExpiry", "safetyCouncilId", "source", "ssn", "state", "status", "twicExpiry", "twicNumber", "updatedAt", "zip" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
