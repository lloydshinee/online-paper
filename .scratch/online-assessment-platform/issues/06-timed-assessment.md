Status: done

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

A student starts a published timed assessment from their class page. They see one question at a time (or a scrollable list — whichever UX works), a countdown timer showing remaining time, and can answer all question types (MC: radio buttons, Fill: text input, TF: radio True/False, Essay: textarea, Coding: code editor). The student can navigate between questions freely. They can manually submit at any time. If the timer expires, the assessment auto-submits with whatever answers they've provided. The timer keeps running even if the student disconnects. No pause button.

Schema: `submissions` table (id, assessment_id FK, student_id FK, started_at, submitted_at nullable, status:text check in_progress|submitted|expired, score_total nullable) and `answers` table (id, submission_id FK, question_id FK, answer_content:jsonb — type varies by question type, score nullable, is_correct nullable).

## Acceptance criteria

- [ ] Student sees published timed assessments on their class page with a "Start" button
- [ ] Starting an assessment creates a `submission` row with status `in_progress` and records `started_at`
- [ ] Countdown timer visible, counts down from the time limit (set in minutes, displayed as MM:SS)
- [ ] Student can answer all five question types with appropriate input controls
- [ ] Student can navigate between questions (next/previous or scroll)
- [ ] "Submit" button available at all times; confirmation dialog before final submit
- [ ] On manual submit: status → `submitted`, `submitted_at` recorded
- [ ] On timer expiry: status → `expired`, `submitted_at` recorded, all current answers saved (auto-submit)
- [ ] If student disconnects and reconnects, timer shows elapsed time correctly (clock keeps running server-side)
- [ ] Once submitted/expired, student cannot modify answers
- [ ] Revisiting a completed assessment shows "Already submitted" state
- [ ] Tests: start assessment → answer → submit → verify answers saved; let timer expire → verify auto-submit; disconnect mid-assessment → reconnects → timer correct

## Blocked by

- 05-assessment-creation
