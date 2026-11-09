// Read-only schema inspection. Never prints connection strings, rows or prompts.
require("dotenv").config();
const { PrismaClient, Prisma } = require("@prisma/client");
const prisma = new PrismaClient({ log: [] });
const types = { Int: ["int4"], BigInt: ["int8"], String: ["text", "varchar", "bpchar", "uuid"], Boolean: ["bool"], DateTime: ["timestamp", "timestamptz"], Json: ["jsonb", "json"], Float: ["float8", "float4"] };
async function main() {
  await prisma.$queryRaw`SELECT 1`;
  console.log("Database connection: OK");
  const schema = new URL(process.env.DATABASE_URL).searchParams.get("schema") || "public";
  const columns = await prisma.$queryRaw`SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE table_schema = ${schema}`;
  let issues = 0;
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName || model.name;
    for (const field of model.fields.filter(field => field.kind !== "object")) {
      const column = field.dbName || field.name;
      const actual = columns.find(item => item.table_name === table && item.column_name === column);
      if (!actual) { console.log(`MISSING: ${table}.${column}`); issues++; }
      else if (types[field.type] && !types[field.type].includes(actual.udt_name)) {
        console.log(`TYPE MISMATCH: ${table}.${column}: database=${actual.udt_name}, Prisma=${field.type}`); issues++;
      }
    }
  }
  const indexes = await prisma.$queryRaw`
    SELECT t.relname::text AS table_name, array_agg(a.attname::text ORDER BY k.ordinality) AS columns
    FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, ordinality) ON k.ordinality <= i.indnkeyatts
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname = ${schema} AND i.indisunique AND i.indpred IS NULL AND i.indisvalid
    GROUP BY t.relname, i.indexrelid`;
  for (const model of Prisma.dmmf.datamodel.models) {
    const uniqueSets = [...(model.uniqueFields || []), ...(model.primaryKey ? [model.primaryKey.fields] : []),
      ...model.fields.filter(field => field.isId || field.isUnique).map(field => [field.name])];
    for (const fields of uniqueSets) {
      const names = fields.map(name => model.fields.find(field => field.name === name)?.dbName || name).sort();
      if (!indexes.some(index => index.table_name === (model.dbName || model.name) && [...index.columns].sort().join(",") === names.join(","))) {
        console.log(`MISSING UNIQUE INDEX: ${model.name}(${names.join(", ")})`); issues++;
      }
    }
  }
  console.log("Schema discrepancies:", issues);
  console.log("Prisma client version:", Prisma.prismaVersion.client);
  if (issues) process.exitCode = 1;
}
main().catch(error => { console.error("Database diagnosis failed", { name: error.name, code: error.code || "UNKNOWN" }); process.exitCode = 1; }).finally(() => prisma.$disconnect());
