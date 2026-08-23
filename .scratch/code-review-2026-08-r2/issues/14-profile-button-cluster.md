# 14 — Profile button cluster: avatar URLs and admin header identity

Status: done

Found by user during classroom-prep testing on `/dashboard/instructor/classes/<id>`
and the admin pages.

## Symptom

- Instructor: profile button rendered as an empty circle (avatar broken) for
  every viewer except the uploading laptop.
- Admin: profile button empty or showing an arbitrary account's identity.

## Root causes

1. **Avatar URLs frozen at upload time** — `uploadAvatarAction` persisted
   `getPublicUrl()`'s absolute URL, baking `localhost:8000` into
   `users.avatar_url`. Any other device resolved that host to itself.
2. **Header identity guessed from user lists** — admin client pages derived
   the signed-in admin from `getUsers(...)` rows. `listUsers` orders by
   `created_at desc`, so "first row" is whoever registered most recently:
   `admin/classes/[id]` took `users[0]` verbatim, and the dashboard scanned
   the newest page for any admin and left every field empty when none was
   found.

## Resolution

- `lib/avatar.ts`: store the storage path (`uid/avatar.ext`); render-time
  resolution via `avatarSrc()` against `NEXT_PUBLIC_SUPABASE_URL`, with a
  legacy branch re-homing old absolute URLs so existing rows heal without
  migration. Covered by `__tests__/lib/avatar.test.ts`.
- `getCurrentUserProfileAction()` in `app/actions/profile.ts`; both admin
  pages use it instead of scanning lists.
- Verified with Playwright against production build: legacy localhost URL
  renders as the configured instance and loads (HTTP 200); admin + newer
  decoy student fixture shows "E2E Admin" on both admin pages.
