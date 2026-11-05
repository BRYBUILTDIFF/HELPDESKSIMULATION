const { EC2Client, RunInstancesCommand, DescribeInstancesCommand, DescribeInstanceStatusCommand, TerminateInstancesCommand } = require("@aws-sdk/client-ec2");
const prisma = require("../prisma");

const ACTIVE_STATUSES = ["PROVISIONING", "READY", "ACTIVE"];
const LIVE_STATUSES = [...ACTIVE_STATUSES, "TERMINATING"];

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

async function countLiveWindowsInstances() {
  let count = 0;
  let nextToken;
  do {
    const response = await getEc2Client().send(new DescribeInstancesCommand({
      Filters: [
        { Name: "tag:Project", Values: ["HelpDeskAI"] },
        { Name: "tag:Purpose", Values: ["UserSimulation"] },
        { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped", "shutting-down"] }
      ], NextToken: nextToken
    }));
    count += (response.Reservations || []).reduce((total, reservation) => total + (reservation.Instances || []).length, 0);
    nextToken = response.NextToken;
  } while (nextToken);
  return count;
}

async function createWindowsSimulationSession(session) {
  let launchAccepted = false;
  try {
    const { launchTemplateId } = getConfig();
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
    launchAccepted = true;
    return await prisma.simulationSession.update({ where: { id: session.id }, data: { ec2InstanceId: instanceId } });
  } catch (error) {
    const denied = !launchAccepted && ["UnauthorizedOperation", "AccessDenied", "AccessDeniedException", "AuthFailure", "InvalidClientTokenId", "SignatureDoesNotMatch"].includes(error?.name || error?.code);
    await prisma.simulationSession.update({
      where: { id: session.id },
      // A timeout may occur after AWS accepted the launch. Reserve capacity
      // until reconciliation recovers the instance or expiry cleans it up.
      data: denied ? { status: "FAILED", endedAt: new Date() } : { status: "PROVISIONING", endedAt: null }
    }).catch(() => {});
    console.error("Windows simulation launch failed", { sessionId: session.id, code: error?.name || error?.code });
    if (denied) {
      throw new SimulationServiceError("AWS denied permission to create the Windows lab. Ask your administrator to check the backend AWS credentials and IAM restrictions.");
    }
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
      if (session.status !== "ACTIVE") {
        try {
          const health = await getEc2Client().send(new DescribeInstanceStatusCommand({
            InstanceIds: [session.ec2InstanceId], IncludeAllInstances: true
          }));
          const checks = health.InstanceStatuses?.find(item => item.InstanceId === session.ec2InstanceId);
          if (checks?.SystemStatus?.Status !== "ok" || checks?.InstanceStatus?.Status !== "ok") return session;
        } catch (error) {
          if (!["UnauthorizedOperation", "AccessDenied", "AccessDeniedException"].includes(error?.name || error?.code)) throw error;
          // Preserve existing connectivity when deployments lack this read permission.
          console.warn("Windows readiness health check unavailable: allow ec2:DescribeInstanceStatus in the backend IAM policy.");
        }
      }
      return prisma.simulationSession.update({
        where: { id: session.id },
        data: { status: session.status === "ACTIVE" ? "ACTIVE" : "READY", privateIp: instance.PrivateIpAddress }
      });
    }
    if (["shutting-down", "terminated"].includes(state)) {
      return prisma.simulationSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
    }
    if (["stopping", "stopped"].includes(state)) {
      await terminateWindowsSimulationSession(session);
      return prisma.simulationSession.findUnique({ where: { id: session.id } });
    }
    return session;
  } catch (error) {
    console.error("Windows simulation refresh failed", { sessionId: session.id, code: error?.name || error?.code });
    throw new SimulationServiceError("Unable to verify the Windows workspace. Please try again shortly.");
  }
}

async function terminateWindowsSimulationSession(session) {
  if (!session || (session.status === "ENDED" && !session.ec2InstanceId)) return session;
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
    if (instance && !hasExpectedSessionTag(instance, terminating)) throw new Error("Instance ownership tag mismatch.");
    if (instance && !["shutting-down", "terminated"].includes(instance.State?.Name)) {
      await getEc2Client().send(new TerminateInstancesCommand({ InstanceIds: [terminating.ec2InstanceId] }));
    }
    return prisma.simulationSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
  } catch (error) {
    if ((error?.name || error?.code) === "InvalidInstanceID.NotFound") {
      return prisma.simulationSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
    }
    console.error("Windows simulation termination failed", { sessionId: session.id, code: error?.name || error?.code });
    throw new SimulationServiceError("Unable to end the Windows workspace. It will be retried automatically.");
  }
}

async function cleanupExpiredWindowsSimulationSessions() {
  const expired = await prisma.simulationSession.findMany({
    where: { OR: [{ status: { in: ACTIVE_STATUSES }, expiresAt: { lt: new Date() } }, { status: "TERMINATING" }] },
    take: 100
  });
  await Promise.all(expired.map((session) => terminateWindowsSimulationSession(session).catch(() => null)));
  await reconcileWindowsSimulationInstances();
  return expired.length;
}

// Reconcile AWS independently of DB instance IDs, including launches interrupted
// between RunInstances and persistence. Only application-tagged instances qualify.
async function reconcileWindowsSimulationInstances() {
  if (!process.env.AWS_SIMULATION_LAUNCH_TEMPLATE_ID || !process.env.AWS_REGION) return;
  const client = getEc2Client();
  let nextToken;
  do {
    const response = await client.send(new DescribeInstancesCommand({
      Filters: [
        { Name: "tag:Project", Values: ["HelpDeskAI"] },
        { Name: "tag:Purpose", Values: ["UserSimulation"] },
        { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] }
      ], NextToken: nextToken
    }));
    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const tags = Object.fromEntries((instance.Tags || []).map(tag => [tag.Key, tag.Value]));
        if (!tags.SessionId || !instance.InstanceId) continue;
        const session = await prisma.simulationSession.findUnique({ where: { id: tags.SessionId } });
        const deadline = Date.parse(tags.AutoTerminateAt || "");
        const expired = Number.isFinite(deadline) && deadline <= Date.now();
        if (expired || !session || !ACTIVE_STATUSES.includes(session.status) || session.expiresAt <= new Date()) {
          await client.send(new TerminateInstancesCommand({ InstanceIds: [instance.InstanceId] }));
          if (session) await prisma.simulationSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
        } else if (!session.ec2InstanceId) {
          await prisma.simulationSession.update({ where: { id: session.id }, data: { ec2InstanceId: instance.InstanceId } });
        }
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);
}

module.exports = {
  countLiveWindowsInstances,
  ACTIVE_STATUSES,
  LIVE_STATUSES,
  reconcileWindowsSimulationInstances,
  SimulationServiceError,
  createWindowsSimulationSession,
  refreshWindowsSimulationSession,
  terminateWindowsSimulationSession,
  cleanupExpiredWindowsSimulationSessions
};
