const common = new Set(["password123!", "password@123", "admin@1234", "user@1234", "qwerty123!", "password1234!"]);
export const passwordAllowed = value => typeof value === "string" && value.length >= 12 && new TextEncoder().encode(value).length <= 72 && !common.has(value.toLowerCase());
export const passwordHelp = "Use at least 12 characters, at most 72 UTF-8 bytes, and avoid common passwords.";
