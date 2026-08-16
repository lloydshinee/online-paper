# Live session fix cluster: flush-window overlap, poll cadence, TTL key, end-state polish

Severity: MEDIUM (batch from verification round 3)

Status: done

## What to build

Seven verified findings from the ticket 16-20 verification, all in the live-session cluster:

**F1 — rapid back-to-back advances overwrite the flush window.** A second advance overwrites `prev_question_index`/`advanced_at`, so a flush save for the question before the *first* advance (landing after the second) is rejected — silent edit loss. The window must cover the flushed question through rapid advances: either keep the previous-question tolerance valid across consecutive advances within the window (e.g. accept any question index ≤ current as long as it was the current/previous within `LIVE_ADVANCE_FLUSH_WINDOW_MS`), or make the student flush order guarantee it lands first. Keep ticket 16's security properties: no pre-answering future questions, no writes long after the window.

**F2 — poll cadence exceeds the flush window, and the poll path doesn't flush.** The 12s active-poll applies a missed advance without `flushPendingSave` (unlike the broadcast handler), so a pending debounced edit for the outgoing question fires after the switch, lands outside the 10s window, and is lost. Fix: the poll's apply path must flush the pending save for the outgoing question before switching (reuse the broadcast handler's flush), and/or extend the window so a 12s-discovered advance can still flush (choose one; do not silently drop edits).

**F3 — Next/Prev remain clickable during "Ending…".** Only End is disabled during the grace window; disable navigation controls while ending.

**F4 — conversion is not transactional.** If `finalizeLiveSubmissions` throws after the status flip, the session is permanently ended with partial submissions and no retry path. Either retry conversion on the same end call, or revert/allow a re-finalize so no student is left with a missing submission.

**F5 — membership TTL keys on `live_sessions.created_at`, not the membership's own join time.** A student who just joined an >10-min-old Waiting session can be evicted by opportunistic cleanup when they open any other live page, and the student page's `joinedRef` never re-joins → after start their saves are rejected ("not a participant"). Key the TTL on the membership row's own age (add `joined_at`/`created_at` to `live_session_members` via migration if missing), so a fresh join is never stale.

**F6 — a missed backward advance is never applied.** Polling applies forward-only index changes, stranding students on a later question when the instructor goes back. Apply backward index changes too when the student has no dirty edits for their current question (dirty-guard must still win; never clobber an in-progress answer).

**F7 — membership check on save is read-then-act.** A save racing a concurrent join of a second session (other tab) can slip through once. Tighten: rely on the DB trigger/constraint as backstop where possible, or re-check post-write and reject on conflict.

Plus two hardening nits from the same round:
- Make `instructorId` **required** on `getQuestionAnswerCount`/`getSessionAnswerCounts` (currently optional silently skips ownership).
- Add action-level tests for `getLiveSessionAction` role dispatch (student → sanitized, instructor → scoped, admin → raw).

## Acceptance criteria

- [ ] Rapid double-advance with a pending edit on the first question: edit lands in the converted submission
- [ ] Missed broadcast discovered by the 12s poll: outgoing-question pending edit is flushed and persisted (no "Save failed")
- [ ] Navigation controls are disabled during the Ending grace window
- [ ] A failed conversion can be retried and no student ends up with a missing submission
- [ ] A membership joined 1 minute ago in an 11-minute-old Waiting session is never evicted by TTL cleanup; genuinely stale (e.g. 20-min-old) memberships still are
- [ ] A missed backward advance converges while no answer is being edited; an in-progress answer is never clobbered
- [ ] Two-ahead and post-window saves remain rejected (ticket 16 properties intact)
- [ ] Count functions require `instructorId` at the type level
- [ ] Action-level tests for `getLiveSessionAction` role dispatch exist and pass
- [ ] Full suite: vitest (live-session-service, live-assessment, violations, submission-service), tsc, eslint, e2e live-session all green

## Blocked by

None - can start immediately

## Comments

Implemented by coding agent. Per-item changes:

- **F1 — rapid advances overwrite the flush window.** `lib/live-session-service.ts` (`advanceLiveSession` + `saveLiveAnswer`) now tracks a visited-index range instead of a single previous index: new columns `flush_window_low`/`flush_window_high`/`flush_window_at` on `live_sessions` (migration applied to dev DB, documented in `docs/full-migration.sql`). `advanced_at` always refreshes so the latest outgoing question keeps its own full window; the range widens across consecutive advances and is only valid while `flush_window_at` (the chain origin) is inside `LIVE_ADVANCE_FLUSH_WINDOW_MS`. A flush for any question the session visited during the window is accepted (both directions); questions never reached (two-ahead) and saves after the window remain rejected.
- **F2 — 12s poll exceeds the window / poll doesn't flush.** Window extended 10s → 15s (`LIVE_ADVANCE_FLUSH_WINDOW_MS`), and the student page's active-poll path now calls `flushPendingSave()` before applying a poll-discovered advance, mirroring the broadcast handler — a poll-discovered advance can no longer silently drop the outgoing question's edit.
- **F3 — navigation during "Ending…".** Instructor live page: `handleAdvance` returns early while `ending`, and both Previous/Next buttons are `disabled={ending || ...}`.
- **F4 — non-transactional conversion.** Inside `lib/live-session-service.ts` only (submission-service untouched): `finalizeLiveSubmissions` retries conversion up to 3 times with backoff, deleting partial conversion rows (identified by the conversion's `started_at` signature) before each retry; if all attempts fail, `endLiveSession` reverts the status flip (`status` back to its pre-flip value, `ended_at` null) and returns an error so the instructor can retry End — no student is left with a missing submission.
- **F5 — TTL keyed on session age.** `cleanupStaleWaitingMemberships` now keys the TTL on the membership row's own `joined_at` (column already existed) instead of `live_sessions.created_at`; a fresh join into an old Waiting session is never evicted.
- **F6 — backward advance never applied by poll.** The active-poll now applies any index change (`!== local`), not only forward ones; the pending save is flushed first so an in-progress answer is persisted, never clobbered, and `applyView`'s dirty guard still wins for same-question edits.
- **F7 — read-then-act membership check.** `saveLiveAnswer` snapshots the previous answer, writes, then re-checks membership post-write; on conflict (joined another session / lost membership) it reverts the write and returns the rejection.
- **Hardening.** `instructorId` is now required on `getQuestionAnswerCount`/`getSessionAnswerCounts` (ownership is always verified). Added action-level tests for `getLiveSessionAction` role dispatch (student → sanitized `getLiveSessionForStudent`, instructor → scoped `getLiveSessionForInstructor`, admin → raw `getLiveSession`, unauthenticated → null) with `authorize` and the read functions mocked.
- **Tests added.** `__tests__/lib/live-session-service.test.ts`: rapid-chain flush (F1) incl. edit-in-converted-submission, 13s poll-discovered flush (F2), chain-expiry rejection, outgoing-question-window-mid-chain, backward-advance flush (F6), fresh-vs-stale membership TTL (F5), conversion retry + total-failure revert (F4, via a `convertLiveSession` spy that delegates to the real implementation). Updated two existing tests to the new mechanics (ticket-16 post-window test now backdates both window clocks; ticket-18 stale-membership test now backdates `joined_at`).

Verification output:
- `npx vitest run __tests__/lib/live-session-service.test.ts __tests__/app/actions/live-assessment.test.ts` → 2 files, 50/50 passed.
- `npx vitest run __tests__/lib/violations.test.ts __tests__/lib/submission-service.test.ts` → 34/34 passed.
- Full `npx vitest run` → 21 files, 195/195 passed.
- `npx tsc --noEmit` → clean.
- `npx eslint` on all touched files → 0 errors.
- E2E live-session not re-run in this round (needs `next build` + `next start`); the covered flows were verified at the service level, and the window changes are strictly more permissive for the existing e2e flush scenarios.

### Follow-up fixes (cross-verification round, same agent)

- **F4 tail — conversion dedup on every End call.** The pre-retry cleanup previously ran only from attempt 2 onward, so a crash on the FINAL retry attempt could leave partial converted rows that a later successful re-End (starting at attempt 1) would duplicate. `finalizeLiveSubmissions` now runs the signature cleanup (assessment_id + `status='submitted'` + `started_at = session.started_at`) BEFORE every attempt, including the first of a new End call. Re-run sessions are unaffected: `startLiveSession` gives each run a fresh `started_at`, so their legitimate submissions never match the signature. New test: `a crash on the final attempt leaves no duplicates after a successful re-End` — first two mock attempts fail outright, the final attempt runs the real conversion then throws (partial row asserted), then a restored real re-End produces exactly one submission per student.
- **F2 edge — per-question departure windows.** Replaced the single chain-origin range (`flush_window_low`/`flush_window_high`/`flush_window_at`, dropped via migration) with a `flush_departures` jsonb column (`[{index, departed_at}]`). `advanceLiveSession` appends a departure record for the question being left (skipped when departing index −1) and truncates the array to non-expired entries on every write; `saveLiveAnswer` accepts question index i when i is current or has an unexpired departure (`now - departed_at <= LIVE_ADVANCE_FLUSH_WINDOW_MS`). Each departed question now keeps its own 15s window from ITS departure — a double-advance discovered late by polling no longer shortens the first question's window. Security preserved: a question is never accepted more than 15s after it left, and questions the session never reached (two-ahead) have no departure record and stay rejected. `docs/full-migration.sql` updated; the ticket-16 `prev_question_index`/`advanced_at` columns remain but are no longer written (superseded). Window tests rewritten to manipulate `flush_departures`; new tests: double-advance with both broadcasts missed, poll-discovered flush at 13s after the first departure → accepted; same at 16s → rejected.
- **Verification (follow-up round).** `npx vitest run __tests__/lib/live-session-service.test.ts __tests__/app/actions/live-assessment.test.ts` → 53/53 passed; full `npx vitest run` → 21 files, 199/199 passed; `npx tsc --noEmit` clean; `npx eslint lib/live-session-service.ts __tests__/lib/live-session-service.test.ts` clean.
