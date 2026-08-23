# Harden increment_violation RPC: NULL-owner bypass and PUBLIC EXECUTE

Severity: HIGH (proctoring evidence integrity)

Status: done

## Problem

`public.increment_violation(p_submission_id, p_student_id)` (`docs/full-migration.sql:224-255`) is `security definer` with Postgres' default PUBLIC EXECUTE (no grant/revoke anywhere in the migration). Two defects:

1. `if v_owner <> p_student_id then return` evaluates to NULL when `p_student_id` is NULL → the ownership check silently passes. Anyone with the anon key can POST `/rest/v1/rpc/increment_violation {"p_submission_id": <uuid>, "p_student_id": null}` to forge proctoring violations; a forged count plus one real violation force-expires the victim's exam via the limit check.
2. Ownership rests entirely on the caller-supplied id ("owner = whoever the caller says").

Barrier today is guessing a uuid4 submission id.

## Fix

- Drop `p_student_id`; derive the caller from the JWT with `auth.uid()` inside the function (works under security definer).
- Null-safe comparison (`IS DISTINCT FROM`).
- `revoke execute ... from public, anon, authenticated` then `grant execute ... to authenticated`.
- Update the only production caller (`recordViolationAction`, `app/actions/timed-assessment.ts:152-157`) to pass just `p_submission_id`.
- Note for existing deployments: signature change requires drop/recreate (tracked under issue 13).

## Acceptance criteria

- [ ] Integration test as student A: incrementing own in-progress submission works; passing another student's submission id (or none of one's own) does not increment; anonymous/unauthenticated call fails or does not increment
- [ ] Existing violation-limit expiry tests stay green
- [ ] `tsc --noEmit` clean

## Comments

- Design amendment: kept `p_student_id` (server passes its verified `auth.userId`) instead of switching to `auth.uid()` inside the function — every production caller is server-side on the service-role client, whose JWT has no user id, so an `auth.uid()` check would reject the legitimate path. The fix is therefore: NULL-safe ownership guard (`IS DISTINCT FROM` + explicit null rejection) AND revoking default PUBLIC EXECUTE so only `service_role` can call the function at all — the wire vector is closed by privilege, not by argument inspection. `recordViolation`'s `studentId` parameter made required accordingly. Test added asserting a signed-in student's direct RPC call fails on permissions.
- Pending live-database application of `docs/incremental-2026-08-r2.sql` (section 2) before the permission test can pass.
- Verified complete: revokes/grants applied; signed-in student's direct `increment_violation` RPC call now fails on permissions; service path and concurrency tests unchanged and green.
