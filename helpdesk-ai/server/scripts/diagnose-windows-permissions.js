require('dotenv').config({ quiet: true });
const { EC2Client, RunInstancesCommand, DescribeLaunchTemplateVersionsCommand } = require('@aws-sdk/client-ec2');
(async () => {
  const client = new EC2Client({ region: process.env.AWS_REGION });
  const template = { LaunchTemplateId: process.env.AWS_SIMULATION_LAUNCH_TEMPLATE_ID, Version: process.env.AWS_SIMULATION_LAUNCH_TEMPLATE_VERSION || '$Default' };
  try {
    const response = await client.send(new DescribeLaunchTemplateVersionsCommand({ LaunchTemplateId: template.LaunchTemplateId, Versions: [template.Version] }));
    const version = response.LaunchTemplateVersions?.[0];
    const data = version?.LaunchTemplateData;
    console.log(JSON.stringify({ stage: 'template', version: version?.VersionNumber, imageId: data?.ImageId, instanceType: data?.InstanceType, hasInstanceProfile: !!data?.IamInstanceProfile }));
  } catch (error) { console.log(JSON.stringify({ code: error.name, message: String(error.message || '').split('Encoded authorization failure message:')[0].trim(), requestId: error.$metadata?.requestId })); }
  try {
    await client.send(new RunInstancesCommand({ DryRun: true, MinCount: 1, MaxCount: 1, LaunchTemplate: template, MetadataOptions: { HttpTokens: 'required', HttpPutResponseHopLimit: 1, InstanceMetadataTags: 'disabled' }, TagSpecifications: [{ ResourceType: 'instance', Tags: Object.entries({ Project: 'HelpDeskAI', Purpose: 'UserSimulation', SessionId: 'permission-diagnostic', UserId: 'diagnostic', ModuleId: 'diagnostic', AutoTerminateAt: new Date(Date.now() + 1200000).toISOString() }).map(([Key, Value]) => ({ Key, Value })) }] }));
  } catch (error) { console.log(JSON.stringify({ code: error.name, message: String(error.message || '').split('Encoded authorization failure message:')[0].trim(), requestId: error.$metadata?.requestId })); }
})().catch(error => { console.error(error.name); process.exitCode = 1; });
