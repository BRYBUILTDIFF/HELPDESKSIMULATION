const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.SECURITY_ENCRYPTION_KEY='a'.repeat(64);
process.env.JWT_ACCESS_SECRET='test-only-security-access-secret-at-least-32-characters';
const {seal,open}=require('../src/utils/encryptedSecret');
const mfa=require('../src/services/adminMfa');
test('encrypted secrets resist tampering and cannot be moved between purposes',()=>{
 const encrypted=seal('private','mfa:1');assert.equal(open(encrypted,'mfa:1'),'private');assert.throws(()=>open(encrypted,'lab:1'));
 const parts=encrypted.split('.');parts[1]=Buffer.alloc(16).toString('base64url');assert.throws(()=>open(parts.join('.'),'mfa:1'));
});
test('TOTP matches RFC 6238 and rejects replay and malformed codes',()=>{
 const secret=mfa.base32(Buffer.from('12345678901234567890'));
 assert.equal(mfa.totp(secret,1),'287082');assert.equal(mfa.matchCounter(secret,'287082',-1,59000),1);
 assert.equal(mfa.matchCounter(secret,'287082',1,59000),null);assert.equal(mfa.matchCounter(secret,'wrong',-1,59000),null);
});
test('admin proof binds account, token version, purpose and factor',()=>{
 const user={id:1,tokenVersion:2};const token=mfa.issueProof(user,'factor');
 assert.ok(mfa.verifyProof(token,user,'factor'));
 assert.equal(mfa.verifyProof(token,{...user,id:2},'factor'),null);
 assert.equal(mfa.verifyProof(token,{...user,tokenVersion:3},'factor'),null);
 assert.equal(mfa.verifyProof(token,user,'another-factor'),null);
});
test('per-instance credentials cannot be reused on another session',async()=>{
 const previous=process.env.WINDOWS_UNIQUE_CREDENTIALS;process.env.WINDOWS_UNIQUE_CREDENTIALS='true';
 const service=require('../src/services/windowsCredentials');const rows=new Map();
 const db={simulationSession:{updateMany:async({where,data})=>Object.assign(rows.get(where.id),data),findUnique:async({where})=>rows.get(where.id)}};
 try {
  for(const id of ['lab-a','lab-b']){rows.set(id,{id,credential:null});await service.prepare(rows.get(id),db);}
  const a=service.credentials(rows.get('lab-a')),b=service.credentials(rows.get('lab-b'));assert.notEqual(a.password,b.password);
  assert.throws(()=>service.credentials({...rows.get('lab-a'),id:'lab-b'}));
  const before=rows.get('lab-a').credential;await service.prepare(rows.get('lab-a'),db);assert.equal(rows.get('lab-a').credential,before);
  const script=Buffer.from(service.userData(rows.get('lab-a')),'base64').toString();assert.ok(script.includes('Set-LocalUser'));assert.ok(!script.includes('Write-Host'));
 }finally{if(previous===undefined)delete process.env.WINDOWS_UNIQUE_CREDENTIALS;else process.env.WINDOWS_UNIQUE_CREDENTIALS=previous;}
});
test('secret scanning detects added credentials without returning their values',()=>{
 const {scan}=require('../scripts/scan-new-secrets');
 const fake='sk-'+ 'a'.repeat(30);const findings=scan(`+++ b/config.txt\n@@ -0,0 +1 @@\n+KEY=${fake}\n`);
 assert.deepEqual(findings,[{file:'config.txt',line:1}]);assert.ok(!JSON.stringify(findings).includes(fake));
});
