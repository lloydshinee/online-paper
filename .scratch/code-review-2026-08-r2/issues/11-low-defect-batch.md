# Low-severity defect batch

Severity: LOW

Status: ready-for-agent

Verified findings from the 2026-08 push review, each independently small:

1. **Client-callable `force` on expire** (`app/actions/timed-assessment.ts:71-80`): derive `force` server-side (violation-limit path only) instead of accepting it from the wire; drop the take-page fallback that calls `submitAssessmentAction` when forced expiry errors (can produce status `submitted`, contradicting the auto-submit contract).
2. **End-session retry dedup delete ignores its error** (`lib/live-session-service.ts:376-381`): a transient failure can duplicate submitted submissions on re-End (no unique constraint covers them). Check the error; abort the retry attempt.
3. **`advanceLiveSession` update lacks `.eq('status','active')`** (`:238-264`): concurrent advances can lose a departure record, closing a question's flush window early. Guard the transition; make the departure append atomic.
4. **`gradeAnswer` ownership check optional-by-parameter** (`lib/submission-service.ts:918-923`): make `instructorId` required.
5. **`saveAnswer` never binds questionId to the submission's assessment** (`:256-263`): validate before upsert so cross-assessment answer rows can't pollute grading views.
6. **Grant target enrollment never validated**: students removed mid-attempt remain extendable/re-openable — either check enrollment or document the makeup-scenario intent.
7. **Admin overview** (`admin/page.tsx:97-136`): zero-result search immediately overwritten by unfiltered refetch; failed fetch leaves eternal spinner. Track last query; try/catch both loaders.
8. **Roster loaders** (`student-roster.tsx`): no try/finally (stuck spinner on throw); removing the last row of a page lands on a phantom empty page — clamp to last valid page.
9. **Closed-state switch misrepresents state** (`settings-tab.tsx:126-133` + parent pill): closed renders as ON/"Draft"; derive from all three states.
10. **Feedback-only autosave suppressed while score empty** (`grading-panel.tsx:59-64`): allow feedback-only saves; don't show "Auto-save..." when nothing will save.
11. **Restore-saved-answer schedules redundant save + instructor count refetch** (live page `:448-455`): skip when content deep-equals what was just loaded.
12. **Flush gaps**: hook SPA navigation (not just `beforeunload`); device-test hidden-tab throttling vs the 15 s flush window.
13. **removeQuestion undo** (`questions-tab.tsx:490-508`): restores at captured index after intervening mutations; persists inside setState updater (StrictMode double-fire). Move persistence out; disable undo after subsequent mutations.
