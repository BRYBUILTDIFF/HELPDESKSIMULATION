UPDATE "PolicyRule"
SET "value" = CASE "value"
  WHEN $$^hi\b$$ THEN 'hi'
  WHEN $$^hello\b$$ THEN 'hello'
  WHEN $$^hey\b$$ THEN 'hey'
  WHEN $$^good morning\b$$ THEN 'good morning'
  WHEN $$^good afternoon\b$$ THEN 'good afternoon'
  WHEN $$^good evening\b$$ THEN 'good evening'
  WHEN $$^yo\b$$ THEN 'yo'
  WHEN $$^hi there\b$$ THEN 'hi there'
  WHEN $$^hello there\b$$ THEN 'hello there'
  ELSE "value"
END
WHERE "type" = 'GREETING_PATTERN';

DELETE FROM "PolicyRule"
WHERE "type" = 'IN_SCOPE_INTENT'
  AND "value" IN (
    $$\b(not working|won't work|doesn't work|stopped working)\b$$,
    $$\b(can't connect|cannot connect|unable to connect|connection (failed|dropped|lost))\b$$,
    $$\b(error|failed|failure|fault|malfunction|corrupted|crash(ed|ing)?)\b$$,
    $$\b(how (do i|to) (fix|reset|configure|set up|setup|install|uninstall|update|enable|disable|unlock|recover))\b$$,
    $$\b(steps to (fix|resolve|troubleshoot|reset|configure))\b$$,
    $$\b(reset|unlock|recover|configure|setup|set up)\b.*\b(password|account|network|device|printer|computer|laptop|email|vpn|wifi)\b$$,
    $$\b(troubleshoot|diagnose|fix|resolve)\b.*\b(issue|problem|error|fault)\b$$
  );

INSERT INTO "PolicyRule" ("id", "type", "value", "position", "enabled", "createdAt", "updatedAt")
SELECT
  'plain-intent-' || LPAD(ordinality::text, 3, '0'),
  'IN_SCOPE_INTENT'::"PolicyRuleType",
  phrase,
  ordinality - 1,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM UNNEST(ARRAY[
  'not working', 'won''t work', 'doesn''t work', 'stopped working',
  'can''t connect', 'cannot connect', 'unable to connect',
  'connection failed', 'connection dropped', 'connection lost',
  'error', 'failed', 'failure', 'fault', 'malfunction', 'corrupted',
  'crash', 'crashed', 'crashing',
  'how do i fix', 'how to fix', 'how do i reset', 'how to reset',
  'how do i configure', 'how to configure', 'how do i set up', 'how to set up',
  'how do i install', 'how to install', 'how do i uninstall', 'how to uninstall',
  'how do i update', 'how to update', 'how do i enable', 'how to enable',
  'how do i disable', 'how to disable', 'how do i unlock', 'how to unlock',
  'how do i recover', 'how to recover',
  'steps to fix', 'steps to resolve', 'steps to troubleshoot', 'steps to reset', 'steps to configure',
  'reset password', 'unlock account', 'recover account', 'configure network', 'set up printer',
  'troubleshoot issue', 'diagnose problem', 'fix error', 'resolve fault'
]) WITH ORDINALITY AS phrases(phrase, ordinality)
ON CONFLICT ("type", "value") DO UPDATE SET
  "position" = EXCLUDED."position",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "PolicyConfig"
SET "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 1;
