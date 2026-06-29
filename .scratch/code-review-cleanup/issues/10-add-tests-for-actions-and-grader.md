Status: ready-for-agent

## What to build

Fill the largest test coverage gaps found during code review: Server Actions (0% coverage) and the auto-grading pipeline (no unit tests). Also create shared test utilities.

**New tests:**

1. **`__tests__/app/actions/`** — Integration tests for all 8 action files:
   - `auth.test.ts` — login, register, logout
   - `admin.test.ts` — create user, deactivate, reset password, list users
   - `classes.test.ts` — create class, join class, archive class, get roster
   - `assessments.test.ts` — create, publish, close, delete assessment
   - `timed-assessment.test.ts` — start submission, save answer, submit
   - `grading.test.ts` — get submissions for grading, grade answer, release scores
   - `live-assessment.test.ts` — create session, start, advance, save answer, end
   - `notifications.test.ts` — get, mark read, mark all read

2. **`__tests__/lib/auto-grader.test.ts`** — Unit tests for the grading engine:
   - Multiple choice: correct/incorrect
   - True/false: correct/incorrect
   - Fill-in-blank: exact match, case-insensitive, typo
   - Essay/coding: always returns null (manual grading)

3. **`__tests__/lib/question-types/`** — Unit tests for each grader:
   - `multiple-choice.test.ts`
   - `true-false.test.ts`
   - `fill-blank.test.ts`

4. **`__tests__/test-utils.ts`** — Shared test factories:
   - `createTestUser(role)` — create and return a test user with unique email
   - `createTestClass(instructorId)` — create and return a test class
   - `createTestAssessment(classId, options?)` — create, add questions, publish
   - `cleanupTestData()` — shared cleanup for `afterAll`

## Acceptance criteria

- [ ] Every Server Action file has corresponding integration tests
- [ ] `auto-grader.ts` has unit tests for all question types
- [ ] Each question-type grader has its own unit test file
- [ ] Test utilities (`createTestUser`, `createTestClass`, `createTestAssessment`) are shared across test files
- [ ] Tests verify both success and error paths
- [ ] Tests verify database state after mutations, not just return values
- [ ] Tests use unique identifier prefixes to avoid cross-test contamination

## Blocked by

None - can start immediately (but may benefit from 01-auth-gaps being done first so tests exercise the auth guards).

## Comments

Discovered during comprehensive 4-agent code review (QA review). Test coverage scored 3/10 overall. 8/26 source files have tests; zero action or UI component tests exist.
