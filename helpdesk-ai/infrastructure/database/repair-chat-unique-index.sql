-- Repair legacy schemas with a missing/non-unique conversation lookup index.
-- A separate name avoids silently accepting an existing non-unique index.
-- If duplicate user/session pairs exist this statement fails; no rows are deleted.
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyConversation_userId_sessionId_repair_key"
ON "PolicyConversation" ("userId", "sessionId");
