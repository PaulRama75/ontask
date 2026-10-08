-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinHash" TEXT;

-- CreateTable
CREATE TABLE "PinUnlockToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinUnlockToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PinUnlockToken_tokenHash_key" ON "PinUnlockToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PinUnlockToken_userId_idx" ON "PinUnlockToken"("userId");
