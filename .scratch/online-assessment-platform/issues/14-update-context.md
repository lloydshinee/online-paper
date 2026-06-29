## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Update `CONTEXT.md` glossary to fully document the current system. The existing glossary has gaps — several features exist in code but have no canonical term or definition.

Add new terms: Retake, Live Session, Proctoring, Notification, Class Archiving. Expand existing terms: Submission (document statuses: in_progress, submitted, expired), Assessment (document full lifecycle including accepting_submissions, unpublish constraint, duration_minutes). Expand the Scoring and Results section to cover score release mechanics, answer reveal mechanics, auto-grading architecture, manual grading flow, and the score-copy feature.

This is a documentation-only change — no code is modified.

## Acceptance criteria

- [ ] Add "Retake" term: a student creates a new submission for an already-completed assessment; previous submissions preserved; toggle controlled by instructor
- [ ] Add "Live Session" term: a real-time assessment session controlled by the instructor; covers session lifecycle (waiting → active → ended), live_answers table, Realtime channels, presence tracking
- [ ] Add "Proctoring" term: tab-switch detection during timed assessments; violation counter per submission; auto-submit when max violations reached
- [ ] Add "Notification" term: in-app notification when assessment is published; bell icon with unread count; dropdown list with mark-read
- [ ] Add "Class Archiving" term: instructor can archive a class; archived classes hidden from student list
- [ ] Update "Submission" to include statuses: in_progress (active taking), submitted (manual submit), expired (timer auto-submit)
- [ ] Update "Assessment" to include: duration_minutes per-assessment setting, accepting_submissions toggle, unpublish constraint (not allowed if submissions exist)
- [ ] Expand "Scoring and results": independent scores_released / answer_reveal_enabled toggles, server-side data stripping for unreleased scores, auto-grading pipeline (pluggable question type registry), manual grading flow with per-answer feedback, score recalculation on edit, copy-scores-to-clipboard (TSV format)
- [ ] All terms follow CONTEXT-FORMAT.md: 1-2 sentence definition, _Avoid_ alternatives, opinionated
- [ ] Only domain-specific terms; no implementation details or file paths

## Blocked by

None - can start immediately
