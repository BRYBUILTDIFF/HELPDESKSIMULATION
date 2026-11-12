-- Move the former hardcoded keyword list into editable policy rules without overwriting existing entries.
INSERT INTO "PolicyRule" ("id", "type", "value", "position", "enabled", "createdAt", "updatedAt")
SELECT 'managed-safety-' || md5(term), 'SAFETY_BLOCK_KEYWORD'::"PolicyRuleType", term,
  COALESCE((SELECT MAX("position") + 1 FROM "PolicyRule" WHERE "type" = 'SAFETY_BLOCK_KEYWORD'), 0) + ord::integer,
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM unnest(ARRAY['porn','pornography','nude','nudes','nudity','sexual','sex','explicit sex','hookup']) WITH ORDINALITY AS terms(term, ord)
ON CONFLICT ("type", "value") DO NOTHING;
UPDATE "PolicyConfig" SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1;
