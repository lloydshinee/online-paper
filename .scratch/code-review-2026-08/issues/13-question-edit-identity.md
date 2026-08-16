# Stop re-binding existing answers when questions are edited (positional update)

Severity: HIGH (silent score corruption)

Status: done

## What to build

Saving an assessment's questions updates rows matched by position (`order_index`). If the instructor inserts a question at the top or reorders, every existing question ID receives different content — and since students' answers are keyed by `question_id`, the subsequent score recalculation re-grades every existing answer against a *different* question. Example: student correctly answered b on an MC question worth 2 points; instructor prepends a new MC question; the old ID now holds the new question, and the student's `selectedIndex: 1` is graded against the new question's `correctIndex` — the score silently flips. A type change (e.g. MC→Essay) additionally leaves the old auto-grade score in place, because recalculation preserves prior non-null scores for null-returning graders.

CONTEXT.md: "If the instructor edits a question after submissions exist, all affected submission scores are recalculated" — the intent is recalculation against the *same* questions, not rebinding.

Design the identity strategy: match edited questions to existing rows by content identity (hash) so unchanged questions keep their IDs, or delete-and-recreate with an explicit answer migration/re-grade keyed on stable identity. Whichever shape: after an edit that inserts/reorders/changes type, every existing answer must be graded against the question content it was originally answered against (or explicitly reset with instructor visibility). Consider a prefactor first: extract the diff/matching logic into a testable unit before touching recalculation.

## Acceptance criteria

- [ ] Prepending/inserting a question after submissions exist does not change existing answers' grades
- [ ] Reordering questions preserves answer-to-question binding
- [ ] Changing a question's type re-grades (or explicitly resets) the affected answers — no stale auto-grade score survives a type change
- [ ] Editing content/points in place still triggers recalculation as before (existing behavior retained)
- [ ] Tests: insert-at-top with existing submissions, reorder, type change, in-place points edit (the last already exists — keep green)

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. setAssessmentQuestions matches by content identity (hash, points excluded): unchanged questions keep IDs, inserts/reorders preserve answer binding, content/type changes delete-and-recreate (answers reset) with resetCount surfaced in the UI. Tests: question identity describe in assessment-service.test.ts.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
