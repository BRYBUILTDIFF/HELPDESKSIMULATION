require("./owner-config");
const { spawn } = require("child_process");
if (!process.env.ADMIN_DATABASE_URL) { console.error("Set ADMIN_DATABASE_URL for migrations; runtime credentials are intentionally not schema owners."); process.exit(1); }
const child = spawn(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", process.argv[2] === "dev" ? "dev" : "deploy"], {
  stdio: "inherit", env: { ...process.env, DATABASE_URL: process.env.ADMIN_DATABASE_URL }
});
child.on("error", () => { process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code || 0; });
