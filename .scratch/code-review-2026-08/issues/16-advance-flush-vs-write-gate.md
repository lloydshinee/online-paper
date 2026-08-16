# Live advance flush rejected by current-question gate (ticket 12 AC2 follow-up)

Severity: HIGH (silent data loss — the original bug from ticket 12 survives)

Status: done

## What to build

The instructor advances the session's question index server-side *before* broadcasting. When a student receives the advance event, they flush their pending debounced autosave using the previous question's ID — but the ticket-04 write gate rejects any save whose question is not the session's current question. Every edit made within the debounce window (~800ms) before an advance is silently discarded, with a transient "Save failed" flash. This is exactly the data loss ticket 12 was created to fix; the write gate and the flush mechanism defeat each other.

Fix so both guarantees hold at once: the gate must tolerate the *previous* question during an advance flush (accept a save whose question is either the current question or the immediately previous one, and only within the flush window), or the instructor flow must broadcast the advance *before* committing the index change so the student's flush lands while the old question is still current. Whichever shape is chosen, ensure the gate still rejects arbitrary out-of-order writes (a student pre-answering a question two ahead must still be rejected).

## Acceptance criteria

- [ ] An edit made in the ~800ms before an instructor advance is present in the final converted submission
- [ ] No "Save failed" flash occurs for legitimate flush saves during an advance
- [ ] A save targeting a question that is neither current nor immediately previous is still rejected
- [ ] A save targeting the previous question after the grace/flush window is rejected
- [ ] E2E covers the real race: student types, instructor clicks Next immediately (no waiting for 1/1 answered), answer preserved
- [ ] Regression: ticket 04 tests (waiting/ended/out-of-order rejection) stay green

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. DB-column approach: new `live_sessions.prev_question_index` + `advanced_at` (migration applied, documented in docs/full-migration.sql); `advanceLiveSession` records them on index change; `saveLiveAnswer` accepts the current question OR the immediately previous one within `LIVE_ADVANCE_FLUSH_WINDOW_MS` (10s, compared server-side). Two-ahead and after-window saves still rejected. Tests: advance-flush describe in __tests__/lib/live-session-service.test.ts; E2E now advances immediately after the student answers (no 1/1 wait) and asserts both answers in the converted submission with no "Save failed" flash.
- Verification: vitest 69/69 on affected files green, ticket-04 gating tests unchanged and green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean, Playwright e2e/live-session + e2e/timed-assessment 7/7 green.
