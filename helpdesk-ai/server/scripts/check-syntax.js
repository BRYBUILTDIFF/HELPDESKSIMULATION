const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
function check(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, item.name);
    if (item.isDirectory()) check(target);
    else if (target.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", target], { stdio: "inherit" });
      if (result.status !== 0) process.exitCode = 1;
    }
  }
}
check("src"); check("scripts"); check("test");
