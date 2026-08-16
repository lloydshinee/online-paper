# Ownership checks on instructor grading and assessment read actions

Severity: HIGH (cross-tenant access / IDOR)

Status: done

## What to build

Role gates exist, but object-level ownership checks are missing on several Instructor server actions, so any instructor can operate on any other instructor's data:

1. **Grade answer** — any instructor can overwrite scores and feedback on any answer in the system, including auto-graded answers (the action also parses IDs out of a client-controlled string for the "unanswered question" branch, and never checks the question is a manually-graded type).
2. **Submission detail (grading view)** — fetches by submission ID only; an instructor can enumerate submission IDs and read another instructor's students' essays, code answers, and the answer key. A `verifySubmissionOwnership` helper already exists but is not called here.
3. **Assessment read with questions** — any instructor can read any assessment including other instructors' Draft assessments, with the full question list and answer key. Sibling functions in the same service verify ownership; this one doesn't.

For each: resolve the object up to its Class, verify the requesting instructor owns that class, and reject otherwise. Restrict manual grading to Essay and Coding questions.

## Acceptance criteria

- [ ] Instructor B cannot grade or alter answers on instructor A's assessment (verified rejection, no partial writes)
- [ ] Instructor B cannot read another instructor's submission detail or assessment questions (draft or published)
- [ ] Grading an auto-graded question type (MultipleChoice, TrueOrFalse, FillInTheBlank) via the manual grade action is rejected
- [ ] The client-controlled composite ID branch validates ownership the same way
- [ ] Tests: cross-instructor grade rejected, cross-instructor submission read rejected, cross-instructor assessment read rejected, manual-grade on auto-graded type rejected

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. gradeAnswer resolves ownership up to class, manual-only (Essay/Coding) enforcement, composite-ID branch validated, getSubmissionDetail + getAssessmentWithQuestions actions check ownership. Tests: __tests__/app/actions/grading.test.ts (cross-instructor rejections).
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
