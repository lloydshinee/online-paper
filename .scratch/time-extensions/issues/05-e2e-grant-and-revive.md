Status: done

## Parent

[PRD: Time Extensions](../PRD.md)

## What to build

End-to-end verification of the two real-world flows, using the existing Playwright setup.

Flow A — mid-exam extension: an instructor opens the submissions dialog for a timed assessment being taken by a student, sees the remaining time, grants +5 minutes, and the student's running countdown jumps up with a banner, without any page refresh on the student side. The student then submits normally and the attempt grades once.

Flow B — revive: a student's attempt expires. The instructor re-opens it from the submissions dialog (confirming the warning). The student refreshes and is taken back to the take view with their previous answers intact, continues answering, and submits. The attempt's score reflects the final answers, and the instructor's manual grades (if any) survived the re-open.

E2E tests follow the prior art of the existing timed-assessment spec (real Supabase test stack, global setup creating instructor/student/class/assessment fixtures).

## Acceptance criteria

- [ ] Flow A passes: countdown jumps and banner appears on the student's live page after the instructor grants time
- [ ] Flow B passes: expired attempt re-opens, student resumes with answers, final score reflects the re-graded submission
- [ ] Both flows clean up their fixtures so subsequent runs stay deterministic
- [ ] Full Playwright suite (including pre-existing specs) remains green

## Blocked by

- 03-instructor-add-time-ui
- 04-student-countdown-sync

## Comments

- Grilled and approved with the user. See PRD for the full decision set.
