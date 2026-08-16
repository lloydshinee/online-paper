# Strip unreleased scores server-side on list and history paths

Severity: HIGH

Status: done

## What to build

CONTEXT.md: "When scores are unreleased, the server strips score data before returning it to the client." Only the detailed results path does this. Three other read paths ship `score_total` raw while `scores_released` is off:

- The student dashboard / class assessment lists (the UI hides the value client-side, but the number is in the payload — devtools reveals it)
- The "all assessments" list used across the student's classes
- The submission history list, where the student assessment page renders `score_total` outright with no release gate at all

Null out score data server-side on all unreleased paths, mirroring the results path. Keep the latest-submission-wins semantics for retakes intact.

## Acceptance criteria

- [ ] With `scores_released` off, none of the list/history payloads contain score values for that assessment (verified on the action return, not the UI)
- [ ] The submission history UI shows scores only after release
- [ ] With `scores_released` on, scores appear everywhere they did before
- [ ] Instructor-facing reads are unaffected
- [ ] Tests: each path strips when unreleased, returns when released

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. buildSubmissionMap + getStudentSubmissionHistory strip score_total while scores_released is off; UI gates history by release. Tests: score stripping describe in __tests__/lib/assessment-service.test.ts.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
