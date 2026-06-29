Status: ready-for-agent

## What to build

Replace pervasive `as` type casts with Zod schemas for runtime validation and fix several type system weaknesses.

**Specific changes:**

1. **Extract `ASSESSMENT_SELECT` constant** — The full column list string `'id, class_id, title, mode, state, duration_minutes, scores_released, answer_reveal_enabled, accepting_submissions, retakes_allowed, created_at'` appears 6+ times in `lib/assessment-service.ts`. Extract to `const ASSESSMENT_SELECT = '...'` and use everywhere.

2. **Create Zod schemas for Supabase query results** — Add Zod schemas for `AssessmentData`, `SubmissionData`, `AnswerData`, `QuestionData`, `ClassData`, and `UserProfile`. Use them to validate `.single()` and `.select()` results instead of `as` casts. Place schemas in `lib/schemas.ts`.

3. **Fix `AuthorizeResult` discriminated union** — In `lib/auth/authorize.ts`, change:
   ```ts
   type AuthorizeResult =
     | { userId: string; error?: undefined }
     | { userId?: undefined; error: string }
   ```
   to:
   ```ts
   type AuthorizeResult =
     | { userId: string; readonly error: never }
     | { readonly userId: never; error: string }
   ```

4. **Use discriminated unions for `QuestionData.content`** — Replace `Record<string, unknown>` with specific types per question type (e.g., `type MCQContent = { stem: string; options: string[]; correctAnswer: string; correctIndex: number }`).

5. **Fix `formData.get()` null safety** — Replace `formData.get('foo') as string` with a `requireString(formData, 'foo')` helper that throws on null.

## Acceptance criteria

- [ ] `ASSESSMENT_SELECT` constant used in all 6+ locations in `assessment-service.ts`
- [ ] Zod schemas validate all Supabase `.single()` results; zero bare `as` casts remain in services
- [ ] `AuthorizeResult` uses `never` for the discriminant
- [ ] Question type content has strong types instead of `Record<string, unknown>`
- [ ] `formData.get()` null checks are enforced at runtime
- [ ] All existing tests pass with the new types
- [ ] Build and typecheck pass with strict mode (no new `any` usages)

## Blocked by

None - can start immediately.

## Comments

Discovered during comprehensive 4-agent code review (architecture). Type safety scored 5/10 due to 30+ `as` casts and `Record<string, unknown>` escapes.
