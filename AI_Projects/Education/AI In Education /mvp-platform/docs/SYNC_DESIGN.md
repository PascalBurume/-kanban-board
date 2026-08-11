# Sync Design Note — Offline ↔ Cloud Conflict Resolution

> **Status: design placeholder, not yet built.** Mwalimu today runs as a single
> local server per school — there is no cloud sync, so none of the risks below
> are live. This note exists so that when sync *is* built, the conflict-resolution
> strategy is chosen deliberately rather than retrofitted after data loss.

## Why this matters

The moment a record can be edited from two places that are sometimes offline from
each other (the classroom's local server and, say, a teacher's phone on mobile
data), the two copies can diverge. The canonical example:

> A teacher grades a project submission on the offline classroom server. Later,
> from their phone (online), they reopen the same submission and mark it *needs
> revision*. When the classroom server reconnects, which state wins?

Getting this wrong silently overwrites real work — a graded submission reverts, a
resolved feedback item reopens.

## Conflict-prone state

Not every table needs conflict handling. The records that are (a) mutable and
(b) plausibly edited from more than one device:

| Entity | Field(s) at risk | Notes |
|--------|------------------|-------|
| `ProjectSubmission` | grade, status, feedback | The motivating example. |
| `LessonFeedback` | `resolved` | Teacher resolves on one device, student adds more on another. |
| `Progress` | `status`, `completedAt` | Usually student-owned and single-device, but a resync could race. |
| `CopilotPolicy` | `enabled` | Teacher toggles from class page and phone. |

Append-only / immutable data (`CopilotMessage`, `QuizAttempt`, `AuditLog`,
`SessionLog`) does **not** conflict — it only ever needs union-merge, never
resolution.

## Option A — Last Write Wins (LWW)

Every syncable record carries a "when was this last meaningfully edited"
timestamp; on sync the newer timestamp wins.

**Two traps specific to this codebase:**

1. **`@updatedAt` is the wrong field.** Only ~9 models carry `@updatedAt` today,
   and Prisma's `@updatedAt` is set to *now* on **every** write — including
   unrelated field updates and re-saves. The codebase already documents this
   footgun (`src/lib/teacher.ts` — the "last active" comment explaining why
   `Progress.updatedAt` cannot be trusted for activity). LWW therefore needs a
   **dedicated `lastEditedAt`** stamped only on the semantically-meaningful edit,
   added consistently to every syncable model — not a reuse of `@updatedAt`.

2. **Device clocks are unreliable.** LWW's correctness rests entirely on
   comparable clocks. In offline rural deployments, machines may have skewed or
   reset clocks and no NTP. A phone with a fast clock would always "win" against
   the classroom server regardless of true order. Mitigations to evaluate:
   hybrid logical clocks (HLC), or server-assigned sequence numbers at sync time
   rather than trusting device wall-clocks.

**Verdict:** cheapest to implement, acceptable for low-contention fields, but
fragile exactly where it matters (grading) if clocks can't be trusted.

## Option B — Event sourcing (append-only action log)

Instead of syncing *final row state*, sync the *actions*:
`{ actor, action: "GRADE_SUBMISSION", targetId, payload, at }`. The central
server replays events in a defined order and derives current state.

- **Pro:** no blind row overwrite — the grade-then-unresolve sequence is
  preserved as two ordered events, and the resolution policy (e.g. "last
  human action wins", or "flag for teacher review") is explicit and auditable.
- **Pro:** Mwalimu already has the seed of this — `AuditLog` is an append-only
  action record. An event log would be a stricter, replayable sibling.
- **Con:** heavier. Requires an event schema per action type, a deterministic
  replay/reducer, and idempotency (events may arrive more than once). Bigger
  build and a migration of write paths to emit events.

**Verdict:** the robust answer for the high-value conflicts (grading, feedback),
at real implementation cost.

## Recommendation (placeholder — decide at the sync milestone)

A likely pragmatic split, to be confirmed when sync is actually scoped:

- **Event sourcing** for the handful of high-value, teacher-authored mutations
  (grading, feedback resolution) where losing a change is unacceptable.
- **LWW with a dedicated `lastEditedAt` + HLC/server-sequence** for low-contention
  toggles (Copilot policy) where simplicity outweighs perfect ordering.
- **Union-merge** for append-only data (messages, attempts, sessions, audit).

## Open questions

- Is a phone client actually in scope, or is sync only classroom-server ↔ cloud
  (one authoritative writer per record), which would collapse most conflicts?
- Can we guarantee NTP at any point (e.g. a nightly online window) to make LWW
  clocks trustworthy?
- Do we need offline-to-offline sync (two classroom servers) or only
  offline-to-cloud? The former rules out any central-server-assigned ordering.
- Retention/compaction policy for an event log on constrained edge storage.

_Last reviewed: 2026-07-24. Revisit when the cloud-sync milestone is scoped._
