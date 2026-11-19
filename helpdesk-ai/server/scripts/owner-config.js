// Maintenance only. Never import this from the running API.
const dotenv = require("dotenv");
const envFileIndex = process.argv.indexOf("--env-file");
if (envFileIndex >= 0) {
  const file = process.argv[envFileIndex + 1];
  if (!file || file.startsWith("--")) throw new Error("--env-file requires a maintenance environment file path");
  const result = dotenv.config({ path: file, quiet: true, override: true });
  if (result.error) throw new Error("Could not read the requested maintenance environment file");
} else {
  dotenv.config({ quiet: true });
  dotenv.config({ path: ".security/owner.env", quiet: true, override: true });
}
