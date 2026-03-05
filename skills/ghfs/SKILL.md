---
name: ghfs
description: Manages ghfs local mirror files in `.ghfs/`, especially translating user instructions into valid `.ghfs/execute.yml` operations, running `ghfs execute` / `ghfs sync`, and validating issue/PR batch edits. Use when tasks involve editing issues/PRs through `.ghfs` artifacts, reconciling sync state, or applying queued GitHub operations.
---

# Ghfs

## Overview

Use this skill to operate ghfs as a local filesystem mirror for GitHub issues and pull requests.

- `ghfs sync` mirrors remote content into `.ghfs/`.
- `ghfs execute` reads `.ghfs/execute.yml` and plans or applies mutations.
- Default execute mode is dry-run. Use `--apply` to mutate GitHub.

Key `.ghfs` files:
- `execute.yml`: queued operations (YAML array)
- `schema/execute.schema.json`: schema for `execute.yml`
- `.sync.json`: sync and execution run history (skip reading it)
- `issues.md`, `pulls.md`, `repo.json`: aggregated mirror views
- `issues/**/*.md`, `pulls/**/*.md`: per-item mirrors

## Main Workflow

1. Sync first when local data may be stale: run `ghfs sync`.
2. Update `.ghfs/execute.yml` from user instructions.
3. Validate and preview with `ghfs execute`.
4. Apply only on explicit user intent: `ghfs execute --apply`.
5. Report results and remaining queued operations.

Execution behavior to remember:
- Operations run in file order.
- On `--apply`, each successful operation is removed from `execute.yml`.
- Failed and not-yet-run operations stay in `execute.yml`.
- After apply, ghfs runs targeted sync for affected numbers automatically.

## Update `.ghfs/execute.yml` Correctly

Keep root as a YAML array and include `number` + `action` for every entry.

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
```

Map user intent to action fields:

| User intent | action | Required extra fields |
| --- | --- | --- |
| Close / reopen | `close`, `reopen` | none |
| Change title | `set-title` | `title` |
| Replace body | `set-body` | `body` |
| Add comment | `add-comment` | `body` |
| Add/remove/set labels | `add-labels`, `remove-labels`, `set-labels` | `labels` (non-empty string array) |
| Add/remove/set assignees | `add-assignees`, `remove-assignees`, `set-assignees` | `assignees` (non-empty string array) |
| Set/clear milestone | `set-milestone`, `clear-milestone` | `milestone` for set |
| Lock/unlock conversation | `lock`, `unlock` | optional `reason` for lock |
| PR reviewer actions | `request-reviewers`, `remove-reviewers` | `reviewers` (non-empty string array) |
| PR draft state | `mark-ready-for-review`, `convert-to-draft` | none |

Rules:
- `number` must be a positive integer.
- `ifUnchangedSince` must be ISO datetime when present.
- `request-reviewers`, `remove-reviewers`, `mark-ready-for-review`, and `convert-to-draft` are PR-only.
- Keep operation order aligned with user intent because execution is sequential.
- Append operations unless user explicitly asks to replace or clear the queue.

Practical number resolution:
- Parse from filenames such as `.ghfs/issues/00123-foo.md` -> `number: 123`.
- Use `.ghfs/issues.md` / `.ghfs/pulls.md` when matching by title.

## Run Sync and Execute via CLI

Preferred commands:

```bash
ghfs sync
ghfs sync --full
ghfs sync --since 2026-03-01T00:00:00Z
ghfs execute
ghfs execute --apply
```

Useful flags:
- `--repo owner/name` when repo cannot be auto-resolved.
- `--non-interactive` for scripted runs.
- `--continue-on-error` to keep applying later ops after a failure.
