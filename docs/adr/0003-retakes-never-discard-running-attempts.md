# Retake requests never discard a running attempt

When a student enters a retake (`startSubmission` with `retake=true`) while an In Progress attempt exists, the server returns that attempt as a resume — it never expires it to spawn a fresh row. A retake may only expire a past-deadline attempt, and only as a precursor to a deliberate new one. The rule is layered with two UI guards: the Retake entry point is visible only when the student's latest attempt is finished (nothing In Progress), and entering it shows a confirm gate on the take page — showing the previous score — instead of silently auto-starting.

## Why

Students were duplicated in production: while still answering a timed assessment, they refreshed and landed in a brand-new blank attempt. The chain: the class page showed Retake to anyone with `retakes_allowed` on — even mid-attempt; that link carried `?retake=1`, which auto-started on page load; and `startSubmission(retake=true)` responded by silently expiring any In Progress attempt and inserting a blank successor. Time extensions amplified the trap: a reopened attempt whose granted window lapsed left the student sitting next to a tempting Retake button, one confused click from destroying their own answers. The blank rows also corrupted the attempt history students use to read their results.

## Considered alternatives

- **Refuse the retake whenever any In Progress exists, even past deadline**: Maximum safety, but abandons the legitimate case — a student who abandoned an attempt hours earlier and genuinely wants a fresh one would have to contact the instructor. Rejected; the UI guards already make the confused click unreachable.
- **Fix visibility only (hide Retake mid-attempt), keep server behavior**: The button is not the only path to `?retake=1` — stale tabs, bookmarks, and pasted links all reach it. A guard that only works for one entry point is no guard. Rejected as the sole measure, adopted as a layer.
- **Confirmation dialog on the class page, keep take-page auto-start**: Protects the button click but not direct URL visits. Rejected in favor of gating at the destination, which covers every path.

The layered form was chosen because each layer covers the others' blind spots: the server rule is the invariant nothing can bypass, the visibility rule keeps the temptation out of sight, and the confirm gate turns the irreversible moment into a decision the student sees ("your previous score: 42 pts").
