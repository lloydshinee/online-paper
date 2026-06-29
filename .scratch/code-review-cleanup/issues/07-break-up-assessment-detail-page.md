Status: ready-for-agent

## What to build

Refactor the 1,349-line monolithic assessment detail page (`instructor/classes/[id]/assessments/[assessmentId]/page.tsx`) into separate, lazy-loaded tab components.

Extract these tabs into individual files:
- `_components/questions-tab.tsx` — question list, inline point editing, delete question
- `_components/settings-tab.tsx` — publish/unpublish, close, scores release, answer reveal, retakes toggle, duration settings
- `_components/submissions-tab.tsx` — student submissions list with search, filter, and pagination
- `_components/grading-panel.tsx` — manual grading UI for essay/coding answers, score input, feedback text

The main page file should become a thin shell that manages tab state and lazy-loads each tab with `next/dynamic`. Use `dynamic(() => import('./_components/questions-tab'), { loading: () => <Skeleton /> })` so only the active tab's code is shipped to the browser.

Also reduce the ~35 `useState` calls by co-locating state within each tab component.

## Acceptance criteria

- [ ] Each tab is in its own file under `_components/` directory
- [ ] Tabs are lazy-loaded with `next/dynamic()` and show skeleton loading
- [ ] No functionality is lost — questions, settings, submissions, and grading all work as before
- [ ] State is co-located in each tab component (no prop drilling between tabs)
- [ ] Main page file is under 200 lines (down from 1,349)
- [ ] Build and typecheck pass

## Blocked by

None - can start immediately (but 05-DashboardHeader and 06-shadcn-aria may be useful to do first to avoid merge conflicts).

## Comments

Discovered during comprehensive 4-agent code review (UI review). This file alone scored the component structure a 7/10.
