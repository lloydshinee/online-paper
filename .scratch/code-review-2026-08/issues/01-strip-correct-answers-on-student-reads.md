# Strip correct answers and verify enrollment on student-facing question reads

Severity: CRITICAL (found independently by two reviewers)

Status: done

## What to build

Every read path that puts Assessment questions into a Student's browser must return sanitized question content — no `correctAnswer`, `correctIndex`, or any grading fields — until the instructor activates answer reveal. Today the timed-assessment data action and the Live Session read paths do a raw `select('*')` on questions, shipping the full answer key in the network payload during the assessment. The sanitizer used by the results path already exists; apply it (or an equivalent) to the take page and live session paths.

Additionally, these reads must verify the Student is enrolled in the Assessment's Class — any authenticated user can currently fetch questions for any published Assessment, enrolled or not.

CONTEXT.md rule: "Correct answers are hidden from students until the instructor activates answer reveal (`answer_reveal_enabled`)."

## Acceptance criteria

- [ ] Starting a timed assessment returns question objects containing no correct-answer or grading fields (verify via network payload / server action return, not just UI)
- [ ] Joining / polling a Live Session returns no correct-answer fields for any question
- [ ] The Live Session read returns only what the current question index requires, not the full question list with answers
- [ ] An unenrolled student calling these actions for a published assessment gets an error, not questions
- [ ] The existing results path (answer reveal) still returns correct answers when `answer_reveal_enabled` is on
- [ ] Regression tests: sanitized shape asserted for timed read, live read; enrollment rejection asserted

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. Sanitized student question reads (lib/question-sanitizer.ts), enrollment checks on timed + live reads, student-scoped live session views. Tests: __tests__/lib/assessment-service.test.ts (sanitized reads), __tests__/lib/live-session-service.test.ts (sanitized view + unenrolled rejection), e2e/timed-assessment.spec.ts (no correct answers until reveal).
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
