# Fresh timed attempts show a phantom "Instructor added 1 min" banner

Severity: HIGH (trust in the extension signal, PRD story 13)

Status: done

## Problem

On a fresh timed start, the countdown is seeded from the client clock (`deadlineRef.current = computeDeadline(Date.now(), data.timeLimit)`, student take page `:374-378`). The authoritative `started_at` is written server-side strictly later (network RTT + processing), so the first remaining-time poll (~10 s later) always returns a strictly later deadline. `adoptServerRemainingTime` treats any later deadline as a grant and fires `showExtensionBanner(remaining - currentRemaining)`, floored at 1 minute (`:130`). Result: essentially every timed attempt opens with "Instructor added 1 min" though nothing was granted — training students to ignore the signal that is supposed to appear only when time is actually added.

## Fix

Drive the banner off `extra_seconds` deltas, not remaining-second diffs:

- Track `lastExtraSecondsRef`, seeded from the server value wherever the deadline is seeded (fresh start: extend `startAssessmentAction` to return `started_at` + `extra_seconds` of the created/resumed submission and compute the true deadline immediately; resume branch already has `active.started_at`/`extra_seconds`).
- `adoptServerRemainingTime` adopts any later deadline silently; shows the banner only when the polled `extraSeconds` exceeds the ref, displaying the actual granted delta; updates the ref on every adopt.

## Acceptance criteria

- [x] Component test: fresh start + first poll returning a later deadline with unchanged `extra_seconds` shows no banner; a subsequent poll with increased `extra_seconds` shows "Instructor added N min" with N derived from the delta
- [x] Real extensions still announce (existing sync tests stay green)
- [x] `tsc --noEmit` clean

## Comments

- Implemented as specified. `startAssessmentAction` now returns `startedAt` + `extraSeconds`; the take page seeds `deadlineRef` and the new `extraSecondsRef` from server truth before `viewMode` flips to 'take' (the optimistic `setTimeLeft(timeLimit * 60)` display only). The resume branch seeds the counter too, so its banner stays driven by init. `adoptServerRemainingTime` adopts later deadlines silently and announces only positive `extra_seconds` deltas. Tests: new "a later server deadline with an unchanged grant counter stays silent" + existing adoption/stale-zero tests updated for the seeded fixture; 9/9 green in timed-assessment-take.test.tsx.
