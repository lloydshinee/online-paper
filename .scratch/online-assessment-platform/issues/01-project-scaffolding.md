Status: done

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Scaffold the Next.js + Supabase project foundation. Set up the Supabase client (server-side with cookie-based sessions, client-side for browser), the project directory structure following Next.js App Router conventions, Tailwind CSS v4, shadcn/ui component library, and Vitest test infrastructure. Create the database schema for users (admin, instructor, student) with role enum. Write a single end-to-end test that registers a user and verifies the session cookie is set.

This is a prefactoring slice — no user-facing feature yet, but every other slice depends on the plumbing being right.

## Acceptance criteria

- [ ] `@supabase/supabase-js` and `@supabase/ssr` installed and configured
- [ ] Server-side Supabase client reads session from cookies (middleware refreshes expired tokens)
- [ ] Browser-side Supabase client configured with `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- [ ] `users` table exists in Supabase with columns: `id` (uuid, PK), `email` (text, unique), `password_hash` (handled by Supabase Auth), `role` (text, check: admin | instructor | student), `created_at` (timestamptz)
- [ ] Tailwind CSS v4 working (global styles, utility classes render correctly)
- [ ] shadcn/ui initialized (`npx shadcn@latest init --defaults`), `components.json` present, `lib/utils.ts` with `cn()` exists
- [ ] Vitest configured, one test passes: register a student → verify session cookie → verify user row exists
- [ ] `app/(auth)/login/`, `app/(auth)/register/`, `app/(dashboard)/` route groups scaffolded (empty pages ok)

## Blocked by

None — can start immediately.
