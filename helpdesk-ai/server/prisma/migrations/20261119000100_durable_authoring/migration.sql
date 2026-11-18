ALTER TABLE "SimulationModule" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "createdById" INTEGER, ADD COLUMN "updatedById" INTEGER,
  ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "ChatSession" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "SimulationDraft" (
  "id" TEXT PRIMARY KEY, "ownerId" INTEGER NOT NULL, "moduleId" TEXT,
  "title" TEXT NOT NULL, "category" TEXT NOT NULL, "difficulty" TEXT NOT NULL DEFAULT 'Medium',
  "sourcePrompt" TEXT, "simulation" JSONB NOT NULL, "generation" JSONB,
  "state" TEXT NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimulationDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SimulationDraft_ownerId_state_updatedAt_idx" ON "SimulationDraft"("ownerId", "state", "updatedAt");
CREATE TABLE "SimulationRevision" (
  "id" TEXT PRIMARY KEY, "moduleId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
  "actorId" INTEGER, "snapshot" JSONB NOT NULL, "testReceiptId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SimulationRevision_moduleId_revision_key" ON "SimulationRevision"("moduleId", "revision");
CREATE INDEX "SimulationRevision_moduleId_createdAt_idx" ON "SimulationRevision"("moduleId", "createdAt");
CREATE TABLE "SimulationTestReceipt" (
  "id" TEXT PRIMARY KEY, "actorId" INTEGER NOT NULL, "definitionHash" TEXT NOT NULL,
  "definition" JSONB NOT NULL, "events" JSONB NOT NULL, "mistakes" INTEGER NOT NULL,
  "stepsCompleted" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SimulationTestReceipt_actorId_createdAt_idx" ON "SimulationTestReceipt"("actorId", "createdAt");
CREATE TABLE "ChatTurn" (
  "id" TEXT PRIMARY KEY, "userId" INTEGER NOT NULL, "sessionId" TEXT NOT NULL,
  "userMessageId" TEXT NOT NULL, "assistantMessageId" TEXT NOT NULL,
  "message" TEXT NOT NULL, "reply" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChatTurn_userId_sessionId_createdAt_idx" ON "ChatTurn"("userId", "sessionId", "createdAt");
-- Preserve legacy definitions without inventing their original authors or approvals.
INSERT INTO "SimulationRevision" ("id", "moduleId", "revision", "snapshot", "createdAt")
  SELECT 'baseline:' || "id", "id", 1, to_jsonb(m), CURRENT_TIMESTAMP FROM "SimulationModule" m;
-- Revision and receipt tables are append-only to the application role.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'helpdesk_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "SimulationDraft", "ChatTurn" TO helpdesk_runtime;
    GRANT SELECT, INSERT ON "SimulationRevision", "SimulationTestReceipt" TO helpdesk_runtime;
  END IF;
END $$;
