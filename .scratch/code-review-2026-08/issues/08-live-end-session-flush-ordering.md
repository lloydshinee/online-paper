# Live end-of-session: flush student answers before conversion

Severity: HIGH (silent data loss)

Status: done

## What to build

When the instructor ends a Live Session, the server flips status to Ended and converts `live_answers` into permanent Submissions — then the client flush path runs. Two races lose the student's last edits:

- The student's end-event handler saves its pending answer *after* conversion has already read the answers, so the write lands in `live_answers` and is never migrated (and is only cleaned up when a new session is created).
- Every student's pending autosave debounce (~1.5s) fires after conversion. The `beforeunload`-style save is an async server action and doesn't complete reliably either.

The result: the last seconds of every student's typing silently vanish from the graded submission while the UI says "Your answers have been saved."

Fix the ordering end-to-end. Recommended shape: the instructor's End action broadcasts an `end` event first; students flush pending saves (synchronous await of the debounced save); the server waits briefly (or acks) before running conversion; writes to an ended session are rejected (issue 04 gating). Alternative accepted: make the end action itself durable — block writes atomically at conversion time so no in-flight write can straddle the read.

CONTEXT.md: "instructor ends, all live answers are converted into permanent submissions and auto-graded."

## Acceptance criteria

- [ ] A student typing at the moment End is clicked has their latest answer included in the converted submission
- [ ] Answers arriving after conversion are rejected (and the client shows it), never silently orphaned
- [ ] The student view reaches the Ended screen only after its flush succeeds or is definitively rejected
- [ ] In-flight saves that land between "ended" broadcast and conversion are included
- [ ] Test: end-session with a pending debounced answer on a student — answer present in converted submission

## Blocked by

- `.scratch/code-review-2026-08/issues/04-enrollment-and-live-write-gating.md` (reject writes to ended sessions)
- `.scratch/code-review-2026-08/issues/07-live-waiting-transition-and-presence.md` (student live page state machine)

## Comments

- Completed by coding agent. Instructor broadcasts end before calling endLiveSession; server waits LIVE_END_FLUSH_GRACE_MS (5s) before converting; writes after conversion rejected; student flushes debounced save on end event and converges to Ended via polling. Tests: end-of-session flush describe + E2E live flow.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
