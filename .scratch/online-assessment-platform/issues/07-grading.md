Status: done

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

On submission (manual or auto-expiry), auto-grade MultipleChoice, TrueOrFalse, and FillInTheBlank questions. Calculate and store the total score. For Essay and Coding questions, scores remain null until the instructor manually grades them (next slice).

Instructor sees a grading interface: list of submissions per assessment, click to view a student's answers. For Essay and Coding: instructor enters a score (0 to question max points) and can write written feedback. Feedback is stored per-answer.

Schema: add `feedback` (text nullable) column to `answers` table. `submissions.score_total` is computed from sum of graded `answers.score`.

## Acceptance criteria

- [ ] MC questions: compare student's selected option to correct answer → score = points if correct, 0 if wrong
- [ ] TF questions: compare student's True/False to correct answer → score = points if correct, 0 if wrong
- [ ] Fill questions: exact match comparison (case-sensitive or case-insensitive — make a deliberate choice) → score = points if match, 0 if not
- [ ] Essay and Coding: score remains null after auto-grade (marked as "pending" for instructor)
- [ ] `submissions.score_total` computed from sum of all graded answers (null answers excluded from sum until graded)
- [ ] Instructor views submission list for an assessment (student name, status, score if graded)
- [ ] Instructor clicks a submission → sees all answers with question text, student response
- [ ] For Essay/Coding: instructor enters numeric score (0 to question points) and optional written feedback
- [ ] Feedback saved per-answer, displayed in instructor view
- [ ] Instructor can edit a grade after saving it
- [ ] Tests: submit MC/TF/Fill answers → verify auto-graded correctly; instructor grades essay → score appears on submission; instructor leaves feedback → feedback stored

## Blocked by

- 06-timed-assessment
