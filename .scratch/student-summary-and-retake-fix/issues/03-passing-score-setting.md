Status: ready-for-agent

## Parent

Feature: student summary and retake fix (this directory). Term defined in `CONTEXT.md` under **Passing Score**.

## What to build

Let instructors set an optional **Passing Score** on an assessment, expressed as a percentage of total points (integer 0–100). Blank means the assessment has no pass/fail threshold.

Add the field to the assessment Settings tab: label it clearly as a percentage, validate integer within 0–100, persist to the dormant `assessments.passing_score` column. It stays editable at any point in the assessment's lifecycle — including after submissions exist — because whether a student failed is derived at read time (authoritative score ÷ total question points vs threshold), never stored. Editing questions or point values later therefore never changes the threshold's meaning; nothing needs recalculating.

Before building, verify the deployed database actually has the `passing_score` column (it exists in `docs/full-migration.sql` but may predate this deployment). If absent, ship an incremental migration adding it as a nullable integer with no default-change to existing rows.

This slice deliberately has no consumer yet — the Student Summary matrix (separate issue) is what reads it for the Failed state.

## Acceptance criteria

- [ ] Settings tab shows a Passing Score (%) field; blank is a valid saved state meaning "no threshold"
- [ ] Only integers 0–100 are accepted; out-of-range and non-integer input is rejected with a clear message
- [ ] Value persists across reloads and survives re-editing
- [ ] Field remains editable after submissions exist, with no effect on existing scores
- [ ] Deployed schema confirmed (or migrated) to include nullable `assessments.passing_score`
- [ ] Tests cover save/clear/validation round-trip

## Blocked by

None - can start immediately.
