Status: done

## What to build

Extract the duplicated header pattern (logo + user display name + "Sign out" button) that appears identically across 10+ pages into a single shared `<DashboardHeader>` component.

The pattern appears in:
- `admin/page.tsx`
- `instructor/page.tsx`
- `instructor/classes/[id]/page.tsx`
- `instructor/classes/[id]/assessments/[assessmentId]/page.tsx`
- `instructor/classes/[id]/assessments/[assessmentId]/live/page.tsx`
- `student/page.tsx`
- `student/classes/[id]/page.tsx`
- `student/classes/[id]/assessments/[assessmentId]/page.tsx`
- `student/classes/[id]/assessments/[assessmentId]/live/page.tsx`
- `admin/classes/[id]/page.tsx`

The component should accept `userName` as a prop and render the logo link, user greeting, and sign-out button in a consistent layout. Place it in `components/dashboard-header.tsx`.

## Acceptance criteria

- [ ] `<DashboardHeader userName={...} />` component exists in `components/dashboard-header.tsx`
- [ ] All 10+ pages use `<DashboardHeader>` instead of inline header markup
- [ ] Header layout is identical to the current one (logo left, user info right)
- [ ] User name loading/fallback states are handled consistently
- [ ] No visual regression on any page

## Blocked by

None - can start immediately.

## Comments

Discovered during comprehensive 4-agent code review (UI review). Component structure scored 7/10 due to this duplication.
