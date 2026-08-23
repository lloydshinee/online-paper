# Live page saved-answer restore can clobber in-flight typing

Severity: HIGH (student input loss during live assessments)

Status: done

## Problem

`applyView` on the student live page (`live/page.tsx:196-209`) computes `locallyEdited = dirtyRef.current && answerQuestionIdRef.current === view.currentQuestion.id` BEFORE `await getStudentLiveAnswerAction(...)` and never re-checks after the await. If the student types (or selects an MC option) during the fetch latency, the resolved server value overwrites their input via `setAnswer(saved)`, and the ref-sync effect (`:458-461`) mirrors the loss into `answerRef`. Happens exactly when students react quickly to a question switch. The `seq` guard does not help: typing never bumps the sequence.

## Fix

Re-check dirtiness after the await and bail out of the restore when the user has local content for the same question:

```
const wasDirtyBeforeFetch = dirtyRef.current && answerQuestionIdRef.current === view.currentQuestion.id
if (!wasDirtyBeforeFetch) {
  const saved = await getStudentLiveAnswerAction(...)
  const typedDuringFetch = dirtyRef.current && answerQuestionIdRef.current === view.currentQuestion.id
  if (seq === questionLoadSeqRef.current && !typedDuringFetch) { ...apply saved/empty... }
}
```

## Acceptance criteria

- [x] Restore skips application when typing occurred during the fetch (unit-testable once the live-page RTL harness exists — see issue 07; until then verified by reasoning + manual repro steps)
- [x] Normal restore behavior unchanged (saved answers still populate untouched questions)
- [x] `tsc --noEmit` clean

## Comments

- Implemented: `typedDuringFetch` re-checks `dirtyRef.current && answerQuestionIdRef.current === view.currentQuestion.id` after the await; restore applies only when the seq matches and no local edit happened during the fetch. Regression test deferred to the live-page harness (issue 07 prerequisite note).
