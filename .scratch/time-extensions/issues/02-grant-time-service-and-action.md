Status: done

## Parent

[PRD: Time Extensions](../PRD.md)

## What to build

The grant-time domain logic and its instructor-facing server action.

A new service function grants time to a specific student's attempt on a timed assessment. Two behaviors, selected by the attempt's current status:

- **In Progress**: add the granted seconds to the attempt's `extra_seconds` counter — the deadline moves forward, nothing else changes (violation count, answers, and status stay as they are).
- **Latest submitted/expired attempt**: re-open it. The attempt transitions back to In Progress, `submitted_at` and `score_total` are cleared, auto-graded per-answer results (MultipleChoice, TrueOrFalse, FillInTheBlank) are cleared while manual essay/coding grades and feedback are kept, the violation count resets to 0, and `extra_seconds` is set so the new deadline is `now + granted_minutes`.

Grants are repeatable and uncapped. Eligibility rules: timed mode only; the assessment must be published (any state — active, not-accepting, or closed); the caller must be the assessment's class instructor; the target attempt must be either the student's current in-progress attempt or their latest finished attempt. Older non-latest attempts are never grantable. Draft assessments and live-mode assessments are rejected.

The instructor server action authenticates the caller, verifies ownership of the assessment's class, validates the granted amount (a positive number of minutes, e.g. capped to a sane input limit), and calls the service.

## Acceptance criteria

- [ ] Extending an in-progress attempt moves its deadline by the granted amount and changes nothing else
- [ ] Re-opening a latest expired attempt: status In Progress, submitted_at and score_total null, auto-graded answers cleared, manual grades and feedback kept, violations 0, new deadline = now + granted
- [ ] Re-opening a latest manually submitted attempt behaves the same as an expired one
- [ ] A non-latest finished attempt is rejected (even if the student has a newer one)
- [ ] Only the class instructor can grant; other instructors, students, and unauthenticated callers are rejected
- [ ] Live-mode and draft assessments are rejected
- [ ] Repeated grants accumulate correctly (in-progress: additive; re-open after re-open: new deadline = now + granted)
- [ ] After re-open, a subsequent submit re-runs grading and produces a fresh score from the final answers
- [ ] Service-level tests cover all of the above (integration against the Supabase test DB, prior art: the submission-service test suite)

## Blocked by

- 01-deadline-kernel

## Comments

- Grilled and approved with the user. See PRD for the full decision set.
