ALTER TABLE "PolicyEvent" ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "requestId" TEXT, ADD COLUMN "outcome" TEXT,
  ADD COLUMN "stage" TEXT, ADD COLUMN "metadata" JSONB;
CREATE INDEX "PolicyEvent_userId_sessionId_at_idx" ON "PolicyEvent"("userId", "sessionId", "at");
ALTER TABLE "AdminAuditLog" ADD COLUMN "metadata" JSONB;
CREATE TABLE "SessionRestriction" (
  "userId" INTEGER NOT NULL, "sessionId" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "violations" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3),
  "reason" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionRestriction_pkey" PRIMARY KEY ("userId", "sessionId"),
  CONSTRAINT "SessionRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SessionRestriction_expiresAt_idx" ON "SessionRestriction"("expiresAt");
-- Existing events retain their historical code-based interpretation.
