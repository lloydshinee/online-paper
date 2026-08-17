Status: done

## Parent

[PRD: Time Extensions](../PRD.md)

## What to build

The deadline kernel for Time Extensions. Add an `extra_seconds` counter to submissions and make it part of the deadline everywhere.

The effective deadline of a timed attempt becomes `started_at + duration_minutes + extra_seconds`. Today the deadline is derived from `started_at + duration_minutes` in several independent places. Introduce ONE shared helper for the effective deadline and wire it into every place a deadline is computed: the overdue check that gates answer saves and submits, the expiry sweep in the submissions listing, the student dashboard's completed/overdue mapping, the take-page resume computation, and any read that exposes remaining time. No code path may compute a deadline from started_at and duration alone anymore.

The column ships with a default of 0, so existing submissions behave exactly as before.

Update the domain docs: add the **Time Extension** term to the glossary (instructor-granted addition of minutes to a specific student's attempt on a timed assessment — either extending an In Progress attempt's deadline or re-opening the student's latest finished attempt), revise the Expired/Submitted definitions (no longer strictly immutable; the instructor may re-open the latest finished attempt via a Time Extension), and record an ADR for the single-counter deadline model — including why revival slack is absorbed into the counter and the deliberate no-audit-log tradeoff.

## Acceptance criteria

- [ ] `extra_seconds` column exists on submissions (integer, not null, default 0) in both the migration and the actual database
- [ ] One shared helper computes the effective deadline from started_at, duration, and extra_seconds
- [ ] All existing deadline sites use the helper; a grep shows no remaining deadline math that ignores `extra_seconds`
- [ ] Existing submissions (extra_seconds = 0) behave identically to before — no regressions in the existing test suite
- [ ] Service tests prove that with extra_seconds > 0, a save past the original duration but within the extended deadline is accepted, and a save past the extended deadline is rejected
- [ ] CONTEXT.md glossary updated; Expired/Submitted definitions revised
- [ ] ADR for the deadline model written

## Blocked by

None - can start immediately

## Comments

- Grilled and approved with the user. See PRD for the full decision set.
