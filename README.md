# ghfs

Mirror GitHub issues and pull requests to local markdown files, then execute maintainer actions in batch from `.ghfs/execute.yml`.

## Install

```bash
pnpm install
pnpm build
```

## Commands

```bash
ghfs                      # same as `ghfs sync`
ghfs sync [--repo owner/name] [--since ISO] [--full]
ghfs execute [--file .ghfs/execute.yml] [--apply] [--non-interactive] [--continue-on-error]
ghfs status
ghfs schema
```

## Config (`ghfs.config.ts`)

```ts
import { defineConfig } from '@ghfs/cli'

export default defineConfig({
  repo: 'owner/name',
  storageDir: '.ghfs',
  executeFile: '.ghfs/execute.yml',
})
```

Precedence: `CLI flags > ghfs.config.ts > auto-detect (.git/package.json) > .ghfs/.sync.json`.

## Local Files

```txt
.ghfs/
  .sync.json
  execute.yml
  schema/execute.schema.json
  issues/
    123.md
    123.patch
    closed/
      124.md
```

- Open issues/PRs: `.ghfs/issues/<number>.md`
- Closed issues/PRs: `.ghfs/issues/closed/<number>.md`
- Open PR patch: `.ghfs/issues/<number>.patch`

## Execute Actions

Supported `action` values:

- `close`
- `reopen`
- `set-title`
- `set-body`
- `add-comment`
- `add-labels`
- `remove-labels`
- `set-labels`
- `add-assignees`
- `remove-assignees`
- `set-assignees`
- `set-milestone`
- `clear-milestone`
- `lock`
- `unlock`
- `request-reviewers` (PR)
- `remove-reviewers` (PR)
- `mark-ready-for-review` (PR)
- `convert-to-draft` (PR)

Each entry is one action object with `action`, `number`, and action-specific payload fields.

## Execute File Example

```yaml
- action: add-labels
  number: 12
  labels: [triage]
- action: request-reviewers
  number: 45
  reviewers: [alice, bob]
```

## Authentication

1. `gh auth token` (preferred)
2. `GH_TOKEN` / `GITHUB_TOKEN`
3. TTY prompt on first run

In non-TTY mode, missing auth token is a hard error.
