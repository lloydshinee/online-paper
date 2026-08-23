# Live-membership overlap trigger is a read-then-act TOCTOU

Severity: MEDIUM (breaks the one-session invariant it exists to enforce)

Status: done

## Problem

`check_live_membership_overlap` (`docs/full-migration.sql:258-279`) is a BEFORE INSERT trigger with a plain EXISTS probe. Under READ COMMITTED, two simultaneous joins by the same student into different sessions both see zero conflicting rows and both insert; `unique (session_id, student_id)` does not span sessions. The app-level pre-check in `joinLiveSession` (`lib/live-session-service.ts:923-933`) is equally read-then-act. Tickets 09/21 present the trigger as the authoritative dual-session guard; it isn't race-safe.

## Fix

Serialize per-student membership changes at the top of the trigger:

```sql
perform pg_advisory_xact_lock(hashtextextended(new.student_id::text, 0));
```

After the lock is held, the EXISTS probe sees any concurrently committed conflicting membership, so the second join raises.

## Acceptance criteria

- [ ] Integration test: `Promise.all` of two joins for the same student into two different live sessions → exactly one succeeds, the other errors
- [ ] Existing membership/TTL tests stay green

## Comments

- Implemented: `pg_advisory_xact_lock(hashtextextended(new.student_id::text, 0))` at the top of the trigger, full-rebuild SQL + incremental section 4. Concurrency test added (`Promise.all` dual join → exactly one success). Pending live-DB application before it passes deterministically.
- Verified complete: advisory lock live; concurrent dual-join race test admits exactly one membership deterministically. (Fixture note: a second session needs a second assessment — one non-ended session per assessment is enforced by design.)
