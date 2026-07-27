const crypto = require("crypto");
const { SimulationServiceError } = require("./windowsSimulationService");

function getGuacamoleConfig() {
  const baseUrl = String(process.env.GUACAMOLE_BASE_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.GUAC_JSON_SECRET || "").trim();
  const username = String(process.env.WINDOWS_LAB_USERNAME || "").trim();
  const password = String(process.env.WINDOWS_LAB_PASSWORD || "");
  if (!baseUrl || !username || !password || !/^[a-fA-F0-9]{32}$/.test(secret)) {
    throw new SimulationServiceError("Windows remote desktop access is not configured. Contact your administrator.");
  }
  return { baseUrl, secret: Buffer.from(secret, "hex"), username, password };
}

function createGuacamoleUrl(session) {
  if (!session?.privateIp) throw new SimulationServiceError("Windows workspace is still starting. Please wait a moment.", 409);
  const { baseUrl, secret, username, password } = getGuacamoleConfig();
  const expires = Date.now() + 2 * 60 * 1000;
  const payload = JSON.stringify({
    username: `helpdesk-${session.userId}-${session.id}`,
    expires,
    connections: {
      "Windows Help Desk Lab": {
        protocol: "rdp",
        parameters: {
          hostname: session.privateIp,
          port: "3389",
          username,
          password,
          security: "nla",
          "ignore-cert": "true"
        }
      }
    }
  });
  const plaintext = Buffer.from(payload, "utf8");
  const signature = crypto.createHmac("sha256", secret).update(plaintext).digest();
  const cipher = crypto.createCipheriv("aes-128-cbc", secret, Buffer.alloc(16));
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([signature, plaintext])), cipher.final()]);
  return `${baseUrl}/?data=${encodeURIComponent(encrypted.toString("base64"))}`;
}

module.exports = { createGuacamoleUrl };
