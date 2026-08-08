CREATE TYPE "PolicyRuleType" AS ENUM (
  'GREETING_PATTERN',
  'IN_SCOPE_KEYWORD',
  'OUT_OF_SCOPE_KEYWORD',
  'IN_SCOPE_INTENT'
);

CREATE TABLE "PolicyConfig" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "messages" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PolicyConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PolicyRule" (
  "id" TEXT NOT NULL,
  "type" "PolicyRuleType" NOT NULL,
  "value" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicyRule_type_value_key" ON "PolicyRule"("type", "value");
CREATE INDEX "PolicyRule_type_enabled_position_idx" ON "PolicyRule"("type", "enabled", "position");

ALTER TABLE "PolicyConfig"
ADD CONSTRAINT "PolicyConfig_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PolicyRule"
ADD CONSTRAINT "PolicyRule_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
