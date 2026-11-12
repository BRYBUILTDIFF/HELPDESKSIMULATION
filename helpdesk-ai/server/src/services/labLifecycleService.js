const prisma = require("../prisma");
const { terminateWindowsSimulationSession } = require("./windowsSimulationService");

async function endUserLabs(userId, simulationId, chatSessionId) {
  const sessions = await prisma.simulationSession.findMany({ where: {
    userId, ...(simulationId ? { id: simulationId } : {}),
    ...(chatSessionId ? { chatSessionId } : {}),
    OR: [{ status: { in: ["PROVISIONING", "READY", "ACTIVE", "TERMINATING"] } },
      { status: "FAILED", ec2InstanceId: { not: null } }]
  } });
  const results = await Promise.allSettled(sessions.map(session => terminateWindowsSimulationSession(session)));
  if (results.some(result => result.status === "rejected")) {
    const error = new Error("Lab cleanup pending");
    error.status = 503;
    error.publicMessage = "Your Windows lab could not be ended. Please retry; automatic cleanup will also retry.";
    throw error;
  }
}
module.exports = { endUserLabs };
