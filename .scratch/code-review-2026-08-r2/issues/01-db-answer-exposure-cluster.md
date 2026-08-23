# Close the DB-level answer-key and grading-data exposure cluster

Severity: CRITICAL (cluster)

Status: done

## Problem

App-layer sanitization (tickets 01/05 in `code-review-2026-08`) holds only against users who stay inside the app's API surface. Every student's browser holds a valid JWT plus the public anon key, so direct PostgREST access bypasses every Next.js server-action strip:

1. **questions** — `"Students can read questions for enrolled class assessments"` (`docs/full-migration.sql:519`) filters rows but exposes all columns; `content` jsonb carries `correctAnswer`/`correctIndex` for MC/TF/FITB. Any enrolled student can read the full answer key for every assessment in their class, including during a running exam. The policy does not even exclude drafts.
2. **submissions** — `"Students manage own submissions"` is `FOR ALL` (`:540`), so students can SELECT their own rows and read `score_total`, `violations`, `extra_seconds` before release.
3. **answers** — `"Students manage own answers"` is `FOR ALL` (`:558`), so students can read `score`, `is_correct`, `feedback` on their own answers before release/reveal.

Verified safe to tighten: all domain reads/writes go through the service-role client (`lib/*-service.ts`, 64 `createServiceClient()` sites, zero user-scoped table queries); the only browser-side table subscription is `notifications` (own policies, untouched). Precedent: `live_session_members` deliberately ships with no student policies (deny-by-default).

Related app-layer holes in the same cluster:

4. **fe04f33 regression** — `getStudentSubmissionResults` (`lib/submission-service.ts:1315-1337`) strips per-answer grading data only when `!answer_reveal_enabled`. In the reachable state reveal ON + scores unreleased (the toggles are independent: `settings-tab.tsx:214`, `updateAssessmentSettingsAction`), students get per-question `score`/`is_correct`/`feedback` over the wire while the UI says "Scores not yet released". Pre-fe04f33, the deleted `!scores_released` block nulled `score`/`is_correct`. Intended model (per both commits' UI): per-question grading data requires release AND reveal; answer-key content requires reveal; total requires release.
5. **Reopened attempts leak manual grades** — `getActiveSubmission` returns raw `answers.select('*')` (`lib/submission-service.ts:217-222`); reopen resets only auto-graded answers, so graded Essay/Coding `score`+`feedback` ship to the take-page payload while scores are unreleased.
6. **Class-list endpoints ship raw `score_total`** — `getStudentAssessments` / `getAllStudentAssessments` (`lib/assessment-service.ts:563, 686`) return it unmodified regardless of `scores_released`; hidden client-side only. Mirror `getStudentSubmissionHistory` which strips correctly.

## Fix

SQL (`docs/full-migration.sql`, full-rebuild script — no incremental migration infra exists):
- Drop the student SELECT policy on `questions`.
- Drop both student `FOR ALL` policies on `submissions` and `answers` (deny-by-default, matching the `live_session_members` precedent), with comments explaining why (service-role-only access; fail loud on future direct use).
- Note for existing deployments: must be applied manually; recorded under issue 13 (migration story).

App (`lib/submission-service.ts`, `lib/assessment-service.ts`):
- Results path: strip answer-key content iff `!answer_reveal_enabled`; strip per-answer `score`/`is_correct`/`feedback` iff `!scores_released || !answer_reveal_enabled`; `score_total` follows `scores_released`.
- `getActiveSubmission`: select only the columns the take page consumes (identity + `answer_content`), never grading fields.
- Class-list endpoints: `score_total: null` when `!scores_released`.

## Acceptance criteria

- [ ] New RLS integration test: signed-in enrolled student gets zero rows from `questions`, `submissions`, `answers` via PostgREST; positive control: owning instructor still reads their questions; service-role unaffected
- [ ] Unit/integration tests: reveal-on + unreleased → per-answer grading fields null, answer-key content intact; released + reveal-off → fields null, content sanitized; released + reveal-on → everything visible
- [ ] Reopened in-progress submission's payload carries no `score`/`is_correct`/`feedback`
- [ ] Unreleased `score_total` absent from class-list payloads
- [ ] Full vitest suite green; `tsc --noEmit` clean

## Comments

- Correction to point 6 (class-list `score_total`): FALSE POSITIVE. `buildSubmissionMap` (`lib/assessment-service.ts:57, 67`) already gates the mapped value on `scores_released`; only the raw column appears in the SELECT. No change needed.
- Implemented: policy drops in `docs/full-migration.sql` (+ comments), reveal/release gate split in `getStudentSubmissionResults`, narrowed `StudentActiveAnswer` payload in `getActiveSubmission`. New tests: rls-student-reads.test.ts (3) and two results-path cases. The RLS test currently FAILS against the live database because the old policies are still applied there — apply `docs/incremental-2026-08-r2.sql` (section 1) and re-run; that failure is itself a live reproduction of C1.
- Verified complete: incremental SQL applied to the local self-hosted instance via `docker exec supabase-test-online-db psql`; RLS test now proves an enrolled student's direct PostgREST reads of questions/submissions/answers return zero rows, instructor positive control passes, anon denied. Full suite 231/231.
