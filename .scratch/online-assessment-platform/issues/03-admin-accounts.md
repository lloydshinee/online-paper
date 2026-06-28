Status: done

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Give the admin a dashboard to manage user accounts. Admin can create new instructor and admin accounts (email + temporary password), view all users in a list, edit user details (email, role), deactivate accounts (soft-delete or flag), and reset passwords. Admin cannot create student accounts — students self-register (issue 02). Admin account recovery is password reset by the admin.

Use the Supabase Admin API (`service_role` key) for user management operations — creating users, updating passwords, listing users. The admin dashboard is only accessible by users with role `admin`.

## Acceptance criteria

- [ ] Admin dashboard shows a list of all users (name/email, role, status)
- [ ] "Create Account" form: admin enters email + temporary password + selects role (instructor or admin)
- [ ] Created user receives the temporary password (displayed on screen once, or admin communicates it)
- [ ] Admin can edit a user's email and role
- [ ] Admin can deactivate a user (user cannot log in)
- [ ] Admin can reset a user's password (generates new temp password or admin sets one)
- [ ] Admin dashboard is only accessible to users with role `admin`
- [ ] Tests: admin creates instructor → instructor can log in; admin deactivates user → user login rejected; non-admin visits admin dashboard → redirected

## Blocked by

- 02-auth
