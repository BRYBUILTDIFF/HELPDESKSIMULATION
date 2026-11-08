const { test } = require("node:test");
const assert = require("node:assert/strict");
const { redactSecrets } = require("../src/utils/redact");
const { PASSWORD_REGEX } = require("../src/utils/security");
const handler = require("../src/middleware/errorHandler");
test("sensitive log and provider fields are redacted before use", () => {
  const text = "password=hunter123 Bearer abc.def.ghi AKIAABCDEFGHIJKLMNOP sk-1234567890123456 postgres://user:secret@host/db";
  const clean = redactSecrets(text);
  for (const secret of ["hunter123", "abc.def.ghi", "AKIAABCDEFGHIJKLMNOP", "sk-1234567890123456", ":secret@"]) assert.ok(!clean.includes(secret));
});
test("malformed and oversized requests preserve 400 and 413 without returning request bodies", () => {
  for (const status of [400, 413]) {
    const res = { status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
    handler({ status, body: "password=private", type: status === 413 ? "entity.too.large" : "entity.parse.failed" }, {}, res, () => {});
    assert.equal(res.code, status); assert.ok(!JSON.stringify(res.body).includes("private"));
  }
});
test("new passwords support passphrases and prevent bcrypt truncation", () => {
  assert.equal(PASSWORD_REGEX.test("a long useful passphrase"), true);
  assert.equal(PASSWORD_REGEX.test("Admin@1234"), false);
  assert.equal(PASSWORD_REGEX.test("a".repeat(73)), false);
  assert.equal(PASSWORD_REGEX.test("\u{1F600}".repeat(19)), false);
});
