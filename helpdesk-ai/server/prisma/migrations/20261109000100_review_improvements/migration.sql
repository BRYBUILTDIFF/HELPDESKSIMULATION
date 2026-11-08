BEGIN;
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "ChatSession" (
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "id" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "id")
);
CREATE INDEX "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt");
INSERT INTO "ChatSession" ("userId", "id", "data", "updatedAt")
SELECT s."userId", e.value->>'id', e.value, s."updatedAt"
FROM "UserSessionState" s CROSS JOIN LATERAL jsonb_array_elements(s.sessions::jsonb) e(value)
WHERE jsonb_typeof(s.sessions::jsonb) = 'array' AND length(e.value->>'id') BETWEEN 1 AND 120
ON CONFLICT DO NOTHING;
CREATE TABLE "RequestLimit" ("key" TEXT PRIMARY KEY, "hits" INTEGER NOT NULL, "resetAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "RequestLimit_resetAt_idx" ON "RequestLimit"("resetAt");
CREATE TABLE "AdminAuditLog" (
  "id" BIGSERIAL PRIMARY KEY, "actorId" INTEGER NOT NULL,
  "method" TEXT NOT NULL, "path" TEXT NOT NULL, "status" INTEGER NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminAuditLog_at_idx" ON "AdminAuditLog"("at");
CREATE TABLE "PromptInsightDismissal" ("key" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

ALTER TABLE "SimulationCompletion" ADD COLUMN "verification" TEXT NOT NULL DEFAULT 'self-reported';
CREATE TABLE "SimulationAttempt" (
  "id" TEXT PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "moduleId" TEXT NOT NULL, "surface" TEXT NOT NULL, "expected" JSONB NOT NULL,
  "nextStep" INTEGER NOT NULL DEFAULT 0, "mistakes" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SimulationAttempt_userId_expiresAt_idx" ON "SimulationAttempt"("userId", "expiresAt");

COMMIT;
