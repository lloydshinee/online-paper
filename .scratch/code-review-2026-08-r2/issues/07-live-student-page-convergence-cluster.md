# Student live page convergence cluster: ended screen, poll seq race, interval leak, missing fallback poll

Severity: MEDIUM cluster (all in the student `live/page.tsx` unless noted)

Status: ready-for-agent

Prerequisite note: building a small RTL harness for this page would let issues 04 and 07 gain regression tests.

## Problems

1. **Ended session shows the generic error screen** — init calls `joinLiveSessionAction` before checking status; "This live session has ended" matches neither error regex → red "Something went wrong" instead of the Ended view that `applyView` would render. Repro: open the link after class. Fix: skip join when `view.session.status === 'ended'`, or map that specific error to the ended view.
2. **Stale poll snapshot regresses the student** — the slow-poll effect assigns its sequence number AFTER its fetch while the broadcast handler assigns BEFORE its own; a pre-advance snapshot can win, bounce the student back a question, clear their answer, and accept re-typed content inside the 15 s departure window overwriting the flushed answer. Fix: bump the seq before fetching in the poll (mirror the broadcast handler), or refuse views whose fetched index is lower than the applied one.
3. **'end' handler spawns an uncancellable interval** — `pollEnded` (`:361-376`) is captured only by its own closure: unreachable by effect cleanup, never cleared on fetch failure, stacked per delivered event, and polls forever if conversion failure reverts the session flip. Fix: hold it in a ref cleared by cleanup, add a give-up counter, check unmount.
4. **Active session at index −1 has no poll fallback** — the slow poll early-returns when `viewState === 'active'`, but active-with-no-current-question renders as waiting and init skips `startPolling()` because raw status is 'active'; a missed Begin broadcast strands the student until manual reload. Fix: start polling whenever the view hasn't converged to a visible question.

## Acceptance criteria

- [ ] Opening an ended session renders the ended screen
- [ ] A stale lower-index snapshot can no longer displace a newer applied view
- [ ] No interval survives unmount; bounded retries when the flip reverts
- [ ] Lobby-of-active converges within one slow poll after a missed Begin
- [ ] RTL/e2e coverage for each path once the harness lands
