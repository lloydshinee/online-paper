# Editing a parsed MC question with >4 options silently truncates options and can force changing the answer key

Severity: MEDIUM (silent content loss)

Status: ready-for-agent

## Problem

The parser accepts any option count up to z (`lib/question-parser.ts:173-214`) and this commit's own format guide says so, but the question edit form (`questions-tab.tsx:534-536`) has only slots a–d and `buildQuestion` (`:415-420`) rebuilds from exactly those four. Saving an edit to a 5+ option question drops options e+; if the correct answer was option e+, validation ("Select a filled option") blocks saving unless the instructor changes the key.

## Fix options

- Support n options in the edit form (dynamic rows), or
- Warn on open and route >4-option questions into the paste-edit flow, or
- Block editing with an explicit message.

Any of the three is acceptable; silent truncation is not.

## Acceptance criteria

- [ ] A 5-option parsed question can be viewed/edited without silent option loss
- [ ] The correct answer can never be silently invalidated by an edit-save
- [ ] Component test covering open → edit → save round-trip for a 5-option question
