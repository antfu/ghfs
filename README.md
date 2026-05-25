# ghfs

GitHub issues/PRs as filesystem, for offline view and operations in batch. Designed for human and agents.

> [!IMPORTANT]
> Still working in progress, not usable yet.

```bash
pnpm install @ghfs/cli
```

and then run the command inside a repository directory:

```bash
ghfs
```

It will sync the open issues and pull requests to the local filesystem under `.ghfs` directory, like:

```txt
.ghfs/
  repo.json   # repository basic information
  issues.md   # index of fetched issues
  pulls.md    # index of fetched pull requests
  execute.md  # queued operations
  issues/
    00134-some-bug.md
    closed/
      00135-fixed-crash.md
  pulls/
    00042-add-cache.md
    00042-add-cache.patch
    closed/
      00043-release-cleanup.md
```

Then you can view them offline, or ask your local agent to summarize them for you.

## Web UI

`ghfs` ships a local web UI for browsing and acting on the synced mirror.

### `ghfs ui` — single project

Run inside a repository directory after a sync. Opens a browser tab with a two-pane (list + detail) view of the project's issues and PRs.

```bash
ghfs ui
```

Flags:

- `--port <number>` — port to listen on (default `7710`).
- `--host <addr>` — bind address (default `127.0.0.1`).
- `--cwd <path>` — project directory; defaults to the current working directory.
- `--no-open` — don't auto-open the browser (useful for headless setups).

The UI is read-and-queue: edits made in the interface are queued to `.ghfs/execute.yml` and `.ghfs/execute.md` — you still apply them with `ghfs execute --run`.

### `ghfs hub` — multi-project dashboard

Point at a directory that contains multiple project checkouts and `ghfs hub` scans for git repositories, lets you enable the ones you want, and exposes them all in one dashboard.

```bash
ghfs hub --cwd ~/projects
```

The hub keeps its enabled-project list and auto-sync interval in `~/.config/ghfs/hub.json`, keyed by the hub root. Switching roots remembers each root's selection independently.

Features:

- Project cards with activity sparkline, open issue / PR counts, last updated and last synced badges.
- `/recent` — cross-project list of recently-updated issues and PRs.
- Queue drawer (`q`) — aggregated queue across all enabled projects with per-project execute; press `X` to execute everything.
- Settings dialog (`,`) for hub root and an optional auto-sync interval (1–60 minutes).

Flags mirror `ghfs ui` (`--port`, `--host`, `--cwd`, `--no-open`).

## Saved replies

Insert canned replies into the comment composer with one click — or press <kbd>⌘</kbd> <kbd>.</kbd> (<kbd>Ctrl</kbd> <kbd>.</kbd> on Linux/Windows) when the composer is focused. Replies come from two scopes, surfaced in a single picker with a per-item indicator:

- **This repo** — `.github/replies.yml` in the repository. ghfs supports the [`refined-saved-replies`](https://github.com/JoshuaKGoldberg/refined-saved-replies) convention, so the same file works in the refined-saved-replies browser extension and any other tool that adopts it. Commit the file so the whole team shares them.
- **Global** — per-user replies stored in `~/.config/ghfs/hub.json`.

Edit either set from the **Settings** dialog (<kbd>,</kbd>) under the **Saved replies** tab. Bodies support a small set of placeholders, replaced at insertion time against the issue/PR being viewed:

| Placeholder    | Resolves to                          |
| -------------- | ------------------------------------ |
| `{{author}}`   | `@<login>` of the item's author      |
| `{{number}}`   | The issue / PR number                |
| `{{title}}`    | The item's title                     |

Example `.github/replies.yml`:

```yaml
- title: Thanks
  body: |
    Thanks for the report, {{author}}! We'll take a look at #{{number}}.
- title: Needs reproduction
  body: Could you share a minimal reproduction?
```

> GitHub's own user "saved replies" (at github.com/settings/replies) have no public REST API, so ghfs can't sync them — global templates are managed entirely through ghfs.

## Execute operations

`ghfs` also allows you to take actions on the issues and pull requests in batch.

`ghfs execute` merges operations from multiple sources:

1. `execute.md` (human-friendly commands)
2. `per-issue` markdown frontmatter changes (from `.ghfs/issues/**/*.md` and `.ghfs/pulls/**/*.md`)
3. `execute.yml` (explicit YAML operations)

Note: execution merge order is `execute.yml` -> `execute.md` -> `per-issue` generated operations.

### 1) `execute.md` (recommended)

`execute.md` is best for quick/manual batching:

```md
close #123 #234
set-title #125 "New title"
label #125 bug, enhancement
close-comment #126 "Closing this as completed"
```

Action names in both `execute.yml` and `execute.md` are case-insensitive and support aliases, including:

- `closes` -> `close`
- `open` -> `reopen`
- `close-comment` / `comment-close` / `close-and-comment` / `comment-and-close` -> `close-with-comment`

`execute.md` also supports comment lines with `#` and `//`, plus HTML comment blocks using `<!-- ... -->`. These comments are preserved when operations are rewritten.

### 2) Per-issue operations

Edit frontmatter directly in issue/PR markdown files:

- `title`
- `state` (`open` / `closed`)
- `labels`
- `assignees`
- `milestone`

`ghfs execute` will diff these values and generate operations automatically (for example `set-title`, `close`/`reopen`, label updates, assignee updates, milestone updates).

### 3) `execute.yml`

`ghfs sync` or `ghfs execute` will auto-create `.ghfs/execute.yml` and `.ghfs/schema/execute.schema.json` if missing.
Use `execute.yml` for explicit/low-level operations:

```yaml
# close the issue #123
- action: close
  number: 123

# change the title of the issue #125 to "New title"
- action: set-title
  number: 125
  title: New title

# add the labels "bug" and "feature" to the issue #125
- action: add-labels
  number: 125
  labels: [bug, feature]
```

Then run `ghfs execute` to preview, and `ghfs execute --run` to execute.

```bash
ghfs execute
ghfs execute --run
```

## Agent Skill

This repository ships an [agent skill](https://agentskills.io/home) at [`skills/ghfs/SKILL.md`](skills/ghfs/SKILL.md).

Install with [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
pnpx skills add antfu/ghfs
```

The `@ghfs/cli` also ship the skills into the npm package that you can have it also installed with [`skills-npm`](https://github.com/antfu/skills-npm):

```bash
pnpm i -D @ghfs/cli
pnpx skills-npm
```

## Configuration

You can configure by creating a `ghfs.config.ts` file in the root of the repository.

```ts
import type { GhfsUserConfig } from '@ghfs/cli'

export default defineConfig({
  repo: 'owner/name',
  sync: {
    issues: true, // set false to skip issue sync
    pulls: true, // set false to skip pull request sync
  },
  // other options...
})
```

## TODOs

- [x] `execute.md` file with human-friendly instructions (`close #123 #234`, `set-title #125 "New title"`).
- [x] Directly editing the `<5-digit-number>-<slug>.md` file to apply the operations.
- [ ] Add a VS Code extension for guided sync/execute.
- [ ] Documentation.
- [x] Index page, and basic repo info
- [x] Agent Skills.
- [x] Local Web UI for managing the local mirror (`ghfs ui` and `ghfs hub`).
