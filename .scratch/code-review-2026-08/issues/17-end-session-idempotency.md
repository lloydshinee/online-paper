# End Live Session idempotency: double-End duplicates submissions

Severity: HIGH

Status: done

## What to build

`endLiveSession` is not concurrency-safe: two calls both read `status='active'`, both sleep the flush grace period, and the guarded status update returns a 0-row success (not an error) for the loser — so both calls proceed to conversion, which inserts a fresh Submission per student each time. The End button is not disabled during the 5-second grace period, and nothing visibly happens for 5 seconds, making a double-click the expected user behavior. Result: two submissions per student from one session, bypassing retake policy and doubling grading entries.

Make ending idempotent: exactly one conversion per session. For example: make the status flip authoritative (return the pre-state via `.select()` and abort if the row was not `active`), or add a single-flight lock / unique guard on conversion (e.g. a per-session idempotency key on the generated submissions), and disable the End control client-side the moment it is clicked, with visible progress during the grace window.

## Acceptance criteria

- [ ] Two concurrent (or double-click) End invocations produce exactly one submission per student
- [ ] The losing End call returns a distinguishable result (e.g. "session already ended") rather than silently converting again
- [ ] The End button is disabled with visible progress for the duration of the end action
- [ ] A re-run of the session after End still works normally (no stale locks)
- [ ] Test: two concurrent endLiveSession calls → one submission row per student, one graded conversion

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. `endLiveSession` now flips the status authoritatively (`.update(...).in('status',['waiting','active']).select('*')`); the loser of a concurrent double-End gets no row and returns "Session already ended" without converting. Instructor page `handleEnd` sets an `ending` state that disables the End button and shows "Ending…" with a spinner until the action resolves; re-run still works (no locks). Tests: concurrent-End describe (two racing calls → one submission row, one graded conversion) + existing re-run tests stay green; E2E asserts the disabled "Ending…" state and exactly "1 submission".
- Verification: vitest 69/69 on affected files green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean, Playwright 7/7 green.
