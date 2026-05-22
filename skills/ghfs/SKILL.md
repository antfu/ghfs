---
name: ghfs
description: Manages ghfs local mirror files in `.ghfs/`, especially translating user instructions into valid execute operations (`execute.md`, `execute.yml`, or per-item edits), running `ghfs execute` / `ghfs sync`, and validating issue/PR batch edits. Use when tasks involve editing issues/PRs through `.ghfs` artifacts, reconciling sync state, or applying queued GitHub operations.
---

# Ghfs

## Overview

Use this skill to operate ghfs as a local filesystem mirror for GitHub issues and pull requests.

- `ghfs sync` mirrors remote content into `.ghfs/`.
- `ghfs execute` merges operations from `.ghfs/execute.yml`, `.ghfs/execute.md`, and per-item markdown frontmatter differences.
- Default execute mode is report mode. Use `--run` to mutate GitHub.

Key `.ghfs` files:
- `execute.md`: queued commands (human-friendly)
- `execute.yml`: queued operations (YAML array)
- `schema/execute.schema.json`: schema for `execute.yml`
- `.sync.json`: sync and execution run history (skip reading it)
- `issues.md`, `pulls.md`, `repo.json`: aggregated mirror views
- `issues/**/*.md`, `pulls/**/*.md`: per-item mirrors

## Main Workflow

1. Sync first when local data may be stale: run `ghfs sync`.
2. Queue requested changes in one or more sources:
   - `.ghfs/execute.md` for quick command-style edits (recommended).
   - `.ghfs/execute.yml` for explicit structured operations.
   - `.ghfs/issues/**/*.md` or `.ghfs/pulls/**/*.md` frontmatter for direct per-item edits.
3. Validate and preview with `ghfs execute`.
4. Apply only on explicit user intent: `ghfs execute --run`.
5. Report results and remaining queued operations.

Execution behavior to remember:
- Merge order is `execute.yml` -> `execute.md` -> per-item generated operations.
- Operations run in file order.
- On `--run`, successful operations are removed from queued YAML/MD sources; failed and not-yet-run entries remain.
- Per-item generated operations are recomputed from current frontmatter on each run.
- After run, ghfs runs targeted sync for affected numbers automatically.

## Update `.ghfs/execute.md` Quickly

Use one command per line:

```md
close #123 #124
set-title #125 "Improve sync summary output"
label #125 enhancement, cli
assign #126 octocat
comment #126 "Need more context"
close-comment #127 "Closing as completed"
```

Rules:
- Action names are case-insensitive and aliases are accepted.
- `#` and `//` line comments plus `<!-- ... -->` HTML comment blocks are supported and preserved.
- Multi-target commands are supported for: `close`, `reopen`, `clear-milestone`, `unlock`, `mark-ready-for-review`, `convert-to-draft`.

Common aliases:
- `open` -> `reopen`
- `closes` -> `close`
- `close-comment` / `comment-close` / `close-and-comment` / `comment-and-close` -> `close-with-comment`
- `label` / `labels` / `tag` / `tags` / `add-tag` -> `add-labels`
- `assign` / `assignee` / `assignees` -> `add-assignees`
- `title` / `retitle` -> `set-title`
- `comment` -> `add-comment`
- `ready` / `undraft` -> `mark-ready-for-review`
- `draft` -> `convert-to-draft`

## Update `.ghfs/execute.yml` Precisely

Keep root as a YAML array and include `number` + `action` for each entry.

```yaml
# yaml-language-server: $schema=./schema/execute.schema.json
- number: 125
  action: set-title
  title: Improve sync summary output

- number: 125
  action: add-labels
  labels: [enhancement, cli]

- number: 126
  action: request-reviewers
  reviewers: [octocat]
  ifUnchangedSince: '2026-03-05T04:10:00Z'

- number: 130
  action: add-reaction
  reaction: heart

- number: 130
  action: add-reaction
  reaction: '+1'
  target: {kind: comment, commentId: 9876543}
```

Map user intent to action fields:

| User intent | action | Required extra fields |
| --- | --- | --- |
| Close / reopen | `close`, `reopen` | none |
| Change title | `set-title` | `title` |
| Replace body | `set-body` | `body` |
| Add comment | `add-comment` | `body` |
| Close with comment | `close-with-comment` | `body` |
| Add/remove/set labels | `add-labels`, `remove-labels`, `set-labels` | `labels` (non-empty string array) |
| Add/remove/set assignees | `add-assignees`, `remove-assignees`, `set-assignees` | `assignees` (non-empty string array) |
| Set/clear milestone | `set-milestone`, `clear-milestone` | `milestone` for set |
| Lock/unlock conversation | `lock`, `unlock` | optional `reason` for lock |
| PR reviewer actions | `request-reviewers`, `remove-reviewers` | `reviewers` (non-empty string array) |
| PR draft state | `mark-ready-for-review`, `convert-to-draft` | none |
| Add/remove a reaction | `add-reaction`, `remove-reaction` | `reaction` (one of `+1`, `-1`, `laugh`, `hooray`, `confused`, `heart`, `rocket`, `eyes`); optional `target` (defaults to the issue/PR body) |

Rules:
- `number` must be a positive integer.
- `ifUnchangedSince` must be ISO datetime when present.
- `request-reviewers`, `remove-reviewers`, `mark-ready-for-review`, and `convert-to-draft` are PR-only.
- Keep operation order aligned with user intent because execution is sequential.
- Append operations unless user explicitly asks to replace or clear the queue.

Practical number resolution:
- Parse from filenames such as `.ghfs/issues/00123-foo.md` -> `number: 123`.
- Use `.ghfs/issues.md` / `.ghfs/pulls.md` when matching by title.

## Update Per-Item Markdown Frontmatter

Edit frontmatter in `.ghfs/issues/**/*.md` or `.ghfs/pulls/**/*.md`:
- `title`
- `state` (`open` / `closed`)
- `labels`
- `assignees`
- `milestone`

`ghfs execute` compares edited frontmatter against tracked state and generates operations automatically (with `ifUnchangedSince` safeguards).

## Run Sync and Execute via CLI

Preferred commands:

```bash
ghfs sync
ghfs sync --full
ghfs sync --since 2026-03-01T00:00:00Z
ghfs execute
ghfs execute --run
```

Useful flags:
- `--repo owner/name` when repo cannot be auto-resolved.
- `--non-interactive` for scripted runs.
- `--continue-on-error` to keep applying later ops after a failure.
