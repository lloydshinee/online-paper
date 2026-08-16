# Enrollment and session-status gating for submission starts and live answer writes

Severity: HIGH

Status: done

## What to build

Two write paths accept writes from students who shouldn't be able to write:

1. **Starting a submission** — validates assessment state, mode, and retake policy, but never checks that the Student is enrolled in the Assessment's Class. A student with any leaked Assessment ID can start, answer, and submit; the submission appears in the instructor's roster and grading queue and pollutes scores.
2. **Saving a live answer** — checks nothing: not that the Live Session is Active (students can answer while Waiting or after Ended), not that the question is the current question (students can pre-answer future questions), not that the saver is enrolled or even a session participant. All gating is currently client-side.

Also apply the `accepting_submissions` gate to retakes — today the gate only runs in the non-retake branch, so turning off submissions doesn't stop students with a completed attempt from starting new ones. CONTEXT.md: a published assessment "may not yet be taken if `accepting_submissions` is off".

## Acceptance criteria

- [ ] Starting a submission for a class the student is not enrolled in is rejected
- [ ] Saving a live answer while the session is Waiting or Ended is rejected
- [ ] Saving a live answer for a question other than the current question index is rejected
- [ ] Unenrolled students cannot save live answers for that session
- [ ] Retakes are rejected while `accepting_submissions` is off
- [ ] Tests: unenrolled start, waiting/ended save, out-of-order question save, retake gate

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. startSubmission checks enrollment + accepting_submissions for retakes; saveLiveAnswer gates on session status, current question index, and enrollment. Tests: submission-service + live-session-service test files.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
