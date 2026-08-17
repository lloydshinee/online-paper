# Time Extensions: single-counter deadline model

The effective deadline of a timed attempt is always `started_at + duration_minutes + extra_seconds`, where `extra_seconds` is a single integer counter on the submission row (default 0). One shared helper (`computeDeadline`) derives this deadline everywhere it is needed — server write-path enforcement, the instructor listing expiry sweep, the student dashboard mapping, and the take-page resume — so no code path computes a deadline from `started_at` and `duration_minutes` alone.

The counter is a *total effective extension*, not a literal sum of granted minutes. Re-opening a finished attempt absorbs the dead time between expiry and the grant: the counter is set so the new deadline is exactly `now + granted_minutes`, which can exceed the granted amount when the attempt expired long ago. This keeps the deadline derivation to a single three-term formula with no per-attempt state about "when the revival happened".

Considered alternatives:
- **A per-grant audit log (table of grants: who, when, how many minutes)**: Preserves a history of who granted what and supports auditability, but adds a second source of truth that every deadline computation must join and fold. Rejected deliberately — the counter is the only record, surfaced as a "Time added" chip in the instructor UI. If an audit trail is ever required, it can be layered on later without changing the deadline model.
- **Two fields (extension + revival offset)**: Separates "real grants" from "slack absorbed by re-opening", keeping grant amounts audit-clean without a full log. Rejected — the distinction has no behavioral consequence; only the total matters for every consumer of the deadline, and one field means one formula.
- **Moving the deadline into a stored timestamp column**: Would denormalize `started_at + duration + extension` into a single value written at start/extension time. Rejected because the derived form stays correct when the instructor later edits the assessment duration, and the derivation is trivial.

The single-counter model was chosen because every consumer needs exactly one number (the effective deadline), the derivation is a pure function of three existing values, and the added simplicity outweighs the loss of a grant history at this stage of the product.
