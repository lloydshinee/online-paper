# Unstartable Waiting session: instructor can never recover a failed start

Severity: HIGH

Status: done

## What to build

The instructor live page only calls the start action in the create branch. If a session already exists in Waiting state — because a previous start failed, or the instructor navigated away between create and start — the page renders the existing Waiting session, but the only control ("Begin") calls the advance action, which requires status `active` and toasts "Session is not active" forever. The only escape is End → re-run, which the retake gate blocks when `retakes_allowed` is off. A single transient start failure permanently bricks live mode for that assessment.

Fix the state machine so a Waiting session is always startable on (re)entry: the Begin control (or the init path) must call start for any Waiting session, not just newly created ones; start must surface errors with a retryable state; and the instructor page must never render a Waiting session that it cannot advance. Related: membership rows created against an abandoned Waiting session currently lock students out of other live sessions — add a TTL or leave/cleanup path (End or admin cleanup) for sessions that never started.

## Acceptance criteria

- [ ] An instructor re-entering a Waiting session can start it (Begin works; no "Session is not active" loop)
- [ ] A failed start shows an actionable error and the instructor can retry without leaving the page
- [ ] Starting a Waiting session twice is idempotent (no error, no state corruption)
- [ ] An abandoned Waiting session does not permanently block students from other live sessions (TTL, leave, or explicit cleanup)
- [ ] Test: create → fail start → re-enter → start succeeds; test: waiting session start is idempotent

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. Instructor page: Begin on a Waiting session calls `startLiveSessionAction` first (error surfaced via toast, session retained so retry works without leaving), then advances; `startLiveSession` is idempotent (already-active returns the session as-is; concurrent starts guarded with `.eq('status','waiting')` and re-read on lost race). Membership TTL: `hasActiveLiveSession` and `joinLiveSession` clean up memberships whose session is Waiting and older than `STALE_WAITING_SESSION_MS` (10 min) before evaluating the constraint. Tests: re-enter-waiting start+advance, concurrent idempotent start, stale membership cleaned up, fresh waiting membership still blocks.
- Verification: vitest 69/69 on affected files green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean, Playwright 7/7 green.
