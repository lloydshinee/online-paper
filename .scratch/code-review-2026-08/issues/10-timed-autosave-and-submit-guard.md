# Timed take page: autosave reliability and submit guard

Severity: HIGH (silent answer loss)

Status: done

## What to build

The timed-assessment take page saves on every keystroke with no debounce or sequencing. Because the server upsert is last-write-wins, overlapping requests can land out of order (typing "hello world" quickly can persist a prefix). Submit races the in-flight saves: any save resolving after submit is rejected by the server — and the client never checks save results — so final answers silently vanish from the graded Submission. Submit itself ignores the action's error result, has no double-click guard, keeps the button enabled during flight, and has no try/catch: on failure the student is shown the results view while the server row is still In Progress, or the confirm dialog just hangs.

Fix end-to-end:

- Debounce autosave per question, serialize saves per question (sequence or version so an older payload can't overwrite a newer one)
- Flush all pending saves before submitting; await them
- Check and surface save errors (banner/toast), including post-expiry rejections from issue 02
- Submit: check the action's error result, guard + disable during flight, wrap in try/catch with an error state, set the submitted flag only on success

## Acceptance criteria

- [ ] Rapid typing persists the complete final text for essay/coding/fill-blank (no truncation from out-of-order upserts)
- [ ] Submitting immediately after typing includes the last answer in the graded submission
- [ ] A failed submit shows an error and leaves the student on the take page with their answers intact
- [ ] Double-clicking Submit produces exactly one submission/grading run
- [ ] Save errors are visible to the student (not silent)
- [ ] Test/manual: type-then-immediately-submit scenario preserves the answer; submit-failure scenario keeps state

## Blocked by

- `.scratch/code-review-2026-08/issues/02-enforce-deadline-on-write-paths.md` (save rejections and submit status semantics change)

## Comments

- Completed by coding agent. Take page: debounced + serialized autosaves, flush before submit, save errors surfaced (incl. expiry), submit guard + try/catch + disabled state, submitted flag only on success. E2E: e2e/timed-assessment.spec.ts.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
