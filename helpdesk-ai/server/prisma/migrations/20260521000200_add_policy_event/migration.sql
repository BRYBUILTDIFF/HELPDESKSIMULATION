CREATE TABLE "PolicyEvent" (
  "id" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" INTEGER,
  "userEmail" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "blocked" BOOLEAN NOT NULL DEFAULT false,
  "code" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "hasHistory" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "PolicyEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PolicyEvent_at_idx" ON "PolicyEvent"("at" DESC);
CREATE INDEX "PolicyEvent_blocked_at_idx" ON "PolicyEvent"("blocked", "at" DESC);
CREATE INDEX "PolicyEvent_code_idx" ON "PolicyEvent"("code");

ALTER TABLE "PolicyEvent"
ADD CONSTRAINT "PolicyEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;