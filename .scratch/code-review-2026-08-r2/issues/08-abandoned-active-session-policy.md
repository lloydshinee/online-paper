# Abandoned ACTIVE live sessions lock students out of all other sessions indefinitely

Severity: MEDIUM (design decision needed)

Status: ready-for-human

## Problem

Membership TTL cleanup only targets **waiting** sessions (`lib/live-session-service.ts:858-874`). Both `joinLiveSession` and the save path reject students holding any non-ended membership, so if an instructor closes their laptop mid-session and never ends it, every enrolled student is permanently blocked from every other live assessment; the client block screen offers no recourse. Waiting-session TTL was fixed in code-review-2026-08; the active case was not.

## Decision needed (product owner)

Pick one (or a combination):

- A. Extend stale-membership TTL to memberships against active sessions whose instructor presence/heartbeat has been gone beyond a threshold.
- B. Let `hasActiveLiveSession` / the join gate ignore active sessions idle past a threshold.
- C. Give admins a force-end control for orphaned sessions.
- D. Accept the behavior and document it (instructor is expected to end sessions).

Related: admins currently have no path into live-session control at all (same gap as time extensions — deliberate per PRD, but worth revisiting together).
