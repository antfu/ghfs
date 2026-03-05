# ghfs Design Spec

## Purpose
This document is the implementation-level design reference for `ghfs`.
It reflects the current behavior in code, including sync, execute, config resolution, and filesystem/state contracts.

## Product Summary
`ghfs` mirrors GitHub issues and pull requests into local markdown files for offline review, then applies explicit batch actions from `.ghfs/execute.yml` back to GitHub.

## Core Decisions
1. CLI framework: `cac`
2. Provider abstraction: sync/execute use `RepositoryProvider`; GitHub adapter uses `octokit` with retry/throttling plugins
3. Prompting: `@clack/prompts`
4. Execute file: `.ghfs/execute.yml`
5. Sync state file: `.ghfs/.sync.json`
6. Validation: `valibot` + custom semantic checks
7. Default command: `ghfs` => `ghfs sync`
8. Execute mode: dry-run by default; `--apply` required for mutations

## CLI Contract
1. `ghfs` (alias of `ghfs sync`)
2. `ghfs sync [--repo owner/name] [--since ISO] [--full]`
3. `ghfs execute [--repo owner/name] [--file path] [--apply] [--non-interactive] [--continue-on-error]`
4. `ghfs status`

## Configuration Contract (`ghfs.config.ts`)
Top-level fields:
- `repo?: string`
- `directory?: string` (default: `.ghfs`)
- `auth?: { token?: string }`
- `sync?: { ... }`

`sync` fields:
- `issues?: boolean` (default: `true`)
- `pulls?: boolean` (default: `true`)
- `closed?: 'existing' | 'all' | false` (default: `'existing'`)
- `patches?: 'open' | 'all' | false` (default: `'open'`)

Resolution precedence:
1. CLI options (where applicable)
2. `ghfs.config.*`
3. Built-in defaults
4. Runtime detection (repo/auth helpers)

## Repository Resolution
Priority:
1. `--repo`
2. config `repo`
3. git remotes (`origin`, `upstream`, then others)
4. `package.json.repository`

If git and package.json disagree:
- interactive TTY: prompt user to choose
- non-interactive: hard error

## Auth Resolution
Priority:
1. config `auth.token`
2. `gh auth token`
3. env: `GH_TOKEN` / `GITHUB_TOKEN` (after loading `.env`)
4. interactive prompt (TTY only)

Non-TTY with no token is a hard error.

## Filesystem Contract
```txt
.ghfs/
  .sync.json
  issues.md
  pulls.md
  repo.json
  execute.yml
  schema/
    execute.schema.json
  issues/
    <00001-short-slug>.md    # open issue
    closed/
      <00001-short-slug>.md  # closed issue
  pulls/
    <00001-short-slug>.md    # open pull request
    <number>.patch           # PR patch (based on sync.patches)
    closed/
      <00001-short-slug>.md  # closed pull request
```

Notes:
- Issues and PRs use separate markdown trees (`issues/` and `pulls/`).
- PR patches are stored under `pulls/`.
- `issues.md` and `pulls.md` are aggregate tables generated from tracked mirrored items.
- `repo.json` stores curated repository metadata with labels and milestones.
- Markdown file names use `<number>-<slug>.md` with 5-digit zero-padding for `number` (example: `00134-some-bug.md`).
- Slug generation rules: lowercase; replace non-`[a-z0-9]` runs with `-`; trim leading/trailing `-`; max length 48; fallback slug `item`.

## Mirror Markdown Contract
Frontmatter fields include:
- common: `schema`, `repo`, `number`, `kind`, `state`, `title`, `author`, `labels`, `assignees`, `milestone`
- timestamps: `created_at`, `updated_at`, `closed_at`, `last_synced_at`
- PR-only: `is_draft`, `merged`, `merged_at`, `base_ref`, `head_ref`, `reviewers_requested`

Body sections:
1. Title
2. Description
3. Comments (with comment id + updated marker)

## Sync State Contract (`.sync.json`)
Root:
- `version: 1`
- `repo?: string`
- `lastSyncedAt?: string`
- `lastSince?: string`
- `items: Record<string, SyncItemState>`
- `executions: ExecutionResult[]`

`SyncItemState`:
- `number`
- `kind: 'issue' | 'pull'`
- `state: 'open' | 'closed'`
- `lastUpdatedAt` (GitHub `updated_at`)
- `lastSyncedAt` (local sync timestamp)
- `filePath`
- `patchPath?`

Backward compatibility:
- legacy `updatedAt` is normalized to `lastUpdatedAt` on state load.

