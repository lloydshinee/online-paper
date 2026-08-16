# Question parser: stop silently mangling common inputs

Severity: MEDIUM

Status: done

## What to build

The question import parser silently drops or mangles several realistic inputs, and the instructor gets no signal:

- **MC options capped at a-d**: a 5-option question has `e)` silently dropped, and if the answer is `e`, the entire question is discarded.
- **Blank lines split Essay/Coding prompts**: a prompt containing a blank line becomes two (or more) separate questions — an instructor pasting a 10-point essay with paragraphs sees multiple 1-point prompts.
- **Points parsing**: `Points: 0` becomes 1 (via a floor of 1) and `Points: 2.5` becomes 2 (integer regex), silently.
- **Malformed section headers** (e.g. trailing text after `]`) merge that section's body into the previous section — wrong question types.

Move from silent skips to explicit results: the parse should return errors/warnings the create-assessment UI surfaces ("question 7 discarded: answer e but only 4 options parsed"), support options a-z, and treat consecutive blocks without an `Answer:` line as continuation of the previous prompt in Essay/Coding sections. Validate points as authored (reject or warn on non-integer / non-positive rather than coercing).

CONTEXT.md: "Instructors create questions by pasting a block of formatted plain text" — the format guide shown in the UI should match whatever grammar this ends up being.

## Acceptance criteria

- [ ] A 5-option MC with answer e parses fully and is playable
- [ ] An Essay/Coding prompt containing blank lines parses as one question with the authored point value
- [ ] `Points: 0` and `Points: 2.5` produce visible warnings/errors, not silent coercion
- [ ] A malformed section header produces an error naming the header, not a silent merge
- [ ] Any discarded question is reported to the instructor with a reason
- [ ] Tests for each case above (parser suite already exists — extend it)

## Blocked by

None - can start immediately

## Comments

- Completed by coding agent. Parser rewritten with diagnostics API (parseQuestionsWithDiagnostics): options a-z, multi-paragraph Essay/Coding prompts, strict Points validation, malformed-header errors, discard reasons surfaced in the questions tab + format guides. Tests: __tests__/lib/question-parser.test.ts.
- Verification: vitest 163/163 green, Playwright E2E 12/12 green, `tsc --noEmit` clean, ESLint 0 errors, `next build` clean.
