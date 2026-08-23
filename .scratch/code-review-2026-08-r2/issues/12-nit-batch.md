# Nit batch

Severity: NIT

Status: ready-for-agent

1. `lib/deadline.ts:13` — identical ternary branches; drop the conditional.
2. Overdue predicate drifted three ways (`deadline.ts:21` `>=`, `submission-service.ts:1036` `>`, `assessment-service.ts:52` `<`); pick one semantic.
3. Extension banner floors at 1 minute (`Math.max(1, ...)`) — sub-minute diffs render dishonestly; consider seconds display under 60.
4. Resume banner fires on ANY resume with `extra_seconds > 0`, not just reopens (`page.tsx:319-321`) — spec promises it for re-opened attempts only.
5. `resolveMinutes` accepts `2.5`/`1e3`/`0x10` (server rejects non-integers) — tighten input parsing.
6. Listing sweep expires rows serially with full expiry+grading round-trips per row (N+1 on dialog load).
7. `const grantTime = timedAssessmentActions as { ... }` (`submissions-tab.tsx:33-35`) — typed-lie cast hides renames from the compiler.
8. PostgREST `.or()` string interpolation of search input (`submission-service.ts:685-689`) — escape/parameterize (impact confined to filtering oddities today).
9. Duplicate assessment query in `createLiveSession` (`live-session-service.ts:81-92`) — fold `retakes_allowed` into the first select.
10. Non-transactional rerun reset (delete answers → delete members → reset session as three independent calls).
11. Hardcoded `http://localhost:3111` in one e2e goto (`timed-assessment.spec.ts:190`) — use relative URL against baseURL.
12. `expect(getByText(...).first()).toHaveCount(0)` — drop `.first()` on count-zero assertions (two specs).
13. `allowScripts` in package.json is not read by any mainstream package manager — verify target tool or remove.
14. Parser-spec titles not timestamped (`parser-questions.spec.ts:27,53,81`) — collide across runs inside the cleanup window.
15. `key={idx}` on question list + points-editor targeting by index (`questions-tab.tsx:666`) can commit points to a shifted row mid-edit.
16. `parseQuestions(text)` runs twice per keystroke in questions-tab render (`:860`).
17. Admin deactivation decrements `userTotal` even while filtered (`admin/page.tsx:124-127`).
18. `advanceLiveSession('prev')` at index −1 clamps to 0 instead of staying at −1 (unreachable via UI today).
19. Redundant nested `answersShown` gates on the student results page (`:750, :780` inside a block already gated on `answersShown`).
