-- CreateEnum
CREATE TYPE "SimulationSessionStatus" AS ENUM ('PROVISIONING', 'READY', 'ACTIVE', 'TERMINATING', 'ENDED', 'FAILED');

-- CreateTable
CREATE TABLE "SimulationSession" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "status" "SimulationSessionStatus" NOT NULL DEFAULT 'PROVISIONING',
    "ec2InstanceId" TEXT,
    "privateIp" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SimulationSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SimulationSession_ec2InstanceId_key" ON "SimulationSession"("ec2InstanceId");
CREATE INDEX "SimulationSession_userId_status_idx" ON "SimulationSession"("userId", "status");
CREATE INDEX "SimulationSession_status_expiresAt_idx" ON "SimulationSession"("status", "expiresAt");

ALTER TABLE "SimulationSession" ADD CONSTRAINT "SimulationSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulationSession" ADD CONSTRAINT "SimulationSession_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "SimulationModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
