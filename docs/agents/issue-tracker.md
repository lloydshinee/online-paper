# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Workflow states

The full lifecycle of an issue:

```
needs-triage  →  needs-info  →  ready-for-agent  →  in-progress  →  done
                                                         ↳ wontfix
```

The triage skills (`triage`) manage the first four states. The builder manages the last two:

| State | Who sets it | Meaning |
|---|---|---|
| `needs-triage` | `triage` skill | Awaiting maintainer evaluation |
| `needs-info` | `triage` skill | Waiting on reporter for more detail |
| `ready-for-agent` | `triage` / `to-issues` skill | Fully specified, an agent can pick it up |
| `in-progress` | You (the builder) | Currently implementing |
| `done` | You (the builder) | Completed, merged, verified |
| `wontfix` | `triage` skill | Will not be actioned |

### Seeing where things stand

```bash
# All issues grouped by status
rg "^Status:" .scratch/

# What's in progress right now?
rg "^Status: in-progress" .scratch/

# Completed work
rg "^Status: done" .scratch/
```

### Archiving done issues

When an issue is complete, change its status to `done` and optionally move it to a `done/` subdirectory:

```
.scratch/<feature-slug>/issues/done/<NN>-<slug>.md
```

This keeps the active directory clean while preserving history.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
