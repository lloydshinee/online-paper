# Medium batch: session resilience, membership enforcement, parser boundary, unscoped aggregates, submit race

Severity: MEDIUM (batch of independent fixes from the re-review)

Status: done

## What to build

Five verified medium findings:

1. **Missed end-broadcast strands students in Active.** The student live page stops polling at first convergence; if the socket drops after that, a missed end broadcast (or mid-session advance) is never recovered — the student stays on a stale question, saves get rejected, and the Ended screen never appears. Add a poll fallback (or keep polling lightly while active) so a missed broadcast self-heals.

2. **Dual-session enforcement is init-only.** The two-sessions check runs once at page load; the fallback join is fire-and-forget with errors ignored, and the live answer save checks enrollment but not session membership. A student who loads session A's page before joining session B (another tab/device) can answer both sessions concurrently. Enforce membership on the answer-save write path (or re-check membership server-side on join).

3. **Parser: malformed-header body still merges silently.** When a section header is malformed, only the header line is skipped — its body merges into the previous valid section and becomes garbage content with no per-question warning (e.g. MC options turning into essay-prompt text). Treat a malformed header as a hard section boundary and drop or explicitly report its body.

4. **Answer-count actions accept any role and any session ID.** The per-question answer count actions leak per-question aggregate counts cross-tenant. Scope them to the owning instructor (same ownership verification as ticket 19) and the student's own session where applicable.

5. **Submit double-run race (ticket 02 remainder).** The guarded status update in submit has no `.select()`, so a caller that lost the concurrent race can't distinguish "I transitioned it" from "the other caller did" — both proceed to grade. Grading is idempotent today, but make the transition authoritative (`.select()` + treat 0 rows as lost race) so exactly one caller grades.

## Acceptance criteria

- [ ] A student whose socket drops before the end broadcast reaches the Ended screen via polling without extra clicks
- [ ] A student with membership in two non-ended sessions cannot save answers to the second one
- [ ] A malformed section header never injects its body into a previous question's content; every discarded body is reported
- [ ] Non-owning instructors (and students) cannot read another session's answer counts
- [ ] Concurrent submits run grading exactly once (test with two racing calls)
- [ ] Regression: all current tests stay green

## Blocked by

None - can start immediately

## Comments

- Items 1, 2, 4, 5 completed by coding agent (item 3 owned by another agent).
  - Item 1: student live page keeps a light poll fallback (12s) while Active; a missed end broadcast converges to the Ended screen and forward index changes are applied, with applyView's dirty/seq guards preventing regressions and local-edit clobbering.
  - Item 2: `saveLiveAnswer` now enforces membership on the write path — the saver must be a member of this session and of no OTHER non-ended session ("not a participant" / "already in another live session" rejections). Tests updated to join before saving where the old flow saved first; new tests: non-member save rejected, forged dual-membership save rejected.
  - Item 4: `getQuestionAnswerCount` / `getSessionAnswerCounts` take an optional `instructorId` and verify session→assessment→class ownership (return 0/{} for non-owners); the actions authorize `['instructor']` and pass `auth.userId`. Test: owner sees counts, non-owner sees 0/{}.
  - Item 5: `submitAssessment`'s guarded transition now uses `.select('status')` and treats a no-row result as a lost race (returns error without grading). Test: two racing `submitAssessment` calls → exactly one success, one "already submitted" error, correct single-graded score.
- Verification: vitest 69/69 on affected files green (incl. ticket-02/04 regressions), `tsc --noEmit` clean, ESLint 0 errors, `next build` clean, Playwright e2e/live-session + e2e/timed-assessment 7/7 green.

- Item 3 (parser hard boundary) completed by the second coding agent: malformed/unknown section headers are now HARD section boundaries — their body lines are excluded from every section and every dropped body is explicitly reported (header warning + "content following ... was discarded" warning). Lines starting with `[` but without a closing bracket remain plain text. Tests: 21/21 parser tests green, including new boundary and unmatched-bracket cases. The E2E parser spec was updated to expect 3 warnings (header + discard + Points).
- Final parent verification: vitest 178/178 across 20 files green; Playwright E2E 12/12 green; `tsc --noEmit` clean; ESLint 0 errors; `next build` clean.
