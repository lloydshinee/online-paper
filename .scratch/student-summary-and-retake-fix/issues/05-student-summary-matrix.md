Status: ready-for-agent

## Parent

Feature: student summary and retake fix (this directory). Terms defined in `CONTEXT.md` under **Student Summary**.

## What to build

The **Student Summary** matrix in its class-page tab: one table answering "scores, who hasn't taken, who's missing, who failed" at a glance.

Rows are enrolled students; columns are the class's published and closed assessments (both timed and live; drafts never appear). Each cell shows exactly one of:

- the **authoritative score** — latest Submitted/Expired attempt's total points, visible to the instructor even while scores are unreleased
- `Failed` — authoritative score as a percentage falls below that assessment's Passing Score. Only when a passing score is set AND the authoritative attempt has no pending ungraded manual answers (an incomplete score must never brand a student Failed)
- `Missing` — no Submitted/Expired attempt exists and the assessment is no longer open for work (closed, availability end passed, or live session ended)
- `Not taken` — no submissions at all and the assessment is still accepting work
- `In progress` — a live In Progress attempt exists

Filter chips above the table — All / Failed / Missing / Not taken — shrink the grid to just those cells/students. Highlight failed cells so they read at a glance. Handle empty states (no assessments yet, no students) with guidance rather than a blank grid.

## Acceptance criteria

- [ ] Matrix renders all enrolled students × all published/closed assessments, drafts excluded
- [ ] Cell states match the five definitions above, including unreleased scores being visible to the instructor
- [ ] Failed appears only when a passing score is set and grading is complete on the authoritative attempt; changing the passing score or question points changes Failed derivation on next view without any migration
- [ ] Missing vs Not taken boundary follows each assessment's openness (timed window and live-session end both respected)
- [ ] Filter chips reduce rows/cells correctly and combine with nothing else breaking
- [ ] Empty states covered for no assessments and no students
- [ ] Tests pin each cell state against seeded fixture data (score, failed, missing, not-taken, in-progress)

## Blocked by

- 03-passing-score-setting (Failed state is meaningless without a threshold)
- 04-class-page-tabs (the tab shell this fills)
