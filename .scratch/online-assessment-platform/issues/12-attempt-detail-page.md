## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

A dedicated attempt detail page at `/assessments/[assessmentId]/results/[submissionId]` showing the full breakdown of a single submission attempt.

When a student clicks a completed attempt from the results list, they land here. The page shows: a Score Summary card (score/total points, percentage), a Question Breakdown table (per-question: type, points, earned points, correct/incorrect/pending status, student's answer, correct answer), and a Feedback section for essay/coding answers with instructor comments.

Scores and correct answers are hidden until the instructor releases scores or enables answer reveal. When scores are unreleased, the page shows the same placeholder as the current behavior. A "Back to results" link navigates back to the results list page. A "Retake" button is visible if retakes are allowed.

## Acceptance criteria

- [ ] New route: `results/[submissionId]` loads full submission details + answers
- [ ] Score Summary: score/total points, percentage (when scores released)
- [ ] Question Breakdown table: per-question type, points, earned, status, student answer, correct answer
- [ ] Scores and correct answers hidden when `scores_released` / `answer_reveal_enabled` are false
- [ ] Scores-not-released placeholder when appropriate (same as current behavior)
- [ ] Feedback section for manually-graded answers with instructor comments
- [ ] "Back to results" navigation to results list page
- [ ] "Retake" button if retakes allowed
- [ ] Service function fetches one submission with all answers and question data
- [ ] Server action enforces auth (student can only see their own submission)
- [ ] Test: student views detailed breakdown; unreleased scores show placeholder; released scores show full data

## Blocked by

- 11-results-list-page (needs the results list to link from)
