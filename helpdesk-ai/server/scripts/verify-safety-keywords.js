require('dotenv').config({quiet:true});
const assert=require('node:assert/strict');
const {randomUUID}=require('crypto');
const prisma=require('../src/prisma');
const {generateAccessToken}=require('../src/utils/jwt');
const {evaluateContentSafety,configuredSafetyBlock}=require('../src/policy/contentSafety');
const {getPolicyRuntimeConfig}=require('../src/store/policyConfigStore');
const {safetyViolation}=require('../src/services/sessionRestrictionService');
async function main(){
 let admin,user,fixture;
 const term='verification-'+randomUUID();
 const request=async(actor,route,method='GET',body)=>{
  const res=await fetch('http://127.0.0.1:5000/api/admin/policy/config'+route,{method,headers:{Authorization:'Bearer '+generateAccessToken({id:actor.id,tokenVersion:actor.tokenVersion}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();assert.ok(res.ok,'API request failed: '+res.status);return data;
 };
 try{
  const create=role=>prisma.user.create({data:{email:'policy-'+randomUUID()+'@example.invalid',passwordHash:'test-only-unusable',firstName:'Policy verification',lastName:'Disposable',role}});
  admin=await create('ADMIN');user=await create('USER');
  const initial=await request(admin,'');
  assert.equal(initial.safetyRules.threatProtection,true);
  assert.equal(initial.safetyRules.protectedKeywords,undefined);
  const denied=await fetch('http://127.0.0.1:5000/api/admin/policy/config/safetyBlockedKeywords',{method:'POST',headers:{Authorization:'Bearer '+generateAccessToken({id:user.id,tokenVersion:user.tokenVersion}),'Content-Type':'application/json'},body:JSON.stringify({value:term})});
  assert.equal(denied.status,403);
  let data=await request(admin,'/safetyBlockedKeywords','POST',{value:term});fixture=term;
  assert.ok(data.config.safetyBlockedKeywords.includes(term));
  assert.equal((await evaluateContentSafety(term)).code,'SAFETY_CUSTOM_KEYWORD');
  assert.ok(safetyViolation({blocked:true,code:'SAFETY_CUSTOM_KEYWORD'}));
  let index=data.config.safetyBlockedKeywords.indexOf(term);
  data=await request(admin,'/safetyBlockedKeywords/'+index,'PATCH',{value:term+'-updated'});fixture=term+'-updated';
  assert.equal(configuredSafetyBlock(term,(await getPolicyRuntimeConfig()).safetyBlockedKeywords),null);
  assert.equal((await evaluateContentSafety(fixture)).code,'SAFETY_CUSTOM_KEYWORD');
  index=data.config.safetyBlockedKeywords.indexOf(fixture);
  data=await request(admin,'/safetyBlockedKeywords/'+index,'DELETE');fixture=null;
  assert.deepEqual(data.config.safetyBlockedKeywords,initial.config.safetyBlockedKeywords);
  assert.equal(configuredSafetyBlock(term+'-updated',(await getPolicyRuntimeConfig()).safetyBlockedKeywords),null);
  assert.equal((await evaluateContentSafety('I will kill you')).code,'SAFETY_THREAT');
  console.log('Live safety keyword checks passed: admin-only CRUD, database persistence, immediate runtime refresh, literal removal, baseline protection, and cooldown classification. No external AI request was made.');
 }finally{
  if(fixture){await prisma.policyRule.deleteMany({where:{type:'SAFETY_BLOCK_KEYWORD',value:fixture}});await prisma.policyConfig.update({where:{id:1},data:{version:{increment:1}}});}
  for(const actor of [admin,user])if(actor)await prisma.user.delete({where:{id:actor.id}});
  await prisma.$disconnect();
 }
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
