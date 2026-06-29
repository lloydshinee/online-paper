Status: done

## What to build

Fix three critical security vulnerabilities and one runtime bug found during code review.

1. **Broken notifications import** — `app/actions/notifications.ts:4` imports `{ authorize }` from `@/lib/auth/require-auth`, but that module exports `requireAuth`/`requireRole` — not `authorize`. This crashes at runtime for any notification action. Fix the import to point at `@/lib/auth/authorize`.

2. **No authorization on admin actions** — Every action in `app/actions/admin.ts` (`createUserAction`, `deactivateUserAction`, `resetPasswordAction`, `getUsers`, `getSystemOverview`, `getAdminClassAssessments`, `getAdminClassStudents`) operates with the service-role Supabase client but has zero `authorize(['admin'])` guards. Any unauthenticated request can create admin accounts, reset passwords, and read all system data.

3. **Live session actions accept any role** — `app/actions/live-assessment.ts` actions (`getLiveSessionAction`, `getLiveSessionByAssessmentAction`, `saveLiveAnswerAction`, `getStudentLiveAnswerAction`) call `authorize()` with no role restriction. A student can read live session data they shouldn't access.

4. **`archiveClass` has no ownership check** — `archiveClassAction` in `app/actions/classes.ts` accepts `['admin', 'instructor']`, but `archiveClass()` in `lib/class-service.ts` doesn't verify the instructor owns the class. Any instructor can archive any class.

## Acceptance criteria

- [ ] `app/actions/notifications.ts` imports `authorize` from `@/lib/auth/authorize` and all notification actions work without crashing
- [ ] Every exported action in `app/actions/admin.ts` starts with `const auth = await authorize(['admin']); if ('error' in auth) return { error: auth.error };`
- [ ] Live session actions in `app/actions/live-assessment.ts` have role-specific guards: `['instructor']` for session management, `['student']` with enrollment check for answer reads
- [ ] `archiveClass()` in `lib/class-service.ts` takes `instructorId` parameter and checks `eq('instructor_id', instructorId)` before archiving
- [ ] No existing functionality is broken

## Blocked by

None - can start immediately.

## Comments

Discovered during comprehensive 4-agent code review (architecture, security, testing, UI).
