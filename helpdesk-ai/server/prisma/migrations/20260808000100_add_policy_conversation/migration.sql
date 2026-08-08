CREATE TABLE "PolicyConversation" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PolicyConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicyConversation_userId_sessionId_key" ON "PolicyConversation"("userId", "sessionId");
CREATE INDEX "PolicyConversation_userId_updatedAt_idx" ON "PolicyConversation"("userId", "updatedAt");

ALTER TABLE "PolicyConversation" ADD CONSTRAINT "PolicyConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
