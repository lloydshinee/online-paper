Status: ready-for-agent

## Parent

Feature: student summary and retake fix (this directory).

## What to build

Expose attempt deletion in the instructor UI. The server action already exists (instructor-scoped permanent deletion of a submission and its answers) — this slice is the surface for it, and doubles as the cleanup tool for the blank duplicate attempts created by the retake bug.

In the View-student dialog on the assessment Submissions tab:

- A Delete control on every attempt row, regardless of status (In Progress included).
- A "delete all attempts" action for that student in a danger-zone footer of the same dialog.
- Both sit behind a confirmation dialog. When the target is In Progress (or delete-all includes one), the dialog warns that the student may be answering right now and will be able to start over.

Per the glossary's **Attempt Deletion** term: deleting a student's only attempt returns them to never-taken — they can take the assessment again even when retakes are disallowed. This emerges from the rows being gone; no new server rule is needed. Lists must refresh after any deletion so counts and attempt history stay truthful.

## Acceptance criteria

- [ ] Instructor can delete a single Submitted, Expired, or In Progress attempt; its answers are gone and the attempt disappears from the list
- [ ] Instructor can delete all of a student's attempts at once
- [ ] Both actions require an explicit confirmation; In Progress targets show the "student may be answering" warning
- [ ] After deleting their only attempt(s), the student sees the assessment as never taken and can start fresh regardless of the retakes setting
- [ ] Non-owning instructors cannot delete (server-side rejection preserved)
- [ ] Submissions list, student group counts, and attempt totals refresh after deletion
- [ ] Tests cover ownership rejection, answer cascade removal, and list refresh after delete

## Blocked by

None - can start immediately.
