ALTER TABLE "SimulationSession" ADD COLUMN "chatSessionId" TEXT;
CREATE INDEX "SimulationSession_userId_chatSessionId_idx" ON "SimulationSession"("userId", "chatSessionId");
-- Recover only uniquely linked legacy records whose owner agrees on both sides.
UPDATE "SimulationSession" s SET "chatSessionId" = links.chat_id
FROM (
  SELECT c."userId", c.data->'windowsOsSimulation'->>'simulationSessionId' AS lab_id, MIN(c.id) AS chat_id
  FROM "ChatSession" c
  WHERE c.data->'windowsOsSimulation'->>'simulationSessionId' IS NOT NULL
  GROUP BY c."userId", c.data->'windowsOsSimulation'->>'simulationSessionId'
  HAVING COUNT(*) = 1
) links
WHERE s.id = links.lab_id AND s."userId" = links."userId";
