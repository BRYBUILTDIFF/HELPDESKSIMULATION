const {test}=require('node:test');const assert=require('node:assert/strict');
let terminated=[];
class DescribeInstancesCommand{constructor(input){this.input=input;}}
class TerminateInstancesCommand{constructor(input){this.input=input;}}
const instance=(id,tags)=>({InstanceId:id,Tags:Object.entries(tags).map(([Key,Value])=>({Key,Value}))});
const sdk={DescribeInstancesCommand,TerminateInstancesCommand,EC2Client:class{async send(command){
 if(command instanceof DescribeInstancesCommand)return {Reservations:[{Instances:[instance('bad',{SessionId:'one',AutoTerminateAt:'invalid'}),instance('denied',{SessionId:'two',AutoTerminateAt:'2000-01-01T00:00:00Z'}),instance('expired',{SessionId:'three',AutoTerminateAt:'2000-01-01T00:00:00Z'})]}]};
 const id=command.input.InstanceIds[0];if(id==='denied')throw new Error('denied');terminated.push(id);return {};
}}};
test('watchdog continues other expired instances and signals failures for alerting',async()=>{
 const sandbox={exports:{},console,Date,require:name=>{assert.equal(name,'@aws-sdk/client-ec2');return sdk;}};
 require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../infrastructure/aws/cleanup-watchdog.js'),'utf8'),sandbox);
 await assert.rejects(sandbox.exports.handler(),/requires attention/);assert.deepEqual(terminated,['expired']);
});
