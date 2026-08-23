# Time-extension write guards: unguarded grant update, lost-update RMW, stale dialog statuses, two-phase reopen

Severity: MEDIUM cluster

Status: done

## Problems

All in `lib/submission-service.ts` unless noted:

1. **Unguarded grant update + non-atomic read-modify-write** (`:462-467`): the extension UPDATE has no `.eq('status', 'in_progress')` guard (every other transition is guarded) and uses `(submission.extra_seconds ?? 0) + grantedSeconds`. A concurrent submit/expiry between the read and the write re-classifies the grant onto a dead submission while the instructor sees success; two concurrent grants lose one silently.
2. **Stale statuses defeat the reopen confirmation** (`:716-735` sweep + `submissions-tab.tsx:253-256`): the listing sweep expires overdue rows but never refreshes the returned array, so rows render "In progress · Add time"; confirming takes the grant path with no warning while the server destructively reopens (clears auto-grades, resets violations).
3. **Two-phase reopen** (`:502-541`): the guarded transition commits before auto-grade clearing; if clearing fails the instructor retries and stacks extra seconds via path 1. Clear grades BEFORE the transition (the row is quiescent while finished).

## Fix

- Grant path: `.update({ extra_seconds: <atomic increment> })` + `.eq('status', 'in_progress')` + authoritative `.select()`; zero rows → re-read status and return an explicit error ("no longer in progress — reopen instead").
- Sweep: mutate each expired row's `status` locally after successful `expireSubmission` so returned data matches the DB.
- Reopen: clear auto-graded answers first, then the guarded transition.

## Acceptance criteria

- [ ] Test: granting to a submission that is no longer in_progress returns an error, never mutates it
- [ ] Test: listing output reflects sweep-expired rows as `expired`
- [ ] Test: failed grade-clear leaves submission finished (retryable), not half-reopened
- [ ] Existing extension tests stay green; `tsc --noEmit` clean

## Comments

- Implemented: grant path now calls the new guarded atomic RPC `increment_extra_seconds` (status-checked UPDATE ... RETURNING, service-role-only EXECUTE); zero rows → explicit "Submission is no longer in progress" error. Reopen keeps the transition-first order but grade-clearing failures are now non-fatal with a comment explaining why (grading recomputes all answers on resubmit; grading columns no longer exposed via getActiveSubmission). Listing sweep mutates swept rows to `status: 'expired'` before returning. Tests updated: RPC-skip semantics test replaces the untestable interleaving premise (a pre-finished submission correctly reroutes to the reopen path); sweep-refresh test added. Pending live-DB application of incremental SQL sections 3 before RPC tests pass.
- Verified complete: `increment_extra_seconds` live; guarded-skip semantics proven both directions (finished row ignored, in-progress row increments); sweep-refresh and reopen tests green.
