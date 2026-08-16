# UI defect batch: grading precision, settings rollback, search race, channel leak, breakdown gating

Severity: MEDIUM (batch of independent, small fixes)

Status: done

## What to build

Five verified, independent client-side defects:

1. **Grading silently rounds fractional scores.** The grading panel passes `Math.round(score)` to the grade action: an instructor entering 2.5 sees "2.5" in the input and a "Saved" indicator while 3 is stored — silent grade corruption. Pass the parsed value as-is (the server accepts numbers) or block non-integer input visibly.

2. **Settings toggles are optimistic without rollback.** Each switch flips local state then saves; on failure only a toast fires and local state stays flipped — the instructor leaves the tab believing scores are released while students still get stripped data. Revert local state on error (or drive state from the server response).

3. **Roster/admin search out-of-order responses.** The student roster and admin user list have no request sequencing: a slow "smi" response can land after a fast "smith" response and replace the fresher results. Add a request-id/ignore guard (the submissions tab already does this correctly — reuse its pattern).

4. **Notification bell channel leak.** The channel subscription is created after an async auth lookup; if the component unmounts mid-lookup, cleanup has already run and the channel subscribes anyway — repeated navigation leaks `postgres_changes` listeners. Check a cancelled flag before subscribing; add `.catch` to the lookup and mark-read actions with user feedback.

5. **Score release hides the entire per-question breakdown.** When scores are released but answer reveal is off, the results view hides the whole breakdown including points earned per question. CONTEXT.md: released scores show "per-question breakdown (their answer vs correct answer, points earned)" with answer reveal gating only the correct-answer column. Render the breakdown on release; conditionally hide only the correct-answer column (the server already strips it when reveal is off).

## Acceptance criteria

- [ ] Entering 2.5 in the grading panel stores 2.5 (or the input visibly rejects it); the saved value matches what the instructor saw
- [ ] A failed settings save reverts the toggle to its true state
- [ ] Out-of-order search responses can never overwrite fresher results (roster + admin list)
- [ ] Navigating away from the bell mid-subscribe leaves no orphan channel; mark-read failures surface
- [ ] With scores released and reveal off, students see per-question points earned and their own answers — correct answers remain hidden
- [ ] Lint errors flagged in these files during review (`set-state-in-effect` in the roster, unescaped entity on the landing page) are resolved as part of touching them

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. Grading panel rejects fractional scores visibly; settings toggles driven by server response with rollback on error; request-id guards on roster + admin searches; notification bell cancelled-flag + catch + mark-read feedback; breakdown renders on release with only the correct-answer column reveal-gated; lint errors fixed (roster set-state-in-effect, landing page unescaped entity). E2E covers breakdown gating.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
