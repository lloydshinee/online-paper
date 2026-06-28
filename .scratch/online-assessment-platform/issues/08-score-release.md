Status: ready-for-agent

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Instructor releases all scores for an assessment. Until released, students see "Scores not yet released" on their submission. Instructor also controls "show answers" separately — until activated, students cannot see correct answers or per-question correctness even after scores are released. When both are released: student sees a per-question breakdown (their answer vs. correct answer, points earned), written feedback for essay/coding, and total score displayed in an HTML table that can be selected and copied (Ctrl+C) for pasting into grading spreadsheets.

If the instructor edited the assessment after submissions exist (from issue 05), all scores are already recalculated before release.

## Acceptance criteria

- [ ] Instructor sees a "Release Scores" button per assessment (visible only when all manual grading is complete, or with a warning if some essay/coding ungraded)
- [ ] Before release: student submission page shows "Scores not yet released"
- [ ] After release: student sees total score
- [ ] Instructor has a "Show Answers" toggle per assessment (independent of score release)
- [ ] When both released and answers shown: student sees per-question breakdown — question text, their answer, correct answer (for MC/TF/Fill), correctness indicator (check/cross), points earned
- [ ] For Essay/Coding: student sees prompt, their submitted response, score, and feedback
- [ ] Score results rendered as an HTML `<table>` with columns: question #, type, points possible, points earned, status (correct/incorrect/pending)
- [ ] Table can be selected with mouse and copied (Ctrl+C) — pastes correctly into spreadsheet apps
- [ ] Instructor can un-release scores or hide answers (reversible action)
- [ ] Tests: release scores → student sees total; show answers → student sees breakdown; copy table → pastes correctly into spreadsheet

## Blocked by

- 07-grading
