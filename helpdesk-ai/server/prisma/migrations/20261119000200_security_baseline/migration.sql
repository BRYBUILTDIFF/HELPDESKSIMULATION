CREATE TABLE "SecurityLease" (
  "id" TEXT PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SecurityLease_expiresAt_idx" ON "SecurityLease"("expiresAt");
CREATE TABLE "AdminSecurity" (
  "userId" INTEGER PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "secret" TEXT,
  "pendingSecret" TEXT,
  "pendingExpiresAt" TIMESTAMP(3),
  "lastCounter" BIGINT NOT NULL DEFAULT -1,
  "recoveryHashes" JSONB NOT NULL DEFAULT '[]'
);
ALTER TABLE "SimulationSession" ADD COLUMN "credential" TEXT;
