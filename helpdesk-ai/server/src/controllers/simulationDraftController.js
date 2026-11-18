const prisma = require('../prisma');
const { normalizeSimulation, getModuleById } = require('../store/simulationModuleStore');
const { redactSecrets, redactObject } = require('../utils/redact');
const cleanJson = value => JSON.parse(JSON.stringify(value));
const fail = (status, message) => Object.assign(new Error(message), { status, publicMessage: message });

async function createStoredDraft(ownerId, input) {
  if(await prisma.simulationDraft.count({where:{ownerId,state:'DRAFT'}})>=100) throw fail(409,'You have 100 saved drafts. Discard an old draft before creating another.');
  const simulation = normalizeSimulation(input.simulation, input.title);
  if (!simulation) throw fail(400, 'A draft needs at least one step.');
  return prisma.simulationDraft.create({ data: {
    ownerId, moduleId: input.moduleId || null,
    title: redactSecrets(input.title || simulation.title).slice(0, 160),
    category: redactSecrets(input.category || 'General').slice(0, 80),
    difficulty: ['Easy', 'Medium', 'Hard'].includes(input.difficulty) ? input.difficulty : 'Medium',
    sourcePrompt: redactSecrets(input.sourcePrompt).slice(0, 4000) || null,
    simulation: cleanJson(simulation),
    ...(input.generation ? { generation: cleanJson(redactObject(input.generation)) } : {})
  } });
}
async function listDrafts(req, res, next) { try {
  return res.json({ drafts: await prisma.simulationDraft.findMany({ where: { ownerId: req.user.id, state: 'DRAFT' }, orderBy: { updatedAt: 'desc' }, take: 100 }) });
} catch (e) { next(e); } }
async function getDraft(req,res,next){try{
  const draft=await prisma.simulationDraft.findFirst({where:{id:req.params.id,ownerId:req.user.id,state:'DRAFT'}});
  if(!draft)throw fail(404,'Draft not found.');
  const runtime=require('../services/terminalRuntime');
  const definition=normalizeSimulation(draft.simulation);
  const receipt=await prisma.simulationTestReceipt.findFirst({where:{actorId:req.user.id,definitionHash:runtime.definitionHash(definition),expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'}});
  return res.json({draft:{...draft,test:receipt?{definition,nextStep:receipt.stepsCompleted,mistakes:receipt.mistakes,completed:true,output:receipt.events[receipt.events.length-1]?.output||'',testReceiptId:receipt.id,testToken:runtime.signTest(definition,req.user.id,receipt.id)}:null}});
}catch(e){next(e);}}
async function createDraft(req, res, next) { try {
  const module = req.body.moduleId ? await getModuleById(req.body.moduleId) : null;
  if (req.body.moduleId && !module) throw fail(404, 'Module not found.');
  const input = module ? { ...module, moduleId: module.id, generation: { baseRevision: module.revision } } : req.body;
  return res.status(201).json({ draft: await createStoredDraft(req.user.id, input) });
} catch (e) { next(e); } }
async function updateDraft(req, res, next) { try {
  const version = req.body.version;
  if (!Number.isInteger(version) || version < 1) throw fail(400, 'A draft version is required.');
  const simulation = normalizeSimulation(req.body.simulation);
  if (!simulation) throw fail(400, 'A draft needs at least one step.');
  const draft = await prisma.$transaction(async tx => {
    const changed = await tx.simulationDraft.updateMany({ where: { id: req.params.id, ownerId: req.user.id, version, state: 'DRAFT' }, data: { simulation: cleanJson(simulation), version: { increment: 1 } } });
    if (!changed.count) throw fail(409, 'This draft changed elsewhere. Reopen the saved draft before editing again.');
    return tx.simulationDraft.findUnique({ where: { id: req.params.id } });
  });
  return res.json({ draft });
} catch (e) { next(e); } }
async function discardDraft(req, res, next) { try {
  await prisma.simulationDraft.deleteMany({ where: { id: req.params.id, ownerId: req.user.id, state: 'DRAFT' } });
  return res.json({ discarded: true });
} catch (e) { next(e); } }
async function revisions(req, res, next) { try {
  return res.json({ revisions: await prisma.simulationRevision.findMany({ where: { moduleId: req.params.id }, orderBy: { revision: 'desc' }, take: 100 }) });
} catch (e) { next(e); } }
module.exports = { createStoredDraft, listDrafts, getDraft, createDraft, updateDraft, discardDraft, revisions };
