# Live page: waiting-to-active transition and per-user presence

Severity: CRITICAL (session-locking) / HIGH (presence)

Status: done

## What to build

Two independent defects make the Live Session student experience broken:

1. **Students can get stuck on the Waiting screen for the whole session.** The student page polls for the session only while it has no session object; once a Waiting session row is found, polling stops. The realtime `next` handler updates the question index but never flips the client into the Active view. A student whose poll lands between session creation and the instructor's start broadcast (or after a failed start) sees "The session hasn't started yet" forever, and zero answers are recorded. Fix the state machine: enter the Active view on the first advance broadcast, and/or keep polling while `status !== 'active'`.

2. **Presence key collision.** Every student tracks presence under the hardcoded key `student`, so Supabase presence dedupes them into one entry. The instructor always sees "1 joined" and answer counts out of 1, breaking the CONTEXT.md feature "the instructor sees how many students are connected and how many have answered each question". Use the authenticated user ID as the presence key on both student and instructor pages.

3. **Instructor live init ignores errors.** The start action's return value is discarded; on failure the page renders a waiting session with no feedback (direct enabler of defect 1). Surface start failures. Also stop silently force-setting `retakes_allowed: true` when opening a live session — the instructor's Retake policy is overwritten without consent or disclosure; if the override is required for live mode, disclose it or gate it explicitly.

## Acceptance criteria

- [ ] A student who polls between session creation and start transitions to Active on the first advance event
- [ ] A student who never receives broadcasts still converges via polling
- [ ] With N students joined, the instructor sees N connected (verify with 2+ distinct users)
- [ ] Answer counts use the correct denominator (N connected, not 1)
- [ ] Start-action failure shows an error state on the instructor page instead of a waiting session
- [ ] Opening a live session does not silently overwrite `retakes_allowed`
- [ ] Tests/manual script: stuck-waiting scenario, multi-student presence count

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. Student live page polls until active, transitions on first advance broadcast, per-user presence keys on both pages, instructor start failures surfaced, silent retakes_allowed override removed. E2E: e2e/live-session.spec.ts.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
