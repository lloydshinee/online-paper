# Timer: recompute from started_at deadline, single stable interval

Severity: HIGH (exploitable timer)

Status: done

## What to build

The take-page countdown decrements a state variable inside a `setInterval` that is torn down and recreated every tick (the effect depends on the remaining time). Each recreation adds latency, so the clock runs slow in the foreground and dramatically slow in a hidden/throttled tab. The deadline is never recomputed from the server's `started_at` + duration, so a student who switches tabs for 10 of 30 minutes returns to a clock showing ~20 minutes remaining. Combined with the missing server-side enforcement (issue 02), this grants free extra time; conversely an attentive foreground student loses ~30-60s/hour.

Fix: compute `deadline = startedAt + duration` once (both already available on load/resume), keep a single stable interval, and on each tick set remaining time to `max(0, deadline - Date.now())`. Auto-submit fires when that value hits 0. CONTEXT.md: "Clock keeps running if the student disconnects."

## Acceptance criteria

- [ ] The countdown matches wall-clock time against the server deadline (no cumulative drift over a session)
- [ ] After leaving the tab backgrounded and returning, the displayed remaining time reflects real elapsed time, not tick count
- [ ] Auto-submit triggers at the true deadline regardless of tab throttling
- [ ] The interval is created once (not recreated per tick) and cleaned up on unmount
- [ ] Resume mid-assessment computes the correct remaining time from `started_at`
- [ ] Test: simulated clock (fake timers / injected now) — deadline math for fresh start and resume

## Blocked by

- `.scratch/code-review-2026-08/issues/02-enforce-deadline-on-write-paths.md` (server semantics for expiry interplay)

## Comments

- Completed by coding agent. Deadline math extracted to lib/deadline.ts (computeDeadline/remainingSeconds), single stable interval, wall-clock recompute from started_at, resume recomputes. Tests: __tests__/lib/deadline.test.ts.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
