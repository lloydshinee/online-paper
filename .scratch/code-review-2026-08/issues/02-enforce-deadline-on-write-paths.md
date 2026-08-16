# Enforce assessment deadline on write paths and record Expired status correctly

Severity: HIGH (security + domain integrity)

Status: done

## What to build

Today a Submission's expiry is only evaluated lazily on read paths. The answer-save and submit functions only check `status === 'in_progress'`, so a Student who keeps the take page open past the deadline can keep saving answers and submit with unlimited extra time. Timer-expiry and violation-limit auto-submits are also recorded as `submitted` instead of `expired` — the client auto-submit paths call the plain submit action, and whether a submission ends up `expired` is a coin flip depending on which server read ran first.

Make the write paths authoritative:

- On every save and on submit, check whether the submission is overdue (deadline from `started_at` + assessment duration). If overdue, force it through the expiry path (status `expired`, auto-grade) and reject further writes.
- The submit update must be guarded so it only transitions an `in_progress` submission (`.eq('status', 'in_progress')`), closing the double-submit race that double-runs auto-grading.
- Client auto-submit paths (timer hitting zero, violation limit reached, resume-after-deadline) must produce a submission with status `expired`, never `submitted`.

CONTEXT.md rules: "Clock keeps running if the student disconnects", "Auto-submits on expiry (status becomes Expired)", "Answers cannot be modified after this point".

Also fix the contradictory unit test that asserts starting while a submission is In Progress returns an error — CONTEXT.md says resume is correct ("The student can resume by navigating back"); the test should assert idempotent resume (same submission returned, no error).

## Acceptance criteria

- [ ] Saving an answer after the deadline is rejected and the submission is expired + auto-graded server-side
- [ ] Submitting after the deadline yields status `expired`, not `submitted`
- [ ] Manual submit before the deadline yields `submitted`; double-clicking submit cannot run grading twice
- [ ] Client timer-zero and violation-limit auto-submits produce `expired` submissions
- [ ] Existing test asserting "cannot start two active submissions" is corrected to assert resume semantics
- [ ] Tests: overdue save, overdue submit, double-submit race, expiry status end-to-end

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. Write paths authoritative: saveAnswer/submitAssessment enforce deadline, guarded submit transition, expireSubmission scoped per student, expireAssessmentAction for client auto-submit paths. Tests: __tests__/lib/submission-service.test.ts (deadline enforcement describe).
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
