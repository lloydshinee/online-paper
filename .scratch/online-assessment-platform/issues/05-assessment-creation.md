Status: done

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Instructor creates an assessment inside a class. They paste a block of formatted plain text with section headers (`[MultipleChoice]`, `[FillInTheBlank]`, `[TrueOrFalse]`, `[Essay]`, `[Coding]`), and the system parses it into structured questions. The instructor sets a point value for each question, chooses Timed or Live mode (and a time limit in minutes for Timed), and manages the assessment lifecycle: Draft (editing, invisible to students) → Published (students can take it, notifications sent) → Closed (no more submissions). Instructors can edit a published assessment, and all existing scores are recalculated.

Schema: `assessments` table (id, class_id FK, title, mode:text check timed|live, time_limit_minutes nullable, status:text check draft|published|closed, created_at) and `questions` table (id, assessment_id FK, type:text, content:jsonb, points:integer, order_index:integer).

## Acceptance criteria

- [ ] Instructor navigates to a class → "Create Assessment" button
- [ ] Assessment creation form: title, mode (Timed/Live toggle), time limit field (visible only when Timed), text area for pasting questions, per-question point override input
- [ ] Question parser correctly handles all five section types:
  - `[MultipleChoice]` — stem + a) b) c) d) options + correct answer marker
  - `[FillInTheBlank]` — sentence with `______` + answer
  - `[TrueOrFalse]` — statement + True/False
  - `[Essay]` — prompt only (no answer, manual grading)
  - `[Coding]` — problem statement only (no test cases, manual grading)
- [ ] Parser preview shows parsed questions before saving (instructor can verify the parse was correct)
- [ ] Each question gets a default point value (e.g., 1) that the instructor can override
- [ ] Save as Draft — assessment is saved but not visible to students
- [ ] Publish — assessment status changes to Published, students can see/take it
- [ ] Close — status changes to Closed, no more submissions accepted
- [ ] Instructor can edit a published assessment → scores recalculate
- [ ] Instructor can delete a draft assessment
- [ ] Tests: parse each question type correctly; create draft → verify not visible to student; publish → visible; close → not takeable; edit published → scores recalculate

## Blocked by

- 04-class-management
