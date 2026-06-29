Status: done

## What to build

Fix a data leak where correct answers are returned in the HTTP response even when `answer_reveal_enabled` is false.

`lib/submission-service.ts:638-641` joins answers with questions via `'*, questions!inner(id, type, content, points, order_index)'`. The `questions.content` JSONB column contains `correctAnswer`, `correctIndex`, and `options` — the full answer key. A student can inspect the network response to see all correct answers before scores are released.

Add server-side filtering: when `scores_released` is false or `answer_reveal_enabled` is false, strip sensitive fields from `question.content` before returning to the client.

## Acceptance criteria

- [ ] `getSubmissionForGrading()` strips `correctAnswer`, `correctIndex`, and `options` from `questions.content` when `answer_reveal_enabled` is false
- [ ] `getAssessmentResults()` (or equivalent student-facing results endpoint) applies the same filtering
- [ ] Manual question types (essay, coding) still return their full question text so students can see the prompt
- [ ] When `answer_reveal_enabled` is true, the full content is returned as before
- [ ] Tests verify the filtering logic

## Blocked by

None - can start immediately.

## Comments

Discovered during comprehensive 4-agent code review (security audit).
