ALTER TABLE "PolicyConversation" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "PolicyConversation_expiresAt_idx" ON "PolicyConversation"("expiresAt");
