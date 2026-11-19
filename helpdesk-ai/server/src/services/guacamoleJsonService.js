const crypto = require("crypto");
const {
  SimulationServiceError,
} = require("./windowsSimulationService");

function getGuacamoleConfig() {
  const baseUrl = String(
    process.env.GUACAMOLE_BASE_URL || ""
  )
    .trim()
    .replace(/\/$/, "");

  const launchUrl = String(
    process.env.GUACAMOLE_LAUNCH_URL || ""
  )
    .trim()
    .replace(/\/$/, "");

  const secret = String(
    process.env.GUAC_JSON_SECRET || ""
  ).trim();

  const username = String(
    process.env.WINDOWS_LAB_USERNAME || ""
  ).trim();

  const password = String(
    process.env.WINDOWS_LAB_PASSWORD || ""
  );

  const securityMode = String(
    process.env.WINDOWS_LAB_SECURITY || "any"
  )
    .trim()
    .toLowerCase();

  const ignoreCert =
    String(
      process.env.WINDOWS_LAB_IGNORE_CERT || "true"
    )
      .trim()
      .toLowerCase() === "true";

  const allowedSecurityModes = [
    "any",
    "nla",
    "tls",
    "rdp",
  ];

  if (
    !baseUrl ||
    !username ||
    (!require('./windowsCredentials').uniqueCredentialsEnabled() && !password) ||
    !/^[a-fA-F0-9]{32}$/.test(secret)
  ) {
    throw new SimulationServiceError(
      "Windows remote desktop access is not configured. Contact your administrator."
    );
  }

  if (!allowedSecurityModes.includes(securityMode)) {
    throw new SimulationServiceError(
      "Invalid Windows RDP security mode."
    );
  }

  for (const value of [baseUrl, launchUrl].filter(Boolean)) {
    let url;

    try {
      url = new URL(value);
    } catch (_) {
      throw new SimulationServiceError(
        "Invalid remote desktop URL configuration."
      );
    }

    if (
      !["http:", "https:"].includes(url.protocol) ||
      (
        process.env.NODE_ENV === "production" &&
        url.protocol !== "https:"
      )
    ) {
      throw new SimulationServiceError(
        "Production remote desktop access requires HTTPS."
      );
    }
  }

  return {
    baseUrl,
    launchUrl,
    secret: Buffer.from(secret, "hex"),
    username,
    password,
    securityMode,
    ignoreCert,
  };
}

function createGuacamoleUrl(session) {
  if (!session?.privateIp) {
    throw new SimulationServiceError(
      "Windows workspace is still starting. Please wait a moment.",
      409
    );
  }

  const {
    baseUrl,
    launchUrl,
    secret,
    username,
    password,
    securityMode,
    ignoreCert,
  } = getGuacamoleConfig();

  const tokenTtlSeconds = Math.min(
    Math.max(
      Number.parseInt(
        process.env.GUAC_URL_TTL_SECONDS || "300",
        10
      ) || 300,
      60
    ),
    900
  );

  const now = Date.now();

  const sessionExpiresAt = new Date(
    session.expiresAt
  ).getTime();

  const tokenExpiresAt =
    now + tokenTtlSeconds * 1000;

  const expires = Math.min(
    Number.isFinite(sessionExpiresAt) &&
    sessionExpiresAt > now
      ? sessionExpiresAt
      : tokenExpiresAt,
    tokenExpiresAt
  );

  const payload = JSON.stringify({
    username:
      `helpdesk-${session.userId}-${session.id}`,

    expires,

    connections: {
      "Windows Help Desk Lab": {
        protocol: "rdp",

        parameters: {
          hostname: session.privateIp,
          port: "3389",

          ...require('./windowsCredentials').credentials(session),

          security: securityMode,

          "ignore-cert":
            ignoreCert ? "true" : "false",
        },
      },
    },
  });

  const plaintext = Buffer.from(
    payload,
    "utf8"
  );

  const signature = crypto
    .createHmac("sha256", secret)
    .update(plaintext)
    .digest();

  const signedPayload = Buffer.concat([
    signature,
    plaintext,
  ]);

  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    secret,
    Buffer.alloc(16)
  );

  const encrypted = Buffer.concat([
    cipher.update(signedPayload),
    cipher.final(),
  ]);

  const data = encodeURIComponent(
    encrypted.toString("base64")
  );

  // Optional launcher hosted on the Guacamole
  // origin. It clears stale Guacamole browser
  // authentication before loading the new token.
  return launchUrl
    ? `${launchUrl}?data=${data}`
    : `${baseUrl}/?data=${data}`;
}

module.exports = {
  createGuacamoleUrl,
};
