const { EC2Client, RunInstancesCommand, DescribeInstancesCommand, TerminateInstancesCommand } = require("@aws-sdk/client-ec2");
const prisma = require("../prisma");

const ACTIVE_STATUSES = ["PROVISIONING", "READY", "ACTIVE"];

class SimulationServiceError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

function getConfig() {
  const launchTemplateId = String(process.env.AWS_SIMULATION_LAUNCH_TEMPLATE_ID || "").trim();
  const region = String(process.env.AWS_REGION || "").trim();
  if (!region || !launchTemplateId) {
    throw new SimulationServiceError("Windows simulations are not configured. Contact your administrator.");
  }
  return { region, launchTemplateId };
}

function getEc2Client() {
  return new EC2Client({ region: getConfig().region });
}

function expectedTags(session) {
  return [
    { Key: "Project", Value: "HelpDeskAI" },
    { Key: "Purpose", Value: "UserSimulation" },
    { Key: "SessionId", Value: session.id },
    { Key: "UserId", Value: String(session.userId) },
    { Key: "ModuleId", Value: String(session.moduleId) },
    { Key: "AutoTerminateAt", Value: session.expiresAt.toISOString() }
  ];
}

function hasExpectedSessionTag(instance, session) {
  return (instance?.Tags || []).some((tag) => tag.Key === "SessionId" && tag.Value === session.id);
}

async function createWindowsSimulationSession(session) {
  const { launchTemplateId } = getConfig();
  try {
    const response = await getEc2Client().send(
      new RunInstancesCommand({
        MinCount: 1,
        MaxCount: 1,
        ClientToken: session.id,
        LaunchTemplate: { LaunchTemplateId: launchTemplateId, Version: "$Default" },
        TagSpecifications: [{ ResourceType: "instance", Tags: expectedTags(session) }]
      })
    );
    const instanceId = response.Instances?.[0]?.InstanceId;
    if (!instanceId) throw new Error("EC2 did not return an instance ID.");
    return prisma.simulationSession.update({ where: { id: session.id }, data: { ec2InstanceId: instanceId } });
  } catch (error) {
    await prisma.simulationSession.update({
      where: { id: session.id },
      data: { status: "FAILED", endedAt: new Date() }
    }).catch(() => {});
    console.error("Windows simulation launch failed", { sessionId: session.id, code: error?.name || error?.code });
    throw new SimulationServiceError("Unable to prepare the Windows workspace. Please try again later.");
  }
}

async function refreshWindowsSimulationSession(session) {
  if (!session?.ec2InstanceId || !ACTIVE_STATUSES.includes(session.status)) return session;
  try {
    const response = await getEc2Client().send(new DescribeInstancesCommand({ InstanceIds: [session.ec2InstanceId] }));
    const instance = response.Reservations?.[0]?.Instances?.[0];
    if (!instance || !hasExpectedSessionTag(instance, session)) {
      return prisma.simulationSession.update({ where: { id: session.id }, data: { status: "FAILED", endedAt: new Date() } });
    }
    const state = instance.State?.Name;
    if (state === "running" && instance.PrivateIpAddress) {
      return prisma.simulationSession.update({
        where: { id: session.id },
        data: { status: session.status === "ACTIVE" ? "ACTIVE" : "READY", privateIp: instance.PrivateIpAddress }
      });
    }
    if (["shutting-down", "terminated"].includes(state)) {
      return prisma.simulationSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
    }
    return session;
  } catch (error) {
    console.error("Windows simulation refresh failed", { sessionId: session.id, code: error?.name || error?.code });
    return session;
  }
}

async function terminateWindowsSimulationSession(session) {
  if (!session || ["ENDED", "FAILED"].includes(session.status)) return session;
  const terminating = await prisma.simulationSession.update({
    where: { id: session.id },
    data: { status: "TERMINATING" }
  });
  if (!terminating.ec2InstanceId) {
    return prisma.simulationSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
  }
  try {
    const inspect = await getEc2Client().send(new DescribeInstancesCommand({ InstanceIds: [terminating.ec2InstanceId] }));
    const instance = inspect.Reservations?.[0]?.Instances?.[0];
    if (instance && hasExpectedSessionTag(instance, terminating) && !["shutting-down", "terminated"].includes(instance.State?.Name)) {
      await getEc2Client().send(new TerminateInstancesCommand({ InstanceIds: [terminating.ec2InstanceId] }));
    }
    return prisma.simulationSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
  } catch (error) {
    console.error("Windows simulation termination failed", { sessionId: session.id, code: error?.name || error?.code });
    throw new SimulationServiceError("Unable to end the Windows workspace. It will be retried automatically.");
  }
}

async function cleanupExpiredWindowsSimulationSessions() {
  const expired = await prisma.simulationSession.findMany({
    where: { status: { in: ACTIVE_STATUSES }, expiresAt: { lt: new Date() } },
    take: 100
  });
  await Promise.all(expired.map((session) => terminateWindowsSimulationSession(session).catch(() => null)));
  return expired.length;
}

module.exports = {
  ACTIVE_STATUSES,
  SimulationServiceError,
  createWindowsSimulationSession,
  refreshWindowsSimulationSession,
  terminateWindowsSimulationSession,
  cleanupExpiredWindowsSimulationSessions
};
