// Maintenance only. Never import this from the running API.
const dotenv = require("dotenv");
dotenv.config({ quiet: true });
dotenv.config({ path: ".security/owner.env", quiet: true, override: true });
