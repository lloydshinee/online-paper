## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

A dedicated results list page at `/assessments/[assessmentId]/results` where students can see all their assessment attempts in one place.

When a student navigates here, they see a list of every submission — including in-progress ones — ordered by attempt number (oldest first). Each row shows: attempt number, status badge ("In Progress", "Submitted", "Expired"), submission date, and score (only when the instructor has released scores). The most recent completed attempt is marked as "current" and highlighted.

In-progress rows are clickable and resume the assessment. Completed rows link to their dedicated attempt detail page. If retakes are enabled, a "Retake" button is visible to start a new attempt. If the student has zero submissions, show an empty state with a "Start Assessment" button.

## Acceptance criteria

- [ ] New route: `assessments/[assessmentId]/results` loads all submissions for the student
- [ ] Each row shows: attempt number (1, 2, 3...), status badge, submission date, score (null when unreleased)
- [ ] In-progress rows are clickable → navigate to the take page to resume
- [ ] Completed rows are clickable → navigate to `/results/[submissionId]`
- [ ] Latest completed attempt is highlighted/annotated as "current"
- [ ] "Retake" button visible when `retakes_allowed` is true (hidden otherwise)
- [ ] Empty state when no submissions exist: "No submissions yet" + "Start Assessment" button
- [ ] Back link to class page
- [ ] Service function fetches all submissions (not just latest) with attempt numbers
- [ ] Server action enforces auth (student can only see their own submissions)
- [ ] Test: student with 3 attempts sees all 3 rows; student with 0 attempts sees empty state

## Blocked by

None - can start immediately
