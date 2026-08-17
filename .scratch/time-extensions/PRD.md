# Time Extensions PRD

Status: ready-for-agent

## Problem Statement

An instructor administering a timed assessment cannot help a specific student who is running out of time. If a student has 40 seconds left (or the timer already ran out because they didn't notice it), there is no way to give that student extra minutes. The only options are to let the student fail the attempt, allow a retake (which starts them from zero), or edit the assessment duration (which changes time for everyone, including students who already submitted). Instructors need a per-student time control on their timed assessments.

## Solution

Add **Time Extensions** to timed assessments: from the submissions tab, the instructor grants additional minutes to a specific student's attempt. The student's countdown updates live and their answers stay intact.

- For an **in-progress** attempt, the grant moves the student's deadline forward by the granted amount.
- For the student's **latest expired or submitted** attempt, the grant re-opens it: the attempt returns to In Progress with a fresh allowance starting now, the student's answers are preserved, auto-grades are cleared (re-grading happens on the next submit), the instructor's manual grades are kept, and the violation count resets.
- Grants are repeatable and unlimited; there are presets (1/5/10/15/30 min) plus a custom amount.

## User Stories

1. As an instructor, I want to add time to a specific student's in-progress attempt on a timed assessment, so that a student with 40 seconds left can finish answering.
2. As an instructor, I want to re-open a student's latest expired or submitted attempt, so that a student who didn't notice their timer can continue answering without starting a new attempt.
3. As an instructor, I want to see the remaining time of each in-progress attempt in the submissions dialog, so that I know who is about to run out.
4. As an instructor, I want preset grant amounts (1, 5, 10, 15, 30 minutes) and a custom amount, so that I can grant exactly what the situation needs.
5. As an instructor, I want to grant time more than once to the same attempt, so that I can adjust as the situation evolves.
6. As an instructor, I want to see which attempts have been given extra time, so that I can keep track of which students I have helped.
7. As an instructor, I want a confirmation prompt when re-opening a finished attempt, so that I am warned that its auto-grades will be cleared before I confirm.
8. As an instructor, I want re-opening an attempt to preserve my manual essay/coding grades and feedback, so that my grading work is not destroyed.
9. As an instructor, I want re-opened attempts to reset the student's violation count, so that a student who hit the violation cap is not instantly auto-submitted again.
10. As an instructor, I want to grant time in any published assessment state (including closed or not accepting submissions), so that I can give makeup time even after closing the exam.
11. As an instructor, I want only the assessment's class instructor to be able to grant time, so that nobody else can tamper with exam timing.
12. As a student, I want my live countdown to reflect granted time automatically, so that I am not wrongly auto-submitted while my instructor is helping me.
13. As a student, I want a visible indication when time is added to my attempt, so that I know I can keep answering.
14. As a student, I want my re-opened attempt to resume with all my previous answers intact, so that I continue exactly where I left off.
15. As a student, I want my re-opened attempt to be re-graded when I next submit, so that my final score reflects my final answers.
16. As a student, I want my stale countdown to never auto-submit me when the server deadline was extended, so that a lagging client cannot override the instructor's grant.
17. As an instructor, I want the same grant behavior for every timed assessment regardless of retakes, so that time help works consistently.
18. As a student, I want my previously submitted older attempts to remain untouched when the instructor re-opens my latest attempt, so that my attempt history stays intact.

## Implementation Decisions

- **Data model**: a single `extra_seconds` counter column on the submission row. No per-grant audit log (deliberate simplicity decision — the counter is the only record, surfaced as a "Time added" chip in the instructor UI).
- **Deadline math**: the effective deadline is always `started_at + duration_minutes + extra_seconds`. One shared helper computes this everywhere a deadline is derived (server enforcement, instructor view sweep, student dashboard mapping, take-page resume, remaining-time poll). No site computes a deadline independently.
- **Grant semantics**:
  - In-progress attempt: `extra_seconds += granted_seconds`.
  - Re-open (latest submitted/expired attempt only): transition back to In Progress, clear `submitted_at` and `score_total`, clear auto-graded per-answer results (MC/TF/Fill) while keeping manual essay/coding grades and feedback, reset violations to 0, and set `extra_seconds` so the new deadline is `now + granted_minutes`. The counter therefore also absorbs the dead time since expiry — it is "total effective extension", not a literal sum of granted minutes.
- **Eligibility**: timed mode only; assessment must be published (any state — active, not-accepting, or closed); class instructor only; target attempt must be either the student's current in-progress attempt or their latest finished attempt.
- **Server actions**: one instructor action to grant time, one student action returning the submission's authoritative remaining seconds (poll endpoint).
- **Timer integrity**: a timer-driven expiry must be verified against the server deadline before expiring; if the server deadline was extended, the client adopts it instead of submitting. The violation-cap auto-expiry remains forced (it does not consult the deadline).
- **Instructor UI**: the submissions dialog lists each attempt with its remaining time (in-progress) and a "Time added" chip (when the counter is non-zero). An "Add time" action opens a small dialog with presets and a custom minutes field; re-opening a finished attempt shows a confirmation warning.
- **Student UI**: while taking, the page polls the remaining-time endpoint roughly every 10 seconds and adopts a later server deadline, showing a short banner ("Instructor added X min"). A re-opened attempt resumes on the next visit/refresh with answers intact and the banner visible.
- **Results interaction**: an attempt re-opened after scores were released is no longer visible as results (it is In Progress again); its old auto-scores are cleared and hidden.

## Testing Decisions

- **Seams**: the highest existing seam is the service layer, exercised directly against the Supabase test database (prior art: `__tests__/lib/submission-service.test.ts`). UI behavior is tested at the mocked-server-action seam (prior art: `__tests__/app/timed-assessment-take.test.tsx`). One end-to-end flow covers the live countdown jump (prior art: `e2e/timed-assessment.spec.ts`).
- **Good tests** assert externally observable behavior — deadlines, statuses, grading state, visibility, permissions — not internal mechanics.
- **Service-level coverage**: extend moves the deadline (saves accepted past the old deadline); re-open transitions status, clears auto-grades, keeps manual grades, resets violations, nulls score_total/submitted_at, and sets deadline to now + granted; only latest attempt revivable; non-instructor rejected; live-mode and draft rejected; re-submission after re-open re-grades.
- **UI-level coverage**: Add time control appears per attempt; remaining time renders; chip renders; confirm dialog warns on re-open; countdown adopts polled deadline and shows the banner; stale-timer auto-submit is averted when the server says not expired.
- **E2E coverage**: instructor grants time mid-take → student's countdown jumps and a banner appears; instructor re-opens an expired attempt → student refreshes and resumes answering.

## Out of Scope

- Live-mode assessments (no per-student timer to extend).
- Removing or shortening time (negative extensions).
- A per-grant audit log (who granted what, when).
- Extending or re-opening non-latest attempts when newer attempts exist.
- Rolling back results a student already viewed before the re-open.
- New notification types (the bell) — the take-page banner is the only student notification.

## Further Notes

- The domain glossary gains a new term: **Time Extension** — an instructor-granted addition of minutes to a specific student's attempt on a timed assessment, either extending an In Progress attempt's deadline or re-opening the student's latest finished attempt.
- The **Expired** and **Submitted** definitions change: they are no longer strictly immutable — the instructor may re-open the student's latest finished attempt via a Time Extension.
- One ADR is warranted: the single-counter deadline model (including why revival slack lives inside the counter) and the deliberate no-audit-log tradeoff.
