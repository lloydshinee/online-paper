# Two assessment modes: Timed and Live

The system supports two fundamentally different assessment modes — Timed (student controls pace, clock enforces limit) and Live (instructor controls pace, questions advance synchronously for all students). These are not configuration tweaks on a single mode; they are distinct interaction models with different state machines, UI flows, and invariants (e.g. a student can't be in two overlapping live sessions).

Considered alternatives:
- **Timed-only**: Simpler, but doesn't support classroom-style assessments where the instructor wants to talk through each question.
- **Live-only**: Simpler, but doesn't support take-home or self-scheduled assessments.
- **Unified mode with a toggle**: A single code path that switches behavior via a flag. Rejected because the constraints diverge too far — live mode has instructor-controlled navigation, join-in-progress, and overlap prevention; timed mode has per-student countdown and auto-submit. A unified implementation would be more complex than two clean paths.

The two-mode design was chosen because the product serves both classroom teaching and individual assessment — each mode solves a distinct instructor workflow.
