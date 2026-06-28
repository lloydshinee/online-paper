Status: done

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Implement email + password registration and login using Supabase Auth (GoTrue). After login, route users to the correct dashboard based on their `role` field in the `users` table. Students go to `/dashboard/student`, instructors to `/dashboard/instructor`, admins to `/dashboard/admin`. Unauthenticated users are redirected to `/login`. Protect all dashboard routes with middleware.

All three roles can register via the same form — role is assigned by the admin (students self-register as "student" by default; instructors/admins must be created by the admin, handled in issue 03). No email verification, no forgot-password.

## Acceptance criteria

- [ ] Registration form (email + password) creates a user via Supabase Auth with role `student` by default
- [ ] Login form (email + password) authenticates via Supabase Auth and sets session cookie
- [ ] Middleware checks for valid session on all `/dashboard/*` routes, redirects unauthenticated users to `/login`
- [ ] After login, middleware redirects to role-appropriate dashboard: student → `/dashboard/student`, instructor → `/dashboard/instructor`, admin → `/dashboard/admin`
- [ ] Logout clears session and redirects to `/login`
- [ ] If a logged-in user visits a dashboard for a different role, they are redirected to their own dashboard
- [ ] Registration shows a generic success message (no email confirmation)
- [ ] Tests: register student → redirect to student dashboard; login as instructor → redirect to instructor dashboard; unauthenticated visit to /dashboard/student → redirect to /login

## Blocked by

- 01-project-scaffolding
