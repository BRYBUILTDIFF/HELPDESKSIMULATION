CREATE TABLE "SimulationModule" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "difficulty" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "completions" INTEGER NOT NULL DEFAULT 0,
  "passRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "avgSteps" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourcePrompt" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SimulationModule_pkey" PRIMARY KEY ("id")
);
