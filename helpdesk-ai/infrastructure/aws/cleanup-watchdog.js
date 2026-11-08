// Deploy separately from the API and schedule every five minutes.
// Scope this function's IAM policy to application-tagged lab instances.
const { EC2Client, DescribeInstancesCommand, TerminateInstancesCommand } = require("@aws-sdk/client-ec2");
const ec2 = new EC2Client({});
exports.handler = async () => {
  let nextToken;
  let terminated = 0;
  do {
    const response = await ec2.send(new DescribeInstancesCommand({ Filters: [
      { Name: "tag:Project", Values: ["HelpDeskAI"] },
      { Name: "tag:Purpose", Values: ["UserSimulation"] },
      { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] }
    ], NextToken: nextToken }));
    for (const reservation of response.Reservations || []) for (const instance of reservation.Instances || []) {
      const tags = Object.fromEntries((instance.Tags || []).map(tag => [tag.Key, tag.Value]));
      const deadline = Date.parse(tags.AutoTerminateAt || "");
      if (!tags.SessionId || !Number.isFinite(deadline)) {
        console.error("Lab requires manual expiry review", { instanceId: instance.InstanceId }); continue;
      }
      if (deadline <= Date.now()) {
        await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instance.InstanceId] })); terminated++;
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);
  return { terminated };
};
