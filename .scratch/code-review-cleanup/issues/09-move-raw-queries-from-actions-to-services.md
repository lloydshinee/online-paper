Status: ready-for-agent

## What to build

Move raw Supabase queries that bypass services out of Server Actions and into their respective service modules. Restore the three-layer architecture: pages → actions (thin auth+delegate) → services (business logic + DB).

**Affected queries:**

1. `app/actions/classes.ts:69-76` — `getInstructorClasses` does raw `supabase.from('classes').select(...)` and `from('class_enrollments').select(...)`. Move to `lib/class-service.ts` as `getInstructorClasses(instructorId)`.

2. `app/actions/assessments.ts:149-167` — `getAssessmentWithQuestions` mixes raw assessment fetch + service call. Move the raw query into `lib/assessment-service.ts` as `getAssessmentWithQuestions(assessmentId)`.

3. `app/actions/timed-assessment.ts:20-60` — `getStudentClassAssessments` does raw enrollment + assessment + submission queries. Move to `lib/assessment-service.ts` as `getStudentAssessments(studentId, classId)`.

4. `app/actions/grading.ts:16-32` — `getAssessmentSubmissions` does raw assessment + class queries. Move to `lib/submission-service.ts` as `getSubmissionsForAssessment(assessmentId)` (if not already there).

5. `app/actions/live-assessment.ts:23-28` — `createLiveSessionAction` does a raw assessment fetch. Delegate that lookup to the service or add it as a guard in `lib/live-session-service.ts`.

After the moves, each action should look like: `authorize() → serviceCall() → revalidatePath() → return`.

## Acceptance criteria

- [ ] No Server Action file contains `supabase.from()` or `createServiceClient()` calls (except admin actions using the admin service)
- [ ] Each extracted query is a named, tested function in the appropriate `lib/*-service.ts`
- [ ] Actions are thin: authorize, delegate, revalidate, return
- [ ] All existing behavior is preserved
- [ ] Tests pass

## Blocked by

None - can start immediately.

## Comments

Discovered during comprehensive 4-agent code review (architecture). Actions-as-thin-wrappers scored 7/10 due to these bypasses.
