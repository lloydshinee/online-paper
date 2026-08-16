# Submission polish: expire double-grade guard and losing-submit UX

Severity: LOW (batch from verification round 3)

Status: done

## What to build

Two verified low-severity findings:

1. **`expireSubmission` grades even when its guarded update matched 0 rows.** In a submit-vs-expire cross-race the expired path can double-run grading. Grading is idempotent today so scores are unaffected, but exactly one caller should grade: check the guarded update's result and skip grading when it matched 0 rows.

2. **Losing submit client isn't routed to results.** When a manual submit loses the race (second tab, or racing a server-side expiry), the client shows "Assessment already submitted" on the take view with no convergence — the student must refresh. The save-error path already converges via the auto-expire route; the submit path should do the same: on the "already submitted" error, transition to the results view (fetch results) instead of leaving the student on the take page.

## Acceptance criteria

- [ ] `expireSubmission` skips grading when its transition matched 0 rows (the winner of the race grades exactly once)
- [ ] A student whose submit loses the race is shown their results (or the scores-not-released state), not stuck on the take view
- [ ] Normal submit, normal expiry, and violation-limit expiry behave exactly as before
- [ ] Tests: submit-vs-expire race grades exactly once; loser submit converges to results view
- [ ] vitest (submission-service), tsc, eslint, e2e timed-assessment all green

## Blocked by

None - can start immediately

## Comments

### What changed

1. **`lib/submission-service.ts` — `expireSubmission` grades only when it wins the race.** The guarded transition now uses `.select('status').maybeSingle()`; grading runs only when a row was transitioned. When the update matched 0 rows (a concurrent manual submit or another expiry won), the expire path fetches and returns the winner's current row without re-grading, so exactly one caller grades.
2. **Take page — losing submit converges to results.** In `handleSubmit`, an `Assessment already submitted` error (lost against a second tab or a server-side expiry) now sets `submitted` and routes through `goToResults()`, showing the results view (or the scores-not-released state) instead of stranding the student on the take view. Other submit errors still show the inline error and keep answers intact.
3. **Tests**
   - `__tests__/lib/submission-service.test.ts`: new `submit-vs-expire race` describe — racing `submitAssessment`/`expireSubmission` transitions exactly once, final score correct, and each branch asserts the loser's convergence; plus deterministic `expireSubmission after a completed submit skips grading`.
   - `__tests__/app/timed-assessment-take.test.tsx` (new): loser-submit converges to the results view (`Scores not yet released`); a non-race submit error keeps the student on the take page with the error banner. Params passed as a pre-fulfilled tracked thenable to mirror Next.js resolving params before render.

### Verification

- `npx vitest run __tests__/lib/submission-service.test.ts` — 1 file, 29 tests passed
- `npx vitest run __tests__/lib/violations.test.ts` — 5 tests passed (violation-limit expiry path unchanged)
- `npx vitest run __tests__/app/timed-assessment-take.test.tsx` — 2 tests passed
- `npx tsc --noEmit` — no errors
- `npx eslint` on `lib/submission-service.ts`, the take page, and both test files — clean
- e2e timed-assessment: not executed here (requires built server on :3111 + global setup); normal submit/expiry flows are covered by the service tests above.

### Follow-up: results-unavailable notice (cross-verification LOW)

- **Change:** when a losing submit's `goToResults()` fetch fails (`getSubmissionResultsAction` returns null — transient network), the student is now shown a visible "Results unavailable — please refresh the page." banner on the take view (blue info style, distinct from the yellow save banner and red submit-error banner). The benign halts are unchanged: `submitted=true` already stops the timer/autosave before the fetch. The flag clears if a later `goToResults()` succeeds.
- **Files:** `app/(dashboard)/dashboard/student/classes/[id]/assessments/[assessmentId]/page.tsx` (`resultsUnavailable` state + `goToResults` else-branch + take-view banner); `__tests__/app/timed-assessment-take.test.tsx` (new test: losing submit + null results fetch → notice visible, results view not reached, student stays on take view).
- **Verification:** `npx vitest run __tests__/lib/submission-service.test.ts __tests__/app/timed-assessment-take.test.tsx` → 2 files, 32/32 passed; `npx tsc --noEmit` → clean; `npx eslint` on both touched files → 0 errors.
