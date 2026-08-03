const crypto = require("crypto");
const { SimulationServiceError } = require("./windowsSimulationService");

function getGuacamoleConfig() {
  const baseUrl = String(process.env.GUACAMOLE_BASE_URL || "").trim().replace(/\/$/, "");
  const launchUrl = String(process.env.GUACAMOLE_LAUNCH_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.GUAC_JSON_SECRET || "").trim();
  const username = String(process.env.WINDOWS_LAB_USERNAME || "").trim();
  const password = String(process.env.WINDOWS_LAB_PASSWORD || "");
  if (!baseUrl || !username || !password || !/^[a-fA-F0-9]{32}$/.test(secret)) {
    throw new SimulationServiceError("Windows remote desktop access is not configured. Contact your administrator.");
  }
  return { baseUrl, launchUrl, secret: Buffer.from(secret, "hex"), username, password };
}

function createGuacamoleUrl(session) {
  if (!session?.privateIp) throw new SimulationServiceError("Windows workspace is still starting. Please wait a moment.", 409);
  const { baseUrl, launchUrl, secret, username, password } = getGuacamoleConfig();
  const tokenTtlSeconds = Math.min(Math.max(Number.parseInt(process.env.GUAC_URL_TTL_SECONDS || "300", 10) || 300, 60), 900);
  const sessionExpiresAt = new Date(session.expiresAt).getTime();
  const expires = Math.min(
    Number.isFinite(sessionExpiresAt) && sessionExpiresAt > Date.now() ? sessionExpiresAt : Date.now() + tokenTtlSeconds * 1000,
    Date.now() + tokenTtlSeconds * 1000
  );
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
  const data = encodeURIComponent(encrypted.toString("base64"));
  // The optional launcher is hosted by Guacamole, allowing it to clear only
  // its own stale browser authentication state before loading this URL.
  return launchUrl ? `${launchUrl}?data=${data}` : `${baseUrl}/?data=${data}`;
}

module.exports = { createGuacamoleUrl };
