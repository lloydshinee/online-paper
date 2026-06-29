Status: done

## What to build

Fix broken imports and missing function references in `app/actions/assessments.ts`. The file calls several functions that are never imported:

- `closeAssessment` (line ~101) — not imported
- `deleteAssessment` (line ~115) — not imported
- `setAssessmentQuestions` (line ~139) — imported as `saveAssessmentQuestions` under the wrong name; actual export is from `lib/assessment-service.ts` as `setAssessmentQuestions`
- `createClient` (line ~153) — not imported from any Supabase client factory
- `getAssessmentQuestions` (line ~164) — not imported

Fix all imports so the file compiles and functions correctly. Ensure the import aliases match the actual exported names from their source modules.

## Acceptance criteria

- [ ] `app/actions/assessments.ts` compiles without missing-import errors
- [ ] All imported function names match their actual exports
- [ ] `saveAssessmentQuestions` import is renamed to `setAssessmentQuestions` to match the source export, or a re-export is added
- [ ] `createClient` import is resolved (likely should be `createServiceClient` from `@/lib/supabase/service`)
- [ ] Tests pass after fixes

## Blocked by

None - can start immediately.

## Comments

Discovered during comprehensive 4-agent code review (architecture). The file has references to 5+ unimported functions.
