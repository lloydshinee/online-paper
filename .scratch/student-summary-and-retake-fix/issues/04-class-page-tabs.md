Status: ready-for-agent

## Parent

Feature: student summary and retake fix (this directory).

## What to build

Prefactor: restructure the instructor class page into three tabs — **Assessments**, **Roster**, **Student Summary** — moving existing content unchanged.

The class header (class name, join code, student count, draft/published/closed counts, archived badge, Create button) stays fixed above the tabs. The Assessments tab holds today's Drafts/Published/Closed sections exactly as they are; the Roster tab holds the existing roster component; the Student Summary tab is an empty placeholder that a later issue fills with the matrix.

No behavior change in this slice — it exists so the matrix lands as filling a tab rather than restructuring plus building in one diff. The active tab should be addressable via URL (query param) so links can target a tab directly and refresh keeps position.

## Acceptance criteria

- [ ] Class page shows three tabs: Assessments, Roster, Student Summary
- [ ] Header content identical to today and visible above all tabs
- [ ] Assessments and Roster tabs render byte-for-byte equivalent content to the current page
- [ ] Student Summary tab renders a sensible empty state
- [ ] Active tab reflected in the URL; deep-linking and browser back/forward switch tabs correctly
- [ ] No changes to data fetching behavior for existing sections

## Blocked by

None - can start immediately.
