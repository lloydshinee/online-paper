# Live page: subscribe-once realtime and flush-on-advance

Severity: HIGH (cross-question answer corruption)

Status: done

## What to build

Two realtime defects on the student Live Session page:

1. **Channel churn.** The subscription effect's dependencies include values that change on every question advance, so each advance unsubscribes and resubscribes the channel (and re-tracks presence). Broadcasts arriving during the resubscribe gap are lost — rapid instructor next→next leaves the student two questions ahead with no way to know. Subscribe once per session ID; read mutable state through refs inside the handlers (refs already exist on the page).

2. **Advance corrupts or loses the previous answer.** The autosave effect re-runs when the question changes, cancelling the in-flight debounce — the student's last ~1.5s of edits to the previous question are never saved. Worse, the answer state isn't cleared until the new question's saved answer resolves, and the save reads a mutable ref: if the fetch is slow, the newly scheduled save fires with the previous question's answer under the new question's ID, overwriting what was already saved (cross-question data corruption). Even on fast fetches, the old answer briefly renders in the new question's inputs.

Fix: on advance, synchronously clear the answer state and ref, flush the previous question's save (awaited, with the previous question ID captured), then load the new question's saved answer; key the debounce per question.

## Acceptance criteria

- [ ] The realtime channel subscribes once per session; advancing questions does not resubscribe (verify no gap: rapid double-advance reaches the correct final question)
- [ ] Edits made in the last moments before an advance are persisted to the correct question
- [ ] A slow fetch on advance can never write question N's answer under question N+1's ID
- [ ] The new question's inputs never display the previous question's answer
- [ ] Test: advance with pending debounced edit — edit lands on old question; advance with slow fetch — no cross-write

## Blocked by

- `.scratch/code-review-2026-08/issues/07-live-waiting-transition-and-presence.md` (state machine and view-state fix land first)

## Comments

- Completed by coding agent. Student live page subscribes once per session id (refs in handlers), advance flushes previous question's save with captured question id, synchronous answer clear, per-question debounce chains, slow-fetch cross-write guards (seq + dirty flags). E2E: rapid advance + flush in live flow.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
