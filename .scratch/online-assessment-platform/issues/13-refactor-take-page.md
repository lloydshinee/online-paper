## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Refactor the assessment-taking page to separate the "take" and "results" concerns that are currently conflated. The take page should only handle assessment-taking — no embedded results view.

After a student submits (manually or via timer expiry), redirect them to the attempt detail page at `/results/[submissionId]`. The take page should no longer switch to a results view mode.

Update all "View Results" links across the app (student dashboard, student class page) to point to `/results` instead of the take page. When a student navigates to the take page but already has a completed submission, redirect them to the results page (unless `?retake=1` is present).

## Acceptance criteria

- [ ] Remove results view mode (`viewMode` state, results JSX) from the take page
- [ ] After manual submit: redirect to `/results/[submissionId]`
- [ ] After timer expiry auto-submit: redirect to `/results/[submissionId]`
- [ ] Student dashboard "View Results" links → point to `/results`
- [ ] Student class page "View Results" links → point to `/results`
- [ ] Navigating to take page with completed submission (and no `?retake=1`) → redirect to `/results`
- [ ] Navigating to take page with `?retake=1` → creates new submission as before (unchanged)
- [ ] Navigating to take page with in-progress submission → resumes as before (unchanged)
- [ ] No broken links or dead navigation paths
- [ ] Test: submit → redirected to detail page; click "View Results" from dashboard → lands on results list

## Blocked by

- 12-attempt-detail-page (needs the detail page to redirect to)
