# getLiveSessionAction missing instructor ownership check (IDOR)

Severity: HIGH (same class as ticket 03 item 3, surviving via a sibling action)

Status: done

## What to build

The non-student branch of `getLiveSessionAction` returns the raw session — including the complete question list with the answer key — for any session ID, with no ownership verification. Its siblings (`getLiveSessionByAssessmentAction`, `getLiveSessionByAssessmentInstructorAction`) gate correctly. The action is currently unused by the UI but is an exported `'use server'` action: an instructor who obtains any session UUID reads another instructor's entire answer key.

Add the same assessment-ownership verification the sibling actions use (resolve session → assessment → class → verify instructor ownership) before returning the raw session, mirroring the ticket 03 pattern. Consider removing the action if nothing consumes it.

## Acceptance criteria

- [ ] Instructor B cannot read instructor A's session (including full question list / answer key) via this action
- [ ] The action either returns an error for non-owners or is removed if unused
- [ ] The legitimate instructor path for the same session still works
- [ ] Test: cross-instructor session read rejected

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. New `getLiveSessionForInstructor(sessionId, instructorId)` resolves session → assessment → class and verifies instructor ownership before returning the full question list; `getLiveSessionAction`'s instructor branch now uses it (returns null for non-owners); admins retain full visibility. Test: cross-instructor session read rejected, owner read returns session with questions.
- Verification: vitest 69/69 on affected files green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean, Playwright 7/7 green.
