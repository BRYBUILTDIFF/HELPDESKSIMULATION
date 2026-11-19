const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
let calls,rows,total,accounts;
const db={
 user:{findMany:async query=>{calls.push(['users',query]);return query.select?.email?accounts:accounts.map(({id})=>({id}));}},
 adminAuditLog:{count:async query=>{calls.push(['count',query]);return total;},findMany:async query=>{calls.push(['events',query]);return rows;},groupBy:async query=>{calls.push(['actors',query]);return [{actorId:7},{actorId:99}];}},
 $transaction:async fn=>fn(db)
};
require.cache[require.resolve('../src/prisma')]={exports:db};
const {parseFilters,safeMetadata,listAuditEvents,listAuditActors}=require('../src/controllers/adminAuditController');
const response=()=>({headers:{},set(key,value){this.headers[key]=value;return this;},json(body){this.body=body;return this;}});
const fail=error=>{throw error;};
beforeEach(()=>{calls=[];rows=[{id:9007199254740993n,actorId:7,method:'PATCH',path:'/api/admin/users/4',status:200,at:new Date('2026-11-19T03:00:00Z'),metadata:{actorRole:'ADMIN',changedFields:['role','password'],requestedValues:{role:'ADMIN',password:'private'},before:{role:'USER'},secret:'private'}}];total=83;accounts=[{id:7,firstName:'Review',lastName:'Admin',email:'review@example.invalid'}];});
test('audit date filters include the full Philippine calendar day',()=>{
 const {where}=parseFilters({from:'2026-11-19',to:'2026-11-19',actorId:'7',result:'unrecorded'});
 assert.equal(where.at.gte.toISOString(),'2026-11-18T16:00:00.000Z');assert.equal(where.at.lt.toISOString(),'2026-11-19T16:00:00.000Z');assert.equal(where.status,0);assert.equal(where.actorId,7);
});
test('invalid audit filters fail before querying the database',()=>{
 for(const query of [{page:'0'},{page:'1; DROP TABLE'},{pageSize:'101'},{actorId:'-1'},{from:'2026-02-30'},{from:'2026-11-20',to:'2026-11-19'},{result:'pending'},{q:['one','two']},{q:'x'.repeat(201)}])assert.throws(()=>parseFilters(query),error=>error.status===400);
 assert.deepEqual(parseFilters({}).where,{});
});
test('audit metadata never exposes arbitrary request fields or credentials',()=>{
 const metadata=safeMetadata(rows[0].metadata);assert.deepEqual(metadata.changedFields,['role']);assert.deepEqual(metadata.requestedValues,{role:'ADMIN'});assert.deepEqual(metadata.before,{role:'USER'});assert.ok(!JSON.stringify(metadata).includes('private'));assert.equal(safeMetadata(null),null);
});
test('server-side pagination uses a stable order and serializes large event IDs exactly',async()=>{
 const res=response();await listAuditEvents({query:{page:'3',pageSize:'25',result:'failed'}},res,fail);
 const query=calls.find(([kind])=>kind==='events')[1];assert.equal(query.skip,50);assert.equal(query.take,25);assert.deepEqual(query.orderBy,[{at:'desc'},{id:'desc'}]);assert.deepEqual(query.where.status,{gte:400});assert.equal(res.body.events[0].id,'9007199254740993');assert.deepEqual(res.body.pagination,{page:3,pageSize:25,total:83,totalPages:4});assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.body.events[0].actor.id,7);
});
test('search is combined with result and administrator filters instead of replacing them',async()=>{
 const res=response();await listAuditEvents({query:{q:'Review',actorId:'7',result:'success'}},res,fail);
 const {where}=calls.find(([kind])=>kind==='events')[1];assert.equal(where.actorId,7);assert.deepEqual(where.status,{gte:200,lt:300});assert.ok(where.OR.some(condition=>condition.actorId?.in.includes(7)));assert.equal(where.OR[0].path.contains,'Review');
});
test('empty pages are clamped and deleted administrator records remain visible by ID',async()=>{
 total=0;rows=[{...rows[0],actorId:99,status:0,metadata:null}];const res=response();await listAuditEvents({query:{page:'10'}},res,fail);
 assert.equal(res.body.pagination.page,1);assert.equal(res.body.pagination.totalPages,1);assert.equal(res.body.events[0].actor,null);assert.equal(res.body.events[0].actorId,99);assert.equal(res.body.events[0].status,0);assert.equal(res.body.events[0].metadata,null);
});
test('administrator options come from historical actors, including deleted accounts',async()=>{
 const res=response();await listAuditActors({},res,fail);assert.equal(res.body.actors.length,2);assert.equal(res.body.actors[0].account.email,'review@example.invalid');assert.deepEqual(res.body.actors[1],{id:99,account:null});assert.equal(res.headers['Cache-Control'],'no-store');
});
