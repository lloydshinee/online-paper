Status: done

## Parent

[PRD: Time Extensions](../PRD.md)

## What to build

Keep the student's live countdown in sync with granted time, and make expiry respect server truth.

The take page currently computes its deadline once (at start or resume) and ticks down locally, while the server enforces the real deadline on every save. When the instructor grants time, three things must happen for the student:

1. **Poll**: while taking, the page polls a lightweight student-owned server action (roughly every 10 seconds) that returns the authoritative remaining seconds for the active attempt. When the server deadline is later than the local one, the page adopts it (countdown jumps up) and shows a short banner ("Instructor added X min").
2. **Server-verified expiry**: when the local countdown hits zero, the expiry request must be verified against the server deadline. If the server says the attempt is not overdue (because time was granted), the client adopts the server deadline and keeps going instead of submitting. The violation-cap auto-expiry stays forced — it does not consult the deadline.
3. **Resume with extension**: a re-opened attempt must resume correctly on the student's next visit/refresh — deadline computed with the extra-time counter, answers intact, and the banner visible so the student understands what happened. The results view must not show a re-opened (In Progress) attempt as finished.

## Acceptance criteria

- [ ] Student-owned remaining-time action returns the authoritative remaining seconds for the active attempt and nothing else sensitive
- [ ] Take page polls it every ~10s while in take mode and adopts a later server deadline; the countdown visibly jumps up
- [ ] A short banner announces added time and dismisses without blocking the exam
- [ ] Timer-zero expiry verifies the server deadline first; an extended attempt is not wrongly auto-submitted by a stale countdown
- [ ] Violation-cap expiry still submits regardless of deadline
- [ ] Re-opened attempt resumes on refresh with previous answers and the extended deadline; the page never treats it as finished
- [ ] Component tests cover poll adoption, banner, stale-timer aversion, and resume (prior art: mocked server actions at the take-page seam)

## Blocked by

- 01-deadline-kernel

## Comments

- Grilled and approved with the user. See PRD for the full decision set.
