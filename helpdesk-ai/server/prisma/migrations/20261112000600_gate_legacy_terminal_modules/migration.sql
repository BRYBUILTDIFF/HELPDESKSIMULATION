-- Preserve legacy lesson text for admin repair; do not serve unassessable terminal modules.
UPDATE "SimulationModule" SET "enabled" = false WHERE "simulation"->>'surface' IN ('windows-terminal','mac-terminal') AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE("simulation"->'steps','[]'::jsonb)) AS step WHERE COALESCE(step->>'actionId','') = '' OR step->>'type' IS NULL);
