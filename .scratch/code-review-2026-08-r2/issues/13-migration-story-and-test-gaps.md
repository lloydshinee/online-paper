# Schema migration story and test-suite gaps

Severity: MEDIUM (process)

Status: ready-for-human

## Problem 1 — no incremental migrations

All schema changes land in `docs/full-migration.sql`, a full-rebuild script. The 2026-08 commits added a table (`live_session_members`), triggers, functions (`increment_violation`, overlap check), columns (`prev_question_index`, `advanced_at`, `flush_departures`, `extra_seconds`), and this round modifies policies/functions again. Existing databases have no documented path to absorb these changes.

Decision needed: adopt a migrations directory (timestamped SQL applied in order), or document the manual apply procedure per change. Until then, every ticket touching `docs/full-migration.sql` must note its manual apply step for deployed databases (issues 01, 02, 06 do).

## Problem 2 — test-suite gaps

- Unit tests require live Supabase via `.env.local` (they are integration tests); fine, but worth naming that in docs so failures are interpretable.
- `__tests__/app/actions/admin.ts` and `profile.ts` have no mirrors — password-reset is the most sensitive untested surface in the repo.
- `lib/question-sanitizer.ts` has no direct test despite being security-relevant (only transitive coverage).
- No create-and-publish-assessment e2e helper — hand-rolled three times across specs (~40 lines of drift-prone duplication); no grading-dialog or data-cleanup helpers.
- E2E live-session coverage is a single happy-path test; none of the convergence-cluster defects (issue 07) would be caught.
