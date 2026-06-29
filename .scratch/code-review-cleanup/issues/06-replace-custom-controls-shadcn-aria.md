Status: done

## What to build

Replace custom hand-rolled UI controls with proper shadcn components and add missing ARIA attributes throughout the app.

**Replacements needed:**
- Custom toggle switches (raw `<button>` at `assessment/page.tsx:883-891` and settings section) → shadcn `Switch` component with `role="switch"` and `aria-checked`
- Custom confirmation overlay (raw `<div>` at `student/.../page.tsx:740-768`) → shadcn `AlertDialog`
- Raw tab buttons without `role="tab"`/`aria-selected` (at `assessment/page.tsx:488-500`) → add proper tab ARIA pattern
- Icon-only buttons (edit, delete, search) without `aria-label` → add descriptive `aria-label` to each

**Create new shadcn components as needed:**
- `components/ui/switch.tsx` — toggle switch component
- `components/ui/tabs.tsx` — tab component (if not already present)

## Acceptance criteria

- [ ] All toggle switches use the shadcn `Switch` component with proper ARIA attributes
- [ ] Confirmation overlay replaced with `AlertDialog`
- [ ] All icon-only buttons have `aria-label` attributes
- [ ] Tab buttons use `role="tab"`, `aria-selected`, and `tabindex` pattern
- [ ] No visual regression — toggles and dialogs look and behave the same
- [ ] Screen reader navigation is improved (verify with axe or similar tool)

## Blocked by

None - can start immediately.

## Comments

Discovered during comprehensive 4-agent code review (UI review). Accessibility scored 6/10.
