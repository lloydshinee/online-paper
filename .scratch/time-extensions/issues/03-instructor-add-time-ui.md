Status: done

## Parent

[PRD: Time Extensions](../PRD.md)

## What to build

The instructor-facing time controls in the submissions tab.

In the per-student attempts dialog, each attempt row gains:

- **Remaining time** for in-progress attempts (computed server-side against the effective deadline), so the instructor can see who is about to run out.
- A **"Time added" chip** whenever the attempt's extra-time counter is non-zero, so granted time is visible at a glance.
- An **"Add time" action** opening a small dialog with preset amounts (1, 5, 10, 15, 30 minutes) and a custom minutes input. Confirming calls the grant-time action, then refreshes the dialog data.
- When the target attempt is finished (expired or submitted), the dialog shows a confirmation warning that re-opening clears the attempt's auto-grades and lets the student continue; manual grades are preserved. Extending an in-progress attempt needs no warning.

The action appears only for eligible attempts (in-progress, or the student's latest finished attempt). For timed assessments only. Success and failure surface via toasts; a failed grant refreshes the data to true server state.

## Acceptance criteria

- [ ] Attempt rows show remaining time for in-progress attempts, accurate against the effective deadline
- [ ] Attempts with a non-zero counter show the "Time added" chip
- [ ] "Add time" dialog offers presets (1/5/10/15/30) and custom minutes; invalid input (empty, zero, negative) is rejected with a message
- [ ] Granting on an in-progress attempt succeeds without a confirmation prompt and updates the displayed remaining time
- [ ] Granting on a finished attempt shows the re-open warning first; confirming re-opens and the row refreshes to In Progress
- [ ] Non-eligible attempts (older than latest) do not show the action
- [ ] Component tests cover the dialog states (prior art: mocked server actions at the component seam)

## Blocked by

- 02-grant-time-service-and-action

## Comments

- Grilled and approved with the user. See PRD for the full decision set.
