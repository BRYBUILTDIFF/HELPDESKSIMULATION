ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PolicyConversation" ADD COLUMN "history" JSONB NOT NULL DEFAULT '[]';

-- Older versions stored bearer credentials directly. Require a fresh login.
DELETE FROM "RefreshToken";
