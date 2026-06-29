Status: done

## What to build

Add loading and error boundaries across all dashboard routes. Currently the codebase has zero `loading.tsx` and zero `error.tsx` files. Server components render nothing until data resolves (no skeleton loading), and if a server component or action throws, users see a raw Next.js error page.

Add:
- `app/(dashboard)/dashboard/loading.tsx` — skeleton card grid
- `app/(dashboard)/dashboard/instructor/loading.tsx` — skeleton for class list
- `app/(dashboard)/dashboard/student/loading.tsx` — skeleton for student dashboard
- `app/(dashboard)/dashboard/admin/loading.tsx` — skeleton for admin overview
- `app/(dashboard)/dashboard/error.tsx` — error boundary with retry button and user-friendly message
- Wrap root layout `children` in `<Suspense>` in `app/layout.tsx`

Skeletons should use `animate-pulse` with placeholder shapes matching the actual layout (rounded rectangles for cards, circles for avatars, etc.).

## Acceptance criteria

- [ ] Every dashboard route has a `loading.tsx` with meaningful skeleton UI
- [ ] Every dashboard route group has an `error.tsx` error boundary with a "Try again" button
- [ ] Root layout wraps children in `<Suspense>` with a fallback
- [ ] Skeleton shapes approximate the real layout (not just a "Loading..." text string)
- [ ] Error boundary resets and retries correctly

## Blocked by

None - can start immediately.

## Comments

Discovered during comprehensive 4-agent code review (UI review). Loading/error states scored 5/10.
