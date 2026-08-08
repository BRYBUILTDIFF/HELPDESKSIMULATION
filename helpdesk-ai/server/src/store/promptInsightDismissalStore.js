const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "../../data");
const DISMISSALS_PATH = path.join(DATA_DIR, "prompt-insight-dismissals.json");

function loadDismissals() {
  try {
    if (!fs.existsSync(DISMISSALS_PATH)) {
      return new Set();
    }
    const parsed = JSON.parse(fs.readFileSync(DISMISSALS_PATH, "utf8"));
    const keys = Array.isArray(parsed?.keys) ? parsed.keys : [];
    return new Set(keys.filter((key) => typeof key === "string" && key.trim()).map((key) => key.trim()));
  } catch (_err) {
    return new Set();
  }
}

const dismissedKeys = loadDismissals();

function persistDismissals() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload = {
    keys: Array.from(dismissedKeys).sort(),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(DISMISSALS_PATH, JSON.stringify(payload, null, 2), "utf8");
}

function isPromptInsightDismissed(...keys) {
  return keys.some((key) => dismissedKeys.has(String(key || "").trim()));
}

function dismissPromptInsight(...keys) {
  keys
    .map((key) => String(key || "").trim())
    .filter(Boolean)
    .forEach((key) => dismissedKeys.add(key));
  persistDismissals();
}

module.exports = {
  dismissPromptInsight,
  isPromptInsightDismissed
};
