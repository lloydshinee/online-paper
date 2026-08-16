# Violations: ownership scoping, atomic increment, resume seeding

Severity: MEDIUM-HIGH

Status: done

## What to build

The Proctoring violation recorder has three defects:

1. **No ownership binding** — any authenticated user can record violations against any submission ID, and reaching the limit force-expires the victim's In Progress submission mid-assessment. Scope the write to the requesting student's own submission.
2. **Lost-update race** — the counter is read-modify-write, so rapid tab switches lose increments and the limit is enforced late. Use an atomic increment (SQL `violations = violations + 1` via update expression or RPC) returning the new value.
3. **Wrong states accepted** — violations are recorded against already-submitted/expired submissions. Ignore rows that aren't In Progress.

Client side: the take page does not restore the violation count from the active submission on resume — after a reload at 2/3 violations the next tab switch shows "Violation 1 of 3" locally while the server is at 3. Seed the client counter from the server value.

CONTEXT.md: "Counted per submission, persisted server-side... When the violation count reaches the per-assessment limit, the assessment is auto-submitted."

## Acceptance criteria

- [ ] Recording a violation against another student's submission is rejected
- [ ] Concurrent violation increments are all counted (no lost updates; verify limit trips at exactly N)
- [ ] Violations on non-In-Progress submissions are ignored (no error to the legitimate client)
- [ ] After resume, the client banner count matches the server count
- [ ] Reaching the limit auto-submits with `expired` status (integrates with issue 02)
- [ ] Tests: ownership rejection, atomic increment under concurrency, limit auto-submit, off-by-one at boundary

## Blocked by

- `.scratch/code-review-2026-08/issues/02-enforce-deadline-on-write-paths.md` (expiry path + status semantics)

## Comments

- Completed by coding agent. Atomic increment_violation RPC (ownership-bound, in-progress only), recordViolation returns server count, take page seeds + syncs violation counter on resume. Migration: docs/full-migration.sql. Tests: __tests__/lib/violations.test.ts.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
