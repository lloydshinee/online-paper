Status: ready-for-agent

## Parent

Feature: student summary and retake fix (this directory). Records its rationale in `docs/adr/0003-retakes-never-discard-running-attempts.md`.

## What to build

Make it impossible for a retake to silently destroy a running attempt — the bug that produced blank duplicate attempts in production (students mid-attempt refreshed or clicked Retake and got a fresh blank attempt while their real one expired).

Three layers, per the ADR:

1. **Server rule**: when a retake request arrives while the student has an In Progress attempt, return that attempt as a resume — never expire it to spawn a new row. Only a past-deadline In Progress attempt may be expired by a retake, and only as a precursor to creating the deliberate new attempt. All other existing start rules are unchanged.
2. **Retake visibility**: the class-page Retake button appears only when the student has at least one finished (Submitted/Expired) attempt AND nothing In Progress. This applies to timed mode only — the live-mode join link keeps its current behavior; do not gate it.
3. **Confirm gate**: visiting the take page with the retake flag no longer auto-starts. When prior finished attempts exist, show a confirmation step ("Your previous attempt: N pts — start attempt #2?"); the new attempt begins only on explicit click. A crafted retake URL with no prior submissions behaves like a normal first start.

First-time starts without the retake flag keep today's behavior.

## Acceptance criteria

- [ ] Retake request + live (non-overdue) In Progress attempt → returns the existing submission for resume; no new row is inserted and the running attempt is untouched
- [ ] Retake request + past-deadline In Progress attempt → old attempt becomes Expired, exactly one new blank attempt is created
- [ ] First start (no prior attempts) → unchanged auto-start behavior
- [ ] Start request without the retake flag after a finished attempt → still rejected with the "already submitted" error
- [ ] Retake button hidden while an attempt is In Progress; visible once the latest attempt is Submitted/Expired
- [ ] Live-mode join link unaffected by the visibility rule
- [ ] Take page with retake flag + finished attempt shows the confirm gate with the previous score; assessment starts only on confirm
- [ ] Unit tests cover each server branch above; component/e2e test covers button visibility and the gate

## Blocked by

None - can start immediately.
