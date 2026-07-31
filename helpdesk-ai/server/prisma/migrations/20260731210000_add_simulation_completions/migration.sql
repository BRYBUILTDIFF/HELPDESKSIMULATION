CREATE TABLE "SimulationCompletion" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "attemptKey" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "stepsCompleted" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SimulationCompletion_attemptKey_key" ON "SimulationCompletion"("attemptKey");
CREATE INDEX "SimulationCompletion_moduleId_completedAt_idx" ON "SimulationCompletion"("moduleId", "completedAt");
CREATE INDEX "SimulationCompletion_userId_completedAt_idx" ON "SimulationCompletion"("userId", "completedAt");

ALTER TABLE "SimulationCompletion" ADD CONSTRAINT "SimulationCompletion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulationCompletion" ADD CONSTRAINT "SimulationCompletion_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "SimulationModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
