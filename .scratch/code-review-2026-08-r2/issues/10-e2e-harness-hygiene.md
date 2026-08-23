# E2E harness hygiene: build guarantee, server reuse, seeding guard, teardown

Severity: MEDIUM cluster (test infrastructure)

Status: ready-for-agent

## Problems

1. `playwright.config.ts:18` — `webServer` runs `npm run start` with nothing guaranteeing `next build` ran or is current; first runs fail confusingly, stale `.next` silently tests yesterday's code.
2. `playwright.config.ts:20` — `reuseExistingServer: true` unconditionally: a leftover or foreign process on :3111 gets silently reused.
3. `e2e/global-setup.ts:6-12, 40` — seeding targets whatever DB `.env.local` names with a committed known password (`'TestPass123!'`) and no environment guard; on a shared project every repo reader knows the credential scheme for up-to-6h-old service-role-seeded accounts.
4. No `globalTeardown`; cleanup is deferred to a future run's >6h sweep and `deleteUser` failures vanish into unnamed empty catches (`:96`).

## Fix

- `"test:e2e": "next build && playwright test"` (or a documented precondition) and `reuseExistingServer: !process.env.CI`.
- Require an explicit `E2E_SUPABASE_URL` (fail unless set) or refuse prod-looking URLs; randomize the per-run password and pass it via the credentials file already written by setup.
- Add `globalTeardown` deleting this run's users by id from credentials.json; name the swallowed errors.

## Acceptance criteria

- [ ] `pnpm test:e2e` cannot silently reuse a foreign server in CI
- [ ] Harness refuses to run against an un-designated database
- [ ] A completed run leaves no rows behind