## Sync Behavior
High-level flow:
1. Resolve repo + token.
2. Load `.sync.json` and compute `since` cursor (unless `--full` or targeted `numbers`).
3. Fetch candidates:
   - targeted: by issue/PR numbers
   - regular: paginated list
4. Filter by `sync.issues` / `sync.pulls`.
5. For each candidate:
   - apply closed-policy handling (`sync.closed`)
   - compare `lastUpdatedAt` vs paginated `updated_at` and skip unchanged items
   - otherwise fetch comments (+ PR metadata if pull), render markdown, move paths as needed
   - manage patch write/delete from `sync.patches`
   - update tracked item state
6. Write aggregate snapshots: `.ghfs/issues.md`, `.ghfs/pulls.md`, and `.ghfs/repo.json`.
7. Persist `.sync.json` summary metadata and counters.

Directory creation behavior:
- sync does not eagerly create `issues/` or `pulls/` trees at startup.
- directories are created lazily when writing/moving markdown or patch files.

Details:
- `sync.closed === false` uses open-only pagination for full sync; incremental sync also requests recently closed items since cursor to clean up local mirror.
- unchanged optimization skips expensive per-item re-sync when remote `updated_at` matches tracked `lastUpdatedAt` and required local files exist.
- `sync.issues` / `sync.pulls` disable processing for that kind only. Disabled kinds are ignored; existing mirrored files for them are not aggressively deleted.
- Sync keeps `filePath` in state and uses it to move/clean stale markdown files when title slug or open/closed state changes.

## Execute File Contract (`.ghfs/execute.yml`)
Root must be a YAML array of operations.
If missing, `sync`/`execute` auto-create `execute.yml` plus `schema/execute.schema.json`, and seed `execute.yml` with a short commented example and `[]`.
Each operation includes:
- required: `number`, `action`
- optional: `ifUnchangedSince`
- action payload fields (e.g. `title`, `body`, `labels`, `assignees`, `reviewers`, `milestone`, `reason`)

Supported actions:
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
- `request-reviewers`
- `remove-reviewers`
- `mark-ready-for-review`
- `convert-to-draft`

## Execute Behavior
1. Parse + validate execute file.
2. In interactive TTY mode, allow selecting subset of operations.
3. Print plan.
4. Dry-run by default (`--apply` required to mutate).
5. On apply:
   - optional confirm prompt in TTY
   - execute operations in order through provider `actionXxx` methods
   - enforce `ifUnchangedSince` conflict guard per op
6. After each successful operation, rewrite `execute.yml` to keep only remaining (not-yet-successful) operations.
7. Save execution run record to `.sync.json`.
8. Run targeted sync for affected numbers only (successful operations) to refresh local mirror.

## Validation Strategy
Two-layer validation for execute file:
1. Structural validation via `valibot` schema.
2. Semantic validation rules (required payload by action, positive integer `number`, valid datetime for `ifUnchangedSince`).

## Sync Module Structure
`src/sync/index.ts` is a barrel file only.

Current breakdown:
- `contracts.ts`: public sync options/summary types
- `execution-log.ts`: execution result append helper
- `sync-repository.ts`: top-level sync orchestration
- `sync-repository-provider.ts`: provider-backed candidate fetching and pagination wiring
- `sync-repository-item.ts`: per-item sync workflow
- `sync-repository-snapshot.ts`: writes aggregate indexes and repo metadata snapshot
- `sync-repository-storage.ts`: path/storage/prune/policy helpers
- `sync-repository-utils.ts`: pure helpers and decision functions
- `sync-repository-types.ts`: internal sync types
- `state.ts`: sync state load/save/normalization
- `status.ts`: status summary from sync state
- `markdown.ts`, `paths.ts`: render/path contracts

Provider layer:
- `src/provider/contracts.ts`: normalized provider models + `RepositoryProvider` contract
- `src/provider/factory.ts`: provider factory wiring from repo/token
- `src/provider/github/provider.ts`: GitHub adapter implementing provider reads and `actionXxx` mutations

## Testing Strategy
Tests are colocated with source in `src/**/*.test.ts`.
Current focus areas:
1. config resolution defaults + overrides
2. repo normalization and detection behavior
3. markdown rendering contract
4. sync paths and sync-state normalization
5. sync optimizations and filtering (`closed`, unchanged skip, issues/pulls toggles)
6. execute validation and execute-file rewrite behavior

## Operational Defaults
1. `sync` is non-interactive.
2. `execute` is interactive in TTY unless `--non-interactive`.
3. `execute` is dry-run unless `--apply`.
4. `continue-on-error` is opt-in.
