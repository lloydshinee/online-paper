# Live session membership and re-run retake gating

Severity: MEDIUM-HIGH

Status: done

## What to build

Two Live Session integrity defects:

1. **The "student cannot be in two active live sessions" check is answer-based and broken.** It infers participation from `live_answers` rows: a student who joined a session but hasn't answered yet is undetected (can sit in N sessions), and once a student has answer rows in 2+ non-ended sessions, the lookup uses a single-row fetch that errors — the error is swallowed and the guard returns "no active session", bypassing the block entirely. Replace inference with explicit membership: persist a session-membership row when a student joins (unique constraint per student across non-ended sessions), and enforce the CONTEXT.md constraint "A student cannot participate in two overlapping live sessions" against it.

2. **Re-running a live session bypasses retake policy.** Re-creating a session on an assessment whose previous session Ended resets it to Waiting; when it ends again, conversion inserts a brand-new Submission per student with no check of `retakes_allowed` — every student gets attempt #2 even when retakes are disallowed (and normal live retakes are impossible because starting submissions blocks Live mode, so this is the only retake path and it's ungated). Gate session re-creation on `retakes_allowed`, or make conversion explicitly replace prior live submissions for the same assessment with instructor disclosure.

## Acceptance criteria

- [ ] A student with an answer in an active session cannot join a second non-ended session (rejected)
- [ ] A student who joined but hasn't answered is also blocked from a second session
- [ ] The dual-session guard no longer depends on `maybeSingle`-style lookups that swallow multi-row results
- [ ] Re-running a session on a `retakes_allowed = false` assessment is blocked or explicitly consented, not silent
- [ ] Membership rows are cleaned up / scoped so ended sessions don't block future joins
- [ ] Tests: joined-not-answered dual join, answered dual join, re-run with retakes off

## Blocked by

- `.scratch/code-review-2026-08/issues/04-enrollment-and-live-write-gating.md` (write gating foundation)

## Comments

- Completed by coding agent. live_session_members table + overlap trigger; joinLiveSession action/service; hasActiveLiveSession membership-based; session re-run gated on retakes_allowed with clear error; membership cleaned on reset and scoped to non-ended sessions. Tests: membership describe in live-session-service.test.ts.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
